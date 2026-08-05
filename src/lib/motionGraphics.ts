/**
 * MONTIQ Motion Graphics — движок профессиональной моушн-графики.
 *
 * Чистый модуль (без DOM): метаданные видов, дефолты, фабрика клипов,
 * математика анимаций (envelope / easing / слова) и генератор FFmpeg-фильтров.
 * Canvas-рендер превью и PNG-панели живут в motionGraphicsCanvas.ts.
 */

import type {
  MotionGraphicConfig,
  MotionGraphicKind,
  MgAnim,
  MgCaptionStyle,
  MgKineticStyle,
  TextClip,
} from "./types";
import { param } from "./types";
import { uid } from "./id";
import { evalParam, paramToFfmpegExpr } from "./keyframes";
import { fontFileFor, sanitizeGlyphs } from "./presets";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ------------------------------------------------------------------ */
/* метаданные видов моушн-графики                                      */
/* ------------------------------------------------------------------ */

export interface MgKindMeta {
  id: MotionGraphicKind;
  label: string;
  icon: string;
  desc: string;
  /** Длительность по умолчанию на таймлайне, сек. */
  duration: number;
  /** Текст-образец. */
  text: string;
  /** Базовая позиция (нормализована, центр кадра = 0). */
  x: number;
  y: number;
  /** Кегль основного текста (в масштабе 1080p). */
  fontSize: number;
  defaultIn: MgAnim;
  defaultOut: MgAnim;
}

export const MG_KINDS: MgKindMeta[] = [
  {
    id: "title",
    label: "Титры",
    icon: "🎬",
    desc: "Профессиональный титр: кикер, заголовок, акцентная линия, подзаголовок",
    duration: 4,
    text: "Название видео",
    x: 0,
    y: -0.1,
    fontSize: 84,
    defaultIn: "slide-up",
    defaultOut: "fade",
  },
  {
    id: "lowerThird",
    label: "Lower Third",
    icon: "🏷️",
    desc: "Имя и роль с акцентной плашкой — для интервью и репортажей",
    duration: 5,
    text: "Алексей Смирнов",
    x: -0.42,
    y: 0.3,
    fontSize: 46,
    defaultIn: "slide-left",
    defaultOut: "fade",
  },
  {
    id: "callout",
    label: "Callout",
    icon: "💬",
    desc: "Выноска с указателем на объект: пузырь, плашка, подчёркивание",
    duration: 4,
    text: "Ключевой факт",
    x: 0,
    y: -0.12,
    fontSize: 54,
    defaultIn: "pop",
    defaultOut: "fade",
  },
  {
    id: "progressBar",
    label: "Progress Bar",
    icon: "📊",
    desc: "Анимированный прогресс-бар с процентами и ключевыми кадрами",
    duration: 6,
    text: "Прогресс",
    x: 0,
    y: 0.34,
    fontSize: 30,
    defaultIn: "slide-up",
    defaultOut: "fade",
  },
  {
    id: "animatedCaptions",
    label: "Animated Captions",
    icon: "🗨️",
    desc: "Динамические подписи: слова появляются одно за другим",
    duration: 5,
    text: "Слова появляются одно за другим",
    x: 0,
    y: 0.33,
    fontSize: 46,
    defaultIn: "fade",
    defaultOut: "fade",
  },
  {
    id: "logoReveal",
    label: "Logo Reveal",
    icon: "✨",
    desc: "Появление логотипа (картинка или монограмма) с wordmark",
    duration: 4,
    text: "Release cut",
    x: 0,
    y: 0,
    fontSize: 60,
    defaultIn: "zoom",
    defaultOut: "fade",
  },
  {
    id: "intro",
    label: "Intro",
    icon: "🎞️",
    desc: "Полноэкранное интро проекта: логотип, заголовок, подзаголовок",
    duration: 5,
    text: "МОНТИРУЕМ ШЕДЕВР",
    x: 0,
    y: 0,
    fontSize: 88,
    defaultIn: "zoom",
    defaultOut: "fade",
  },
  {
    id: "outro",
    label: "Outro",
    icon: "🏁",
    desc: "Полноэкранное аутро с CTA-кнопкой и логотипом",
    duration: 6,
    text: "Подписывайтесь!",
    x: 0,
    y: 0,
    fontSize: 72,
    defaultIn: "scale-in",
    defaultOut: "fade",
  },
  {
    id: "cta",
    label: "CTA",
    icon: "🔔",
    desc: "Призыв к действию: кнопка, полоса или карточка с пульсацией",
    duration: 5,
    text: "Подписаться",
    x: 0,
    y: 0.16,
    fontSize: 44,
    defaultIn: "pop",
    defaultOut: "fade",
  },
  {
    id: "subtitle",
    label: "Субтитры",
    icon: "🔤",
    desc: "Стилизованные субтитры: классика, плашка, подсветка, karaoke",
    duration: 4,
    text: "Субтитры с поддержкой стилей",
    x: 0,
    y: 0.36,
    fontSize: 44,
    defaultIn: "fade",
    defaultOut: "fade",
  },
  {
    id: "trackingText",
    label: "Tracking Text",
    icon: "➡️",
    desc: "Бегущая строка-тикер в любом направлении",
    duration: 6,
    text: "Срочные новости • Прямой эфир •",
    x: 0,
    y: -0.32,
    fontSize: 40,
    defaultIn: "fade",
    defaultOut: "fade",
  },
  {
    id: "kinetic",
    label: "Kinetic Type",
    icon: "⚡",
    desc: "Кинетическая типографика: wordBurst, wave, stomp, elastic, glitch",
    duration: 6,
    text: "Больше просмотров больше подписчиков",
    x: 0,
    y: 0,
    fontSize: 62,
    defaultIn: "none",
    defaultOut: "fade",
  },
];

export const MG_KIND_MAP: Record<MotionGraphicKind, MgKindMeta> = Object.fromEntries(
  MG_KINDS.map((k) => [k.id, k]),
) as Record<MotionGraphicKind, MgKindMeta>;

export function mgLabel(kind: MotionGraphicKind): string {
  return MG_KIND_MAP[kind]?.label ?? kind;
}

export function mgIcon(kind: MotionGraphicKind): string {
  return MG_KIND_MAP[kind]?.icon ?? "🪄";
}

/* ------------------------------------------------------------------ */
/* дефолты                                                             */
/* ------------------------------------------------------------------ */

export function defaultMotionGraphic(kind: MotionGraphicKind): MotionGraphicConfig {
  const base: MotionGraphicConfig = {
    kind,
    accentColor: "#8b5cf6",
    secondaryColor: "#cbd5e1",
    backgroundColor: "#0b0b14",
    panelOpacity: 0.72,
    kicker: "НОВЫЙ ПРОЕКТ",
    subtext: "Подзаголовок",
    ctaLabel: "Подписаться",
    ctaSubtext: "Не пропустите новые выпуски",
    logoText: "M",
    logoAssetId: null,
    animationIn: MG_KIND_MAP[kind].defaultIn,
    animationOut: MG_KIND_MAP[kind].defaultOut,
    inDuration: 0.6,
    outDuration: 0.45,
    kineticStagger: 0.16,
    progress: param(0.4),
    barWidth: 0.5,
    barThickness: 12,
    barRounded: true,
    showPercent: true,
    showLabel: true,
    calloutStyle: "bubble",
    ctaStyle: "button",
    trackingDirection: "left",
    trackingSpeed: 0.25,
    kineticStyle: "wordBurst",
    captionStyle: "pop",
    radius: 16,
    shadowEnabled: true,
    shadowColor: "#000000",
    shadowBlur: 24,
    outlineEnabled: false,
    outlineColor: "#000000",
    outlineWidth: 0,
    letterSpacing: 0,
    lineHeight: 1.18,
    fontWeight: 800,
    uppercase: false,
    italic: false,
    logoStyle: "zoom",
  };

  switch (kind) {
    case "lowerThird":
      return { ...base, kicker: "ИМЯ СПИКЕРА", subtext: "Должность / роль", backgroundColor: "#0b0b14", panelOpacity: 0.82, shadowEnabled: true };
    case "callout":
      return { ...base, kicker: "", subtext: "", backgroundColor: "#0b0b14", panelOpacity: 0.9, calloutStyle: "bubble", shadowEnabled: true };
    case "progressBar":
      return { ...base, kicker: "", subtext: "", backgroundColor: "#0b0b14", panelOpacity: 0.4, inDuration: 0.5, outDuration: 0.35 };
    case "animatedCaptions":
      return { ...base, kicker: "", subtext: "", backgroundColor: "#0b0b14", panelOpacity: 0.6, captionStyle: "pop", kineticStagger: 0.14, fontWeight: 800 };
    case "logoReveal":
      return { ...base, kicker: "", subtext: "", logoText: "M", backgroundColor: "#0b0b14", panelOpacity: 0, inDuration: 1.1, outDuration: 0.5 };
    case "intro":
      return { ...base, kicker: "ПРЕДСТАВЛЯЕТ", subtext: "Короткое описание проекта в одну-две строки", backgroundColor: "#05050c", panelOpacity: 0.94, inDuration: 0.9, outDuration: 0.6, shadowEnabled: true };
    case "outro":
      return { ...base, kicker: "СПАСИБО ЗА ПРОСМОТР", subtext: "Ставьте лайк и делитесь с друзьями", ctaLabel: "Подписаться", backgroundColor: "#05050c", panelOpacity: 0.94, inDuration: 0.8, outDuration: 0.6, shadowEnabled: true };
    case "cta":
      return { ...base, kicker: "", subtext: "Подзаголовок призыва", backgroundColor: "#0b0b14", panelOpacity: 0.85, ctaStyle: "button", inDuration: 0.5, outDuration: 0.4, shadowEnabled: true };
    case "subtitle":
      return { ...base, kicker: "", subtext: "", backgroundColor: "#000000", panelOpacity: 0.55, captionStyle: "classic", kineticStagger: 0.08, fontWeight: 700 };
    case "trackingText":
      return { ...base, kicker: "", subtext: "", backgroundColor: "#0b0b14", panelOpacity: 0.5, trackingDirection: "left", trackingSpeed: 0.28, uppercase: true, inDuration: 0.3, outDuration: 0.3, shadowEnabled: true };
    case "kinetic":
      return { ...base, kicker: "", subtext: "", backgroundColor: "#0b0b14", panelOpacity: 0, kineticStyle: "wordBurst", kineticStagger: 0.18, inDuration: 0.3, outDuration: 0.5, shadowEnabled: true };
    case "title":
    default:
      return { ...base, backgroundColor: "#0b0b14", panelOpacity: 0.5, shadowEnabled: true };
  }
}

