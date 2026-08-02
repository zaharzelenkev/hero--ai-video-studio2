/**
 * MONTIQ Color Grading Presets
 * 
 * Профессиональные пресеты цветокоррекции, каждый с точными параметрами.
 * Преобразуются в ColorGradeParams и затем применяются движком.
 */

import type { ColorGradeParams, CurvePoint, LiftGammaGain } from "./colorGrade";

export interface ColorPreset {
  id: string;
  name: string;
  description: string;
  category: "cinematic" | "platform" | "style" | "mood";
  thumbnail?: string;
  params: ColorGradeParams;
}

function c(pt: Partial<ColorGradeParams>): ColorGradeParams {
  return {
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
    ...pt,
  };
}

function curves(master: CurvePoint[], red?: CurvePoint[], green?: CurvePoint[], blue?: CurvePoint[]) {
  return {
    master,
    red: red ?? [],
    green: green ?? [],
    blue: blue ?? [],
  };
}

function lgg(
  lr = 0, lg = 0, lb = 0,
  gr = 0, gg = 0, gb = 0,
  gnr = 0, gng = 0, gnb = 0,
): LiftGammaGain {
  return {
    lift: { r: lr, g: lg, b: lb },
    gamma: { r: gr, g: gg, b: gb },
    gain: { r: gnr, g: gng, b: gnb },
  };
}

/* ------------------------------------------------------------------ */
/* Пресеты                                                             */
/* ------------------------------------------------------------------ */

