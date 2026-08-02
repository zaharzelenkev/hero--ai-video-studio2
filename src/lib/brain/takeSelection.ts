/**
 * TAKE SELECTION — умный выбор дублей (offline edit).
 *
 * Реальная работа монтажёра начинается не со склейки, а с ОТБОРА: из десяти
 * похожих кадров в фильм попадает один. MONTIQ делает это автоматически.
 *
 * Как работает:
 *   1. Каждому монтажному плану (Shot) выставляется покритериальная оценка
 *      по десяти профессиональным критериям (см. TakeCriteria):
 *      резкость, смаз, тряска, экспозиция, композиция, лица, эмоция,
 *      направление взгляда, уровень движения, качество звука.
 *   2. Похожие планы группируются в «дубли» (TakeGroup) по перцептивной
 *      подписи кадра: доминирующий тон, свет, контраст, крупность, лицо и
 *      его положение, класс движения, длительность + родство имён файлов
 *      (IMG_0042 / IMG_0043 — почти всегда дубли одного и того же).
 *   3. Внутри группы выигрывает лучший дубль, остальные отбраковываются
 *      с человекочитаемым объяснением («смаз 0.31 против 0.82 у выбранного»).
 *
 * Модуль ЧИСТЫЙ: без DOM и случайности. Одни и те же материалы всегда дают
 * один и тот же отбор — превью и экспорт совпадают покадрово.
 */

import type { Shot } from "./perception";
import { isUnstableCamera } from "./perception";

// ---------------------------------------------------------------------------
// Критерии
// ---------------------------------------------------------------------------

/** Десять критериев отбора. Каждый нормирован в 0..1 (больше — лучше). */
export interface TakeCriteria {
  /** Резкость кадра: детализация, отсутствие расфокуса. */
  sharpness: number;
  /** Отсутствие смаза движения (motion blur). */
  motionBlur: number;
  /** Отсутствие тряски камеры (стабильность). */
  stability: number;
  /** Экспозиция: кадр не провален в тень и не выбит в пересвет. */
  exposure: number;
  /** Композиция: правило третей, воздух, положение субъекта. */
  composition: number;
  /** Наличие и крупность лиц. */
  faces: number;
  /** Эмоциональный заряд кадра. */
  emotion: number;
  /** Направление взгляда / «воздух под взгляд» (looking room). */
  gaze: number;
  /** Уровень движения: живой, но управляемый кадр. */
  motion: number;
  /** Качество звука: разборчивая речь, присутствие, не мёртвая дорожка. */
  audio: number;
}

/**
 * Веса критериев. Технический брак (смаз, тряска, расфокус) весит больше
 * художественных нюансов: зритель простит среднюю композицию, но не простит
 * мыло и трясучку.
 */
export const TAKE_WEIGHTS: TakeCriteria = {
  sharpness: 1.5,
  motionBlur: 1.3,
  stability: 1.35,
  exposure: 1.2,
  composition: 1.0,
  faces: 0.75,
  emotion: 0.85,
  gaze: 0.6,
  motion: 0.6,
  audio: 0.95,
};

export const TAKE_CRITERIA_LABELS: Record<keyof TakeCriteria, string> = {
  sharpness: "резкость",
  motionBlur: "отсутствие смаза",
  stability: "стабильность",
  exposure: "экспозиция",
  composition: "композиция",
  faces: "лица в кадре",
  emotion: "эмоция",
  gaze: "направление взгляда",
  motion: "уровень движения",
  audio: "качество звука",
};

export interface TakeScore {
  shotId: string;
  assetId: string;
  assetName: string;
  start: number;
  end: number;
  /** Итоговая взвешенная оценка 0..1. */
  total: number;
  criteria: TakeCriteria;
  /** Сильные стороны дубля (критерии ≥ 0.75). */
  strengths: string[];
  /** Слабые стороны дубля (критерии ≤ 0.4). */
  flaws: string[];
}

