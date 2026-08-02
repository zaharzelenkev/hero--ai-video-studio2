/**
 * MONTIQ Color Grading Engine
 * 
 * Профессиональная система цветокоррекции с реальной математикой.
 * Всё работает попиксельно на RGBA-буферах — как для превью, так и для экспорта.
 * 
 * Возможности:
 *   • Lift / Gamma / Gain (настоящие цветовые колёса с логарифмическим пространством)
 *   • RGB Curves (master + поканальные, монотонная кубическая интерполяция)
 *   • White Balance (температура в Кельвинах → RGB-матрица)
 *   • Tint (зелёный–пурпурный сдвиг)
 *   • Exposure (EV-компенсация, физически корректная)
 *   • Contrast (с точкой опоры — pivot)
 *   • Saturation (через Rec.709 luma)
 *   • Vibrance (интеллектуальная насыщенность: защищает skin tones и уже насыщенные цвета)
 *   • Highlights / Shadows / Whites / Blacks (селективная тоновая коррекция)
 *   • Skin Tone Protection (ключевой дифференциатор MONTIQ)
 *   • LUT (3D 33³, трилинейная интерполяция)
 *   • AI Auto Grade (анализ гистограммы + детекция сцены)
 */

import type { LutGrid } from "./editor/vfxEngine";

/* ------------------------------------------------------------------ */
/* Типы                                                                */
/* ------------------------------------------------------------------ */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LiftGammaGain {
  lift: RGB;   // корректирует тени (нормализовано -1..1 на канал)
  gamma: RGB;  // корректирует средние тона
  gain: RGB;   // корректирует света
}

export interface CurvePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export interface RGBCurvesDef {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export interface ColorGradeParams {
  // Базовые
  exposure: number;      // EV (-3..3)
  contrast: number;      // -1..1
  contrastPivot: number; // 0..1, по умолчанию 0.5
  saturation: number;    // -1..1
  vibrance: number;      // -1..1
  hue: number;           // градусы -180..180
  
  // Тоновые диапазоны
  highlights: number;    // -100..100
  shadows: number;       // -100..100
  whites: number;        // -100..100
  blacks: number;        // -100..100
  
  // Баланс белого
  temperature: number;   // -1 (холодный)..1 (тёплый)
  tint: number;          // -1 (зелёный)..1 (пурпурный)
  whiteBalanceK?: number; // Температура в Кельвинах (2000..15000)
  
  // Профессиональные
  gamma: number;         // 0.2..2.5
  liftGammaGain?: LiftGammaGain;
  curves?: RGBCurvesDef;
  
  // Skin tone protection
  skinToneProtection?: number; // 0..1
  
  // LUT
  lutIntensity?: number; // 0..1, интенсивность LUT
}

export interface AutoGradeResult {
  params: ColorGradeParams;
  confidence: number;
  sceneType: "indoor" | "outdoor" | "lowlight" | "bright" | "mixed" | "portrait" | "landscape";
  histogram: HistogramData;
}

export interface HistogramData {
  min: number;
  max: number;
  mean: number;
  median: number;
  shadows: number;   // % пикселей в тенях (0..25%)
  midtones: number;  // % (25..75%)
  highlights: number; // % (75..100%)
  rMean: number;
  gMean: number;
  bMean: number;
}

/* ------------------------------------------------------------------ */
/* Константы                                                           */
/* ------------------------------------------------------------------ */

const REC709_R = 0.2126;
const REC709_G = 0.7152;
const REC709_B = 0.0722;

/** Skin tone hues в HSV (30°–50° — типичные оттенки кожи всех рас). */
const SKIN_HUE_MIN = 15;
const SKIN_HUE_MAX = 50;
const SKIN_SAT_MIN = 0.1;
const SKIN_SAT_MAX = 0.7;
const SKIN_VAL_MIN = 0.2;
const SKIN_VAL_MAX = 0.95;

/* ------------------------------------------------------------------ */
/* Утилиты                                                             */
/* ------------------------------------------------------------------ */

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-9));
  return t * t * (3 - 2 * t);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = h / 360;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number, g: number, b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [r, g, b];
}

