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
  // Моно-сумма каналов: басы и ударные часто смещены в один канал, иначе биты теряются.
  let data = buffer.getChannelData(0);
  if (buffer.numberOfChannels > 1) {
    const mixed = new Float32Array(data.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) mixed[i] += ch[i] / buffer.numberOfChannels;
    }
    data = mixed;
  }

  const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
  const hop = Math.floor(windowSize / 2);
  const hopSec = hop / sampleRate;
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

  // --- Темп-сетка (Beat Grid) ---
  // Онсеты без темпа дают неровный ритм склеек. Оцениваем BPM автокорреляцией
  // energy-flux (классический метод из open-source beat trackers, напр. aubio/essentia),
  // находим фазу и строим равномерную сетку. Возвращаем сетку + сильные внесеточные онсеты.
  const minPeriodSec = 0.315; // ~190 BPM
  const maxPeriodSec = 1.0;   // 60 BPM
  const minLag = Math.round(minPeriodSec / hopSec);
  const maxLag = Math.round(maxPeriodSec / hopSec);

  if (flux.length > maxLag * 4) {
    // Нормализация flux для устойчивой автокорреляции
    let meanF = 0;
    for (const v of flux) meanF += v;
    meanF /= flux.length;
    const centered = flux.map((v) => v - meanF);

    let bestLag = -1;
    let bestScore = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i + lag < centered.length; i++) corr += centered[i] * centered[i + lag];
      corr /= centered.length - lag;
      // Метрика чётности сетки: пики должны повторяться и через 2 периода
      let corr2 = 0;
      if (lag * 2 < centered.length) {
        for (let i = 0; i + lag * 2 < centered.length; i++) corr2 += centered[i] * centered[i + lag * 2];
        corr2 /= centered.length - lag * 2;
      }
      let score = corr + corr2 * 0.5;
      const bpm = 60 / (lag * hopSec);
      if (bpm >= 100 && bpm <= 150) score *= 1.12; // лёгкий приоритет танцевальному диапазону
      if (score > bestScore) { bestScore = score; bestLag = lag; }
    }

    if (bestLag > 0 && bestScore > 0) {
      const periodSec = bestLag * hopSec;

      // Фаза сетки: сдвиг 0..period, максимизирующий суммарный flux на узлах сетки
      let bestPhase = 0;
      let bestPhaseScore = -1;
      const phaseSteps = 24;
      for (let s = 0; s < phaseSteps; s++) {
        const phase = (s / phaseSteps) * periodSec;
        let score = 0;
        for (let t = phase; t < buffer.duration; t += periodSec) {
          const fi = Math.round(t / hopSec);
          if (fi < flux.length) score += flux[fi];
        }
        if (score > bestPhaseScore) { bestPhaseScore = score; bestPhase = phase; }
      }

      const grid: number[] = [];
      for (let t = bestPhase; t <= buffer.duration; t += periodSec) {
        grid.push(Math.round(t * 1000) / 1000);
      }

      // Добавляем сильные внесеточные онсеты (акценты между долями, типично для дропов)
      let avgFlux = 0;
      for (const v of flux) avgFlux += v;
      avgFlux /= flux.length || 1;
      for (const b of beats) {
        const nearGrid = grid.some((g) => Math.abs(g - b) < 0.09);
        if (nearGrid) continue;
        const fi = Math.round(b / hopSec);
        if (fi < flux.length && flux[fi] > avgFlux * 2.2) grid.push(b);
      }

      if (grid.length > beats.length * 0.5) {
        return grid.sort((a, b) => a - b);
      }
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