/** Дополнительный контекст восприятия, которого нет в самом кадре. */
export interface TakeContext {
  /**
   * Доля окна [start,end), покрытая распознанной речью (0..1). Распознанные
   * слова — прямое доказательство РАЗБОРЧИВОГО звука: лучший объективный
   * сигнал качества дорожки, доступный офлайн.
   */
  speechCoverage?: (assetId: string, start: number, end: number) => number;
  /** Есть ли у материала звуковая дорожка вообще. */
  hasAudio?: (assetId: string) => boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Колоколообразная функция: 1 в центре, спад к краям окна. */
function bell(value: number, center: number, halfWidth: number): number {
  const d = Math.abs(value - center) / Math.max(1e-6, halfWidth);
  return clamp01(1 - d * d);
}

// ---------------------------------------------------------------------------
// Покритериальная оценка одного дубля
// ---------------------------------------------------------------------------

/** Резкость: расфокус — приговор, контраст — косвенная мера детализации. */
function scoreSharpness(shot: Shot): number {
  if (!shot.isAnalyzed) return 0.5;
  const base = shot.blurry ? 0.18 : 0.72;
  const contrastBonus = clamp01(((shot.contrast ?? 90) - 60) / 120) * 0.28;
  const qualityBonus = clamp01((shot.qualityScore - 4) / 6) * 0.12;
  return clamp01(base + contrastBonus + qualityBonus - (shot.blurry ? 0 : 0));
}

/**
 * Смаз движения: сам по себе блюр плюс блюр НА ДВИЖЕНИИ (самый неприятный
 * случай — «мыло в панораме», кадр невозможно смотреть на паузе).
 */
function scoreMotionBlur(shot: Shot): number {
  if (!shot.isAnalyzed) return 0.5;
  let penalty = shot.blurry ? 0.55 : 0.05;
  if (shot.blurry && (shot.dominantMotion === "high" || shot.dominantMotion === "shake")) penalty += 0.3;
  if (shot.dominantMotion === "shake") penalty += 0.15;
  // Низкий контраст при высоком движении — тоже смаз, просто детектор блюра
  // не сработал (мягкая картинка + быстрый пан).
  if ((shot.contrast ?? 120) < 70 && shot.dominantMotion === "high") penalty += 0.15;
  return clamp01(1 - penalty);
}

/** Тряска: ручная камера терпима, «шейк» — почти всегда брак. */
function scoreStability(shot: Shot): number {
  switch (shot.cameraMotion) {
    case "shake":
      return 0.05;
    case "handheld":
      return 0.45;
    case "dynamic":
      return 0.62;
    case "drift":
      return 0.72;
    case "unknown":
      return 0.6;
    default:
      return shot.dominantMotion === "shake" ? 0.2 : 0.93;
  }
}

/** Экспозиция: идеальный «средний серый» — 95..165 по яркости. */
function scoreExposure(shot: Shot): number {
  if (!shot.isAnalyzed) return 0.5;
  if (shot.dark && !shot.cinematicDark) return 0.14;
  if (shot.cinematicDark) return 0.68; // ночь/неон — художественный выбор
  const b = shot.brightness ?? 130;
  // Плато 95..165, плавный спад к 40 и 225.
  const centered = b < 95 ? bell(b, 95, 55) : b > 165 ? bell(b, 165, 60) : 1;
  const contrastOk = clamp01(((shot.contrast ?? 100) - 40) / 110);
  return clamp01(centered * 0.78 + contrastOk * 0.22);
}

/** Композиция уже посчитана восприятием по правилу третей (0..10). */
function scoreComposition(shot: Shot): number {
  return clamp01(shot.composition / 10);
}

/** Лица: наличие + читаемая крупность. Кадры без людей нейтральны, не плохи. */
function scoreFaces(shot: Shot): number {
  if (!shot.hasFaces) return 0.38;
  const size = shot.faceSize ?? 0.02;
  return clamp01(0.62 + Math.min(0.38, size * 4.2));
}

/** Эмоциональный заряд: тип эмоции + динамика + пик звука площадки. */
function scoreEmotion(shot: Shot): number {
  const base =
    shot.emotion === "energetic" ? 0.82 : shot.emotion === "dramatic" ? 0.76 : shot.emotion === "calm" ? 0.55 : 0.45;
  const action = shot.hasAction ? 0.1 : 0;
  const peak = shot.audioPeak >= 0.7 ? 0.1 : shot.audioPeak >= 0.4 ? 0.05 : 0;
  const aesthetic = clamp01((shot.aestheticScore - 4) / 6) * 0.1;
  return clamp01(base + action + peak + aesthetic);
}

/**
 * Направление взгляда (looking room).
 *
 * Честная оговорка: офлайн-детектор даёт только рамку лица, а не зрачки.
 * Поэтому взгляд оценивается по КОМПОЗИЦИОННОМУ следствию: у говорящей головы
 * в кадре должен быть «воздух» в ту сторону, куда развёрнут человек. Лицо
 * ровно по центру = взгляд в камеру (норма для интервью), лицо на трети =
 * классический профильный кадр с воздухом, лицо у самого края = взгляд
 * «упирается в рамку» — брак, такой дубль проигрывает.
 */
function scoreGaze(shot: Shot): number {
  if (!shot.hasFaces || shot.faceX === undefined) return 0.5;
  const x = shot.faceX;
  const y = shot.faceY ?? 0.5;

  // Лицо прижато к краю: взгляду некуда идти.
  if (x <= 0.12 || x >= 0.88) return 0.2;
  if (y <= 0.08 || y >= 0.92) return 0.28;

  const centered = Math.abs(x - 0.5) < 0.1;
  if (centered) {
    // Взгляд в камеру: сильный кадр для говорящей головы, если голова не
    // прижата к нижнему краю (нет «воздуха» над головой — типичная ошибка).
    return y < 0.62 ? 0.86 : 0.66;
  }

  // Кадр с воздухом: чем ближе к трети, тем лучше «место под взгляд».
  const nearThird = Math.min(Math.abs(x - 1 / 3), Math.abs(x - 2 / 3));
  const room = x < 0.5 ? 1 - x : x; // сколько кадра остаётся по направлению взгляда
  return clamp01(0.55 + (1 - Math.min(1, nearThird / 0.2)) * 0.25 + (room - 0.5) * 0.4);
}

/** Уровень движения: мёртвая статика скучна, «шейк» невозможен. Оптимум ~0.5. */
function scoreMotion(shot: Shot): number {
  if (shot.cameraMotion === "shake") return 0.1;
  const m = shot.momentum;
  // Плато 0.3..0.8, спад по краям — кадр «живой, но управляемый».
  const core = m < 0.3 ? bell(m, 0.3, 0.35) : m > 0.8 ? bell(m, 0.8, 0.4) : 1;
  return clamp01(core * 0.85 + (shot.hasAction ? 0.15 : 0.05));
}

/**
 * Качество звука. Основной сигнал — РАСПОЗНАННАЯ РЕЧЬ в окне: если Whisper
 * уверенно вытащил слова, дорожка разборчива. Дополнительно учитывается
 * присутствие (энергия площадки): мёртвая тишина под говорящей головой =
 * микрофон не записал.
 */
function scoreAudio(shot: Shot, ctx: TakeContext | undefined): number {
  const hasAudio = ctx?.hasAudio ? ctx.hasAudio(shot.assetId) : true;
  if (!hasAudio) return 0.5; // немой материал (фото/видео без звука) — нейтрально
  const coverage = ctx?.speechCoverage ? clamp01(ctx.speechCoverage(shot.assetId, shot.start, shot.end)) : 0;
  const presence =
    shot.audioPeak >= 0.98 ? 0.9 : shot.audioPeak >= 0.7 ? 0.8 : shot.audioPeak >= 0.4 ? 0.65 : shot.audioPeak > 0 ? 0.45 : 0.35;
  if (coverage <= 0) return clamp01(presence * 0.75 + 0.1);
  // Речь распознана: разборчивость — главный аргумент.
  return clamp01(0.55 + coverage * 0.35 + presence * 0.1);
}

/** Полная покритериальная оценка дубля. */
export function scoreTake(shot: Shot, ctx?: TakeContext): TakeScore {
  const criteria: TakeCriteria = {
    sharpness: scoreSharpness(shot),
    motionBlur: scoreMotionBlur(shot),
    stability: scoreStability(shot),
    exposure: scoreExposure(shot),
    composition: scoreComposition(shot),
    faces: scoreFaces(shot),
    emotion: scoreEmotion(shot),
    gaze: scoreGaze(shot),
    motion: scoreMotion(shot),
    audio: scoreAudio(shot, ctx),
  };

  let sum = 0;
  let wsum = 0;
  const keys = Object.keys(criteria) as Array<keyof TakeCriteria>;
  for (const k of keys) {
    sum += criteria[k] * TAKE_WEIGHTS[k];
    wsum += TAKE_WEIGHTS[k];
  }

  const strengths: string[] = [];
  const flaws: string[] = [];
  for (const k of keys) {
    if (criteria[k] >= 0.78) strengths.push(TAKE_CRITERIA_LABELS[k]);
    else if (criteria[k] <= 0.4) flaws.push(TAKE_CRITERIA_LABELS[k]);
  }

  return {
    shotId: shot.id,
    assetId: shot.assetId,
    assetName: shot.assetName,
    start: shot.start,
    end: shot.end,
    total: Math.round((sum / wsum) * 1000) / 1000,
    criteria,
    strengths,
    flaws,
  };
}

// ---------------------------------------------------------------------------
// Группировка похожих дублей
// ---------------------------------------------------------------------------

/** Перцептивная подпись кадра — по ней узнаём «тот же самый кадр, дубль два». */
interface TakeSignature {
  hue: number;
  brightness: number;
  contrast: number;
  colorfulness: number;
  hasFaces: boolean;
  faceSize: number;
  faceX: number;
  faceY: number;
  size: Shot["size"];
  motionClass: 0 | 1 | 2;
  duration: number;
  stem: string;
}

/** Круговое расстояние между тонами (0..180). */
function hueDistance(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * «Стем» имени файла: IMG_0042.mp4 → img_, take-3.mov → take-, clip 07.mp4 →
 * clip. Камеры и телефоны нумеруют дубли подряд — общий стем это сильная
 * подсказка «снято подряд, одно и то же».
 */
export function fileStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .replace(/[\s._-]*\d+\s*$/, "")
    .replace(/[\s._-]+$/, "")
    .trim();
}

function motionClassOf(shot: Shot): 0 | 1 | 2 {
  const m = shot.dominantMotion;
  return m === "static" || m === "low" ? 0 : m === "medium" ? 1 : 2;
}

function signatureOf(shot: Shot): TakeSignature {
  return {
    hue: shot.hue ?? -1,
    brightness: shot.brightness ?? 130,
    contrast: shot.contrast ?? 100,
    colorfulness: shot.colorfulness ?? 20,
    hasFaces: shot.hasFaces,
    faceSize: shot.faceSize ?? 0,
    faceX: shot.faceX ?? 0.5,
    faceY: shot.faceY ?? 0.5,
    size: shot.size,
    motionClass: motionClassOf(shot),
    duration: shot.duration,
    stem: fileStem(shot.assetName),
  };
}

/**
 * Перцептивное расстояние между двумя кадрами (0 — идентичны, ≥1 — разные).
 * Экспортируется ради тестируемости порогов.
 */
export function takeDistance(a: Shot, b: Shot): number {
  const sa = signatureOf(a);
  const sb = signatureOf(b);
  let d = 0;

  if (sa.hue >= 0 && sb.hue >= 0) d += (hueDistance(sa.hue, sb.hue) / 180) * 0.24;
  else if (sa.hue >= 0 !== sb.hue >= 0) d += 0.1;

  d += Math.min(1, Math.abs(sa.brightness - sb.brightness) / 110) * 0.22;
  d += Math.min(1, Math.abs(sa.contrast - sb.contrast) / 120) * 0.1;
  d += Math.min(1, Math.abs(sa.colorfulness - sb.colorfulness) / 40) * 0.1;

  if (sa.hasFaces !== sb.hasFaces) d += 0.34;
  else if (sa.hasFaces && sb.hasFaces) {
    const relSize = Math.abs(sa.faceSize - sb.faceSize) / Math.max(0.01, Math.max(sa.faceSize, sb.faceSize));
    d += Math.min(1, relSize) * 0.12;
    const pos = Math.hypot(sa.faceX - sb.faceX, sa.faceY - sb.faceY);
    d += Math.min(1, pos / 0.5) * 0.12;
  }

  if (sa.size !== sb.size) d += 0.16;
  if (sa.motionClass !== sb.motionClass) d += 0.12;

  // СОДЕРЖАНИЕ КАДРА. Экшн-кадр не может быть «дублем» статики, даже если
  // свет и цвет совпали: это разные события, а не две попытки одного.
  if (a.hasAction !== b.hasAction) d += 0.4;
  d += Math.min(1, Math.abs(a.momentum - b.momentum) / 0.45) * 0.22;

  const durRatio = Math.min(sa.duration, sb.duration) / Math.max(0.01, Math.max(sa.duration, sb.duration));
  d += (1 - durRatio) * 0.06;

  // Родственные имена файлов — сильный намёк на серию дублей.
  if (sa.stem && sa.stem === sb.stem && a.assetId !== b.assetId) d -= 0.1;

  return Math.max(0, d);
}

/**
 * Могут ли два кадра ВООБЩЕ быть дублями одного и того же?
 *
 * Жёсткие запреты (проверяются до метрики похожести). Ошибка отбраковки стоит
 * дороже ошибки «оставили лишнее»: выкинутый эпик-кадр рушит весь ролик,
 * а лишний похожий план — просто материал, который режиссёр может не взять.
 */
export function canBeSameTake(a: Shot, b: Shot): boolean {
  // 1. Без покадрового анализа судить не о чем: у таких кадров все признаки
  //    дефолтные, и они «похожи» друг на друга чисто технически.
  if (!a.isAnalyzed || !b.isAnalyzed) return false;

  // 2. Разное содержание — разные кадры.
  if (a.hasAction !== b.hasAction) return false;
  if (a.hasFaces !== b.hasFaces) return false;
  if (a.size !== b.size) return false;

  // 3. Кадр-событие против проходного: разрыв по динамике больше половины
  //    шкалы означает разные моменты, а не два дубля.
  //
  //    Осознанно НЕ сравниваем здесь score/tier: разрыв в оценке — это ровно
  //    то, ради чего существует выбор дублей (хороший дубль против брака).
  //    Разные СОБЫТИЯ отсекаются признаками содержания выше, а не качеством.
  if (Math.abs(a.momentum - b.momentum) > 0.3) return false;

  // 4. Внутри ОДНОГО файла разные окна — почти всегда разные моменты
  //    (детектор уже разрезал их по смене сцены/содержания). Признать их
  //    дублями можно только при почти полном совпадении цвета и света.
  if (a.assetId === b.assetId) {
    const bA = a.brightness ?? 130;
    const bB = b.brightness ?? 130;
    if (Math.abs(bA - bB) > 12) return false;
    const cA = a.colorfulness ?? 20;
    const cB = b.colorfulness ?? 20;
    if (Math.abs(cA - cB) > 8) return false;
    if (a.hue !== undefined && b.hue !== undefined && a.hue >= 0 && b.hue >= 0 && hueDistance(a.hue, b.hue) > 25) {
      return false;
    }
  }

  return true;
}

export interface TakeAlternative {
  shotId: string;
  assetId: string;
  assetName: string;
  start: number;
  end: number;
  total: number;
  /** Почему этот дубль проиграл. */
  reason: string;
}

export interface TakeGroup {
  id: string;
  /** Победивший дубль. */
  bestShotId: string;
  bestScore: TakeScore;
  /** Проигравшие дубли (исключены из монтажа). */
  rejected: TakeAlternative[];
  /** Человекочитаемое объяснение выбора. */
  verdict: string;
}

export interface TakeSelectionResult {
  /** Кадры, допущенные до монтажа (в исходном порядке). */
  chosen: Shot[];
  /** Кадры, отбракованные как худшие дубли. */
  rejected: Shot[];
  /** Группы дублей (только те, где реально был выбор). */
  groups: TakeGroup[];
  /** Оценки всех кадров по shotId. */
  scores: Map<string, TakeScore>;
  /** Короткие заметки для журнала режиссёра. */
  notes: string[];
}

export interface SelectTakesOptions {
  ctx?: TakeContext;
  /** Порог «это один и тот же кадр» для РАЗНЫХ файлов. */
  threshold?: number;
  /** Более строгий порог для двух окон ВНУТРИ одного файла. */
  sameAssetThreshold?: number;
  /** Минимальный отрыв победителя, ниже которого дубли считаются равноценными. */
  minGap?: number;
  /** Не оставлять меньше этого числа кадров (иначе монтировать нечего). */
  minKeep?: number;
}

/**
 * Главная точка входа: разбить кадры на группы дублей и оставить лучшие.
 *
 * Гарантии:
 *   • отбраковываются только кадры, у которых есть ЯВНО лучший близнец
 *     (отрыв ≥ minGap) — равноценные дубли остаются как материал для
 *     разнообразия монтажа;
 *   • пул никогда не схлопывается ниже minKeep кадров;
 *   • детерминированно: порядок групп и победителей воспроизводим.
 */
export function selectBestTakes(shots: Shot[], opts: SelectTakesOptions = {}): TakeSelectionResult {
  const threshold = opts.threshold ?? 0.3;
  const sameAssetThreshold = opts.sameAssetThreshold ?? 0.16;
  const minGap = opts.minGap ?? 0.05;
  const minKeep = opts.minKeep ?? 3;

  const scores = new Map<string, TakeScore>();
  for (const s of shots) scores.set(s.id, scoreTake(s, opts.ctx));

  if (shots.length < 2) {
    return { chosen: [...shots], rejected: [], groups: [], scores, notes: [] };
  }

  // --- Кластеризация (union-find по порогу похожести) ---
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const s of shots) parent.set(s.id, s.id);

  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j < shots.length; j++) {
      const a = shots[i];
      const b = shots[j];
      // Жёсткие запреты: разное содержание кадра исключает «дубль» независимо
      // от того, насколько похожи свет и цвет.
      if (!canBeSameTake(a, b)) continue;
      const sameAsset = a.assetId === b.assetId;
      // Соседние окна одного файла — это продолжение действия, а не дубль:
      // склеивать их в группу нельзя, иначе выкинем половину длинного плана.
      if (sameAsset && Math.min(Math.abs(a.start - b.end), Math.abs(b.start - a.end)) < 1.5) continue;
      const limit = sameAsset ? sameAssetThreshold : threshold;
      if (takeDistance(a, b) <= limit) union(a.id, b.id);
    }
  }

  const clusters = new Map<string, Shot[]>();
  for (const s of shots) {
    const root = find(s.id);
    const list = clusters.get(root);
    if (list) list.push(s);
    else clusters.set(root, [s]);
  }

  const rejectedIds = new Set<string>();
  const groups: TakeGroup[] = [];
  const notes: string[] = [];

  // НЕПРИКОСНОВЕННЫЕ КАДРЫ: самый динамичный («эпик») и самый качественный
  // план проекта. Даже если у них найдётся похожий сосед с чуть более высокой
  // покритериальной оценкой, вырезать их нельзя — на них строится кульминация
  // и хук. Потеря эпика — это потеря драматургии всего ролика.
  const protectedIds = new Set<string>();
  {
    const byMomentum = [...shots].sort((a, b) => b.momentum - a.momentum || b.score - a.score);
    const byScore = [...shots].sort((a, b) => b.score - a.score);
    if (byMomentum[0] && byMomentum[0].momentum > 0.5) protectedIds.add(byMomentum[0].id);
    if (byScore[0]) protectedIds.add(byScore[0].id);
    const actionShots = shots.filter((s) => s.hasAction).sort((a, b) => b.score - a.score);
    if (actionShots[0]) protectedIds.add(actionShots[0].id);
  }

  // Порядок групп детерминирован порядком первого кадра каждой группы.
  const orderedClusters = [...clusters.values()].sort(
    (x, y) => shots.indexOf(x[0]) - shots.indexOf(y[0]),
  );

  for (const cluster of orderedClusters) {
    if (cluster.length < 2) continue;
    const ranked = [...cluster].sort((a, b) => {
      const d = scores.get(b.id)!.total - scores.get(a.id)!.total;
      if (Math.abs(d) > 1e-6) return d;
      // Тай-брейк: длиннее окно → больше свободы монтажу; затем стабильный id.
      const w = b.cutOut - b.cutIn - (a.cutOut - a.cutIn);
      if (Math.abs(w) > 1e-6) return w;
      return a.id < b.id ? -1 : 1;
    });

    const best = ranked[0];
    const bestScore = scores.get(best.id)!;
    const losers: TakeAlternative[] = [];

    for (const other of ranked.slice(1)) {
      const otherScore = scores.get(other.id)!;
      const gap = bestScore.total - otherScore.total;
      if (gap < minGap) continue; // равноценный дубль — оставляем как материал
      // Опорные кадры драматургии не отбраковываются никогда.
      if (protectedIds.has(other.id)) continue;
      // Самое просевшее относительно победителя качество — и есть причина отказа.
      const keys = Object.keys(bestScore.criteria) as Array<keyof TakeCriteria>;
      let worstKey: keyof TakeCriteria = "sharpness";
      let worstDelta = -Infinity;
      for (const k of keys) {
        const delta = (bestScore.criteria[k] - otherScore.criteria[k]) * TAKE_WEIGHTS[k];
        if (delta > worstDelta) {
          worstDelta = delta;
          worstKey = k;
        }
      }
      losers.push({
        shotId: other.id,
        assetId: other.assetId,
        assetName: other.assetName,
        start: other.start,
        end: other.end,
        total: otherScore.total,
        reason:
          `${TAKE_CRITERIA_LABELS[worstKey]} хуже (${otherScore.criteria[worstKey].toFixed(2)} против ` +
          `${bestScore.criteria[worstKey].toFixed(2)}), общая оценка ${otherScore.total.toFixed(2)} против ${bestScore.total.toFixed(2)}`,
      });
      rejectedIds.add(other.id);
    }

    if (losers.length === 0) continue;

    groups.push({
      id: `take_${groups.length}_${best.id}`,
      bestShotId: best.id,
      bestScore,
      rejected: losers,
      verdict:
        `Дублей: ${losers.length + 1}. Выбран «${best.assetName}» @${best.start.toFixed(1)}с ` +
        `(${bestScore.total.toFixed(2)}/1.00${bestScore.strengths.length ? `, сильные стороны: ${bestScore.strengths.slice(0, 3).join(", ")}` : ""}).`,
    });
  }

  // Защита от схлопывания пула: возвращаем лучших из отбракованных, пока не
  // наберём минимум. Лучше слабый дубль, чем ролик из двух кадров.
  let keptCount = shots.length - rejectedIds.size;
  if (keptCount < minKeep) {
    const revivable = shots
      .filter((s) => rejectedIds.has(s.id))
      .sort((a, b) => scores.get(b.id)!.total - scores.get(a.id)!.total);
    for (const s of revivable) {
      if (keptCount >= minKeep) break;
      rejectedIds.delete(s.id);
      keptCount++;
    }
    if (revivable.length > 0) {
      notes.push("Пул кадров мал: часть отбракованных дублей возвращена — иначе монтировать нечего.");
    }
  }

  const chosen = shots.filter((s) => !rejectedIds.has(s.id));
  const rejected = shots.filter((s) => rejectedIds.has(s.id));

  if (rejected.length > 0) {
    const totalRejectedSec = rejected.reduce((a, s) => a + s.duration, 0);
    notes.push(
      `Отбор дублей: групп похожих кадров ${groups.length}, отбраковано ${rejected.length} дублей ` +
        `(${totalRejectedSec.toFixed(1)}с материала) — в монтаж идёт лучший кадр каждой группы.`,
    );
    for (const g of groups.slice(0, 3)) notes.push(`Дубли: ${g.verdict}`);
  }

  return { chosen, rejected, groups, scores, notes };
}

/** Кадры, которые нельзя брать в монтаж ни при каких условиях (жёсткий брак). */
export function isTechnicallyBroken(shot: Shot, score: TakeScore): boolean {
  if (isUnstableCamera(shot.cameraMotion) && shot.cameraMotion === "shake") return true;
  return score.criteria.sharpness < 0.25 && score.criteria.exposure < 0.25;
}