function luma(r: number, g: number, b: number): number {
  return REC709_R * r + REC709_G * g + REC709_B * b;
}

/* ------------------------------------------------------------------ */
/* Kelvin → RGB матрица (физически обоснованная)                       */
/* ------------------------------------------------------------------ */

/**
 * Преобразует цветовую температуру в Кельвинах в RGB-множители.
 * Основано на формуле Планка и адаптации к D65.
 */
function kelvinToRgb(kelvin: number): RGB {
  const k = clamp(kelvin, 1000, 40000) / 100;
  let r: number, g: number, b: number;

  if (k <= 66) {
    r = 1;
    g = 0.39008157876902 * Math.log(k) - 0.631841443788627;
    if (k <= 19) b = 0;
    else b = 1.12962286000891 * Math.log(k - 10) - 2.64506651302389;
  } else {
    r = 1.29293618606275 * Math.pow(k - 60, -0.1332047592);
    g = 1.12989086089548 * Math.pow(k - 60, -0.0755148492);
    b = 1;
  }
  return {
    r: clamp01(r),
    g: clamp01(g),
    b: clamp01(b),
  };
}

/* ------------------------------------------------------------------ */
/* Монотонная кубическая интерполяция (Fritsch–Carlson)                */
/* ------------------------------------------------------------------ */

function monotoneCubicInterp(points: CurvePoint[], x: number): number {
  if (points.length < 2) return x;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;

  let i = 0;
  while (i < points.length - 2 && points[i + 1].x < x) i++;

  const x0 = points[i].x, y0 = points[i].y;
  const x1 = points[i + 1].x, y1 = points[i + 1].y;
  const h = x1 - x0 || 1e-9;
  const t = (x - x0) / h;

  // Касательные
  let m0: number, m1: number;
  if (i === 0) {
    m0 = (points[1].y - points[0].y) / (points[1].x - points[0].x || 1e-9);
  } else {
    const d0 = (y0 - points[i - 1].y) / (x0 - points[i - 1].x || 1e-9);
    const d1 = (y1 - y0) / h;
    m0 = d0 * d1 <= 0 ? 0 : (d0 + d1) / 2;
    if (Math.abs(m0) > 3 * Math.abs(d1)) m0 = 3 * d1;
  }

  if (i >= points.length - 2) {
    const dLast = (points[points.length - 1].y - points[points.length - 2].y) /
      (points[points.length - 1].x - points[points.length - 2].x || 1e-9);
    m1 = dLast;
  } else {
    const d0 = (y1 - y0) / h;
    const d1 = (points[i + 2].y - y1) / (points[i + 2].x - x1 || 1e-9);
    m1 = d0 * d1 <= 0 ? 0 : (d0 + d1) / 2;
    if (Math.abs(m1) > 3 * Math.abs(d0)) m1 = 3 * d0;
  }

  const h00 = 2 * t * t * t - 3 * t * t + 1;
  const h10 = t * t * t - 2 * t * t + t;
  const h01 = -2 * t * t * t + 3 * t * t;
  const h11 = t * t * t - t * t;

  return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
}

/* ------------------------------------------------------------------ */
/* Основные операции попиксельно                                       */
/* ------------------------------------------------------------------ */

/** Применяет Exposure (EV) к компоненту. */
function applyExposure(v: number, ev: number): number {
  if (ev === 0) return v;
  return clamp01(v * Math.pow(2, ev));
}

/** Применяет Contrast с точкой опоры. */
function applyContrast(v: number, contrast: number, pivot: number): number {
  if (contrast === 0) return v;
  return clamp01((v - pivot) * (1 + contrast) + pivot);
}

/** Применяет Gamma. */
function applyGamma(v: number, gamma: number): number {
  if (gamma === 1) return v;
  return clamp01(Math.pow(v, 1 / gamma));
}