/** Полная фабрика TextClip с конфигурацией моушн-графики. */
export function createMotionGraphicClip(opts: {
  trackId: string;
  start: number;
  kind: MotionGraphicKind;
  text?: string;
  duration?: number;
}): TextClip {
  const meta = MG_KIND_MAP[opts.kind];
  const cfg = defaultMotionGraphic(opts.kind);
  const duration = opts.duration ?? meta.duration;
  return {
    id: uid("clip"),
    trackId: opts.trackId,
    type: "text",
    name: `${meta.icon} ${meta.label}`,
    text: opts.text ?? meta.text,
    fontFamily: "Montserrat",
    fontSize: meta.fontSize,
    color: "#ffffff",
    backgroundColor: "transparent",
    strokeColor: "#000000",
    strokeWidth: 0,
    align: "center",
    start: opts.start,
    duration,
    x: param(meta.x),
    y: param(meta.y),
    scale: param(1),
    rotation: param(0),
    opacity: param(1),
    animationIn: "none",
    animationOut: "none",
    style: {
      fontFamily: "Montserrat",
      fontSize: meta.fontSize,
      fontWeight: cfg.fontWeight,
      fontStyle: "normal",
      letterSpacing: cfg.letterSpacing,
      lineHeight: cfg.lineHeight,
      color: "#ffffff",
      backgroundColor: "transparent",
      shadow: { enabled: cfg.shadowEnabled, color: cfg.shadowColor, offsetX: 0, offsetY: 2, blur: 12 },
    },
    motionGraphic: cfg,
  };
}

export function isMotionGraphicClip(clip: { motionGraphic?: MotionGraphicConfig | null } | null | undefined): boolean {
  return !!clip?.motionGraphic;
}

/** Текст с учётом опции uppercase. */
export function mgDisplayText(clip: TextClip): string {
  const cfg = clip.motionGraphic;
  if (!cfg) return clip.text;
  return cfg.uppercase ? clip.text.toUpperCase() : clip.text;
}

/** Кегль в пикселях текущего кадра. */
export function mgPx(px1080: number, h: number): number {
  return px1080 * (h / 1080);
}

/* ------------------------------------------------------------------ */
/* математика анимаций                                                 */
/* ------------------------------------------------------------------ */

export interface MgEnvelope {
  /** Прогресс входной анимации 0..1. */
  pIn: number;
  /** Прогресс выходной анимации 0..1 (0 = ещё не началась). */
  pOut: number;
  phase: "in" | "hold" | "out";
}

export function mgEnvelope(cfg: MotionGraphicConfig, duration: number, localTime: number): MgEnvelope {
  const pIn = cfg.inDuration <= 0 ? 1 : clamp01(localTime / cfg.inDuration);
  const outStart = duration - cfg.outDuration;
  const pOut = cfg.outDuration <= 0 ? 0 : clamp01((localTime - outStart) / cfg.outDuration);
  const phase: MgEnvelope["phase"] = pIn < 1 ? "in" : pOut > 0 ? "out" : "hold";
  return { pIn, pOut, phase };
}

