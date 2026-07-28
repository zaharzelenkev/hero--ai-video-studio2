
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
  qualityScore: number; // 1-10
  isSceneChange: boolean;
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

    let faceDetector: any = null;
    if (typeof window !== "undefined" && window.FaceDetector) {
      try {
        faceDetector = new window.FaceDetector();
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

        // Detect Faces (if supported by browser natively)
        let hasFaces = false;
        if (faceDetector) {
          try {
             const faces = await faceDetector.detect(canvas);
             hasFaces = faces.length > 0;
          } catch { /* fallback */ }
        }

        // Motion metrics
        const motionRatio = changedPixels / pixelCount;
        let motionLevel: "static" | "low" | "medium" | "high" | "shake" = "low";
        if (motionRatio < 0.01) motionLevel = "static";
        else if (motionRatio > 0.6) motionLevel = "shake"; // Massive full-frame changes often mean camera shake or bad tracking
        else if (motionRatio > 0.3) motionLevel = "high";
        else if (motionRatio > 0.08) motionLevel = "medium";

        // Scene change detection
        const avgDiff = diffSum / (pixelCount * 3);
        const isSceneChange = avgDiff > 45 && prevData !== null && motionRatio > 0.8;

        // Base Quality Score 1-10
        let qScore = 5;
        if (!isDark) qScore += 1;
        if (!isBlurry) qScore += 2;
        if (hasFaces) qScore += 2;
        if (avgSaturation > 30) qScore += 1; // colorful
        if (contrast > 120) qScore += 1; // good contrast
        if (motionLevel === "shake") qScore -= 3;
        if (isDark) qScore -= 2;
        
        qScore = Math.max(1, Math.min(10, Math.round(qScore)));

        segments.push({
          startTime: currentTime,
          endTime: Math.min(currentTime + step, duration),
          motionLevel,
          isDark,
          isBlurry,
          hasFaces,
          qualityScore: qScore,
          isSceneChange
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
      // If any frame had faces or motion, keep the higher priority tags
      if (next.hasFaces) current.hasFaces = true;
      if (next.motionLevel === "high" && current.motionLevel !== "shake") current.motionLevel = "high";
    }
  }
  compacted.push(current);
  return compacted;
}