/** Применяет Lift/Gamma/Gain в log-пространстве (стандарт индустрии). */
function applyLiftGammaGainLog(v: number, lift: number, gamma: number, gain: number): number {
  // Преобразуем в log-пространство (смягчённое, чтобы избежать log(0))
  const logV = Math.log2(Math.max(v, 1e-6) + 0.001);
  const logLift = Math.log2(Math.max(lift, 1e-6) + 0.001);
  const logGain = Math.log2(Math.max(gain, 1e-6) + 0.001);

  // Lift/Gamma/Gain в log-пространстве
  let result = logV;
  result = result * gamma + logLift * (1 - gamma);
  result = result + logGain;

  return clamp01(Math.pow(2, result) - 0.001);
}

/**
 * Преобразует параметр Lift (-1..1) в множитель lift.
 * lift=0 → 1.0 (без изменений); lift>0 осветляет тени; lift<0 затемняет.
 */
function liftParamToValue(param: number): number {
  return 1 + param * 0.5;
}

function gammaParamToValue(param: number): number {
  return clamp(param, 0.1, 10);
}

function gainParamToValue(param: number): number {
  return 1 + param * 0.8;
}

/** Тоновая маска: насколько пиксель принадлежит теням (1 = чистые тени). */
function shadowMask(l: number): number {
  return 1 - smoothstep(0.15, 0.45, l);
}

/** Тоновая маска: средние тона. Экспортируется для будущего использования. */
export function midtoneMask(l: number): number {
  return 1 - Math.abs(l - 0.5) * 2;
}

/** Тоновая маска: света. */
function highlightMask(l: number): number {
  return smoothstep(0.55, 0.85, l);
}

/* ------------------------------------------------------------------ */
/* Skin Tone Detection                                                 */
/* ------------------------------------------------------------------ */

function isSkinPixel(r: number, g: number, b: number): number {
  const [h, s, v] = rgbToHsv(r, g, b);
  // Проверяем hue, saturation и value на попадание в диапазон кожи
  const hueOk = h >= SKIN_HUE_MIN && h <= SKIN_HUE_MAX;
  const satOk = s >= SKIN_SAT_MIN && s <= SKIN_SAT_MAX;
  const valOk = v >= SKIN_VAL_MIN && v <= SKIN_VAL_MAX;
  // Дополнительная проверка: R > G > B (характерно для кожи)
  const rgOk = r > g && g > b;
  const skinConf = hueOk && satOk && valOk && rgOk ? 1.0 :
    hueOk && satOk ? 0.5 : 0;
  return skinConf;
}

/* ------------------------------------------------------------------ */
/* Главная функция: применение полного грейда к RGBA-буферу             */
/* ------------------------------------------------------------------ */