export interface MgMotion {
  alpha: number;
  dx: number; // доля размера кадра (0.22 = 22% ширины/высоты)
  dy: number;
  scale: number;
  rotate: number; // градусы
  blur: number; // px
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/**
 * Трансформация элемента для фазы анимации.
 * @param p прогресс фазы 0..1
 * @param dir 1 = вход, -1 = выход (зеркалит вход: элемент продолжает движение)
 */
export function mgAnimMotion(anim: MgAnim, p: number, dir: 1 | -1): MgMotion {
  if (dir === -1) {
    // Выход = зеркальный вход: элемент продолжает движение в ту же сторону.
    const mirror = mgAnimMotion(anim, clamp01(1 - p), 1);
    return { ...mirror, dx: -mirror.dx, dy: -mirror.dy, rotate: -mirror.rotate };
  }
  const q = clamp01(p);
  const ec = easeOutCubic(q);
  const eb = easeOutBack(q);
  const ee = easeOutElastic(q);
  const identity: MgMotion = { alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0 };

  let m: MgMotion;
  switch (anim) {
    case "none":
      m = identity;
      break;
    case "fade":
      m = { alpha: q, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0 };
      break;
    case "slide-up":
      m = { alpha: q, dx: 0, dy: (1 - ec) * 0.22, scale: 1, rotate: 0, blur: 0 };
      break;
    case "slide-down":
      m = { alpha: q, dx: 0, dy: -(1 - ec) * 0.22, scale: 1, rotate: 0, blur: 0 };
      break;
    case "slide-left":
      m = { alpha: q, dx: (1 - ec) * 0.22, dy: 0, scale: 1, rotate: 0, blur: 0 };
      break;
    case "slide-right":
      m = { alpha: q, dx: -(1 - ec) * 0.22, dy: 0, scale: 1, rotate: 0, blur: 0 };
      break;
    case "pop":
      m = { alpha: clamp01(q * 1.4), dx: 0, dy: 0, scale: eb, rotate: 0, blur: 0 };
      break;
    case "elastic":
      m = { alpha: clamp01(q * 2), dx: 0, dy: 0, scale: ee, rotate: 0, blur: 0 };
      break;
    case "stomp":
      m = {
        alpha: clamp01(q * 1.2),
        dx: 0,
        dy: q > 0.85 ? Math.sin((q - 0.85) * 50) * 0.008 * (1 - q) : 0,
        scale: 1 + (1 - ec) * 4,
        rotate: 0,
        blur: 0,
      };
      break;
    case "glitch":
      m = {
        alpha: q < 0.08 ? 0.35 : q < 0.14 ? 1 : q < 0.22 ? 0.45 : 1,
        dx: Math.sin(q * 47) * 0.03 * (1 - q),
        dy: Math.cos(q * 31) * 0.015 * (1 - q),
        scale: 1,
        rotate: 0,
        blur: 0,
      };
      break;
    case "typewriter":
      m = { alpha: q, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0 };
      break;
    case "blur-in":
      m = { alpha: q, dx: 0, dy: 0, scale: 1, rotate: 0, blur: (1 - q) * 14 };
      break;
    case "scale-in":
      m = { alpha: clamp01(q * 1.5), dx: 0, dy: 0, scale: 0.3 + 0.7 * eb, rotate: 0, blur: 0 };
      break;
    case "rotate-in":
      m = { alpha: clamp01(q * 1.2), dx: 0, dy: 0, scale: 1, rotate: (1 - ec) * 90, blur: 0 };
      break;
    case "zoom":
      m = { alpha: clamp01(q * 1.5), dx: 0, dy: 0, scale: 1 + (1 - ec) * 3, rotate: 0, blur: 0 };
      break;
    default:
      m = identity;
  }

  return m;
}

/** Композиция входной и выходной трансформаций. */
export function mgGroupMotion(cfg: MotionGraphicConfig, duration: number, localTime: number): MgMotion {
  const env = mgEnvelope(cfg, duration, localTime);
  const inM = mgAnimMotion(cfg.animationIn, env.pIn, 1);
  const outM = mgAnimMotion(cfg.animationOut, env.pOut, -1);
  return {
    alpha: clamp01(inM.alpha * outM.alpha),
    dx: inM.dx + outM.dx,
    dy: inM.dy + outM.dy,
    scale: inM.scale * outM.scale,
    rotate: inM.rotate + outM.rotate,
    blur: Math.max(inM.blur, outM.blur),
  };
}

/* ------------------------------------------------------------------ */
/* пословная анимация                                                  */
/* ------------------------------------------------------------------ */

export function mgSplitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Эффективный шаг появления слов (сек), не выходящий за длительность клипа. */
export function mgWordStagger(count: number, duration: number, requested: number): number {
  if (count <= 1) return 0;
  const max = Math.max(0.04, (duration - 0.35) / count);
  return clamp(requested > 0 ? requested : 0.16, 0.03, max);
}

/** Длительность анимации одного слова. */
export function mgWordDur(stagger: number): number {
  return clamp(stagger * 2.2, 0.12, 0.55);
}

/** Прогресс появления слова i в момент localTime. */
export function mgWordProgress(localTime: number, index: number, stagger: number, wordDur: number): number {
  return clamp01((localTime - index * stagger) / wordDur);
}

/** Индекс активного слова (karaoke) в момент localTime. */
export function mgActiveWordIndex(localTime: number, stagger: number): number {
  if (stagger <= 0) return 0;
  return Math.max(0, Math.floor(localTime / stagger));
}

/** Прогресс 0..1 для ключевых кадров прогресс-бара. */
export function mgProgressValue(cfg: MotionGraphicConfig, localTime: number): number {
  return clamp01(evalParam(cfg.progress, localTime));
}

/* ------------------------------------------------------------------ */
/* FFmpeg-экспорт                                                      */
/* ------------------------------------------------------------------ */

export interface InputEntry {
  pre: string[];
  path: string;
}

/** Геометрия статичной панели (для PNG-оверлея или drawbox). */
export interface MgPanelSpec {
  x: number; // top-left px
  y: number;
  w: number;
  h: number;
  r: number; // radius px
  bg: string; // hex
  alpha: number; // 0..1
  borderColor?: string | null;
  borderWidth?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  /** Полноэкранная подложка с мягким акцентным свечением (intro/outro). */
  glow?: boolean;
}

/** Готовый PNG-оверлей панели. */
export interface MgOverlayResult {
  path: string;
  png: Uint8Array;
}

/** Рендерер PNG-панелей (поставляется из canvas-модуля в браузере). */
export type MgOverlayRenderer = (clip: TextClip, W: number, H: number, spec: MgPanelSpec) => MgOverlayResult | null;

/** Измерение текста в пикселях (canvas в браузере, эвристика в Node). */
export type MgMeasureText = (text: string, px: number, family: string, weight: number) => number;

export function heuristicMeasure(text: string, px: number, _family: string, _weight: number): number {
  if (!text) return 0;
  let wide = 0;
  for (const ch of text) {
    if (ch === "m" || ch === "w" || ch === "M" || ch === "W" || ch === "@" || ch === "—" || ch === "•") wide += 0.72;
    else if (ch === "i" || ch === "l" || ch === "I" || ch === "|" || ch === " " || ch === ".") wide += 0.34;
    else wide += 0.58;
  }
  return wide * px * 0.62;
}

export interface MgFfmpegOptions {
  clip: TextClip;
  W: number;
  H: number;
  /** Текущий label композита. */
  composite: string;
  /** Генератор уникальных label. */
  label: (prefix: string) => string;
  /** Сюда можно пушить доп. входы (логотип, PNG-панели). */
  inputs: InputEntry[];
  /** Резолвер имени файла ассета по assetId. */
  fileNameFor: (assetId: string) => string;
  /** Измерение текста в px. */
  measure: MgMeasureText;
  /** Рендерер PNG-панелей (null → drawbox). */
  renderOverlay?: MgOverlayRenderer | null;
}

export interface MgFfmpegResult {
  composite: string;
  filters: string[];
  /** PNG-файлы, которые рендер должен записать в ФС ffmpeg. */
  overlayFiles: { path: string; png: Uint8Array }[];
}

function escDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

/* ---- выражения (зеркалят mgAnimMotion / ease-функции) ---- */

const eCubic = (wp: string) => `1-pow(1-(${wp}),3)`;
const eBack = (wp: string) => `1+2.70158*pow((${wp})-1,3)+1.70158*pow((${wp})-1,2)`;
const eElastic = (wp: string) => `pow(2,-10*(${wp}))*sin(((${wp})*10-0.75)*2.094395)+1`;
const c01 = (e: string) => `min(1,max(0,(${e})))`;

function wpExpr(T: string, i: number, stagger: number, wordDur: number): string {
  return c01(`((${T})-${(i * stagger).toFixed(4)})/${wordDur.toFixed(4)}`);
}

export interface MgAnimExprs {
  alpha: string;
  dx: string; // доля кадра
  dy: string;
  scale: string;
}

/** FFmpeg-выражения, точно повторяющие mgAnimMotion. */
export function mgAnimExprs(anim: MgAnim, wp: string, dir: 1 | -1): MgAnimExprs {
  // Выход зеркалит вход: значения берутся в (1-p), направление — обратное.
  const w = dir === -1 ? `(1-(${wp}))` : wp;
  const ec = eCubic(w);
  const eb = eBack(w);
  const ee = eElastic(w);
  let a = "1";
  let dx = "0";
  let dy = "0";
  let sc = "1";
  switch (anim) {
    case "fade":
      a = w;
      break;
    case "slide-up":
      a = w;
      dy = `(1-(${ec}))*0.22`;
      break;
    case "slide-down":
      a = w;
      dy = `-(1-(${ec}))*0.22`;
      break;
    case "slide-left":
      a = w;
      dx = `(1-(${ec}))*0.22`;
      break;
    case "slide-right":
      a = w;
      dx = `-(1-(${ec}))*0.22`;
      break;
    case "pop":
      a = c01(`(${w})*1.4`);
      sc = eb;
      break;
    case "elastic":
      a = c01(`(${w})*2`);
      sc = ee;
      break;
    case "stomp":
      a = c01(`(${w})*1.2`);
      dy = `if(gt(${w},0.85),sin((${w}-0.85)*50)*0.008*(1-(${w})),0)`;
      sc = `1+(1-(${ec}))*4`;
      break;
    case "glitch":
      a = `if(lt(${w},0.08),0.35,if(lt(${w},0.14),1,if(lt(${w},0.22),0.45,1)))`;
      dx = `sin((${w})*47)*0.03*(1-(${w}))`;
      dy = `cos((${w})*31)*0.015*(1-(${w}))`;
      break;
    case "typewriter":
      a = w;
      break;
    case "blur-in":
      a = w;
      break;
    case "scale-in":
      a = c01(`(${w})*1.5`);
      sc = `0.3+0.7*(${eb})`;
      break;
    case "rotate-in":
      a = c01(`(${w})*1.2`);
      break;
    case "zoom":
      a = c01(`(${w})*1.5`);
      sc = `1+(1-(${ec}))*3`;
      break;
    default:
      break;
  }
  if (dir === -1) {
    dx = `-(${dx})`;
    dy = `-(${dy})`;
  }
  return { alpha: a, dx, dy, scale: sc };
}

/** Композитные выражения группы: вход × выход. */
export function mgGroupExprs(
  cfg: MotionGraphicConfig,
  duration: number,
  T: string,
): { alpha: string; dx: string; dy: string; scale: string } {
  const pIn = cfg.inDuration <= 0 ? "1" : c01(`(${T})/${cfg.inDuration}`);
  const pOut = cfg.outDuration <= 0 ? "0" : c01(`((${T})-${(duration - cfg.outDuration).toFixed(4)})/${cfg.outDuration}`);
  const inM = mgAnimExprs(cfg.animationIn, pIn, 1);
  const outM = mgAnimExprs(cfg.animationOut, pOut, -1);
  return {
    alpha: c01(`(${inM.alpha})*(${outM.alpha})`),
    dx: `(${inM.dx})+(${outM.dx})`,
    dy: `(${inM.dy})+(${outM.dy})`,
    scale: `(${inM.scale})*(${outM.scale})`,
  };
}

/** Перенос строк по ширине (эвристика, согласована с canvas-версией). */
export function wrapMgText(text: string, maxW: number, px: number, family: string, weight: number, measure: MgMeasureText): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, px, family, weight) > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