export const COLOR_PRESETS: ColorPreset[] = [
  /* ======================== CINEMATIC ============================ */
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Классический кинематографичный лук: teal в тенях, тёплые света, мягкий контраст",
    category: "cinematic",
    params: c({
      contrast: 0.08,
      saturation: -0.08,
      vibrance: 0.05,
      gamma: 1.05,
      highlights: -10,
      shadows: 8,
      blacks: -5,
      temperature: 0.15,
      tint: -0.04,
      curves: curves(
        [
          { x: 0, y: 0.03 },
          { x: 0.25, y: 0.24 },
          { x: 0.5, y: 0.5 },
          { x: 0.75, y: 0.78 },
          { x: 1, y: 0.97 },
        ],
      ),
      liftGammaGain: lgg(
        0.03, 0.02, 0.07,   // lift: лёгкий teal в тенях
        -0.01, 0, 0.02,      // gamma
        0.05, 0.03, -0.02,   // gain: тёплые света
      ),
    }),
  },

  /* ======================== NETFLIX ============================== */
  {
    id: "netflix",
    name: "Netflix",
    description: "Современный 'Netflix look': чистый, глубокий контраст, нейтральные средние тона, богатые тени",
    category: "cinematic",
    params: c({
      contrast: 0.14,
      saturation: -0.04,
      vibrance: 0.06,
      gamma: 1.08,
      highlights: -15,
      shadows: 10,
      blacks: -10,
      whites: 8,
      temperature: 0.06,
      curves: curves(
        [
          { x: 0, y: 0.02 },
          { x: 0.3, y: 0.28 },
          { x: 0.55, y: 0.5 },
          { x: 0.8, y: 0.82 },
          { x: 1, y: 0.98 },
        ],
        undefined,
        [
          { x: 0, y: 0.01 },
          { x: 0.4, y: 0.42 },
          { x: 0.7, y: 0.68 },
          { x: 1, y: 0.96 },
        ],
      ),
      liftGammaGain: lgg(
        -0.02, 0, 0.05,       // lift: глубокие тени с лёгким cool
        0, 0, 0.02,            // gamma
        0.03, 0.02, 0,         // gain
      ),
    }),
  },

  /* ======================== DOCUMENTARY ============================ */
  {
    id: "documentary",
    name: "Documentary",
    description: "Натуральный, правдивый цвет для документалистики: нейтральный баланс, естественный контраст",
    category: "cinematic",
    params: c({
      contrast: 0.04,
      saturation: 0.02,
      vibrance: 0.04,
      gamma: 1.02,
      highlights: -5,
      shadows: 5,
      temperature: 0.02,
      curves: curves(
        [
          { x: 0, y: 0.01 },
          { x: 0.35, y: 0.36 },
          { x: 0.65, y: 0.64 },
          { x: 1, y: 0.99 },
        ],
      ),
    }),
  },

  /* ======================== COMMERCIAL ============================ */
  {
    id: "commercial",
    name: "Commercial",
    description: "Яркий, контрастный, сочный — идеально для рекламы и промо",
    category: "cinematic",
    params: c({
      contrast: 0.12,
      saturation: 0.15,
      vibrance: 0.12,
      gamma: 1.03,
      highlights: -8,
      shadows: 4,
      whites: 12,
      blacks: -6,
      curves: curves(
        [
          { x: 0, y: 0 },
          { x: 0.2, y: 0.18 },
          { x: 0.5, y: 0.52 },
          { x: 0.8, y: 0.84 },
          { x: 1, y: 1 },
        ],
      ),
      liftGammaGain: lgg(
        0, 0, 0,
        0, 0, 0,
        0.04, 0.04, 0.04,    // gain: всё чуть ярче
      ),
    }),
  },

  /* ======================== YOUTUBE ============================== */
  {
    id: "youtube",
    name: "YouTube",
    description: "Оптимизирован для YouTube: чистый, яркий, с хорошей читаемостью, slight pop",
    category: "platform",
    params: c({
      contrast: 0.08,
      saturation: 0.1,
      vibrance: 0.15,
      gamma: 1.01,
      highlights: -5,
      shadows: 8,
      whites: 6,
      blacks: -4,
      temperature: 0.04,
      curves: curves(
        [
          { x: 0, y: 0.02 },
          { x: 0.3, y: 0.31 },
          { x: 0.6, y: 0.6 },
          { x: 0.85, y: 0.88 },
          { x: 1, y: 1 },
        ],
      ),
    }),
  },

  /* ======================== TIKTOK =============================== */
  {
    id: "tiktok",
    name: "TikTok",
    description: "Максимально яркий и привлекающий внимание: повышенная насыщенность, контраст, vibrancy",
    category: "platform",
    params: c({
      contrast: 0.1,
      saturation: 0.2,
      vibrance: 0.25,
      gamma: 0.97,
      highlights: -10,
      shadows: 6,
      whites: 15,
      blacks: -8,
      temperature: 0.08,
      curves: curves(
        [
          { x: 0, y: 0 },
          { x: 0.15, y: 0.12 },
          { x: 0.45, y: 0.48 },
          { x: 0.75, y: 0.8 },
          { x: 1, y: 1 },
        ],
      ),
      liftGammaGain: lgg(
        -0.02, -0.01, 0.02,
        0, 0, 0,
        0.06, 0.05, 0.02,
      ),
    }),
  },

  /* ======================== APPLE ================================ */
  {
    id: "apple",
    name: "Apple",
    description: "Apple-стиль: чистый, минималистичный, повышенная яркость средних тонов, холодноватый оттенок",
    category: "style",
    params: c({
      contrast: 0.06,
      saturation: -0.03,
      vibrance: 0.04,
      gamma: 0.96,
      highlights: -12,
      shadows: 12,
      whites: 5,
      blacks: -3,
      temperature: -0.06,
      tint: 0.02,
      curves: curves(
        [
          { x: 0, y: 0.04 },
          { x: 0.3, y: 0.34 },
          { x: 0.55, y: 0.52 },
          { x: 0.8, y: 0.84 },
          { x: 1, y: 0.96 },
        ],
        undefined,
        undefined,
        [
          { x: 0, y: 0.02 },
          { x: 0.5, y: 0.5 },
          { x: 1, y: 0.94 },
        ],
      ),
      liftGammaGain: lgg(
        0.04, 0.02, 0.06,
        0, 0.01, -0.02,
        -0.02, 0, -0.04,
      ),
    }),
  },

  /* ======================== DARK / MOODY ========================= */
  {
    id: "dark",
    name: "Dark",
    description: "Глубокий, мрачный, драматичный: насыщенные тени, приглушённые света",
    category: "mood",
    params: c({
      contrast: 0.2,
      saturation: -0.15,
      vibrance: -0.05,
      gamma: 1.15,
      highlights: -25,
      shadows: -15,
      blacks: -20,
      whites: -10,
      temperature: 0.1,
      curves: curves(
        [
          { x: 0, y: 0 },
          { x: 0.4, y: 0.3 },
          { x: 0.65, y: 0.55 },
          { x: 1, y: 0.85 },
        ],
      ),
      liftGammaGain: lgg(
        -0.08, -0.04, 0.04,
        0.02, 0.01, 0.02,
        -0.05, -0.03, -0.01,
      ),
    }),
  },

  /* ======================== WARM ================================= */
  {
    id: "warm",
    name: "Warm",
    description: "Тёплый, золотистый, уютный: идеально для sunset, golden hour, интерьеров",
    category: "mood",
    params: c({
      contrast: 0.02,
      saturation: 0.08,
      vibrance: 0.12,
      gamma: 1.02,
      highlights: -5,
      shadows: 10,
      temperature: 0.4,
      tint: 0.08,
      curves: curves(
        [
          { x: 0, y: 0.03 },
          { x: 0.5, y: 0.52 },
          { x: 1, y: 0.95 },
        ],
        [
          { x: 0, y: 0.05 },
          { x: 0.5, y: 0.55 },
          { x: 1, y: 0.98 },
        ],
      ),
      liftGammaGain: lgg(
        0.06, 0.04, -0.04,
        0.01, 0, -0.01,
        0.08, 0.05, -0.05,
      ),
    }),
  },

  /* ======================== COLD ================================= */
  {
    id: "cold",
    name: "Cold",
    description: "Холодный, кристальный, зимний: синие тени, чистая картинка",
    category: "mood",
    params: c({
      contrast: 0.06,
      saturation: -0.05,
      vibrance: 0.02,
      gamma: 1.03,
      highlights: -8,
      shadows: 5,
      temperature: -0.4,
      tint: -0.04,
      whiteBalanceK: 7500,
      curves: curves(
        [
          { x: 0, y: 0.02 },
          { x: 0.5, y: 0.5 },
          { x: 1, y: 0.98 },
        ],
        undefined,
        undefined,
        [
          { x: 0, y: 0.04 },
          { x: 0.5, y: 0.52 },
          { x: 1, y: 0.99 },
        ],
      ),
      liftGammaGain: lgg(
        -0.04, -0.02, 0.06,
        -0.01, 0, 0.02,
        -0.05, -0.02, 0.04,
      ),
    }),
  },
];

