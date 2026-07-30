
"use client";

declare global {
  class FaceDetector {
    constructor();
    detect(image: ImageBitmapSource): Promise<any[]>;
  }
  interface Window {
    FaceDetector?: typeof FaceDetector;
  }
}

export interface VideoSegmentMetadata {
  startTime: number;
  endTime: number;
  motionLevel: "static" | "low" | "medium" | "high" | "shake";
  isDark: boolean;
  isBlurry: boolean;
  hasFaces: boolean;
  faceX?: number;
  faceY?: number;
  /** Относительная площадь самого крупного лица (0..1) — характер кадра: общий/средний/крупный план. */
  faceSize?: number;
  /** Средняя яркость кадра (0..255) — для авто-экспозиции при склейке разных камер. */
  brightness?: number;
  /** Размах яркости (0..255) — мера контраста кадра. */
  contrast?: number;
  /** Средняя насыщенность (0..255). */
  saturation?: number;
  qualityScore: number; // 1-10
  isSceneChange: boolean;
  hasAction: boolean;
  aestheticScore: number;
}

// ---------------------------------------------------------------------------
// Face detection engine
//
// window.FaceDetector — экспериментальный API, отсутствует в Firefox/Safari и по
// умолчанию выключен в Chrome, поэтому полагаться на него нельзя: face-aware
// монтаж (хуки с лицами, умный рефрейминг) молча умирал бы у большинства
// пользователей. Основной движок — MediaPipe BlazeFace (short-range), который
// лениво подгружается с нашего же домена из /public/mediapipe (open-source,
// работает везде, ~230Кб модель + WASM).
// ---------------------------------------------------------------------------

type MpDetector = { send: (input: { image: HTMLCanvasElement }) => Promise<void>; onResults: (cb: (r: any) => void) => void; setOptions?: (o: any) => void; close?: () => void };

let mpDetectorPromise: Promise<MpDetector | null> | null = null;

function loadMediaPipeFaceDetector(): Promise<MpDetector | null> {
  if (mpDetectorPromise) return mpDetectorPromise;
  mpDetectorPromise = (async () => {
    if (!(window as any).FaceDetection) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/mediapipe/face_detection/face_detection.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("MediaPipe script failed to load"));
        document.head.appendChild(s);
      });
    }
    const Ctor = (window as any).FaceDetection;
    if (!Ctor) throw new Error("FaceDetection global is missing");
    const detector: MpDetector = new Ctor({
      locateFile: (file: string) => `/mediapipe/face_detection/${file}`,
    });
    detector.setOptions?.({ model: "short", minDetectionConfidence: 0.5 });
    return detector;
  })().catch((e) => {
    console.warn("[localAnalyzer] MediaPipe недоступен, лица детектируем нативно/не детектируем:", e);
    mpDetectorPromise = null; // retry next time
    return null;
  });
  return mpDetectorPromise;
}

interface MpFace { x: number; y: number; size: number }

function detectFacesWithMediaPipe(detector: MpDetector, source: HTMLCanvasElement): Promise<MpFace | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: MpFace | null) => { if (!settled) { settled = true; resolve(v); } };
    const timeout = setTimeout(() => finish(null), 2000);
    try {
      detector.onResults((res: any) => {
        clearTimeout(timeout);
        const dets = res?.detections || [];
        if (!dets.length) return finish(null);
        const largest = dets.reduce((p: any, c: any) =>
          (c.boundingBox.width * c.boundingBox.height > p.boundingBox.width * p.boundingBox.height) ? c : p);
        finish({
          x: largest.boundingBox.xCenter,
          y: largest.boundingBox.yCenter,
          size: largest.boundingBox.width * largest.boundingBox.height,
        });
      });
      detector.send({ image: source }).catch(() => { clearTimeout(timeout); finish(null); });
    } catch {
      clearTimeout(timeout);
      finish(null);
    }
  });
}

// Lightweight Laplacian Variance for blur detection
function calculateLaplacianVariance(data: Uint8ClampedArray, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const top = ((y - 1) * width + x) * 4;
      const bottom = ((y + 1) * width + x) * 4;
      const left = (y * width + (x - 1)) * 4;
      const right = (y * width + (x + 1)) * 4;

      // Luminance (fast approx)
      const lC = (data[i] + data[i+1] + data[i+2]) / 3;
      const lT = (data[top] + data[top+1] + data[top+2]) / 3;
      const lB = (data[bottom] + data[bottom+1] + data[bottom+2]) / 3;
      const lL = (data[left] + data[left+1] + data[left+2]) / 3;
      const lR = (data[right] + data[right+1] + data[right+2]) / 3;

      const laplacian = lT + lB + lL + lR - 4 * lC;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }
  const mean = sum / count;
  return (sumSq / count) - (mean * mean);
}