/** Кинетика слова: выражения для drawtext (позиция/масштаб/альфа). */
export function mgWordExprs(
  style: MgKineticStyle,
  T: string,
  i: number,
  stagger: number,
  wordDur: number,
  tGlobal: string,
): { alpha: string; dx: string; dy: string; scale: string } {
  const wp = wpExpr(T, i, stagger, wordDur);
  switch (style) {
    case "wordBurst": {
      const dx = `(mod(${i},3)-1)*0.03*(1-(${wp}))`;
      return { alpha: c01(`(${wp})*1.5`), dx, dy: "0", scale: eBack(wp) };
    }
    case "wave": {
      const waveY = `sin((${tGlobal})*7.54+(${i})*0.9)*0.022`;
      return { alpha: c01(`(${wp})*2`), dx: "0", dy: waveY, scale: "1" };
    }
    case "stomp": {
      const dy = `if(gt(${wp},0.9),sin((${wp}-0.9)*45)*0.01,0)`;
      return { alpha: c01(`(${wp})*1.2`), dx: "0", dy, scale: `1+(1-(${eCubic(wp)}))*4` };
    }
    case "elastic":
      return { alpha: c01(`(${wp})*2`), dx: "0", dy: "0", scale: eElastic(wp) };
    case "glitch": {
      const jx = `(sin((${tGlobal})*60+(${i})*7)+0.5*sin((${tGlobal})*97+(${i})*13))*0.012*(0.4+0.6*${wp})`;
      const a = `if(lt(mod((${tGlobal})*17+(${i}),1),0.25),0.6,1)*${c01(`(${wp})*2`)}`;
      return { alpha: a, dx: jx, dy: "0", scale: "1" };
    }
    case "typewriter": {
      const blur = `(1-${c01(`(${wp})*2.2`)})*6`;
      return { alpha: c01(`(${wp})*3`), dx: "0", dy: "0", scale: `1+(${blur})*0.02` };
    }
    case "flip":
      return { alpha: c01(`(${wp})*1.5`), dx: "0", dy: "0", scale: eBack(wp) };
    default:
      return { alpha: c01(`(${wp})*2`), dx: "0", dy: "0", scale: "1" };
  }
}

/** Выражения caption-стиля для слова. */
export function mgCaptionWordExprs(style: MgCaptionStyle, T: string, i: number, stagger: number, wordDur: number): { alpha: string; dx: string; dy: string; scale: string } {
  const wp = wpExpr(T, i, stagger, wordDur);
  switch (style) {
    case "pop":
      return { alpha: c01(`(${wp})*1.5`), dx: "0", dy: "0", scale: eBack(wp) };
    case "highlight":
      return { alpha: c01(`(${wp})*2`), dx: "0", dy: "0", scale: "1" };
    case "karaoke":
      return { alpha: c01(`(${wp})*2`), dx: "0", dy: "0", scale: "1" };
    case "box":
      return { alpha: c01(`(${wp})*2`), dx: "0", dy: "0", scale: "1" };
    case "classic":
    default:
      return { alpha: c01(`(${wp})*2`), dx: "0", dy: "0", scale: "1" };
  }
}

/** Drawtext-строка. */
function drawtextLine(opts: {
  fontFile: string;
  text: string;
  fontSize: string;
  color: string;
  x: string;
  y: string;
  alpha: string;
  start: number;
  end: number;
  borderw?: number;
  bordercolor?: string;
  shadowx?: number;
  shadowy?: number;
  shadowcolor?: string;
  enableExtra?: string;
}): string {
  const parts = [
    `drawtext=fontfile=${opts.fontFile}`,
    `text='${opts.text}'`,
    `fontsize='${opts.fontSize}'`,
    `fontcolor=${opts.color}`,
    `x='${opts.x}'`,
    `y='${opts.y}'`,
    `alpha='${opts.alpha}'`,
    `borderw=${opts.borderw ?? 0}`,
    `bordercolor=${opts.bordercolor ?? "black"}`,
  ];
  if (opts.shadowx) parts.push(`shadowx=${opts.shadowx}`);
  if (opts.shadowy) parts.push(`shadowy=${opts.shadowy}`);
  if (opts.shadowcolor) parts.push(`shadowcolor=${opts.shadowcolor}`);
  const enable = opts.enableExtra
    ? `between(t\\,${opts.start.toFixed(4)}\\,${opts.end.toFixed(4)})+(${opts.enableExtra})`
    : `between(t\\,${opts.start.toFixed(4)}\\,${opts.end.toFixed(4)})`;
  parts.push(`enable='${enable}'`);
  return parts.join(":");
}

export function hexToFfmpegColor(hex: string, alpha: number): string {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const a = clamp01(alpha);
  return `0x${c}@${a.toFixed(3)}`;
}

/* ------------------------------------------------------------------ */
/* геометрия (общая для превью и экспорта)                             */
/* ------------------------------------------------------------------ */

export interface MgLineLayout {
  text: string;
  /** Центр строки по X (px, абсолютно). */
  cx: number;
  /** Верх строки по Y (px, абсолютно). */
  y: number;
  /** Ширина строки (px). */
  w: number;
  /** Левый край (px). */
  left: number;
}

export interface MgWordLayout {
  word: string;
  /** Центр слова (px, абсолютно). */
  cx: number;
  /** Левый край слова (px, абсолютно). */
  left: number;
  w: number;
  /** Индекс строки. */
  line: number;
  /** Индекс слова в тексте. */
  index: number;
}

export interface MgTextLayout {
  lines: MgLineLayout[];
  words: MgWordLayout[];
  /** Общая высота блока (px). */
  height: number;
  /** Верх блока (px). */
  top: number;
  /** Максимальная ширина строки (px). */
  maxW: number;
  /** Кегль (px). */
  px: number;
  lineHeight: number;
}

/** Раскладка многострочного текста с пословными позициями. */
export function layoutMgText(opts: {
  text: string;
  px: number;
  maxW: number;
  cx: number;
  top: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  family: string;
  weight: number;
  measure: MgMeasureText;
}): MgTextLayout {
  const { text, px, maxW, cx, top, lineHeight, align, family, weight, measure } = opts;
  const rawLines = wrapMgText(text, maxW, px, family, weight, measure);
  const lines: MgLineLayout[] = rawLines.map((line) => {
    const w = measure(line, px, family, weight);
    let left: number;
    if (align === "left") left = cx - maxW / 2;
    else if (align === "right") left = cx + maxW / 2 - w;
    else left = cx - w / 2;
    return { text: line, cx: left + w / 2, y: 0, w, left };
  });
  const words: MgWordLayout[] = [];
  let globalIndex = 0;
  rawLines.forEach((line, li) => {
    const ws = mgSplitWords(line);
    let cursor = lines[li].left;
    ws.forEach((word) => {
      const w = measure(word, px, family, weight);
      words.push({ word, cx: cursor + w / 2, left: cursor, w, line: li, index: globalIndex });
      globalIndex += 1;
      cursor += w + measure(" ", px, family, weight);
    });
  });
  lines.forEach((l, i) => {
    l.y = top + i * lineHeight;
  });
  const height = rawLines.length * lineHeight;
  return { lines, words, height, top, maxW, px, lineHeight };
}

/* ------------------------------------------------------------------ */
/* главный билдер FFmpeg-фильтров                                      */
/* ------------------------------------------------------------------ */

const n = (v: number): string => v.toFixed(2);

