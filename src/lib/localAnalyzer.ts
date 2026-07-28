"use client";

export interface VideoSegmentMetadata {
  startTime: number;
  endTime: number;
  motionLevel: "low" | "medium" | "high";
  isDark: boolean;
  isSceneChange: boolean;
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
    // Keep it extremely small for blazing fast pixel analysis
    const W = 32;
    const H = 32;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx) {
      URL.revokeObjectURL(url);
      return resolve([]); // Fallback gracefully
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

      const processFrame = () => {
        ctx.drawImage(video, 0, 0, W, H);
        const imageData = ctx.getImageData(0, 0, W, H);
        const data = imageData.data;

        let totalBrightness = 0;
        let changedPixels = 0;
        let diffSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // Perceived brightness
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
          totalBrightness += brightness;

          if (prevData) {
            const pr = prevData[i];
            const pg = prevData[i + 1];
            const pb = prevData[i + 2];
            const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
            diffSum += diff;
            if (diff > 50) changedPixels++;
          }
        }

        const avgBrightness = totalBrightness / (W * H);
        const isDark = avgBrightness < 40; // 0-255 scale
        
        // Motion metrics
        const motionRatio = changedPixels / (W * H);
        let motionLevel: "low" | "medium" | "high" = "low";
        if (motionRatio > 0.4) motionLevel = "high";
        else if (motionRatio > 0.1) motionLevel = "medium";

        // Scene change detection (massive sudden difference)
        const avgDiff = diffSum / (W * H * 3);
        const isSceneChange = avgDiff > 45 && prevData !== null;

        segments.push({
          startTime: currentTime,
          endTime: Math.min(currentTime + step, duration),
          motionLevel,
          isDark,
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

// Group 0.5s frames into logical contiguous blocks to reduce JSON payload size for the LLM
function compactSegments(raw: VideoSegmentMetadata[]): VideoSegmentMetadata[] {
  if (raw.length === 0) return [];
  const compacted: VideoSegmentMetadata[] = [];
  let current = { ...raw[0] };

  for (let i = 1; i < raw.length; i++) {
    const next = raw[i];
    // If scene changed OR motion drastically changed, we start a new block
    if (next.isSceneChange || next.motionLevel !== current.motionLevel || next.isDark !== current.isDark) {
      compacted.push(current);
      current = { ...next };
    } else {
      // expand current block
      current.endTime = next.endTime;
    }
  }
  compacted.push(current);
  return compacted;
}