export async function analyzeVideoLocally(
  file: File,
  onProgress?: (progress: number) => void
): Promise<VideoSegmentMetadata[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    
    const canvas = document.createElement("canvas");
    // 64x64 is a sweet spot: fast for JS, enough detail for basic blur/contrast detection
    const W = 64;
    const H = 64;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // Отдельный кадр повышенного разрешения для детектора лиц:
    // на 64x64 маленькие лица неразличимы для нейросети.
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 192;
    faceCanvas.height = 192;
    const faceCtx = faceCanvas.getContext("2d");

    let nativeFaceDetector: any = null;
    if (typeof window !== "undefined" && window.FaceDetector) {
      try {
        nativeFaceDetector = new window.FaceDetector();
      } catch { /* ignore */ }
    }

    if (!ctx) {
      URL.revokeObjectURL(url);
      return resolve([]);
    }

    const segments: VideoSegmentMetadata[] = [];
    let prevData: Uint8ClampedArray | null = null;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!duration || duration === Infinity) {
        URL.revokeObjectURL(url);
        return resolve([]);
      }

      // Лениво поднимаем MediaPipe (WASM ~6Мб) только когда реально анализируем видео.
      const mpDetector = await loadMediaPipeFaceDetector();
      if (mpDetector) {
        console.info("[localAnalyzer] Детекция лиц: MediaPipe BlazeFace");
      }

      const fpsTarget = 2; // analyze 2 frames per second
      const step = 1 / fpsTarget;
      let currentTime = 0;

      const processFrame = async () => {
        ctx.drawImage(video, 0, 0, W, H);
        const imageData = ctx.getImageData(0, 0, W, H);
        const data = imageData.data;

        let totalBrightness = 0;
        let changedPixels = 0;
        let diffSum = 0;
        
        let minLuma = 255;
        let maxLuma = 0;
        let totalSaturation = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          totalBrightness += luma;
          
          if (luma < minLuma) minLuma = luma;
          if (luma > maxLuma) maxLuma = luma;
          
          const maxRGB = Math.max(r, g, b);
          const minRGB = Math.min(r, g, b);
          totalSaturation += (maxRGB - minRGB);

          if (prevData) {
            const pr = prevData[i];
            const pg = prevData[i + 1];
            const pb = prevData[i + 2];
            const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
            diffSum += diff;
            if (diff > 40) changedPixels++;
          }
        }

        const pixelCount = W * H;
        const avgBrightness = totalBrightness / pixelCount;
        const avgSaturation = totalSaturation / pixelCount;
        const contrast = maxLuma - minLuma;
        
        const isDark = avgBrightness < 30 || maxLuma < 100;
        
        // Calculate Blur
        const laplacianVar = calculateLaplacianVariance(data, W, H);
        const isBlurry = laplacianVar < 100 && contrast < 150; // threshold for 64x64

        // Detect Faces: сначала нативный API (если вдруг включён), затем MediaPipe.
        let hasFaces = false;
        let faceX: number | undefined;
        let faceY: number | undefined;
        let faceSize: number | undefined;

        if (nativeFaceDetector) {
          try {
             const faces = await nativeFaceDetector.detect(canvas);
             if (faces.length > 0) {
               hasFaces = true;
               const largest = faces.reduce((p: any, c: any) =>
                 (c.boundingBox.width * c.boundingBox.height > p.boundingBox.width * p.boundingBox.height) ? c : p
               );
               faceX = (largest.boundingBox.x + largest.boundingBox.width / 2) / W;
               faceY = (largest.boundingBox.y + largest.boundingBox.height / 2) / H;
               faceSize = (largest.boundingBox.width * largest.boundingBox.height) / (W * H);
             }
          } catch { /* fallback */ }
        }

        if (!hasFaces && mpDetector && faceCtx) {
          faceCtx.drawImage(video, 0, 0, faceCanvas.width, faceCanvas.height);
          const mpFace = await detectFacesWithMediaPipe(mpDetector, faceCanvas);
          if (mpFace) {
            hasFaces = true;
            faceX = Math.min(1, Math.max(0, mpFace.x));
            faceY = Math.min(1, Math.max(0, mpFace.y));
            faceSize = mpFace.size;
          }
        }

        
        // Motion metrics
        const motionRatio = changedPixels / pixelCount;
        
        // Let's determine if the motion is localized (interesting action) vs global (camera pan/shake)
        // We do this by seeing if the changed pixels are concentrated or spread out.
        let actionScore = 0;
        if (motionRatio > 0.05 && motionRatio < 0.4) {
          // If between 5% and 40% of the screen is moving, it's highly likely to be a subject moving, not the camera.
          actionScore = 1;
        }

        let motionLevel: "static" | "low" | "medium" | "high" | "shake" = "low";
        if (motionRatio < 0.01) motionLevel = "static";
        else if (motionRatio > 0.6) motionLevel = "shake"; // Massive full-frame changes often mean camera shake or bad tracking
        else if (motionRatio > 0.3) motionLevel = "high";
        else if (motionRatio > 0.08) motionLevel = "medium";

        // Scene change detection
        const avgDiff = diffSum / (pixelCount * 3);
        const isSceneChange = avgDiff > 45 && prevData !== null && motionRatio > 0.8;

        
        // Aesthetic scoring based on color theory (Rule of Thirds / Color harmony approximation)
        // High saturation + good contrast usually equals a more visually pleasing "stock-like" shot.
        let aestheticScore = 5;
        if (avgSaturation > 40 && contrast > 100 && !isDark && !isBlurry) aestheticScore += 3;
        if (hasFaces && !isBlurry) aestheticScore += 2;
        if (motionLevel === "shake" || isBlurry) aestheticScore -= 4;

        // Base Quality Score 1-10
        let qScore = 5;
        if (!isDark) qScore += 1;
        if (!isBlurry) qScore += 2;
        if (hasFaces) qScore += 2;
        if (actionScore > 0) qScore += 1; // Bonus for localized action
        if (avgSaturation > 30) qScore += 1; // colorful
        if (contrast > 120) qScore += 1; // good contrast
        if (motionLevel === "shake") qScore -= 3;
        if (isDark) qScore -= 2;
        
        qScore = Math.max(1, Math.min(10, Math.round(qScore)));
        aestheticScore = Math.max(1, Math.min(10, Math.round(aestheticScore)));

        segments.push({
          startTime: currentTime,
          endTime: Math.min(currentTime + step, duration),
          motionLevel,
          isDark,
          isBlurry,
          hasFaces,
          faceX,
          faceY,
          faceSize,
          brightness: Math.round(avgBrightness),
          contrast: Math.round(contrast),
          saturation: Math.round(avgSaturation),
          qualityScore: qScore,
          isSceneChange,
          hasAction: actionScore > 0,
          aestheticScore
        });

        prevData = new Uint8ClampedArray(data);
        currentTime += step;

        if (currentTime >= duration) {
          URL.revokeObjectURL(url);
          resolve(compactSegments(segments));
        } else {
          onProgress?.(currentTime / duration);
          video.currentTime = currentTime;
        }
      };

      video.onseeked = processFrame;
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve([]);
      };
      
      // trigger first frame
      video.currentTime = currentTime;
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve([]);
    };

    video.src = url;
  });
}

