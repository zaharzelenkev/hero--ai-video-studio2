"use client";

/**
 * Lightweight, fully client-side beat/onset detector.
 *
 * There is no paid AI API involved: we decode the audio with the Web Audio
 * API, compute a short-time energy envelope, and pick local energy peaks
 * that exceed a rolling average ("energy flux" onset detection). This is a
 * classic DSP technique used by many open-source beat trackers and is good
 * enough to snap auto-generated cuts to the music.
 */
export async function detectBeats(file: File, minIntervalSec = 0.25): Promise<number[]> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close();
  }

  const sampleRate = buffer.sampleRate;
  const data = buffer.getChannelData(0);

  const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
  const hop = Math.floor(windowSize / 2);
  const energies: number[] = [];
  for (let i = 0; i + windowSize < data.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) sum += data[j] * data[j];
    energies.push(sum / windowSize);
  }

  // Energy flux: positive difference between consecutive frames.
  const flux: number[] = [0];
  for (let i = 1; i < energies.length; i++) {
    flux.push(Math.max(0, energies[i] - energies[i - 1]));
  }

  // Rolling average threshold (adaptive).
  const smoothWindow = 20;
  const beats: number[] = [];
  const minGapFrames = Math.max(1, Math.round((minIntervalSec * sampleRate) / hop));
  let lastBeatFrame = -minGapFrames;

  for (let i = 0; i < flux.length; i++) {
    const start = Math.max(0, i - smoothWindow);
    const end = Math.min(flux.length, i + smoothWindow);
    let avg = 0;
    for (let j = start; j < end; j++) avg += flux[j];
    avg /= end - start || 1;
    const threshold = avg * 1.5 + 0.0005;
    if (flux[i] > threshold && i - lastBeatFrame >= minGapFrames) {
      beats.push((i * hop) / sampleRate);
      lastBeatFrame = i;
    }
  }

  return beats;
}

/** Snap a target time to the closest detected beat within a tolerance window. */
export function snapToBeat(time: number, beats: number[], tolerance = 0.5): number {
  if (beats.length === 0) return time;
  let closest = beats[0];
  let bestDist = Math.abs(time - closest);
  for (const b of beats) {
    const d = Math.abs(time - b);
    if (d < bestDist) {
      bestDist = d;
      closest = b;
    }
  }
  return bestDist <= tolerance ? closest : time;
}
