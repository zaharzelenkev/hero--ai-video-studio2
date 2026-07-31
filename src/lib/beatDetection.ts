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

/**
 * Однополюсный НЧ-фильтр (RC-аппроксимация): выделяет полосу кика/баса.
 * O(n), бесплатно, проверенная классика предобработки onset-детекторов —
 * удар кика это метроном танцевальной и поп-музыки, а широкополосный флюкс
 * размывается вокалом и хэты.
 */
export function lowpassOnePole(data: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(data.length);
  const a = 1 - Math.exp(-2 * Math.PI * cutoffHz / sampleRate);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    out[i] = y;
  }
  return out;
}

/** Энергетическая огибающая по окнам windowSec с 50% перекрытием. */
export function energyEnvelope(data: Float32Array, sampleRate: number, windowSec = 0.05): { energies: number[]; hopSec: number } {
  const windowSize = Math.max(16, Math.floor(sampleRate * windowSec));
  const hop = Math.floor(windowSize / 2);
  const energies: number[] = [];
  for (let i = 0; i + windowSize < data.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) sum += data[j] * data[j];
    energies.push(sum / windowSize);
  }
  return { energies, hopSec: hop / sampleRate };
}

/** Положительная разность соседних окон (energy flux). */
export function fluxOf(energies: number[]): number[] {
  const flux: number[] = [0];
  for (let i = 1; i < energies.length; i++) {
    flux.push(Math.max(0, energies[i] - energies[i - 1]));
  }
  return flux;
}

/**
 * Комбинированный флюкс для онсетов: max(низкополосный*1.25, широкополосный).
 * Кик даёт самый чистый ритмический импульс — берём его приоритетным;
 * широкая полоса подхватывает акустику/фортепиано, где баса может не быть.
 * Оба канала нормализуются к своему 95-му перцентилю (устойчиво к выбросам).
 */
export function combinedOnsetFlux(data: Float32Array, sampleRate: number): { flux: number[]; hopSec: number } {
  const full = energyEnvelope(data, sampleRate);
  const low = energyEnvelope(lowpassOnePole(data, sampleRate, 150), sampleRate);
  const fluxFull = fluxOf(full.energies);
  const fluxLow = fluxOf(low.energies);
  const norm = (f: number[]) => {
    const s = [...f].sort((a, b) => a - b);
    const p95 = s[Math.floor(s.length * 0.95)] || 1;
    return Math.max(p95, 1e-9);
  };
  const nF = norm(fluxFull);
  const nL = norm(fluxLow);
  const n = Math.min(fluxFull.length, fluxLow.length);
  const flux: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    flux[i] = Math.max((fluxLow[i] / nL) * 1.25, fluxFull[i] / nF);
  }
  return { flux, hopSec: full.hopSec };
}

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

  const { flux, hopSec } = combinedOnsetFlux(data, sampleRate);
  const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows
  const hop = Math.floor(windowSize / 2);

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
  const grid = buildBeatGrid(flux, hopSec, buffer.duration, beats);
  if (grid && grid.length > beats.length * 0.5) {
    return grid;
  }
  return beats;
}

/**
 * Оценка темпа и фазы по energy-flux: автокорреляция (классика открытых
 * beat-трекеров — aubio/essentia) + фаза максимумом суммарного флюкса на
 * узлах сетки. Возвращает равномерную сетку + сильные внесеточные онсеты
 * (акценты между долями, типичные для дропов) или null, если темп не читается.
 */
export function buildBeatGrid(
  flux: number[],
  hopSec: number,
  duration: number,
  onsets: number[],
): number[] | null {
  const minPeriodSec = 0.315; // ~190 BPM
  const maxPeriodSec = 1.0;   // 60 BPM
  const minLag = Math.round(minPeriodSec / hopSec);
  const maxLag = Math.round(maxPeriodSec / hopSec);

  if (flux.length <= maxLag * 4) return null;

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

  if (bestLag <= 0 || bestScore <= 0) return null;
  const periodSec = bestLag * hopSec;

  // Фаза сетки: сдвиг 0..period, максимизирующий суммарный flux на узлах сетки
  let bestPhase = 0;
  let bestPhaseScore = -1;
  const phaseSteps = 24;
  for (let s = 0; s < phaseSteps; s++) {
    const phase = (s / phaseSteps) * periodSec;
    let score = 0;
    for (let t = phase; t < duration; t += periodSec) {
      const fi = Math.round(t / hopSec);
      if (fi < flux.length) score += flux[fi];
    }
    if (score > bestPhaseScore) { bestPhaseScore = score; bestPhase = phase; }
  }

  const grid: number[] = [];
  for (let t = bestPhase; t <= duration; t += periodSec) {
    grid.push(Math.round(t * 1000) / 1000);
  }

  // Добавляем сильные внесеточные онсеты (акценты между долями, типично для дропов)
  let avgFlux = 0;
  for (const v of flux) avgFlux += v;
  avgFlux /= flux.length || 1;
  for (const b of onsets) {
    const nearGrid = grid.some((g) => Math.abs(g - b) < 0.09);
    if (nearGrid) continue;
    const fi = Math.round(b / hopSec);
    if (fi < flux.length && flux[fi] > avgFlux * 2.2) grid.push(b);
  }

  return grid.sort((a, b) => a - b);
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