// Group similar consecutive frames to reduce JSON payload for the LLM
function compactSegments(raw: VideoSegmentMetadata[]): VideoSegmentMetadata[] {
  if (raw.length === 0) return [];
  const compacted: VideoSegmentMetadata[] = [];
  let current = { ...raw[0] };

  for (let i = 1; i < raw.length; i++) {
    const next = raw[i];
    
    // Check if we need to split into a new block
    const isMajorChange = 
      next.isSceneChange || 
      (next.motionLevel !== current.motionLevel && (next.motionLevel === "shake" || current.motionLevel === "shake")) ||
      next.isDark !== current.isDark ||
      next.isBlurry !== current.isBlurry ||
      next.hasAction !== current.hasAction ||
      next.hasFaces !== current.hasFaces ||
      Math.abs(next.qualityScore - current.qualityScore) > 3;

    if (isMajorChange) {
      compacted.push(current);
      current = { ...next };
    } else {
      // Expand current block
      current.endTime = next.endTime;
      // Average out the quality score
      current.qualityScore = Math.round((current.qualityScore + next.qualityScore) / 2);
      (current as any).aestheticScore = Math.round(((current as any).aestheticScore + (next as any).aestheticScore) / 2);
      // Усредняем статистику света/цвета для авто-экспозиции
      if (next.brightness !== undefined) (current as any).brightness = Math.round((((current as any).brightness ?? next.brightness) + next.brightness) / 2);
      if (next.contrast !== undefined) (current as any).contrast = Math.round((((current as any).contrast ?? next.contrast) + next.contrast) / 2);
      if (next.saturation !== undefined) (current as any).saturation = Math.round((((current as any).saturation ?? next.saturation) + next.saturation) / 2);
      // If any frame had faces or motion, keep the higher priority tags
      if (next.hasFaces) {
        current.hasFaces = true;
        if (next.faceX !== undefined) (current as any).faceX = next.faceX;
        if (next.faceY !== undefined) (current as any).faceY = next.faceY;
        if (next.faceSize !== undefined) (current as any).faceSize = Math.max(next.faceSize, (current as any).faceSize || 0);
      }
      if (next.hasAction) current.hasAction = true;
      if (next.motionLevel === "high" && current.motionLevel !== "shake") current.motionLevel = "high";
    }
  }
  compacted.push(current);
  return compacted;
}
