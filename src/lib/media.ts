"use client";

export interface MediaMeta {
  duration: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}

/**
 * Превью-кадры медиа. Размер намеренно скромный: миниатюры лежат прямо в
 * JSON проекта (IndexedDB-сохранения и история правок сериализуют их при
 * каждой операции). 240px при q=0.66 хватает для сетки медиатеки и карточек
 * проектов, но в ~3 раза легче прежних 320px/0.75 — сохранение и undo/redo
 * на больших проектах заметно быстрее.
 */
function canvasToJpeg(canvas: HTMLCanvasElement, maxSize = 240): string {
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas.toDataURL("image/jpeg", 0.66);
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  const ctx = small.getContext("2d");
  if (ctx) ctx.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.66);
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
  // Avoid crashing the browser on huge files
  if (file.size > 100 * 1024 * 1024) {
    return Array(buckets).fill(0.1);
  }
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


export interface AudioEnergySegment {
  startTime: number;
  endTime: number;
  energyLevel: "low" | "medium" | "high" | "drop";
}

/**
 * Классификация энергии по ПЕРЦЕНТИЛЯМ (вынесено для тестируемости в Node).
 *
 * Старая схема нормализовала окна к максимуму файла: на сжатой поп-музыке
 * RMS почти плоский → «high/drop» срабатывал и на интро (ложные дропы,
 * inPoint трека ставился на вступление), а одинокий выброс (хлопок, кашель)
 * становился эталоном «дропа». Профи-логика: структура трека читается
 * относительно его СОБСТВЕННОГО распределения:
 *   drop   — верхние ~15% энергии и заметно выше медианы и локального фона;
 *   high   — выше медианы;
 *   low    — нижние ~35% и заметно ниже медианы;
 *   medium — всё остальное.
 * Дополнительно дроп подтверждается локальным контрастом с окрестностью
 * (±7 окон): лес одинаково громких окон — это «фон высокой громкости»,
 * а не событие; событие = пик над фоном.
 */
export function classifyEnergyWindows(
  energies: number[],
  windowSec: number,
  duration: number,
): AudioEnergySegment[] {
  if (energies.length === 0) return [];
  const sorted = [...energies].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  const p15 = pct(0.15);
  const p50 = Math.max(pct(0.5), 1e-4);
  const p85 = pct(0.85);

  const segments: AudioEnergySegment[] = [];
  for (let i = 0; i < energies.length; i++) {
    const e = energies[i];
    // Локальный фон окрестности без самого окна
    let locSum = 0, locN = 0;
    for (let j = Math.max(0, i - 7); j <= Math.min(energies.length - 1, i + 7); j++) {
      if (j === i) continue;
      locSum += energies[j];
      locN++;
    }
    const locMean = locN > 0 ? locSum / locN : e;

    let level: AudioEnergySegment["energyLevel"];
    if (e >= p85 && e > p50 * 1.18 && e > locMean * 1.1) level = "drop";
    else if (e > p50 * 1.05) level = "high";
    else if (e <= p15 || e < p50 * 0.55) level = "low";
    else level = "medium";

    const startTime = i * windowSec;
    const endTime = Math.min(startTime + windowSec, duration);

    if (segments.length > 0 && segments[segments.length - 1].energyLevel === level) {
      segments[segments.length - 1].endTime = endTime;
    } else {
      segments.push({ startTime, endTime, energyLevel: level });
    }
  }
  return segments;
}

/** Analyzes an audio file and returns a timeline of energy levels (drops, buildups) */
export async function analyzeAudioEnergy(file: Blob): Promise<AudioEnergySegment[]> {
  if (file.size > 100 * 1024 * 1024) return []; // Skip heavy files

  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    const windowSec = 2; // analyze 2-second chunks
    const windowSamples = sampleRate * windowSec;
    const duration = buffer.duration;

    // Моно-сумма: кик/бас нередко панированы — по одному каналу структура теряется.
    const chans: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
    const energies: number[] = [];
    for (let i = 0; i < data.length; i += windowSamples) {
      const end = Math.min(i + windowSamples, data.length);
      let sumSq = 0;
      let count = 0;
      for (let j = i; j < end; j += 10) {
        let s = 0;
        for (let c = 0; c < chans.length; c++) s += chans[c][j];
        sumSq += s * s;
        count++;
      }
      energies.push(Math.sqrt(sumSq / count));
    }

    return classifyEnergyWindows(energies, windowSec, duration);
  } catch {
    return [];
  } finally {
    ctx.close();
  }
}
