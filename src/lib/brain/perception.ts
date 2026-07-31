/**
 * PERCEPTION ENGINE — слой восприятия AI Director.
 *
 * Превращает сырой анализ материалов (покадровые сегменты localAnalyzer,
 * энергетику аудиодорожек, транскрипты Whisper, бит-сетку музыки) в
 * структурированное ПОНИМАНИЕ, на котором режиссёр принимает решения:
 *
 *   - монтажные планы (shots): композиция (общий/средний/крупный),
 *     движение камеры (панорама/наезд/слежение/тряска), динамика, эмоция,
 *     качество и итоговая режиссёрская оценка с объяснением причин;
 *   - сильные и слабые моменты каждого материала;
 *   - речевые фразы с драматическими паузами;
 *   - музыкальная карта (биты, BPM, дропы, энергия) в координатах таймлайна.
 *
 * Модуль чистый: без DOM, window и случайности — работает в браузере
 * и в Node-тестах, для одних и тех же данных даёт один и тот же результат.
 */

import type { VideoSegmentMetadata } from "../localAnalyzer";
import type { AudioEnergySegment } from "../media";

// ---------------------------------------------------------------------------
// Входные данные (совместимы с AIAnalysisRequest["assets"])
// ---------------------------------------------------------------------------

export interface PerceivedAssetInput {
  id: string;
  name: string;
  type: "video" | "image" | "audio";
  duration?: number;
  width?: number;
  height?: number;
  transcript?: string;
  segments?: VideoSegmentMetadata[];
  audioEnergy?: AudioEnergySegment[];
}

export interface PerceiveInput {
  assets: PerceivedAssetInput[];
  /** Бит-сетка в координатах ТАЙМЛАЙНА (уже со сдвигом на inPoint музыки). */
  beats?: number[];
  /** Точка входа пользовательской музыки в координатах файла трека. */
  musicInPointSec?: number;
}

// ---------------------------------------------------------------------------
// Речь: фильтр мусорных фраз (единая точка правды для эвристики и LLM)
// ---------------------------------------------------------------------------

const SPEECH_FILLERS = new Set([
  "ну", "э", "ээ", "эээ", "м", "мм", "ммм", "аа", "эх",
  "типа", "какбы", "вот", "короче", "значит", "угу", "ага",
]);
const SPEECH_GREETING_RE = /^(привет|всем|здравствуйте|здорово|добрый|доброе|день|вечер|утро|друзья|ребята|hello|hi|hey|guys)$/i;

export function filterSpeechPhrases<T extends { start: number; end: number; text: string; isPause?: boolean }>(phrases: T[]): T[] {
  return phrases.filter((p) => {
    if (p.isPause) return true;
    const toks = p.text.toLowerCase().split(/\s+/)
      .map((w: string) => w.replace(/[^а-яa-zё]/g, ""))
      .filter(Boolean);
    if (toks.length === 0) return false;
    if (toks.every((w: string) => SPEECH_FILLERS.has(w))) return false;
    const realToks = toks.filter((w: string) => !SPEECH_FILLERS.has(w));
    if (realToks.length > 0 && realToks.every((w: string) => SPEECH_GREETING_RE.test(w)) && (p.end - p.start) < 2.2) return false;
    if (toks.length <= 3 && realToks.length <= 1 && (p.end - p.start) < 1.0) return false;
    if (p.end - p.start < 0.2) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Речь: разбор транскрипта во фразы (с драматическими паузами)
// ---------------------------------------------------------------------------

export interface SpeechPhrase {
  start: number;
  end: number;
  text: string;
  isPause?: boolean;
  assetId: string;
}

export function parseTranscriptPhrases(
  assetId: string,
  transcript: string,
  opts?: { keepPauses?: boolean },
): SpeechPhrase[] {
  const lines = transcript.split("\n").filter((l) => l.includes("]"));
  const words: { start: number; end: number; text: string }[] = [];
  for (const l of lines) {
    const m = l.match(/\[([\d.]+)s - ([\d.]+)s\] (.+)/);
    if (m) words.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), text: m[3].trim() });
  }
  if (words.length === 0) return [];

  const phrases: SpeechPhrase[] = [];
  let cur = { ...words[0] };
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const gap = w.start - cur.end;
    // >= 0.35: строгое «> 0.4» втаскивало хвостовые филлеры внутрь фразы
    // при паузе ровно-в-узел (фильтр их тогда уже не видел).
    if (gap >= 0.35 || cur.end - cur.start > 4.0) {
      phrases.push({ ...cur, assetId });
      // Пауза 0.7–2.5с между мыслями — драматический момент (reaction beat),
      // профи оставляют его в монтаже, а не режут как мёртвый воздух.
      if (opts?.keepPauses && gap >= 0.7 && gap <= 2.5) {
        phrases.push({ start: cur.end, end: w.start, text: "[ПАУЗА]", isPause: true, assetId });
      }
      cur = { ...w };
    } else {
      cur.end = w.end;
      cur.text += " " + w.text;
    }
  }
  phrases.push({ ...cur, assetId });
  return phrases;
}

