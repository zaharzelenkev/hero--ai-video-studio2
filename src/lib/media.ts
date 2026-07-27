"use client";

export interface MediaMeta {
  duration: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}

function canvasToJpeg(canvas: HTMLCanvasElement, maxSize = 320): string {
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas.toDataURL("image/jpeg", 0.75);
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  const ctx = small.getContext("2d");
  if (ctx) ctx.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.75);
}

export function readVideoMeta(file: File): Promise<MediaMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, Math.max(0, video.duration / 4));
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      let thumbnail: string | undefined;
      try {
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnail = canvasToJpeg(canvas);
      } catch {
        thumbnail = undefined;
      }
      const meta: MediaMeta = {
        duration: video.duration || 0,
        width: video.videoWidth,
        height: video.videoHeight,
        thumbnail,
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать видео"));
    };
  });
}

export function readImageMeta(file: File): Promise<MediaMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      const thumbnail = canvasToJpeg(canvas);
      URL.revokeObjectURL(url);
      resolve({ duration: 4, width: img.naturalWidth, height: img.naturalHeight, thumbnail });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    img.src = url;
  });
}

export async function readAudioMeta(file: File): Promise<MediaMeta> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return { duration: buffer.duration };
  } finally {
    ctx.close();
  }
}

export function inferKind(file: File): "video" | "image" | "audio" {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return "audio";
}

/** Downsampled amplitude envelope, used to draw waveforms cheaply. */
export async function computeWaveformPeaks(file: Blob, buckets = 400): Promise<number[]> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const data = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(data.length / buckets));
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i++) {
      let sum = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, data.length);
      for (let j = start; j < end; j++) sum += Math.abs(data[j]);
      peaks.push(end > start ? sum / (end - start) : 0);
    }
    const max = Math.max(...peaks, 0.0001);
    return peaks.map((p) => p / max);
  } finally {
    ctx.close();
  }
}
