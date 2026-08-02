/**
 * COLOR MATCH — сквозное выравнивание цвета между планами автомонтажа.
 *
 * Профессиональный приём: кадры с разных камер/телефонов в один ролик различаются
 * по экспозиции, контрасту и насыщенности, и на стыках «моргают». Вместо того,
 * чтобы монтировать «как есть», каждый план подтягивается к ЕДИНОМУ таргету
 * (медиане по ролику), из-за чего весь монтаж выглядит как одна съёмка.
 *
 * Функция чистая и детерминированная — легко тестировать (см. test-color-match.mts).
 * Намеренно тёмные кино-сцены (неон, ночь) при высоком контрасте НЕ трогаем:
 * это художественный выбор, а не брак.
 */

export interface ClipColorStat {
  id: string;
  /** 0..255 средняя яркость сегментов плана. */
  brightness: number;
  /** 0..255 средний контраст плана. */
  contrast: number;
  /** 0..255 средняя насыщенность плана. */
  saturation: number;
  /** Тёмная кино-сцена (isDark во всех покрытых сегментах при высоком контрасте). */
  cinematicDark: boolean;
}

export interface ColorAdjustment {
  /** Дельта к clip.color.brightness.value. */
  brightness: number;
  /** Дельта к clip.color.contrast.value (только вверх — вялые подтягиваем). */
  contrast: number;
  /** Дельта к clip.color.saturation.value. */
  saturation: number;
}

export interface ColorMatchOptions {
  /** Целевая яркость держится в этом диапазоне (не даём пересвет/недосвет). */
  minTargetBrightness?: number;
  maxTargetBrightness?: number;
  /** Диапазон целевой насыщенности (не даём цвет выесть/раздуть). */
  minTargetSaturation?: number;
  maxTargetSaturation?: number;
  /** Максимальный ход экспозиции (±) как доля полной шкалы. */
  maxBrightnessDelta?: number;
  /** Максимальный ход контраста вверх. */
  maxContrastDelta?: number;
  /** Максимальный ход насыщенности (±). */
  maxSaturationDelta?: number;
  /** Доля дистанции до таргета, на которую тянем план (0..1). */
  brightnessPull?: number;
  contrastPull?: number;
  saturationPull?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (vals: number[]) => {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function defaultColorMatchOptions(): Required<ColorMatchOptions> {
  return {
    minTargetBrightness: 95,
    maxTargetBrightness: 160,
    minTargetSaturation: 24,
    maxTargetSaturation: 72,
    maxBrightnessDelta: 0.1,
    maxContrastDelta: 0.12,
    maxSaturationDelta: 0.15,
    brightnessPull: 0.7,
    contrastPull: 0.5,
    saturationPull: 0.55,
  };
}

export function computeColorMatch(
  stats: ClipColorStat[],
  opts: ColorMatchOptions = {},
): Map<string, ColorAdjustment> {
  const o = { ...defaultColorMatchOptions(), ...opts };
  const result = new Map<string, ColorAdjustment>();

  if (stats.length <= 1) return result;

  // Художественно-тёмные планы исключаем из расчёта таргета И не подтягиваем.
  const lit = stats.filter((s) => !s.cinematicDark);
  if (lit.length <= 1) return result;

  const targetB = clamp(
    median(lit.map((s) => s.brightness)),
    o.minTargetBrightness,
    o.maxTargetBrightness,
  );
  const targetC = median(lit.map((s) => s.contrast));
  // Если данных о насыщенности нет (анализатор не заполнил поле — все нули),
  // насыщенность НЕ трогаем: иначе выжжем/раздуем цвет вслепую.
  const hasSaturationData = lit.some((s) => s.saturation !== 0);
  const targetS = clamp(
    median(lit.map((s) => s.saturation)),
    o.minTargetSaturation,
    o.maxTargetSaturation,
  );

  for (const s of lit) {
    const dB = clamp(
      ((targetB - s.brightness) / 255) * o.brightnessPull,
      -o.maxBrightnessDelta,
      o.maxBrightnessDelta,
    );
    // Контраст тянем ТОЛЬКО вверх (вялые кадры оживляем, плотные не перенасыщаем).
    const dC = clamp(
      ((targetC - s.contrast) / 255) * o.contrastPull,
      0,
      o.maxContrastDelta,
    );
    const dS = hasSaturationData
      ? clamp(((targetS - s.saturation) / 255) * o.saturationPull, -o.maxSaturationDelta, o.maxSaturationDelta)
      : 0;

    if (Math.abs(dB) < 0.005 && Math.abs(dC) < 0.005 && Math.abs(dS) < 0.005) continue;

    result.set(s.id, { brightness: dB, contrast: dC, saturation: dS });
  }

  return result;
}

/** Добавить дельту ко всем ключам анимации параметра и базовому значению. */
export function applyColorAdjustment(
  clip: { color: { brightness: { value: number; keyframes?: { value: number }[] }; contrast: { value: number; keyframes?: { value: number }[] }; saturation: { value: number; keyframes?: { value: number }[] } } },
  adj: ColorAdjustment,
): void {
  clip.color.brightness.value += adj.brightness;
  for (const k of clip.color.brightness.keyframes ?? []) k.value += adj.brightness;
  clip.color.contrast.value += adj.contrast;
  for (const k of clip.color.contrast.keyframes ?? []) k.value += adj.contrast;
  clip.color.saturation.value += adj.saturation;
  for (const k of clip.color.saturation.keyframes ?? []) k.value += adj.saturation;
}