/** Склейка ультракоротких фраз (<minLen): рубленая обрывочная речь даёт
 *  стробоскоп планов и субтитров. Обрывок вливаем в следующую фразу. */
export function mergeUltraShortPhrases(phrases: SpeechPhrase[], minLen = 0.45): SpeechPhrase[] {
  const merged: SpeechPhrase[] = [];
  for (const p of phrases) {
    const last = merged[merged.length - 1];
    if (last && !last.isPause && !p.isPause && last.end - last.start < minLen) {
      last.end = p.end;
      last.text += " " + p.text;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Энергия аудио
// ---------------------------------------------------------------------------

export const ENERGY_INTENSITY: Record<AudioEnergySegment["energyLevel"], number> = {
  low: 0.15,
  medium: 0.45,
  high: 0.75,
  drop: 1,
};

/** Максимальная энергия (0..1), перекрывающая окно [s, e]. */
export function peakEnergyOverlap(energy: AudioEnergySegment[] | undefined, s: number, e: number): number {
  if (!energy) return 0;
  let peak = 0;
  for (const seg of energy) {
    if (seg.endTime <= s || seg.startTime >= e) continue;
    peak = Math.max(peak, ENERGY_INTENSITY[seg.energyLevel] ?? 0);
  }
  return peak;
}

/** Средняя энергия (0..1), перекрывающая окно [s, e]. */
export function meanEnergyOverlap(energy: AudioEnergySegment[] | undefined, s: number, e: number): number {
  if (!energy) return 0;
  let sum = 0;
  let n = 0;
  for (const seg of energy) {
    if (seg.endTime <= s || seg.startTime >= e) continue;
    sum += ENERGY_INTENSITY[seg.energyLevel] ?? 0;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

// ---------------------------------------------------------------------------
// Монтажный план (shot): композиция, движение камеры, качество, эмоция
// ---------------------------------------------------------------------------

export type CameraMotionKind =
  | "static"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "dolly-in"
  | "dolly-out"
  | "handheld"
  | "shake"
  | "dynamic"
  | "drift"
  | "unknown";

export const CAMERA_LABELS: Record<CameraMotionKind, string> = {
  static: "статика",
  "pan-left": "панорама влево",
  "pan-right": "панорама вправо",
  "pan-up": "панорама вверх",
  "pan-down": "панорама вниз",
  "dolly-in": "наезд",
  "dolly-out": "отъезд",
  handheld: "ручная камера",
  shake: "тряска",
  dynamic: "динамичный кадр",
  drift: "плавное движение",
  unknown: "не определено",
};

export type ShotSize = "wide" | "medium" | "close";
export type ShotTier = "strong" | "usable" | "weak" | "reject";
export type ShotEmotion = "energetic" | "calm" | "dramatic" | "neutral";

export interface Shot {
  id: string;
  assetId: string;
  assetName: string;
  start: number;
  end: number;
  duration: number;
  /** Крупность плана из композиции кадра (по размеру лица). */
  size: ShotSize;
  cameraMotion: CameraMotionKind;
  dominantMotion: VideoSegmentMetadata["motionLevel"];
  hasFaces: boolean;
  faceX?: number;
  faceY?: number;
  faceSize?: number;
  hasAction: boolean;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  colorfulness?: number;
  dark: boolean;
  /** Кинематографичная тёмная сцена (неон, ночь): художественный выбор, не брак. */
  cinematicDark: boolean;
  blurry: boolean;
  qualityScore: number;
  aestheticScore: number;
  /** Визуальная динамика 0..1: движение + экшн + аудио-пик камерного звука. */
  momentum: number;
  audioPeak: number;
  emotion: ShotEmotion;
  /** Итоговая «режиссёрская привлекательность» плана. */
  score: number;
  tier: ShotTier;
  /** Человекочитаемые причины оценки — попадают в заметки режиссёра. */
  reasons: string[];
  /** Рекомендуемое окно нарезки внутри плана (края с браком подрезаны). */
  cutIn: number;
  cutOut: number;
  isAnalyzed: boolean;
}

export function isSteadyCamera(kind: CameraMotionKind): boolean {
  return kind === "static" || kind === "pan-left" || kind === "pan-right" || kind === "pan-up" || kind === "pan-down"
    || kind === "dolly-in" || kind === "dolly-out";
}

export function isUnstableCamera(kind: CameraMotionKind): boolean {
  return kind === "handheld" || kind === "shake";
}

/**
 * Вывод направления движения камеры по траектории лица в кадре.
 * Если лицо стабильно дрейфует вправо — камера панорамирует влево
 * (содержимое кадра «уплывает» против движения камеры).
 */
export function inferCameraMotion(
  faceSamples: { t: number; x: number; y: number; size: number }[],
  dominantMotion: VideoSegmentMetadata["motionLevel"],
  hasAction: boolean,
): CameraMotionKind {
  if (dominantMotion === "shake") return "shake";

  if (faceSamples.length >= 3) {
    const slopeX = linSlope(faceSamples, (p) => p.x);
    const slopeY = linSlope(faceSamples, (p) => p.y);
    const firstSize = Math.max(0.01, faceSamples[0].size);
    const sizeTrend = (faceSamples[faceSamples.length - 1].size - firstSize) / firstSize;
    const residualX = linResidualStd(faceSamples, (p) => p.x);

    if (Math.abs(slopeX) > 0.04 && residualX < 0.05) return slopeX > 0 ? "pan-left" : "pan-right";
    if (Math.abs(slopeY) > 0.04) return slopeY > 0 ? "pan-up" : "pan-down";
    if (sizeTrend > 0.35) return "dolly-in";
    if (sizeTrend < -0.35) return "dolly-out";
    if (residualX > 0.03) return "handheld";
    return "static";
  }

  if (dominantMotion === "static" || dominantMotion === "low") return "static";
  return hasAction ? "dynamic" : "drift";
}

function linSlope<T>(pts: T[], v: (p: T) => number): number {
  const n = pts.length;
  if (n < 2) return 0;
  let mt = 0;
  let mv = 0;
  pts.forEach((p, i) => {
    mt += (p as unknown as { t: number }).t ?? i;
    mv += v(p);
  });
  mt /= n;
  mv /= n;
  let num = 0;
  let den = 0;
  pts.forEach((p, i) => {
    const t = (p as unknown as { t: number }).t ?? i;
    num += (t - mt) * (v(p) - mv);
    den += (t - mt) * (t - mt);
  });
  return den > 0 ? num / den : 0;
}

function linResidualStd<T>(pts: T[], v: (p: T) => number): number {
  const n = pts.length;
  if (n < 3) return 0;
  const slope = linSlope(pts, v);
  let mt = 0;
  let mv = 0;
  pts.forEach((p, i) => {
    mt += (p as unknown as { t: number }).t ?? i;
    mv += v(p);
  });
  mt /= n;
  mv /= n;
  let sum = 0;
  pts.forEach((p, i) => {
    const t = (p as unknown as { t: number }).t ?? i;
    const d = v(p) - (mv + slope * (t - mt));
    sum += d * d;
  });
  return Math.sqrt(sum / n);
}

const MOTION_ENERGY: Record<VideoSegmentMetadata["motionLevel"], number> = {
  static: 0.12,
  low: 0.3,
  medium: 0.55,
  high: 0.8,
  shake: 1,
};

function aggregateShot(
  asset: PerceivedAssetInput,
  segs: VideoSegmentMetadata[],
  index: number,
  audioEnergy: AudioEnergySegment[] | undefined,
): Shot {
  const start = segs[0].startTime;
  const end = segs[segs.length - 1].endTime;
  const span = Math.max(0.001, end - start);

  let wq = 0, wa = 0, wb = 0, wc = 0, ws = 0, wcol = 0, wSum = 0;
  let darkW = 0, blurryW = 0;
  let hasFaces = false;
  let hasAction = false;
  let faceX: number | undefined;
  let faceY: number | undefined;
  let faceSize: number | undefined;
  const faceSamples: { t: number; x: number; y: number; size: number }[] = [];
  const motionW: Record<VideoSegmentMetadata["motionLevel"], number> = { static: 0, low: 0, medium: 0, high: 0, shake: 0 };

  for (const s of segs) {
    const w = Math.max(0.001, s.endTime - s.startTime);
    wSum += w;
    wq += (s.qualityScore ?? 5) * w;
    wa += (s.aestheticScore ?? 5) * w;
    if (s.brightness !== undefined) wb += s.brightness * w;
    if (s.contrast !== undefined) wc += s.contrast * w;
    if (s.saturation !== undefined) ws += s.saturation * w;
    if (s.colorfulness !== undefined) wcol += s.colorfulness * w;
    motionW[s.motionLevel] += w;
    if (s.isDark) darkW += w;
    if (s.isBlurry) blurryW += w;
    if (s.hasAction) hasAction = true;
    if (s.hasFaces) {
      hasFaces = true;
      if (s.faceX !== undefined && s.faceY !== undefined) {
        faceSamples.push({ t: s.startTime, x: s.faceX, y: s.faceY, size: s.faceSize ?? 0 });
        faceX = s.faceX;
        faceY = s.faceY;
        faceSize = Math.max(faceSize ?? 0, s.faceSize ?? 0);
      }
    }
  }

  const q = wq / wSum;
  const a = wa / wSum;
  const brightness = wSum > 0 ? wb / wSum : undefined;
  const contrast = wSum > 0 ? wc / wSum : undefined;
  const colorfulness = wSum > 0 ? wcol / wSum : undefined;
  const darkRatio = darkW / wSum;
  const blurryRatio = blurryW / wSum;
  const dark = darkRatio > 0.5;
  const cinematicDark = dark && (contrast ?? 0) >= 150;

  const dominantMotion = (Object.entries(motionW).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "static") as VideoSegmentMetadata["motionLevel"];
  const cameraMotion = inferCameraMotion(faceSamples, dominantMotion, hasAction);

  const audioPeak = peakEnergyOverlap(audioEnergy, start, end);
  const momentum = Math.min(1, MOTION_ENERGY[dominantMotion] * 0.62 + (hasAction ? 0.25 : 0) + audioPeak * 0.13);

  let emotion: ShotEmotion = "neutral";
  if (momentum >= 0.65) emotion = "energetic";
  else if (cinematicDark) emotion = "dramatic";
  else if (momentum <= 0.35 && !dark) emotion = "calm";

  // Итоговая оценка: та же шкала, что использовалась монтажным ядром,
  // + штрафы за нестабильность/брак — число должно объясняться.
  let score = q * 10 + a * 5;
  if (hasFaces) score += 20;
  if (hasAction) score += 30;
  score += Math.min(18, (colorfulness ?? 0) * 0.4);
  if (audioPeak > 0.7) score *= 1.25;
  else if (audioPeak > 0.4) score *= 1.1;
  else if (audioPeak > 0 && audioPeak <= 0.2 && !hasFaces && !hasAction) score -= 20;
  if (blurryRatio > 0.4) score -= 30;
  if (cameraMotion === "shake") score -= 60;
  if (dark && !cinematicDark) score -= 50;
  score = Math.round(score * 10) / 10;

  let tier: ShotTier = "usable";
  if ((dark && !cinematicDark) || cameraMotion === "shake" || (blurryRatio > 0.4 && (contrast ?? 0) < 70) || q < 2) {
    tier = "reject";
  } else if (q < 4 || blurryRatio > 0.4 || a <= 2) {
    tier = "weak";
  } else if (score >= 100 || (momentum > 0.7 && a >= 7)) {
    tier = "strong";
  }

  const size: ShotSize = faceSize !== undefined && faceSize >= 0.05 ? "close" : hasFaces ? "medium" : "wide";

  const reasons: string[] = [];
  if (hasFaces) reasons.push(size === "close" ? "крупный план лица" : "человек в кадре");
  if (hasAction) reasons.push("действие в кадре");
  if (cameraMotion !== "static" && cameraMotion !== "unknown") reasons.push(`камера: ${CAMERA_LABELS[cameraMotion]}`);
  if (q >= 8) reasons.push("высокое качество");
  if (a >= 8) reasons.push("эстетичный кадр");
  if ((colorfulness ?? 0) > 25) reasons.push("сочные цвета");
  if (audioPeak >= 0.75) reasons.push("пик звука площадки");
  if (dark && cinematicDark) reasons.push("художественная тёмная сцена");
  else if (dark) reasons.push("тёмный кадр (брак света)");
  if (blurryRatio > 0.4) reasons.push("смазанный кадр");
  if (cameraMotion === "shake") reasons.push("тряска камеры");

  // Подрезаем бракованные края плана (до 50% с каждой стороны): нарезка
  // начинается и заканчивается на живом кадре, а не на мерцании/темноте.
  let cutIn = start;
  let cutOut = end;
  let trimmed = 0;
  for (const s of segs) {
    const w = s.endTime - s.startTime;
    const good = !s.isDark && !s.isBlurry && s.motionLevel !== "shake" && (s.qualityScore ?? 5) >= 5;
    if (!good && trimmed + w <= span * 0.5) {
      cutIn = s.endTime;
      trimmed += w;
    } else break;
  }
  trimmed = 0;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const w = s.endTime - s.startTime;
    const good = !s.isDark && !s.isBlurry && s.motionLevel !== "shake" && (s.qualityScore ?? 5) >= 5;
    if (!good && trimmed + w <= span * 0.5 && s.endTime > cutIn + 0.6) {
      cutOut = s.startTime;
      trimmed += w;
    } else break;
  }
  if (cutOut - cutIn < 0.6) {
    cutIn = start;
    cutOut = end;
  }

  return {
    id: `${asset.id}#shot${index}@${start.toFixed(1)}`,
    assetId: asset.id,
    assetName: asset.name,
    start,
    end,
    duration: span,
    size,
    cameraMotion,
    dominantMotion,
    hasFaces,
    faceX,
    faceY,
    faceSize,
    hasAction,
    brightness: brightness !== undefined ? Math.round(brightness) : undefined,
    contrast: contrast !== undefined ? Math.round(contrast) : undefined,
    saturation: wSum > 0 ? Math.round(ws / wSum) : undefined,
    colorfulness: colorfulness !== undefined ? Math.round(colorfulness * 10) / 10 : undefined,
    dark,
    cinematicDark,
    blurry: blurryRatio > 0.4,
    qualityScore: Math.round(q * 10) / 10,
    aestheticScore: Math.round(a * 10) / 10,
    momentum: Math.round(momentum * 100) / 100,
    audioPeak,
    emotion,
    score,
    tier,
    reasons,
    cutIn,
    cutOut,
    isAnalyzed: true,
  };
}

/** План-заглушка для материала без покадрового анализа. */
function syntheticShot(asset: PerceivedAssetInput): Shot {
  const dur = Math.max(1, asset.duration ?? (asset.type === "image" ? 10 : 5));
  return {
    id: `${asset.id}#shot0@0.0`,
    assetId: asset.id,
    assetName: asset.name,
    start: 0,
    end: dur,
    duration: dur,
    size: "wide",
    cameraMotion: "unknown",
    dominantMotion: "static",
    hasFaces: false,
    hasAction: false,
    dark: false,
    cinematicDark: false,
    blurry: false,
    qualityScore: 5,
    aestheticScore: 5,
    momentum: 0.3,
    audioPeak: 0,
    emotion: "neutral",
    score: 50,
    tier: "usable",
    reasons: ["материал без покадрового анализа — оценка приблизительная"],
    cutIn: 0,
    cutOut: dur,
    isAnalyzed: false,
  };
}

/** Класс движения для границы моментов: статика/спокойствие / умеренное / бурное. */
function motionClassOf(m: VideoSegmentMetadata["motionLevel"]): 0 | 1 | 2 {
  return m === "static" || m === "low" ? 0 : m === "medium" ? 1 : 2;
}

/**
 * Сильная развязка между соседними окнами анализа — признак ДРУГОГО момента
 * внутри длинного дубля (детектор смен сцен промолчал): прыжок качества на 4+,
 * смена класса движения, появление/исчезновение человека, вход/выход из брака
 * (темнота/смаз) или просто дыра во времени анализа. Без этого всё видео
 * сливается в один «усреднённый» план, где эпик-момент тонет в посредственности.
 */
function isMomentBoundary(prev: VideoSegmentMetadata, cur: VideoSegmentMetadata): boolean {
  if (cur.startTime - prev.endTime > 0.3) return true;
  if (Math.abs((cur.qualityScore ?? 5) - (prev.qualityScore ?? 5)) >= 4) return true;
  if (motionClassOf(cur.motionLevel) !== motionClassOf(prev.motionLevel)) return true;
  if (!!cur.hasFaces !== !!prev.hasFaces) return true;
  if (!!cur.isDark !== !!prev.isDark) return true;
  if (!!cur.isBlurry !== !!prev.isBlurry) return true;
  return false;
}

/**
 * Нарезка материала на монтажные планы. Границы — детектированные смены сцен
 * И сильные развязки содержания (isMomentBoundary): длинный дубль дробится
 * на смысловые моменты, а не усредняется в бесформенный план. Окна за пределами
 * реальной длительности материала подрезаются — план не может ссылаться на
 * кадры, которых нет.
 */
export function buildShotsForAsset(
  asset: PerceivedAssetInput,
  opts?: { audioEnergy?: AudioEnergySegment[] },
): Shot[] {
  const sorted = (asset.segments ?? []).slice().sort((a, b) => a.startTime - b.startTime);
  const audioEnergy = opts?.audioEnergy ?? asset.audioEnergy;
  const dur = asset.duration ?? 0;

  const segs = dur > 0
    ? sorted
        .map((s) => ({ ...s, endTime: Math.min(s.endTime, dur) }))
        .filter((s) => s.endTime - s.startTime > 0.05)
    : sorted;

  if (segs.length === 0) {
    if (!(dur > 0)) return [];
    return [syntheticShot(asset)];
  }

  const groups: VideoSegmentMetadata[][] = [];
  let cur: VideoSegmentMetadata[] = [];
  for (const s of segs) {
    const prev = cur[cur.length - 1];
    if (prev && (s.isSceneChange || isMomentBoundary(prev, s))) {
      groups.push(cur);
      cur = [s];
    } else {
      cur.push(s);
    }
  }
  if (cur.length > 0) groups.push(cur);

  return groups.map((g, i) => aggregateShot(asset, g, i, audioEnergy));
}

// ---------------------------------------------------------------------------
// Музыкальное понимание
// ---------------------------------------------------------------------------

export interface MusicEnergyPoint {
  start: number;
  end: number;
  level: AudioEnergySegment["energyLevel"];
  intensity: number;
}

export interface MusicUnderstanding {
  /** Есть ли пользовательский музыкальный трек (аудио-ассет). */
  present: boolean;
  assetId?: string;
  inPoint: number;
  beatsTimeline: number[];
  beatDur?: number;
  bpm?: number;
  /** Начала дропов в координатах ТАЙМЛАЙНА (файловый offset вычтен). */
  dropsTimeline: number[];
  highsTimeline: number[];
  energyMap: MusicEnergyPoint[];
}

export function perceiveMusic(input: PerceiveInput): MusicUnderstanding {
  const musicAsset = input.assets.find((a) => a.type === "audio");
  const beats = (input.beats ?? []).filter((b) => b >= 0).sort((a, b) => a - b);

  let beatDur: number | undefined;
  let bpm: number | undefined;
  const deltas: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const d = beats[i] - beats[i - 1];
    if (d > 0.2 && d < 1.5) deltas.push(d);
  }
  if (deltas.length >= 3) {
    deltas.sort((a, b) => a - b);
    beatDur = deltas[Math.floor(deltas.length / 2)];
    bpm = Math.round(60 / beatDur);
  }

  const inPoint = input.musicInPointSec ?? 0;
  const energyMap: MusicEnergyPoint[] = (musicAsset?.audioEnergy ?? [])
    .map((e) => ({
      start: e.startTime - inPoint,
      end: e.endTime - inPoint,
      level: e.energyLevel,
      intensity: ENERGY_INTENSITY[e.energyLevel],
    }))
    .filter((e) => e.end > 0);

  const dropsTimeline = energyMap.filter((e) => e.level === "drop" && e.start > 0).map((e) => Math.round(e.start * 100) / 100);
  const highsTimeline = energyMap.filter((e) => e.level === "high" && e.start > 0).map((e) => Math.round(e.start * 100) / 100);

  return {
    present: !!musicAsset,
    assetId: musicAsset?.id,
    inPoint,
    beatsTimeline: beats,
    beatDur,
    bpm,
    dropsTimeline,
    highsTimeline,
    energyMap,
  };
}

// ---------------------------------------------------------------------------
// Итог восприятия
// ---------------------------------------------------------------------------

export interface WeakSpan {
  start: number;
  end: number;
  reason: string;
}

export interface AssetUnderstanding {
  assetId: string;
  name: string;
  kind: "video" | "image";
  duration: number;
  width?: number;
  height?: number;
  isAnalyzed: boolean;
  shots: Shot[];
  weakSpans: WeakSpan[];
  speech?: { phrases: SpeechPhrase[]; phrasesWithPauses: SpeechPhrase[] };
  meanQuality: number;
  meanAesthetic: number;
  dynamism: number;
}

export interface PerceptionResult {
  assets: AssetUnderstanding[];
  music: MusicUnderstanding;
  speechAssets: string[];
  visualAnalyzedCount: number;
  shotsTotal: number;
  strongTotal: number;
  weakTotal: number;
  rejectTotal: number;
  hasFacesAnywhere: boolean;
  bestGlobalShot?: Shot;
}

export function perceiveAssets(request: PerceiveInput): PerceptionResult {
  const assets: AssetUnderstanding[] = [];
  let strongTotal = 0;
  let weakTotal = 0;
  let rejectTotal = 0;
  let hasFacesAnywhere = false;
  let bestGlobalShot: Shot | undefined;

  for (const a of request.assets) {
    if (a.type === "audio") continue;
    const shots = buildShotsForAsset(a);
    const isAnalyzed = (a.segments ?? []).length > 0;

    const weakSpans: WeakSpan[] = [];
    let spanSum = 0, qSum = 0, aSum = 0, dynSum = 0;
    for (const s of shots) {
      spanSum += s.duration;
      qSum += s.qualityScore * s.duration;
      aSum += s.aestheticScore * s.duration;
      dynSum += s.momentum * s.duration;
      if (s.hasFaces) hasFacesAnywhere = true;
      if (s.tier === "strong") {
        strongTotal++;
        if (!bestGlobalShot || s.score > bestGlobalShot.score) bestGlobalShot = s;
      } else if (s.tier === "weak") {
        weakTotal++;
        weakSpans.push({ start: s.start, end: s.end, reason: s.reasons.join(", ") || "низкое качество" });
      } else if (s.tier === "reject") {
        rejectTotal++;
        weakSpans.push({ start: s.start, end: s.end, reason: s.reasons.join(", ") || "технический брак" });
      }
    }

    let speech: AssetUnderstanding["speech"];
    if (a.transcript && a.transcript.length > 10) {
      const filtered = filterSpeechPhrases(parseTranscriptPhrases(a.id, a.transcript));
      const withPauses = filterSpeechPhrases(parseTranscriptPhrases(a.id, a.transcript, { keepPauses: true }));
      const phrasesWithPauses = withPauses.length > 0 ? withPauses : filtered;
      if (phrasesWithPauses.length > 0) {
        speech = { phrases: filtered, phrasesWithPauses };
      }
    }

    assets.push({
      assetId: a.id,
      name: a.name,
      kind: a.type === "image" ? "image" : "video",
      duration: a.duration ?? 0,
      width: a.width,
      height: a.height,
      isAnalyzed,
      shots,
      weakSpans,
      speech,
      meanQuality: spanSum > 0 ? Math.round((qSum / spanSum) * 10) / 10 : 5,
      meanAesthetic: spanSum > 0 ? Math.round((aSum / spanSum) * 10) / 10 : 5,
      dynamism: spanSum > 0 ? Math.round((dynSum / spanSum) * 100) / 100 : 0.3,
    });
  }

  return {
    assets,
    music: perceiveMusic(request),
    speechAssets: assets.filter((a) => (a.speech?.phrasesWithPauses.length ?? 0) > 0).map((a) => a.assetId),
    visualAnalyzedCount: assets.filter((a) => a.isAnalyzed).length,
    shotsTotal: assets.reduce((acc, a) => acc + a.shots.length, 0),
    strongTotal,
    weakTotal,
    rejectTotal,
    hasFacesAnywhere,
    bestGlobalShot,
  };
}