/* ------------------------------------------------------------------ */
/* Поиск                                                               */
/* ------------------------------------------------------------------ */

export function getPreset(id: string): ColorPreset | undefined {
  return COLOR_PRESETS.find((p) => p.id === id);
}

export function getPresetsByCategory(category: ColorPreset["category"]): ColorPreset[] {
  return COLOR_PRESETS.filter((p) => p.category === category);
}

/** Применяет пресет к текущим параметрам (миксует). */
export function applyPresetToParams(
  current: ColorGradeParams,
  preset: ColorPreset,
  intensity: number = 1,
): ColorGradeParams {
  const p = preset.params;
  const i = clamp(intensity, 0, 1);

  return {
    exposure: current.exposure + (p.exposure - current.exposure) * i,
    contrast: current.contrast + (p.contrast - current.contrast) * i,
    contrastPivot: p.contrastPivot,
    saturation: current.saturation + (p.saturation - current.saturation) * i,
    vibrance: current.vibrance + (p.vibrance - current.vibrance) * i,
    hue: current.hue + (p.hue - current.hue) * i,
    highlights: current.highlights + (p.highlights - current.highlights) * i,
    shadows: current.shadows + (p.shadows - current.shadows) * i,
    whites: current.whites + (p.whites - current.whites) * i,
    blacks: current.blacks + (p.blacks - current.blacks) * i,
    temperature: current.temperature + (p.temperature - current.temperature) * i,
    tint: current.tint + (p.tint - current.tint) * i,
    gamma: current.gamma + (p.gamma - current.gamma) * i,
    whiteBalanceK: p.whiteBalanceK,
    liftGammaGain: p.liftGammaGain
      ? {
          lift: {
            r: (current.liftGammaGain?.lift.r ?? 0) + (p.liftGammaGain.lift.r - (current.liftGammaGain?.lift.r ?? 0)) * i,
            g: (current.liftGammaGain?.lift.g ?? 0) + (p.liftGammaGain.lift.g - (current.liftGammaGain?.lift.g ?? 0)) * i,
            b: (current.liftGammaGain?.lift.b ?? 0) + (p.liftGammaGain.lift.b - (current.liftGammaGain?.lift.b ?? 0)) * i,
          },
          gamma: {
            r: (current.liftGammaGain?.gamma.r ?? 0) + (p.liftGammaGain.gamma.r - (current.liftGammaGain?.gamma.r ?? 0)) * i,
            g: (current.liftGammaGain?.gamma.g ?? 0) + (p.liftGammaGain.gamma.g - (current.liftGammaGain?.gamma.g ?? 0)) * i,
            b: (current.liftGammaGain?.gamma.b ?? 0) + (p.liftGammaGain.gamma.b - (current.liftGammaGain?.gamma.b ?? 0)) * i,
          },
          gain: {
            r: (current.liftGammaGain?.gain.r ?? 0) + (p.liftGammaGain.gain.r - (current.liftGammaGain?.gain.r ?? 0)) * i,
            g: (current.liftGammaGain?.gain.g ?? 0) + (p.liftGammaGain.gain.g - (current.liftGammaGain?.gain.g ?? 0)) * i,
            b: (current.liftGammaGain?.gain.b ?? 0) + (p.liftGammaGain.gain.b - (current.liftGammaGain?.gain.b ?? 0)) * i,
          },
        }
      : current.liftGammaGain,
    curves: p.curves ?? current.curves,
    skinToneProtection: current.skinToneProtection ?? 0,
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