export function applyColorGrade(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: ColorGradeParams,
  lutGrid?: LutGrid | null,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const totalPixels = width * height;

  // Предварительные вычисления
  const ev = params.exposure ?? 0;
  const contrast = params.contrast ?? 0;
  const pivot = params.contrastPivot ?? 0.5;
  const sat = params.saturation ?? 0;
  const vib = params.vibrance ?? 0;
  const hueShift = (params.hue ?? 0) / 360;
  const highlights = (params.highlights ?? 0) / 100;
  const shadows = (params.shadows ?? 0) / 100;
  const whites = (params.whites ?? 0) / 100;
  const blacks = (params.blacks ?? 0) / 100;
  const temp = params.temperature ?? 0;
  const tintVal = params.tint ?? 0;
  const gamma = params.gamma ?? 1;
  const skinProtect = params.skinToneProtection ?? 0;
  const lgg = params.liftGammaGain;
  const curves = params.curves;
  const lutIntensity = params.lutIntensity ?? 1;

  // White Balance из Кельвинов, если задан
  let wbR = 1, wbG = 1, wbB = 1;
  if (params.whiteBalanceK) {
    const kelvinRgb = kelvinToRgb(params.whiteBalanceK);
    wbR = kelvinRgb.r;
    wbG = kelvinRgb.g;
    wbB = kelvinRgb.b;
  }

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    let r = data[idx] / 255;
    let g = data[idx + 1] / 255;
    let b = data[idx + 2] / 255;
    const a = data[idx + 3];

    // --- Skin Tone Detection ---
    const skinFactor = skinProtect > 0.001 ? isSkinPixel(r, g, b) * skinProtect : 0;

    // --- White Balance (Kelvin) ---
    if (params.whiteBalanceK) {
      r = clamp01(r * wbR);
      g = clamp01(g * wbG);
      b = clamp01(b * wbB);
    }

    // --- Temperature & Tint (color balance shift) ---
    if (temp !== 0 || tintVal !== 0) {
      // Тёплый: +R, -B; Холодный: -R, +B; Tint: +G или +M
      const tr = 1 + temp * 0.25 + tintVal * 0.08;
      const tg = 1 + tintVal * 0.12;
      const tb = 1 - temp * 0.25 - tintVal * 0.08;
      r = clamp01(r * tr);
      g = clamp01(g * tg);
      b = clamp01(b * tb);
    }

    // --- Lift / Gamma / Gain per channel ---
    if (lgg) {
      const lr = liftParamToValue(lgg.lift.r);
      const lg = liftParamToValue(lgg.lift.g);
      const lb = liftParamToValue(lgg.lift.b);
      const gr = gammaParamToValue(1 + lgg.gamma.r);
      const gg = gammaParamToValue(1 + lgg.gamma.g);
      const gb = gammaParamToValue(1 + lgg.gamma.b);
      const gnr = gainParamToValue(lgg.gain.r);
      const gng = gainParamToValue(lgg.gain.g);
      const gnb = gainParamToValue(lgg.gain.b);

      r = applyLiftGammaGainLog(r, lr, gr, gnr);
      g = applyLiftGammaGainLog(g, lg, gg, gng);
      b = applyLiftGammaGainLog(b, lb, gb, gnb);
    }

    // --- Exposure ---
    r = applyExposure(r, ev);
    g = applyExposure(g, ev);
    b = applyExposure(b, ev);

    // --- Gamma (master) ---
    if (gamma !== 1) {
      r = applyGamma(r, gamma);
      g = applyGamma(g, gamma);
      b = applyGamma(b, gamma);
    }

    // --- Contrast ---
    if (contrast !== 0) {
      r = applyContrast(r, contrast, pivot);
      g = applyContrast(g, contrast, pivot);
      b = applyContrast(b, contrast, pivot);
    }

    // --- Highlights / Shadows / Whites / Blacks ---
    const l = luma(r, g, b);
    const shMask = shadowMask(l);
    const hlMask = highlightMask(l);

    if (shadows !== 0) {
      const sFactor = 1 + shadows * shMask;
      r = clamp01(r * sFactor);
      g = clamp01(g * sFactor);
      b = clamp01(b * sFactor);
    }
    if (highlights !== 0) {
      const hFactor = 1 + highlights * hlMask;
      r = clamp01(r * hFactor);
      g = clamp01(g * hFactor);
      b = clamp01(b * hFactor);
    }
    if (whites !== 0) {
      const wMask = smoothstep(0.7, 0.95, l);
      const wFactor = 1 + whites * wMask;
      r = clamp01(r * wFactor);
      g = clamp01(g * wFactor);
      b = clamp01(b * wFactor);
    }
    if (blacks !== 0) {
      const bMask = 1 - smoothstep(0.05, 0.25, l);
      const bFactor = 1 + blacks * bMask;
      r = clamp01(r * bFactor);
      g = clamp01(g * bFactor);
      b = clamp01(b * bFactor);
    }

    // --- Saturation ---
    if (sat !== 0) {
      const lum = luma(r, g, b);
      const satFactor = 1 + sat;
      r = clamp01(lum + (r - lum) * satFactor);
      g = clamp01(lum + (g - lum) * satFactor);
      b = clamp01(lum + (b - lum) * satFactor);
    }

    // --- Vibrance (smart saturation: protects skin tones & saturated colors) ---
    if (vib !== 0) {
      const lum = luma(r, g, b);
      const currentSat = Math.sqrt(
        (r - lum) ** 2 + (g - lum) ** 2 + (b - lum) ** 2,
      ) * 1.5;
      // Vibrance применяется сильнее к ненасыщенным пикселям
      const vibWeight = clamp01((1 - currentSat) * (1 - skinFactor * 0.85));
      const vibFactor = 1 + vib * vibWeight * 1.2;
      r = clamp01(lum + (r - lum) * vibFactor);
      g = clamp01(lum + (g - lum) * vibFactor);
      b = clamp01(lum + (b - lum) * vibFactor);
    }

    // --- Hue shift ---
    if (hueShift !== 0) {
      const [h, s, v] = rgbToHsv(r, g, b);
      const newHue = ((h / 360 + hueShift) % 1 + 1) % 1;
      const [nr, ng, nb] = hsvToRgb(newHue * 360, s, v);
      r = nr;
      g = ng;
      b = nb;
    }

    // --- Curves ---
    if (curves) {
      if (curves.master.length >= 2) {
        r = clamp01(monotoneCubicInterp(curves.master, r));
        g = clamp01(monotoneCubicInterp(curves.master, g));
        b = clamp01(monotoneCubicInterp(curves.master, b));
      }
      if (curves.red.length >= 2) r = clamp01(monotoneCubicInterp(curves.red, r));
      if (curves.green.length >= 2) g = clamp01(monotoneCubicInterp(curves.green, g));
      if (curves.blue.length >= 2) b = clamp01(monotoneCubicInterp(curves.blue, b));
    }

    // --- LUT (3D) ---
    if (lutGrid && lutIntensity > 0.001) {
      const [lr, lg, lb] = applyLut3D(r, g, b, lutGrid);
      const lint = clamp01(lutIntensity);
      r = r + (lr - r) * lint;
      g = g + (lg - g) * lint;
      b = b + (lb - b) * lint;
    }

    // --- Skin tone restoration ---
    if (skinFactor > 0.001) {
      // Частично возвращаем оригинальные цвета кожи
      const origR = data[idx] / 255;
      const origG = data[idx + 1] / 255;
      const origB = data[idx + 2] / 255;
      const restoreAmount = skinFactor * 0.4;
      r = lerp(r, origR, restoreAmount);
      g = lerp(g, origG, restoreAmount);
      b = lerp(b, origB, restoreAmount);
    }

    // Запись
    out[idx] = clamp(Math.round(clamp01(r) * 255), 0, 255);
    out[idx + 1] = clamp(Math.round(clamp01(g) * 255), 0, 255);
    out[idx + 2] = clamp(Math.round(clamp01(b) * 255), 0, 255);
    out[idx + 3] = a;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Трилинейная интерполяция 3D LUT                                     */
/* ------------------------------------------------------------------ */

function applyLut3D(r: number, g: number, b: number, lut: LutGrid): [number, number, number] {
  const { data: grid, size } = lut;
  const maxIdx = size - 1;
  const fr = r * maxIdx;
  const fg = g * maxIdx;
  const fb = b * maxIdx;
  const ir = Math.min(maxIdx - 1, Math.floor(fr));
  const ig = Math.min(maxIdx - 1, Math.floor(fg));
  const ib = Math.min(maxIdx - 1, Math.floor(fb));
  const dr = fr - ir;
  const dg = fg - ig;
  const db = fb - ib;
  const c000 = (1 - dr) * (1 - dg) * (1 - db);
  const c100 = dr * (1 - dg) * (1 - db);
  const c010 = (1 - dr) * dg * (1 - db);
  const c110 = dr * dg * (1 - db);
  const c001 = (1 - dr) * (1 - dg) * db;
  const c101 = dr * (1 - dg) * db;
  const c011 = (1 - dr) * dg * db;
  const c111 = dr * dg * db;

  const stride = size * size * 3;
  const i000 = (ir * size * size + ig * size + ib) * 3;
  const i100 = i000 + stride;
  const i010 = i000 + size * 3;
  const i110 = i100 + size * 3;
  const i001 = i000 + 3;
  const i101 = i100 + 3;
  const i011 = i010 + 3;
  const i111 = i110 + 3;

  const outR = (
    grid[i000] * c000 + grid[i100] * c100 +
    grid[i010] * c010 + grid[i110] * c110 +
    grid[i001] * c001 + grid[i101] * c101 +
    grid[i011] * c011 + grid[i111] * c111
  ) / 255;

  const outG = (
    grid[i000 + 1] * c000 + grid[i100 + 1] * c100 +
    grid[i010 + 1] * c010 + grid[i110 + 1] * c110 +
    grid[i001 + 1] * c001 + grid[i101 + 1] * c101 +
    grid[i011 + 1] * c011 + grid[i111 + 1] * c111
  ) / 255;

  const outB = (
    grid[i000 + 2] * c000 + grid[i100 + 2] * c100 +
    grid[i010 + 2] * c010 + grid[i110 + 2] * c110 +
    grid[i001 + 2] * c001 + grid[i101 + 2] * c101 +
    grid[i011 + 2] * c011 + grid[i111 + 2] * c111
  ) / 255;

  return [outR, outG, outB];
}

/* ------------------------------------------------------------------ */
/* Анализ гистограммы (для AI Auto Grade)                              */
/* ------------------------------------------------------------------ */

export function analyzeHistogram(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HistogramData {
  const totalPixels = width * height;
  const lumaValues: number[] = [];
  let rSum = 0, gSum = 0, bSum = 0;
  let shadowCount = 0, midCount = 0, highCount = 0;

  // Сэмплируем каждый 4-й пиксель для скорости
  const step = Math.max(1, Math.floor(totalPixels / 5000));
  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    const l = luma(r, g, b);
    lumaValues.push(l);
    rSum += r;
    gSum += g;
    bSum += b;
    if (l < 0.25) shadowCount++;
    else if (l < 0.75) midCount++;
    else highCount++;
  }

  const n = lumaValues.length || 1;
  lumaValues.sort((a, b) => a - b);

  return {
    min: lumaValues[0] ?? 0,
    max: lumaValues[lumaValues.length - 1] ?? 1,
    mean: lumaValues.reduce((a, b) => a + b, 0) / n,
    median: lumaValues[Math.floor(n / 2)] ?? 0.5,
    shadows: shadowCount / n,
    midtones: midCount / n,
    highlights: highCount / n,
    rMean: rSum / n,
    gMean: gSum / n,
    bMean: bSum / n,
  };
}

/* ------------------------------------------------------------------ */
/* AI Auto Grade                                                       */
/* ------------------------------------------------------------------ */

/**
 * AI Auto Grade анализирует гистограмму кадра и автоматически
 * подбирает оптимальные параметры цветокоррекции.
 */
export function autoGrade(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): AutoGradeResult {
  const hist = analyzeHistogram(data, width, height);
  const params: ColorGradeParams = {
    exposure: 0,
    contrast: 0,
    contrastPivot: 0.5,
    saturation: 0,
    vibrance: 0,
    hue: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    gamma: 1,
  };

  // Определяем тип сцены
  let sceneType: AutoGradeResult["sceneType"] = "mixed";
  if (hist.median < 0.18) sceneType = "lowlight";
  else if (hist.median > 0.75) sceneType = "bright";
  else if (hist.shadows > 0.5) sceneType = "indoor";
  else if (hist.highlights > 0.4) sceneType = "outdoor";

  // Проверяем на портрет (преобладание skin-tone hue)
  let skinPixels = 0;
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(totalPixels / 3000));
  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    skinPixels += isSkinPixel(data[idx] / 255, data[idx + 1] / 255, data[idx + 2] / 255);
  }
  if (skinPixels / (totalPixels / step) > 0.15) sceneType = "portrait";
  else if (hist.shadows < 0.25 && hist.highlights > 0.3) sceneType = "landscape";

  // Автоматическая экспозиция: приводим медиану к ~0.45
  const targetMedian = 0.45;
  const exposureCorrection = Math.log2(targetMedian / Math.max(hist.median, 0.01));
  params.exposure = clamp(exposureCorrection * 0.7, -2, 2);

  // Автоматический контраст
  const dynamicRange = hist.max - hist.min;
  if (dynamicRange < 0.4) {
    params.contrast = clamp((0.4 - dynamicRange) * 1.5, 0, 0.5);
  } else if (dynamicRange > 0.9) {
    params.contrast = clamp((0.9 - dynamicRange) * 0.5, -0.3, 0);
  }

  // Тени и света
  if (hist.shadows > 0.45) {
    params.shadows = clamp((0.45 - hist.shadows) * 60, -40, 40);
    params.blacks = clamp((0.45 - hist.shadows) * 30, -30, 20);
  }
  if (hist.highlights > 0.4) {
    params.highlights = clamp((0.35 - hist.highlights) * 50, -40, 30);
  }

  // Баланс белого по средним каналов
  const avgRgb = (hist.rMean + hist.gMean + hist.bMean) / 3;
  if (avgRgb > 0.01) {
    const rBias = hist.rMean / avgRgb - 1;
    const bBias = hist.bMean / avgRgb - 1;
    params.temperature = clamp((rBias - bBias) * 0.6, -0.5, 0.5);
    params.tint = clamp((hist.gMean / avgRgb - 1) * 0.3, -0.3, 0.3);
  }

  // Насыщенность
  if (sceneType === "portrait") {
    params.saturation = 0.03;
    params.vibrance = 0.08;
    params.skinToneProtection = 0.6;
  } else if (sceneType === "landscape") {
    params.saturation = 0.12;
    params.vibrance = 0.15;
  } else if (sceneType === "lowlight") {
    params.saturation = -0.05;
    params.gamma = 1.1;
  } else {
    params.saturation = 0.05;
    params.vibrance = 0.08;
  }

  // Gamma для низкой освещённости
  if (hist.median < 0.25) {
    params.gamma = clamp(1 + (0.25 - hist.median) * 0.6, 1, 1.3);
  }

  return {
    params,
    confidence: clamp01(0.5 + dynamicRange * 0.5),
    sceneType,
    histogram: hist,
  };
}