export function buildMotionGraphicFfmpeg(opts: MgFfmpegOptions): MgFfmpegResult {
  const { clip, W, H, composite, label, inputs, fileNameFor, measure, renderOverlay } = opts;
  const cfg = clip.motionGraphic;
  const filters: string[] = [];
  const overlayFiles: { path: string; png: Uint8Array }[] = [];
  let comp = composite;
  if (!cfg) return { composite: comp, filters, overlayFiles };

  const duration = clip.duration;
  const start = clip.start;
  const end = start + duration;
  const T = `t-${start.toFixed(4)}`;
  const s = H / 1080;
  const px = (p1080: number) => p1080 * s;

  const clipX = paramToFfmpegExpr(clip.x, T);
  const clipY = paramToFfmpegExpr(clip.y, T);
  const clipScale = paramToFfmpegExpr(clip.scale, T);
  const clipOp = c01(paramToFfmpegExpr(clip.opacity, T));
  const group = mgGroupExprs(cfg, duration, T);
  const groupAlpha = c01(`(${clipOp})*(${group.alpha})`);

  const fontFile = fontFileFor(clip.fontFamily);
  const family = clip.fontFamily;
  const weight = cfg.fontWeight ?? 800;

  /** Начало координат группы (центр кадра + clip.x/y + групповой сдвиг).
   *  В превью смещение clip.x/y умножается на полный размер кадра. */
  const OX = `(${W}/2)+(${clipX})*${W}+(${group.dx})*${W}`;
  const OY = `(${H}/2)+(${clipY})*${H}+(${group.dy})*${H}`;

  const mainPx = px(clip.fontSize);
  const text = mgDisplayText(clip);

  const shadowOpts = cfg.shadowEnabled
    ? { shadowx: 0, shadowy: Math.max(1, Math.round(px(6))), shadowcolor: hexToFfmpegColor(cfg.shadowColor, 0.55) }
    : {};
  const stroke = cfg.outlineEnabled
    ? { borderw: Math.max(1, Math.round(px(cfg.outlineWidth))), bordercolor: hexToFfmpegColor(cfg.outlineColor, 1) }
    : {};

  let ovlCounter = 0;
  /**
   * Панель: PNG-оверлей или drawbox-fallback.
   * spec.x/y — координаты относительно начала координат группы (OX/OY);
   * fades — в локальном времени стрима (стрим живёт ровно длительность клипа,
   * а видимость на таймлайне задаёт enable='between(t,start,end)').
   */
  const addPanel = (spec: MgPanelSpec, motion: { dx?: string; dy?: string; scale?: string }) => {
    const dx = motion.dx ?? "0";
    const dy = motion.dy ?? "0";
    const scale = motion.scale ?? group.scale;
    if (renderOverlay) {
      // PNG-рендереру нужны АБСОЛЮТНЫЕ координаты кадра (с учётом базового
      // смещения clip.x/y), а анимация позиции докидывается выражением ниже.
      const baseX = evalParam(clip.x, 0);
      const baseY = evalParam(clip.y, 0);
      const absSpec: MgPanelSpec = { ...spec, x: spec.x + W / 2 + baseX * W, y: spec.y + H / 2 + baseY * H };
      const res = renderOverlay(clip, W, H, absSpec);
      if (res) {
        const idx = inputs.length;
        // Стрим живёт до конца клипа на таймлайне: иначе при eof_action=repeat
        // overlay показывал бы последний (погасший) кадр для клипов с start > 0.
        inputs.push({ pre: ["-loop", "1", "-t", end.toFixed(3)], path: res.path });
        overlayFiles.push({ path: res.path, png: res.png });
        const ov = label("ovl_");
        const fades: string[] = ["format=rgba"];
        if (cfg.inDuration > 0) fades.push(`fade=t=in:st=${start.toFixed(4)}:d=${cfg.inDuration.toFixed(4)}:alpha=1`);
        if (cfg.outDuration > 0) fades.push(`fade=t=out:st=${(end - cfg.outDuration).toFixed(4)}:d=${cfg.outDuration.toFixed(4)}:alpha=1`);
        filters.push(`[${idx}:v]${fades.join(",")}[${ov}]`);
        let ovlLabel = ov;
        if (scale !== "1") {
          const sc = label("ovs_");
          filters.push(`[${ov}]scale=w='iw*(${scale})':h='ih*(${scale})':eval=frame[${sc}]`);
          ovlLabel = sc;
        }
        const xExpr = `${n(absSpec.x + absSpec.w / 2)}+(${clipX}-(${n(baseX)}))*${W}+(${group.dx})*${W}+(${dx})*${W}-overlay_w/2`;
        const yExpr = `${n(absSpec.y + absSpec.h / 2)}+(${clipY}-(${n(baseY)}))*${H}+(${group.dy})*${H}+(${dy})*${H}-overlay_h/2`;
        const next = label("ovc_");
        filters.push(
          `[${comp}][${ovlLabel}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${next}]`,
        );
        comp = next;
        return;
      }
    }
    // Fallback: drawbox (без скругления, тени и свечения).
    const next = label("db_");
    const color = hexToFfmpegColor(spec.bg, spec.alpha);
    filters.push(
      `[${comp}]drawbox=x='${OX}+${n(spec.x)}+(${dx})*${W}':y='${OY}+${n(spec.y)}+(${dy})*${H}':w=${n(spec.w)}:h=${n(spec.h)}:color=${color}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${next}]`,
    );
    comp = next;
  };

  /** Добавляет drawtext. relX — центр по X, либо leftX — левый край (px от начала координат). */
  const addText = (o: {
    raw: string;
    px: number;
    /** Центр по X (px, относительно начала координат). */
    cxRel?: number | string;
    /** Левый край по X (px, относительно начала координат). */
    leftRel?: number | string;
    /** Абсолютный X (полное выражение; игнорирует OX). */
    xAbs?: string;
    /** Середина строки по Y (px, относительно начала координат). */
    yRel?: number | string;
    /** Абсолютный Y (полное выражение; игнорирует OY). */
    yAbs?: string;
    color: string;
    alphaExpr: string;
    scaleExpr?: string;
    /** Текст уже экранирован (для %{eif} и т.п.). */
    rawText?: boolean;
    enableExtra?: string;
  }) => {
    const cleaned = o.rawText ? o.raw : sanitizeGlyphs(o.raw);
    if (!cleaned.trim()) return;
    const fontsize = o.scaleExpr
      ? `(${n(o.px)}*(${clipScale})*(${o.scaleExpr}))`
      : `(${n(o.px)}*(${clipScale}))`;
    const xExpr = o.xAbs
      ? `(${o.xAbs})`
      : o.leftRel !== undefined
        ? `${OX}+(${typeof o.leftRel === "number" ? n(o.leftRel) : o.leftRel})`
        : `${OX}+(${typeof o.cxRel === "number" ? n(o.cxRel) : o.cxRel})-text_w/2`;
    const yExpr = o.yAbs ? `(${o.yAbs})+text_h/2` : `(${OY})+(${typeof o.yRel === "number" ? n(o.yRel) : o.yRel})+text_h/2`;
    const next = label("dt_");
    filters.push(
      `[${comp}]${drawtextLine({
        fontFile,
        text: o.rawText ? cleaned : escDrawtext(cleaned),
        fontSize: fontsize,
        color: o.color,
        x: xExpr,
        y: yExpr,
        alpha: o.alphaExpr,
        start,
        end,
        ...shadowOpts,
        ...stroke,
        enableExtra: o.enableExtra,
      })}[${next}]`,
    );
    comp = next;
  };

  const hasPanel = cfg.backgroundColor && cfg.backgroundColor !== "transparent" && cfg.panelOpacity > 0.02;
  void ovlCounter;

  /* ================= TITLE ================= */
  if (cfg.kind === "title") {
    const kPx = px(Math.round(clip.fontSize * 0.34));
    const subPx = px(Math.round(clip.fontSize * 0.4));
    const maxW = W * 0.72;
    const kicker = cfg.kicker ? cfg.kicker.toUpperCase() : "";
    const titleLayout = layoutMgText({ text, px: mainPx, maxW, cx: W / 2, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const subLines = cfg.subtext ? wrapMgText(cfg.subtext, maxW, subPx, family, weight, measure) : [];
    const kH = kicker ? kPx * 1.7 : 0;
    const subH = subLines.length * subPx * 1.5;
    const contentH = kH + titleLayout.height + (subLines.length ? subH + px(12) : 0);
    const padX = W * 0.045;
    const padY = px(26);
    const boxW = Math.max(titleLayout.maxW, measure(kicker, kPx, family, weight), ...subLines.map((l) => measure(l, subPx, family, weight))) + padX * 2;
    const boxH = contentH + padY * 2;
    if (hasPanel) {
      addPanel({ x: -boxW / 2, y: -boxH / 2, w: boxW, h: boxH, r: px(cfg.radius), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
    }
    let yCursor = -contentH / 2;
    if (kicker) {
      addText({ raw: kicker, px: kPx, cxRel: 0, yRel: yCursor + kPx * 0.6, color: hexToFfmpegColor(cfg.accentColor, 1), alphaExpr: groupAlpha, scaleExpr: group.scale });
      yCursor += kH - px(8);
    }
    titleLayout.lines.forEach((l) => {
      addText({ raw: l.text, px: mainPx, cxRel: 0, yRel: yCursor + (l.y - titleLayout.top) + mainPx * 0.6, color: clip.color || "#ffffff", alphaExpr: groupAlpha, scaleExpr: group.scale });
    });
    yCursor += titleLayout.height;
    if (subLines.length) {
      yCursor += px(12);
      subLines.forEach((l, i) => {
        addText({ raw: l, px: subPx, cxRel: 0, yRel: yCursor + i * subPx * 1.5 + subPx * 0.6, color: hexToFfmpegColor(cfg.secondaryColor, 1), alphaExpr: groupAlpha, scaleExpr: group.scale });
      });
    }
  }

  /* ================= LOWER THIRD ================= */
  else if (cfg.kind === "lowerThird") {
    const namePx = px(clip.fontSize);
    const rolePx = px(Math.round(clip.fontSize * 0.62));
    const kicker = cfg.kicker || "ИМЯ";
    const role = cfg.subtext || "";
    const barW = Math.max(5, px(7));
    const padX = W * 0.022;
    const padY = px(16);
    const nameW = measure(kicker, namePx, family, weight);
    const roleW = role ? measure(role, rolePx, family, weight) : 0;
    const boxW = Math.max(nameW, roleW) + padX * 2 + barW + px(12);
    const boxH = padY * 2 + namePx * 1.4 + (role ? rolePx * 1.5 : 0);
    // Панель: левый край = начало координат, вертикально по центру.
    if (hasPanel) {
      addPanel({ x: 0, y: -boxH / 2, w: boxW, h: boxH, r: px(cfg.radius), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
    }
    // Акцентный вертикальный бар.
    const barNext = label("db_");
    filters.push(
      `[${comp}]drawbox=x='${OX}+${n(px(2))}':y='${OY}+${n(-boxH / 2 + px(2))}':w=${n(barW)}:h=${n(boxH - px(4))}:color=${hexToFfmpegColor(cfg.accentColor, 1)}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${barNext}]`,
    );
    comp = barNext;
    const textLeft = barW + padX + px(6);
    addText({ raw: kicker, px: namePx, leftRel: textLeft, yRel: -boxH / 2 + padY + namePx * 0.65, color: clip.color || "#ffffff", alphaExpr: groupAlpha });
    if (role) {
      addText({ raw: role, px: rolePx, leftRel: textLeft, yRel: -boxH / 2 + padY + namePx * 1.4 + rolePx * 0.6, color: hexToFfmpegColor(cfg.secondaryColor, 1), alphaExpr: groupAlpha });
    }
  }

  /* ================= CALLOUT ================= */
  else if (cfg.kind === "callout") {
    const maxW = W * 0.5;
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: 0, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const padX = px(26);
    const padY = px(18);
    const boxW = layout.maxW + padX * 2;
    const boxH = layout.height + padY * 2;
    const tailH = px(22);
    const style = cfg.calloutStyle;
    const boxX = -boxW / 2;
    const boxY = -boxH - tailH;
    if (style === "bubble" || style === "box" || style === "sticker") {
      const spec: MgPanelSpec = {
        x: boxX, y: boxY, w: boxW, h: boxH,
        r: style === "sticker" ? px(14) : px(cfg.radius),
        bg: style === "box" ? (hasPanel ? cfg.backgroundColor : "#0b0b14") : cfg.accentColor,
        alpha: style === "box" ? cfg.panelOpacity : 0.92,
        borderColor: style === "box" ? cfg.accentColor : null,
        borderWidth: style === "box" ? Math.max(2, px(3)) : 0,
        shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur),
      };
      addPanel(spec, {});
      layout.lines.forEach((l) => {
        addText({ raw: l.text, px: mainPx, cxRel: 0, yRel: boxY + padY + (l.y - layout.top) + mainPx * 0.6, color: "#ffffff", alphaExpr: groupAlpha, scaleExpr: group.scale });
      });
    } else if (style === "highlight") {
      const hlH = layout.height + px(16);
      addPanel({ x: boxX, y: boxY, w: boxW, h: hlH, r: px(cfg.radius), bg: cfg.accentColor, alpha: 0.85, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
      layout.lines.forEach((l) => {
        addText({ raw: l.text, px: mainPx, cxRel: 0, yRel: boxY + px(8) + (l.y - layout.top) + mainPx * 0.6, color: "#ffffff", alphaExpr: groupAlpha, scaleExpr: group.scale });
      });
    } else {
      // underline: текст + акцентное подчёркивание
      const uW = layout.maxW + px(24);
      const uH = Math.max(4, px(5));
      const uY = boxY + layout.height + px(8);
      addText({ raw: text, px: mainPx, cxRel: 0, yRel: boxY + mainPx * 0.6, color: clip.color || "#ffffff", alphaExpr: groupAlpha, scaleExpr: group.scale });
      const un = label("db_");
      filters.push(
        `[${comp}]drawbox=x='${OX}+${n(-uW / 2)}':y='${OY}+${n(uY)}':w=${n(uW)}:h=${n(uH)}:color=${hexToFfmpegColor(cfg.accentColor, 1)}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${un}]`,
      );
      comp = un;
    }
  }

  /* ================= PROGRESS BAR ================= */
  else if (cfg.kind === "progressBar") {
    const labelTxt = cfg.showLabel ? text : "";
    const labelPx = px(clip.fontSize || 28);
    const trackW = W * cfg.barWidth;
    const trackH = px(cfg.barThickness);
    const gap = px(16);
    const labelW = labelTxt ? measure(labelTxt, labelPx, family, weight) : 0;
    const pctPx = px(Math.round((clip.fontSize || 28) * 0.9));
    const pctW = cfg.showPercent ? measure("100%", pctPx, family, weight) : 0;
    const rowW = labelW + gap + trackW + gap + pctW;
    let trackX: number;
    let trackY: number;
    let rowMode = false;
    if (rowW < W * 0.94) {
      rowMode = true;
      const rowLeft = (W - rowW) / 2;
      trackX = rowLeft - W / 2 + labelW + gap;
      trackY = -trackH / 2;
      if (labelTxt) {
        addText({ raw: labelTxt, px: labelPx, leftRel: rowLeft - W / 2, yRel: labelPx * 0.35, color: clip.color || "#ffffff", alphaExpr: groupAlpha });
      }
    } else {
      trackX = -trackW / 2;
      trackY = px(14);
      if (labelTxt) {
        addText({ raw: labelTxt, px: labelPx, cxRel: 0, yRel: -px(16) + labelPx * 0.35, color: clip.color || "#ffffff", alphaExpr: groupAlpha });
      }
    }
    const r = cfg.barRounded ? trackH / 2 : 0;
    const progExpr = c01(paramToFfmpegExpr(cfg.progress, T));
    if (hasPanel) {
      addPanel({ x: trackX - px(6), y: trackY - px(6), w: trackW + px(12), h: trackH + px(12), r: r + px(6), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(6) }, {});
    }
    // Трек.
    addPanel({ x: trackX, y: trackY, w: trackW, h: trackH, r, bg: "#ffffff", alpha: 0.18 }, {});
    // Заливка (анимированная ширина) — PNG с crop, либо drawbox.
    const fillW = `${n(trackW)}*(${progExpr})`;
    if (cfg.barRounded && renderOverlay) {
      const spec: MgPanelSpec = { x: trackX, y: trackY, w: trackW, h: trackH, r, bg: cfg.accentColor, alpha: 1 };
      const res = renderOverlay(clip, W, H, spec);
      if (res) {
        const idx = inputs.length;
        inputs.push({ pre: ["-loop", "1", "-t", end.toFixed(3)], path: res.path });
        overlayFiles.push({ path: res.path, png: res.png });
        const ov = label("ovl_");
        filters.push(`[${idx}:v]format=rgba[${ov}]`);
        const cr = label("crp_");
        filters.push(`[${ov}]crop=w='${fillW}':h=ih:x=0:y=0[${cr}]`);
        const xExpr = `${OX}+${n(trackX)}`;
        const yExpr = `${OY}+${n(trackY)}`;
        const next = label("ovc_");
        filters.push(`[${comp}][${cr}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${next}]`);
        comp = next;
      } else {
        const fn = label("db_");
        filters.push(
          `[${comp}]drawbox=x='${OX}+${n(trackX)}':y='${OY}+${n(trackY)}':w='${fillW}':h=${n(trackH)}:color=${hexToFfmpegColor(cfg.accentColor, 1)}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${fn}]`,
        );
        comp = fn;
      }
    } else {
      const fn = label("db_");
      filters.push(
        `[${comp}]drawbox=x='${OX}+${n(trackX)}':y='${OY}+${n(trackY)}':w='${fillW}':h=${n(trackH)}:color=${hexToFfmpegColor(cfg.accentColor, 1)}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${fn}]`,
      );
      comp = fn;
    }
    if (cfg.showPercent) {
      const pctX = rowMode ? trackX + trackW + gap : trackX + trackW - pctW;
      const pctText = `%{eif\\:floor(100*(${progExpr}))\\:d}\\%%`;
      const next = label("pct_");
      filters.push(
        `[${comp}]drawtext=fontfile=${fontFile}:text='${pctText}':fontsize='(${n(pctPx)}*(${clipScale}))':fontcolor=${clip.color || "#ffffff"}:x='${OX}+${n(pctX)}-text_w/2':y='${OY}+${n(trackY + trackH / 2 + pctPx * 0.1)}':alpha='${groupAlpha}':enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${next}]`,
      );
      comp = next;
    }
  }

  /* ================= CAPTIONS / SUBTITLE ================= */
  else if (cfg.kind === "animatedCaptions" || cfg.kind === "subtitle") {
    const maxW = W * 0.82;
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: W / 2, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const count = Math.max(1, layout.words.length);
    const stagger = mgWordStagger(count, duration, cfg.kineticStagger);
    const wordDur = mgWordDur(stagger);
    const boxPadX = px(28);
    const boxPadY = px(18);
    const style = cfg.captionStyle;
    const blockTop = -layout.height / 2;
    const hasBox = style === "box" || (hasPanel && style !== "classic" && style !== "highlight");
    if (hasBox) {
      addPanel({ x: -layout.maxW / 2 - boxPadX, y: blockTop - boxPadY, w: layout.maxW + boxPadX * 2, h: layout.height + boxPadY * 2, r: px(cfg.radius), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
    }
    if (style === "highlight") {
      // Акцентная полоса под каждой строкой.
      layout.lines.forEach((l, li) => {
        const lineStart = li * layout.lineHeight;
        const aExpr = c01(`((${T})-${n(lineStart)})/0.3`);
        const barH = Math.max(6, px(8));
        const hn = label("db_");
        filters.push(
          `[${comp}]drawbox=x='${OX}+${n(l.left - W / 2 - px(10))}':y='${OY}+${n(l.y - layout.top + blockTop + mainPx * 0.55 - barH / 2)}':w=${n(l.w + px(20))}:h=${n(barH)}:color=${hexToFfmpegColor(cfg.accentColor, 0.85)}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})+gt(${aExpr}\\,0)'[${hn}]`,
        );
        comp = hn;
      });
    }
    layout.words.forEach((w) => {
      const we = mgCaptionWordExprs(style, T, w.index, stagger, wordDur);
      const wordAlpha = c01(`(${groupAlpha})*(${we.alpha})`);
      const isKaraoke = style === "karaoke";
      const cxRel = w.cx - W / 2;
      const yRel = blockTop + (w.line * layout.lineHeight) + mainPx * 0.6;
      addText({
        raw: w.word,
        px: mainPx,
        cxRel,
        yRel,
        color: isKaraoke ? hexToFfmpegColor(cfg.accentColor, 1) : clip.color || "#ffffff",
        alphaExpr: wordAlpha,
        scaleExpr: `(${group.scale})*(${we.scale})`,
      });
      if (isKaraoke) {
        addText({
          raw: w.word,
          px: mainPx,
          cxRel,
          yRel,
          color: clip.color || "#ffffff",
          alphaExpr: c01(`(${groupAlpha})*(1-${we.alpha})`),
          scaleExpr: `(${group.scale})*(${we.scale})`,
        });
      }
    });
  }

  /* ================= LOGO REVEAL ================= */
  else if (cfg.kind === "logoReveal") {
    const logoSize = Math.min(W, H) * 0.18;
    const wordmarkPx = px(clip.fontSize);
    const kickerPx = px(Math.round(clip.fontSize * 0.4));
    const hasImage = !!cfg.logoAssetId;
    const wordmarkW = measure(text, wordmarkPx, family, weight);
    const gap = px(18);
    const totalH = logoSize + gap + wordmarkPx * 1.4 + (cfg.kicker ? kickerPx * 1.6 : 0);
    const top = -totalH / 2;
    if (hasPanel) {
      const boxW = Math.max(logoSize, wordmarkW) + px(60);
      addPanel({ x: -boxW / 2, y: top - px(28), w: boxW, h: totalH + px(56), r: px(cfg.radius), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
    }
    const logoDelay = 0.25;
    const logoDur = Math.max(0.3, cfg.inDuration * 0.7);
    const lp = c01(`((${T})-${n(logoDelay)})/${n(logoDur)}`);
    let la = lp;
    let ls = "1";
    let ldx = "0";
    let ldy = "0";
    switch (cfg.logoStyle) {
      case "zoom":
        ls = `0.2+0.8*(${eBack(lp)})`;
        la = c01(`(${lp})*2`);
        break;
      case "fade":
        la = c01(`(${lp})*2`);
        break;
      case "slide":
        ldx = `(1-(${eCubic(lp)}))*0.3`;
        la = c01(`(${lp})*2`);
        break;
      case "bounce":
        la = c01(`(${lp})*2`);
        ldy = `abs(sin((${T})*5))*0.04*(1-${c01(`((${T})-0.9)/0.5`)})`;
        break;
      case "rotate":
        la = c01(`(${lp})*2`);
        ls = `0.5+0.5*(${eCubic(lp)})`;
        break;
    }
    const logoY = top + logoSize / 2;
    if (hasImage && cfg.logoAssetId) {
      const logoFile = fileNameFor(cfg.logoAssetId);
      if (logoFile) {
        const idx = inputs.length;
        inputs.push({ pre: ["-loop", "1", "-t", end.toFixed(3)], path: logoFile });
        const ov = label("logo_");
        const fades: string[] = ["format=rgba"];
        if (la !== "1") fades.push(`fade=t=in:st=${(start + logoDelay).toFixed(4)}:d=${logoDur.toFixed(4)}:alpha=1`);
        if (cfg.outDuration > 0) fades.push(`fade=t=out:st=${(end - cfg.outDuration).toFixed(4)}:d=${cfg.outDuration.toFixed(4)}:alpha=1`);
        filters.push(`[${idx}:v]${fades.join(",")}[${ov}]`);
        const sc = label("logos_");
        filters.push(`[${ov}]scale=w='${n(logoSize)}*(${ls})':h='${n(logoSize)}*(${ls})':eval=frame[${sc}]`);
        const next = label("logoc_");
        const xExpr = `(${W / 2})-overlay_w/2+(${ldx})*${W}+(${group.dx})*${W}+(${clipX})*${W}`;
        const yExpr = `(${H / 2 + logoY})-overlay_h/2+(${ldy})*${H}+(${group.dy})*${H}+(${clipY})*${H}`;
        filters.push(`[${comp}][${sc}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${next}]`);
        comp = next;
      }
    } else {
      addText({
        raw: cfg.logoText || "M",
        px: logoSize * 1.05,
        cxRel: 0,
        yRel: logoY,
        color: hexToFfmpegColor(cfg.accentColor, 1),
        alphaExpr: c01(`(${groupAlpha})*(${la})`),
        scaleExpr: `(${group.scale})*(${ls})`,
      });
    }
    const wmP = c01(`((${T})-${n(logoDelay + 0.45)})/0.4`);
    addText({
      raw: text,
      px: wordmarkPx,
      cxRel: 0,
      yRel: top + logoSize + gap + wordmarkPx * 0.7,
      color: clip.color || "#ffffff",
      alphaExpr: c01(`(${groupAlpha})*(${wmP})`),
      scaleExpr: group.scale,
    });
    if (cfg.kicker) {
      addText({
        raw: cfg.kicker.toUpperCase(),
        px: kickerPx,
        cxRel: 0,
        yRel: top - px(10) + kickerPx * 0.6,
        color: hexToFfmpegColor(cfg.accentColor, 1),
        alphaExpr: groupAlpha,
        scaleExpr: group.scale,
      });
    }
  }

  /* ================= INTRO / OUTRO ================= */
  else if (cfg.kind === "intro" || cfg.kind === "outro") {
    const isOutro = cfg.kind === "outro";
    // Полноэкранная подложка — абсолютная (не двигается с clip.x/y).
    if (hasPanel) {
      const bgNext = label("bg_");
      if (renderOverlay) {
        const spec: MgPanelSpec = { x: 0, y: 0, w: W, h: H, r: 0, bg: cfg.backgroundColor, alpha: cfg.panelOpacity, glow: true };
        const res = renderOverlay(clip, W, H, spec);
        if (res) {
          const idx = inputs.length;
          inputs.push({ pre: ["-loop", "1", "-t", end.toFixed(3)], path: res.path });
          overlayFiles.push({ path: res.path, png: res.png });
          const ov = label("ovl_");
          const fades: string[] = ["format=rgba"];
          if (cfg.inDuration > 0) fades.push(`fade=t=in:st=${start.toFixed(4)}:d=${Math.min(cfg.inDuration, 0.8).toFixed(4)}:alpha=1`);
          if (cfg.outDuration > 0) fades.push(`fade=t=out:st=${(end - cfg.outDuration).toFixed(4)}:d=${cfg.outDuration.toFixed(4)}:alpha=1`);
          filters.push(`[${idx}:v]${fades.join(",")}[${ov}]`);
          filters.push(`[${comp}][${ov}]overlay=x=0:y=0:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${bgNext}]`);
          comp = bgNext;
        } else {
          filters.push(
            `[${comp}]drawbox=x=0:y=0:w=${W}:h=${H}:color=${hexToFfmpegColor(cfg.backgroundColor, cfg.panelOpacity)}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${bgNext}]`,
          );
          comp = bgNext;
        }
      } else {
        filters.push(
          `[${comp}]drawbox=x=0:y=0:w=${W}:h=${H}:color=${hexToFfmpegColor(cfg.backgroundColor, cfg.panelOpacity)}:t=fill:enable='between(t\\,${start.toFixed(4)}\\,${end.toFixed(4)})'[${bgNext}]`,
        );
        comp = bgNext;
      }
    }
    const kicker = cfg.kicker || (isOutro ? "СПАСИБО ЗА ПРОСМОТР" : "");
    const kickerPx = px(Math.round(clip.fontSize * 0.32));
    const subPx = px(Math.round(clip.fontSize * 0.38));
    const logoSize = Math.min(W, H) * 0.12;
    const logoY = -H * (isOutro ? 0.26 : 0.24);
    if (cfg.logoText) {
      addText({
        raw: cfg.logoText,
        px: logoSize * 1.1,
        cxRel: 0,
        yRel: logoY,
        color: hexToFfmpegColor(cfg.accentColor, 1),
        alphaExpr: groupAlpha,
        scaleExpr: group.scale,
      });
    }
    let yCursor = -H * (isOutro ? 0.12 : 0.14);
    if (kicker) {
      addText({ raw: kicker.toUpperCase(), px: kickerPx, cxRel: 0, yRel: yCursor, color: hexToFfmpegColor(cfg.accentColor, 1), alphaExpr: groupAlpha, scaleExpr: group.scale });
      yCursor += kickerPx * 1.8;
    }
    const maxW = W * 0.8;
    const tLayout = layoutMgText({ text, px: mainPx, maxW, cx: W / 2, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    tLayout.lines.forEach((l) => {
      addText({ raw: l.text, px: mainPx, cxRel: 0, yRel: yCursor + (l.y - tLayout.top) + mainPx * 0.6, color: clip.color || "#ffffff", alphaExpr: groupAlpha, scaleExpr: group.scale });
    });
    yCursor += tLayout.height + px(20);
    if (isOutro) {
      const btnW = Math.max(px(220), measure(cfg.ctaLabel || "Подписаться", px(40), family, weight) + px(90));
      const btnH = px(72);
      const btnY = yCursor;
      const pulse = `(1+0.025*sin(2*PI*1.6*(${T})))`;
      addPanel({ x: -btnW / 2, y: btnY, w: btnW, h: btnH, r: btnH / 2, bg: cfg.accentColor, alpha: 1, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(20) }, { scale: `(${group.scale})*(${pulse})` });
      addText({ raw: cfg.ctaLabel || "Подписаться", px: px(40), cxRel: 0, yRel: btnY + btnH / 2, color: "#ffffff", alphaExpr: groupAlpha, scaleExpr: `(${group.scale})*(${pulse})` });
      yCursor += btnH + px(24);
    }
    if (cfg.subtext) {
      const subLines = wrapMgText(cfg.subtext, maxW, subPx, family, weight, measure);
      subLines.forEach((l, i) => {
        addText({ raw: l, px: subPx, cxRel: 0, yRel: yCursor + i * subPx * 1.5 + subPx * 0.6, color: hexToFfmpegColor(cfg.secondaryColor, 1), alphaExpr: groupAlpha, scaleExpr: group.scale });
      });
    }
  }

  /* ================= CTA ================= */
  else if (cfg.kind === "cta") {
    const style = cfg.ctaStyle;
    const btnLabel = cfg.ctaLabel || clip.text || "Подписаться";
    const title = clip.text && clip.text !== btnLabel ? clip.text : "";
    const sub = cfg.ctaSubtext || "";
    const subPx = px(Math.round(clip.fontSize * 0.55));
    const titlePx = px(Math.round(clip.fontSize * 1.15));
    const btnPx = px(clip.fontSize);
    const btnH = px(64);
    const pulse = `(1+0.025*sin(2*PI*1.6*(${T})))`;
    if (style === "button") {
      const btnW = Math.max(px(180), measure(btnLabel, btnPx, family, weight) + px(80));
      addPanel({ x: -btnW / 2, y: -btnH / 2, w: btnW, h: btnH, r: btnH / 2, bg: cfg.accentColor, alpha: 1, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(18) }, { scale: `(${group.scale})*(${pulse})` });
      addText({ raw: `${btnLabel}  →`, px: btnPx, cxRel: 0, yRel: 0, color: "#ffffff", alphaExpr: groupAlpha, scaleExpr: `(${group.scale})*(${pulse})` });
      if (sub) {
        addText({ raw: sub, px: subPx, cxRel: 0, yRel: btnH / 2 + subPx * 1.1, color: hexToFfmpegColor(cfg.secondaryColor, 1), alphaExpr: groupAlpha, scaleExpr: group.scale });
      }
    } else if (style === "bar") {
      const barW = W * 0.86;
      const barH = px(92);
      addPanel({ x: -barW / 2, y: -barH / 2, w: barW, h: barH, r: px(cfg.radius), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
      const btnW = Math.max(px(150), measure(btnLabel, btnPx, family, weight) + px(60));
      const btnX = barW / 2 - btnW - px(16);
      const btnY = -btnH / 2;
      addPanel({ x: btnX, y: btnY, w: btnW, h: btnH, r: btnH / 2, bg: cfg.accentColor, alpha: 1 }, { scale: `(${group.scale})*(${pulse})` });
      if (title) {
        addText({ raw: title, px: titlePx, leftRel: -barW / 2 + px(28), yRel: titlePx * 0.1, color: clip.color || "#ffffff", alphaExpr: groupAlpha, scaleExpr: group.scale });
      }
      addText({ raw: btnLabel, px: btnPx, cxRel: btnX + btnW / 2, yRel: 0, color: "#ffffff", alphaExpr: groupAlpha, scaleExpr: `(${group.scale})*(${pulse})` });
    } else {
      // card
      const maxW = W * 0.5;
      const titleLayout = title ? layoutMgText({ text: title, px: titlePx, maxW, cx: 0, top: 0, lineHeight: titlePx * cfg.lineHeight, align: "center", family, weight, measure }) : null;
      const subLines = sub ? wrapMgText(sub, maxW, subPx, family, weight, measure) : [];
      const btnW = Math.max(px(180), measure(btnLabel, btnPx, family, weight) + px(80));
      const contentH = (titleLayout?.height ?? 0) + (subLines.length ? subLines.length * subPx * 1.5 + px(10) : 0) + btnH + px(36);
      const boxW = Math.max(maxW, btnW) + px(64);
      const boxH = contentH + px(48);
      addPanel({ x: -boxW / 2, y: -boxH / 2, w: boxW, h: boxH, r: px(cfg.radius), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
      let yCursor = -contentH / 2 + px(12);
      if (titleLayout) {
        titleLayout.lines.forEach((l) => {
          addText({ raw: l.text, px: titlePx, cxRel: 0, yRel: yCursor + (l.y - titleLayout.top) + titlePx * 0.6, color: clip.color || "#ffffff", alphaExpr: groupAlpha, scaleExpr: group.scale });
        });
        yCursor += titleLayout.height + px(10);
      }
      subLines.forEach((l, i) => {
        addText({ raw: l, px: subPx, cxRel: 0, yRel: yCursor + i * subPx * 1.5 + subPx * 0.6, color: hexToFfmpegColor(cfg.secondaryColor, 1), alphaExpr: groupAlpha, scaleExpr: group.scale });
      });
      if (subLines.length) yCursor += subLines.length * subPx * 1.5 + px(16);
      addPanel({ x: -btnW / 2, y: yCursor, w: btnW, h: btnH, r: btnH / 2, bg: cfg.accentColor, alpha: 1 }, { scale: `(${group.scale})*(${pulse})` });
      addText({ raw: btnLabel, px: btnPx, cxRel: 0, yRel: yCursor + btnH / 2, color: "#ffffff", alphaExpr: groupAlpha, scaleExpr: `(${group.scale})*(${pulse})` });
    }
  }

  /* ================= TRACKING TEXT ================= */
  else if (cfg.kind === "trackingText") {
    const trackPx = px(clip.fontSize);
    const dir = cfg.trackingDirection;
    const speed = cfg.trackingSpeed;
    if (dir === "up" || dir === "down") {
      const lines = wrapMgText(text, W * 0.95, trackPx, family, weight, measure);
      const lineH = trackPx * cfg.lineHeight;
      const blockH = lines.length * lineH;
      lines.forEach((l, i) => {
        const offset = `((${T})*${n(speed * H)}+${n(i * lineH)})`;
        const mod = `mod(${offset},${n(H + blockH + lineH * 2)})`;
        const yExpr = dir === "up" ? `(${H})+${n(trackPx)}-${mod}` : `-${n(trackPx)}+${mod}`;
        addText({ raw: l, px: trackPx, xAbs: OX, yAbs: yExpr, color: clip.color || "#ffffff", alphaExpr: groupAlpha });
      });
    } else {
      const speedPx = speed * W;
      const xExpr =
        dir === "left"
          ? `(${W})+text_w-mod((${T})*${n(speedPx)},(${W})+2*text_w)`
          : `-text_w+mod((${T})*${n(speedPx)},(${W})+2*text_w)`;
      addText({ raw: text, px: trackPx, xAbs: xExpr, yRel: trackPx * 0.05, color: clip.color || "#ffffff", alphaExpr: groupAlpha });
    }
  }

  /* ================= KINETIC ================= */
  else if (cfg.kind === "kinetic") {
    const maxW = W * 0.86;
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: W / 2, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const count = Math.max(1, layout.words.length);
    const stagger = mgWordStagger(count, duration, cfg.kineticStagger);
    const wordDur = mgWordDur(stagger);
    const style = cfg.kineticStyle;
    const blockTop = -layout.height / 2;
    if (hasPanel) {
      addPanel({ x: -layout.maxW / 2 - px(32), y: blockTop - px(24), w: layout.maxW + px(64), h: layout.height + px(48), r: px(cfg.radius), bg: cfg.backgroundColor, alpha: cfg.panelOpacity, shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: px(cfg.shadowBlur) }, {});
    }
    layout.words.forEach((w) => {
      const we = mgWordExprs(style, T, w.index, stagger, wordDur, T);
      const cxRel = w.cx - W / 2;
      const yRel = blockTop + w.line * layout.lineHeight + mainPx * 0.6;
      const alpha = c01(`(${groupAlpha})*(${we.alpha})`);
      const scaleExpr = `(${group.scale})*(${we.scale})`;
      if (style === "glitch") {
        addText({ raw: w.word, px: mainPx, cxRel: `(${n(cxRel)})+(${we.dx})*${W}`, yRel, color: hexToFfmpegColor(cfg.accentColor, 1), alphaExpr: c01(`(${alpha})*0.55`), scaleExpr });
        addText({ raw: w.word, px: mainPx, cxRel: `(${n(cxRel)})-(${we.dx})*${W}`, yRel, color: "#67e8f9", alphaExpr: c01(`(${alpha})*0.45`), scaleExpr });
      }
      addText({ raw: w.word, px: mainPx, cxRel: `(${n(cxRel)})+(${we.dx})*${W}`, yRel: `(${n(yRel)})+(${we.dy})*${H}`, color: clip.color || "#ffffff", alphaExpr: alpha, scaleExpr });
    });
  }

  return { composite: comp, filters, overlayFiles };
}