/* ------------------------------------------------------------------ */
/* Экспорт параметров в FFmpeg-выражения (для filterGraph)             */
/* ------------------------------------------------------------------ */

export function colorParamsToFfmpegExpr(params: ColorGradeParams): {
  brightnessExpr: string;
  contrastExpr: string;
  saturationExpr: string;
  gammaExpr: string;
  hueExpr: string;
  colorbalanceExpr: string;
} {
  const exposure = params.exposure ?? 0;
  const contrast = params.contrast ?? 0;
  const saturation = params.saturation ?? 0;
  const gamma = params.gamma ?? 1;
  const hue = params.hue ?? 0;
  const temp = params.temperature ?? 0;
  const tintVal = params.tint ?? 0;

  return {
    brightnessExpr: (Math.pow(2, exposure) - 1).toFixed(4),
    contrastExpr: (1 + contrast).toFixed(4),
    saturationExpr: (1 + saturation).toFixed(4),
    gammaExpr: gamma.toFixed(4),
    hueExpr: hue.toFixed(2),
    colorbalanceExpr:
      `rs=${(temp * 0.3 + tintVal * 0.1).toFixed(3)}:` +
      `gs=${(tintVal * 0.15).toFixed(3)}:` +
      `bs=${(-temp * 0.3 - tintVal * 0.1).toFixed(3)}`,
  };
}
