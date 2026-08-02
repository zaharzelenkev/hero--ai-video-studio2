"use client";

import { evalParam } from "@/lib/keyframes";
import { EFFECT_PRESETS } from "@/lib/presets";
import type { BlendMode, Clip, ColorGrade, MediaAsset, Project, SubtitleClip, TextClip, Track, VideoClip } from "@/lib/types";
import { mediaPool } from "./resourcePool";
import { applyVfxChain, hexToRgbArr, toImageData } from "./vfxEngine";
import { vfxBrush } from "./vfxBrush";
import { bgRemovalService, type SegmentationMask } from "./mediaPipeVfx";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const LUT_CSS: Record<string, string> = {
  none: "",
  cinematic: "contrast(1.08) saturate(0.92) sepia(0.08)",
  warm: "sepia(0.18) saturate(1.15) contrast(1.03)",
  cool: "hue-rotate(-8deg) saturate(1.05) contrast(1.02) brightness(1.02)",
  bw: "grayscale(1) contrast(1.1)",
  vintage: "sepia(0.35) saturate(0.8) contrast(0.95) brightness(1.05)",
  vivid: "saturate(1.45) contrast(1.1)",
  moody: "saturate(0.85) contrast(1.12) brightness(0.95)",
  dramatic: "contrast(1.25) saturate(0.9)",
  neutral: "contrast(1.03) saturate(1.02)",
  "teal-orange": "contrast(1.1) saturate(1.12) hue-rotate(-6deg)",
  "film-noir": "grayscale(1) contrast(1.32) brightness(0.95)",
  luxury: "saturate(1.2) contrast(1.1) sepia(0.06)",
};

const BLEND_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  colorDodge: "color-dodge",
  colorBurn: "color-burn",
  hardLight: "hard-light",
  softLight: "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function isActiveAt(clip: Clip, time: number): boolean {
  return time >= clip.start - 1e-6 && time < clip.start + clip.duration;
}

/** Локальное время внутри клипа (сек). */
function localTimeOf(clip: Clip, time: number): number {
  return Math.max(0, time - clip.start);
}

/** CSS-фильтр, приближающий цветокоррекцию клипа в реальном времени. */
export function colorGradeToCss(color: ColorGrade | undefined, localTime: number): string {
  if (!color) return "";
  const parts: string[] = [];
  const ev = (p?: { value: number; keyframes: unknown[] }) =>
    p ? evalParam(p as Parameters<typeof evalParam>[0], localTime) : 0;

  const exposure = ev(color.exposure);
  const brightness = ev(color.brightness);
  const contrast = ev(color.contrast);
  const saturation = ev(color.saturation);
  const vibrance = ev(color.vibrance);
  const hue = ev(color.hue);
  const temperature = ev(color.temperature);
  const tint = ev(color.tint);
  const gammaParam = color.gamma ? evalParam(color.gamma, localTime) : 1;
  const highlights = ev(color.highlights);
  const shadows = ev(color.shadows);
  const blacks = ev(color.blacks);
  const whites = ev(color.whites);

  const brightnessTotal =
    Math.pow(2, exposure) * (1 + brightness) * (1 + (whites - blacks) / 600) * (gammaParam ? 1 / Math.max(0.2, gammaParam) : 1);
  if (Math.abs(brightnessTotal - 1) > 0.001) parts.push(`brightness(${clamp(brightnessTotal, 0.05, 4).toFixed(3)})`);

  const contrastTotal = (1 + contrast) * (1 + (highlights - shadows) / 900);
  if (Math.abs(contrastTotal - 1) > 0.001) parts.push(`contrast(${clamp(contrastTotal, 0.05, 4).toFixed(3)})`);

  const satTotal = (1 + saturation) * (1 + vibrance * 0.5);
  if (Math.abs(satTotal - 1) > 0.001) parts.push(`saturate(${clamp(satTotal, 0, 4).toFixed(3)})`);

  const hueTotal = hue + tint * 18;
  if (Math.abs(hueTotal) > 0.01) parts.push(`hue-rotate(${hueTotal.toFixed(2)}deg)`);

  if (temperature > 0.001) parts.push(`sepia(${clamp(temperature * 0.42, 0, 1).toFixed(3)}) saturate(${(1 + temperature * 0.16).toFixed(3)})`);
  if (temperature < -0.001) parts.push(`hue-rotate(${(temperature * 14).toFixed(2)}deg) saturate(${(1 - temperature * 0.08).toFixed(3)})`);

  const lutCss = LUT_CSS[color.lut] ?? "";
  if (lutCss) parts.push(lutCss);

  return parts.join(" ");
}

function effectsToCss(effects: string[] | undefined): string {
  if (!effects?.length) return "";
  const parts: string[] = [];
  for (const id of effects) {
    const preset = EFFECT_PRESETS.find((p) => p.id === id);
    if (preset?.css) parts.push(preset.css);
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* offscreen helpers                                                   */
/* ------------------------------------------------------------------ */

const scratchCanvases = new Map<string, HTMLCanvasElement>();

function scratch(key: string, width: number, height: number): CanvasRenderingContext2D | null {
  let canvas = scratchCanvases.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    scratchCanvases.set(key, canvas);
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function croppedSource(clip: VideoClip, width: number, height: number, localTime: number): SourceRect {
  const cl = clip.cropLeft ? clamp(evalParam(clip.cropLeft, localTime), 0, 0.9) : 0;
  const cr = clip.cropRight ? clamp(evalParam(clip.cropRight, localTime), 0, 0.9) : 0;
  const ct = clip.cropTop ? clamp(evalParam(clip.cropTop, localTime), 0, 0.9) : 0;
  const cb = clip.cropBottom ? clamp(evalParam(clip.cropBottom, localTime), 0, 0.9) : 0;
  const sx = width * cl;
  const sy = height * ct;
  const sw = Math.max(2, width * (1 - cl - cr));
  const sh = Math.max(2, height * (1 - ct - cb));
  return { sx, sy, sw, sh };
}

function fitRect(sw: number, sh: number, w: number, h: number, mode: "cover" | "contain"): { dw: number; dh: number } {
  const sourceAspect = sw / sh;
  const frameAspect = w / h;
  if (mode === "contain" ? sourceAspect > frameAspect : sourceAspect < frameAspect) {
    return { dw: w, dh: w / sourceAspect };
  }
  return { dw: h * sourceAspect, dh: h };
}

/** Ken Burns / камера: небольшой дрейф кадра за время клипа. */
function cameraTransform(clip: VideoClip, progress: number): { scale: number; dx: number; dy: number } {
  const motion = clip.cameraMotion ?? "none";
  const amount = 0.12;
  switch (motion) {
    case "zoom-in":
      return { scale: 1 + amount * progress, dx: 0, dy: 0 };
    case "zoom-out":
      return { scale: 1 + amount * (1 - progress), dx: 0, dy: 0 };
    case "pan-left":
      return { scale: 1 + amount, dx: -amount * progress, dy: 0 };
    case "pan-right":
      return { scale: 1 + amount, dx: amount * progress, dy: 0 };
    case "pan-up":
      return { scale: 1 + amount, dx: 0, dy: -amount * progress };
    case "pan-down":
      return { scale: 1 + amount, dx: 0, dy: amount * progress };
    default:
      return { scale: 1, dx: 0, dy: 0 };
  }
}

/** Прозрачность перехода на входе/выходе клипа. */
function transitionAlpha(clip: VideoClip | TextClip, localTime: number): { alpha: number; flash: string | null } {
  let alpha = 1;
  let flash: string | null = null;
  const media = clip as VideoClip;
  const tin = media.transitionIn;
  if (tin && tin.duration > 0 && localTime < tin.duration) {
    const p = clamp(localTime / tin.duration, 0, 1);
    if (tin.type === "fadeblack") {
      alpha = 1;
      flash = `rgba(0,0,0,${(1 - p).toFixed(3)})`;
    } else if (tin.type === "fadewhite") {
      alpha = 1;
      flash = `rgba(255,255,255,${(1 - p).toFixed(3)})`;
    } else if (tin.type !== "cut") {
      alpha = p;
    }
  }
  const tout = media.transitionOut;
  if (tout && tout.duration > 0) {
    const remaining = clip.duration - localTime;
    if (remaining < tout.duration) {
      const p = clamp(remaining / tout.duration, 0, 1);
      if (tout.type === "fadeblack") flash = `rgba(0,0,0,${(1 - p).toFixed(3)})`;
      else if (tout.type === "fadewhite") flash = `rgba(255,255,255,${(1 - p).toFixed(3)})`;
      else if (tout.type !== "cut") alpha = Math.min(alpha, p);
    }
  }
  return { alpha, flash };
}

/* ------------------------------------------------------------------ */
/* VFX helpers                                                         */
/* ------------------------------------------------------------------ */

/** Есть ли у клипа эффекты движка, требующие обработки кадра. */
function hasEngineVfx(clip: VideoClip): boolean {
  const vfx = clip.vfx;
  if (clip.chroma?.enabled) return true;
  if (clip.motionBlur?.enabled) return true;
  if (!vfx) return false;
  return (
    (vfx.backgroundRemoval?.enabled ?? false) ||
    (vfx.objectRemoval?.enabled && ((vfx.objectRemoval.strokes?.length ?? 0) > 0 || (vfx.objectRemoval.region?.polygon?.length ?? 0) > 0)) ||
    (vfx.lut?.enabled && vfx.lut.preset !== "none") ||
    (vfx.glow?.enabled ?? false) ||
    (vfx.lightRays?.enabled ?? false) ||
    (vfx.filmGrain?.enabled ?? false) ||
    (vfx.lensDistortion?.enabled ?? false) ||
    (vfx.bloom?.enabled ?? false) ||
    (vfx.sharpen?.enabled ?? false) ||
    (vfx.noiseReduction?.enabled ?? false) ||
    (vfx.vignette?.enabled ?? false)
  );
}

/**
 * Прогоняет VFX-цепочку движка по слою клипа (offscreen-канвас).
 * Для скорости работает на уменьшенной копии кадра — как прокси в NLE.
 */
function applyEngineToLayer(
  layerCtx: CanvasRenderingContext2D,
  clip: VideoClip,
  asset: MediaAsset | undefined,
  source: CanvasImageSource,
  localTime: number,
  w: number,
  h: number,
) {
  const vfx = clip.vfx;
  // Удаление объекта (FMM-инпейнтинг) — самый дорогой шаг: считаем на
  // заметно меньшем разрешении.
  const maxWork = vfx?.objectRemoval?.enabled ? 420 : 660;
  const scale = Math.min(1, maxWork / Math.max(1, w));
  const workW = Math.max(2, Math.round(w * scale));
  const workH = Math.max(2, Math.round(h * scale));

  let work: CanvasRenderingContext2D | null = null;
  let full: CanvasRenderingContext2D | null = null;
  if (scale < 0.999) {
    work = scratch(`vfxWork:${clip.id}`, workW, workH);
    if (!work) return;
    work.drawImage(layerCtx.canvas, 0, 0, workW, workH);
  } else {
    full = layerCtx;
  }

  const target = (work ?? full)!;
  const frame = target.getImageData(0, 0, workW, workH);

  // AI-удаление фона: маска MediaPipe (кэшируется по времени — 250 мс корзины).
  let bgMask: SegmentationMask | null = null;
  if (vfx?.backgroundRemoval?.enabled) {
    const key = `${clip.id}:${asset?.id ?? "?"}:${Math.round(localTime * 4) / 4}`;
    bgMask = bgRemovalService.getMask(key);
    if (!bgMask) {
      bgRemovalService.computeMaskSoon(source, key);
    }
  }

  const chainVfx = {
    ...vfx,
    motionBlur: clip.motionBlur?.enabled
      ? {
          enabled: true,
          angleDeg: clip.motionBlur.angle ?? 0,
          length: (clip.motionBlur.samples ?? 8) * 0.75,
          samples: Math.max(2, Math.round((clip.motionBlur.samples ?? 8) * 1.5)),
        }
      : null,
  };

  const chroma = clip.chroma;
  const out = applyVfxChain(
    { data: frame.data, width: workW, height: workH },
    chainVfx,
    {
      time: localTime,
      workScale: scale,
      bgMask: bgMask ?? null,
      chroma: chroma?.enabled
        ? {
            color: hexToRgbArr(chroma.color),
            similarity: chroma.similarity,
            blend: chroma.blend,
            despill: chroma.despill ?? 0.35,
          }
        : null,
    },
  );

  target.putImageData(toImageData(out), 0, 0);

  if (scale < 0.999 && work) {
    layerCtx.drawImage(work.canvas, 0, 0, w, h);
  }
}

/** Оверлей кисти удаления объекта (штрихи + живой мазок). */
function drawBrushOverlay(ctx: CanvasRenderingContext2D, clip: VideoClip, w: number, h: number) {
  if (!vfxBrush.isActive(clip.id)) return;
  const strokes = clip.vfx?.objectRemoval.strokes ?? [];
  const live = vfxBrush.state.liveStroke;
  ctx.save();
  for (const s of [...strokes, ...(live ?? [])]) {
    const cx = s.x * w;
    const cy = s.y * h;
    const r = Math.max(2, s.radius * w);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(244,63,94,0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* clip drawing                                                        */
/* ------------------------------------------------------------------ */

function drawVisualClip(
  ctx: CanvasRenderingContext2D,
  clip: VideoClip,
  asset: MediaAsset | undefined,
  time: number,
  w: number,
  h: number,
) {
  const localTime = localTimeOf(clip, time);
  let source: CanvasImageSource | null = null;
  let sourceWidth = 0;
  let sourceHeight = 0;

  if (clip.type === "video" && asset) {
    const el = mediaPool.videoFor(clip.id, asset);
    if (el && el.readyState >= 2) {
      source = el;
      sourceWidth = el.videoWidth;
      sourceHeight = el.videoHeight;
    }
  } else if (asset) {
    const img = mediaPool.imageFor(asset);
    if (img) {
      source = img;
      sourceWidth = img.naturalWidth;
      sourceHeight = img.naturalHeight;
    }
  }

  if (!source || !sourceWidth || !sourceHeight) {
    // Материал ещё грузится: показываем нейтральную «шахматку» вместо пустоты.
    ctx.save();
    ctx.fillStyle = "#12121c";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  const crop = croppedSource(clip, sourceWidth, sourceHeight, localTime);
  const drawSource: CanvasImageSource = source;
  const drawCrop = crop;

  const opacity = clamp(clip.opacity ? evalParam(clip.opacity, localTime) : 1, 0, 1);
  const { alpha, flash } = transitionAlpha(clip, localTime);
  const progress = clip.duration > 0 ? clamp(localTime / clip.duration, 0, 1) : 0;
  const camera = cameraTransform(clip, progress);

  const userScale = clip.scale ? evalParam(clip.scale, localTime) : 1;
  const scaleX = (clip.scaleX ? evalParam(clip.scaleX, localTime) : 1) * userScale * camera.scale * (clip.flipH ? -1 : 1);
  const scaleY = (clip.scaleY ? evalParam(clip.scaleY, localTime) : 1) * userScale * camera.scale * (clip.flipV ? -1 : 1);
  const offsetX = (clip.x ? evalParam(clip.x, localTime) : 0) + camera.dx;
  const offsetY = (clip.y ? evalParam(clip.y, localTime) : 0) + camera.dy;
  const rotation = clip.rotation ? evalParam(clip.rotation, localTime) : 0;

  const filter = [colorGradeToCss(clip.color, localTime), effectsToCss(clip.effects)]
    .filter(Boolean)
    .join(" ");

  // Ключ цвета и motion blur теперь считаются движком попиксельно.
  const needsMask = clip.mask?.enabled;
  const engineFx = hasEngineVfx(clip);
  // Если нужен движок — рисуем в offscreen-слой, обрабатываем, потом кладём на холст.
  const needsOffscreen = needsMask || engineFx;
  const target = needsOffscreen ? scratch(`mask:${clip.id}`, w, h) : ctx;
  if (!target) return;

  target.save();
  target.globalAlpha = opacity * alpha;
  if (!needsOffscreen && clip.blendMode && clip.blendMode !== "normal") {
    target.globalCompositeOperation = BLEND_MAP[clip.blendMode] ?? "source-over";
  }

  // Blur-pad: заполняем фон размытой копией кадра, чтобы вертикальное видео
  // на горизонтальном холсте не резалось.
  if (clip.blurPad) {
    const cover = fitRect(drawCrop.sw, drawCrop.sh, w, h, "cover");
    target.save();
    target.filter = "blur(28px) brightness(0.7)";
    target.drawImage(
      drawSource,
      drawCrop.sx,
      drawCrop.sy,
      drawCrop.sw,
      drawCrop.sh,
      (w - cover.dw * 1.12) / 2,
      (h - cover.dh * 1.12) / 2,
      cover.dw * 1.12,
      cover.dh * 1.12,
    );
    target.restore();
  }

  const mode: "cover" | "contain" = clip.blurPad ? "contain" : clip.fitMode ?? "cover";
  const { dw, dh } = fitRect(drawCrop.sw, drawCrop.sh, w, h, mode);

  target.translate(w / 2 + offsetX * w, h / 2 + offsetY * h);
  if (rotation) target.rotate((rotation * Math.PI) / 180);
  target.scale(scaleX, scaleY);
  if (filter) target.filter = filter;
  target.drawImage(drawSource, drawCrop.sx, drawCrop.sy, drawCrop.sw, drawCrop.sh, -dw / 2, -dh / 2, dw, dh);
  target.filter = "none";

  // Color wheels — приближение: подсветка теней (lift) и светов (gain).
  const wheels = clip.color?.colorWheels;
  if (wheels) {
    const liftStrength = Math.abs(wheels.lift.r) + Math.abs(wheels.lift.g) + Math.abs(wheels.lift.b);
    const gainStrength = Math.abs(wheels.gain.r) + Math.abs(wheels.gain.g) + Math.abs(wheels.gain.b);
    if (liftStrength > 0.001) {
      target.globalCompositeOperation = "lighter";
      target.globalAlpha = clamp(liftStrength * 0.25, 0, 0.5) * opacity;
      target.fillStyle = `rgb(${clamp(128 + wheels.lift.r * 127, 0, 255)},${clamp(128 + wheels.lift.g * 127, 0, 255)},${clamp(128 + wheels.lift.b * 127, 0, 255)})`;
      target.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
    if (gainStrength > 0.001) {
      target.globalCompositeOperation = "overlay";
      target.globalAlpha = clamp(gainStrength * 0.3, 0, 0.6) * opacity;
      target.fillStyle = `rgb(${clamp(128 + wheels.gain.r * 127, 0, 255)},${clamp(128 + wheels.gain.g * 127, 0, 255)},${clamp(128 + wheels.gain.b * 127, 0, 255)})`;
      target.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
  }
  target.restore();

  // VFX-движок: настоящая попиксельная обработка слоя.
  if (engineFx && target !== ctx) {
    applyEngineToLayer(target, clip, asset, source, localTime, w, h);
  }

  if (needsOffscreen) {
    // Маска (destination-in/out) на обработанном слое.
    if (clip.mask?.enabled) {
      const maskCtx = target;
      const mx = evalParam(clip.mask.x, localTime) * w;
      const my = evalParam(clip.mask.y, localTime) * h;
      const mw = evalParam(clip.mask.width, localTime) * w;
      const mh = evalParam(clip.mask.height, localTime) * h;
      maskCtx.save();
      maskCtx.globalCompositeOperation = clip.mask.inverted ? "destination-out" : "destination-in";
      if (clip.mask.feather > 0) maskCtx.filter = `blur(${clip.mask.feather}px)`;
      maskCtx.fillStyle = "#ffffff";
      if (clip.mask.shape === "ellipse") {
        maskCtx.beginPath();
        maskCtx.ellipse(mx + mw / 2, my + mh / 2, mw / 2, mh / 2, 0, 0, Math.PI * 2);
        maskCtx.fill();
      } else if (clip.mask.shape === "polygon" && clip.mask.points?.length) {
        maskCtx.beginPath();
        clip.mask.points.forEach((p, i) => {
          const px = p.x * w;
          const py = p.y * h;
          if (i === 0) maskCtx.moveTo(px, py);
          else maskCtx.lineTo(px, py);
        });
        maskCtx.closePath();
        maskCtx.fill();
      } else {
        maskCtx.fillRect(mx, my, mw, mh);
      }
      maskCtx.restore();
    }

    ctx.save();
    if (clip.blendMode && clip.blendMode !== "normal") {
      ctx.globalCompositeOperation = BLEND_MAP[clip.blendMode] ?? "source-over";
    }
    ctx.drawImage(target.canvas, 0, 0);
    ctx.restore();
  }

  drawBrushOverlay(ctx, clip, w, h);

  if (clip.effects?.includes("vignette")) {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (clip.effects?.includes("letterbox")) {
    const bar = h * 0.12;
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
    ctx.restore();
  }

  if (flash) {
    ctx.save();
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawTextClip(ctx: CanvasRenderingContext2D, clip: TextClip, time: number, w: number, h: number) {
  const localTime = localTimeOf(clip, time);
  const style = clip.style;
  const fontSize = (clip.fontSize || 48) * (h / 1080);
  const weight = style?.fontWeight ?? 700;
  const italic = style?.fontStyle === "italic" ? "italic " : "";
  const family = clip.fontFamily || "Inter";

  const opacity = clamp(clip.opacity ? evalParam(clip.opacity, localTime) : 1, 0, 1);
  const scale = clip.scale ? evalParam(clip.scale, localTime) : 1;
  const rotation = clip.rotation ? evalParam(clip.rotation, localTime) : 0;
  const x = w / 2 + (clip.x ? evalParam(clip.x, localTime) : 0) * w;
  const y = h / 2 + (clip.y ? evalParam(clip.y, localTime) : 0) * h;
  const { alpha } = transitionAlpha(clip, localTime);

  ctx.save();
  ctx.globalAlpha = opacity * alpha;
  ctx.translate(x, y);
  if (rotation) ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.font = `${italic}${weight} ${fontSize}px "${family}", "Inter", system-ui, sans-serif`;
  ctx.textAlign = clip.align || "center";
  ctx.textBaseline = "middle";
  if (style?.letterSpacing) {
    const withSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    withSpacing.letterSpacing = `${style.letterSpacing}px`;
  }

  let text = clip.text || "";
  if (clip.animationIn === "typewriter") {
    const revealDuration = Math.min(1.2, clip.duration * 0.6);
    const shown = Math.ceil(clamp(localTime / revealDuration, 0, 1) * text.length);
    text = text.slice(0, shown);
  }
  if (clip.animationIn === "blur-in") {
    const p = clamp(localTime / 0.5, 0, 1);
    if (p < 1) ctx.filter = `blur(${((1 - p) * 12).toFixed(2)}px)`;
  }

  const maxWidth = w * 0.86;
  const lines = wrapLines(ctx, text, maxWidth / Math.max(0.2, scale));
  const lineHeight = fontSize * (style?.lineHeight ?? 1.25);
  const totalHeight = lines.length * lineHeight;
  const startY = -totalHeight / 2 + lineHeight / 2;

  if (clip.backgroundColor && clip.backgroundColor !== "transparent") {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    ctx.save();
    ctx.fillStyle = clip.backgroundColor;
    ctx.globalAlpha = opacity * alpha;
    const padX = fontSize * 0.45;
    const padY = fontSize * 0.28;
    const bx = clip.align === "left" ? -padX : clip.align === "right" ? -widest - padX : -widest / 2 - padX;
    ctx.fillRect(bx, startY - lineHeight / 2 - padY, widest + padX * 2, totalHeight + padY * 2);
    ctx.restore();
  }

  if (style?.shadow?.enabled) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowOffsetX = style.shadow.offsetX;
    ctx.shadowOffsetY = style.shadow.offsetY;
    ctx.shadowBlur = style.shadow.blur;
  }

  lines.forEach((line, i) => {
    const ly = startY + i * lineHeight;
    if (style?.gradient?.enabled && style.gradient.colors.length > 1) {
      const width = ctx.measureText(line).width;
      const gradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
      for (const stop of style.gradient.colors) gradient.addColorStop(clamp(stop.position, 0, 1), stop.color);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = clip.color || "#ffffff";
    }
    const strokeWidth = clip.strokeWidth ?? (style?.stroke?.enabled ? style.stroke.width : 0);
    if (strokeWidth) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = clip.strokeColor || style?.stroke?.color || "#000000";
      ctx.lineWidth = strokeWidth * (h / 1080);
      ctx.strokeText(line, 0, ly);
    }
    ctx.fillText(line, 0, ly);
  });

  ctx.restore();
}

function drawSubtitleClip(ctx: CanvasRenderingContext2D, clip: SubtitleClip, w: number, h: number) {
  const fontSize = Math.round(h * 0.045);
  ctx.save();
  ctx.font = `700 ${fontSize}px "Inter", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const lines = wrapLines(ctx, clip.text || "", w * 0.8);
  const lineHeight = fontSize * 1.28;
  const baseY = h - h * 0.08;
  lines.forEach((line, i) => {
    const y = baseY - (lines.length - 1 - i) * lineHeight;
    const width = ctx.measureText(line).width;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(w / 2 - width / 2 - 14, y - lineHeight + 6, width + 28, lineHeight);
    ctx.lineWidth = Math.max(2, fontSize * 0.08);
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(line, w / 2, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, w / 2, y);
  });
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

export interface FrameOptions {
  /** Рисовать безопасные зоны и сетку кадра. */
  guides?: boolean;
  /** Рисовать рамку выделенного клипа. */
  selectedClipId?: string | null;
}

/** Рендерит один кадр таймлайна в canvas (превью = то, что уйдёт в экспорт). */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  time: number,
  options: FrameOptions = {},
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  const assetsById = new Map(project.assets.map((a) => [a.id, a] as const));

  for (const track of project.tracks) {
    if (track.hidden) continue;
    if (track.type === "audio") continue;
    for (const clip of track.clips) {
      if (!isActiveAt(clip, time)) continue;
      if (clip.type === "video" || clip.type === "image") {
        const media = clip as VideoClip;
        drawVisualClip(ctx, media, assetsById.get(media.assetId), time, w, h);
      } else if (clip.type === "text") {
        drawTextClip(ctx, clip as TextClip, time, w, h);
      } else if (clip.type === "subtitle") {
        drawSubtitleClip(ctx, clip as SubtitleClip, w, h);
      }
    }
  }

  // Кинематографичные затемнения проекта.
  const fadeIn = project.openingFadeIn ?? 0;
  if (fadeIn > 0 && time < fadeIn) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${(1 - time / fadeIn).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const fadeOut = project.endingFadeOut ?? 0;
  if (fadeOut > 0 && time > project.duration - fadeOut) {
    const p = clamp((project.duration - time) / fadeOut, 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${(1 - p).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (options.guides) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = Math.max(1, w / 960);
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);
    ctx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 3) * i, 0);
      ctx.lineTo((w / 3) * i, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (h / 3) * i);
      ctx.lineTo(w, (h / 3) * i);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export interface SyncOptions {
  isPlaying: boolean;
  rate: number;
  masterVolume: number;
}

/**
 * Синхронизирует HTML-video элементы с плейхедом: скорость, звук, seek.
 * Возвращает набор идентификаторов активных клипов.
 */
export function syncVideoElements(project: Project, time: number, options: SyncOptions): Set<string> {
  const active = new Set<string>();
  const soloTracks = project.tracks.filter((t) => t.solo);
  const assetsById = new Map(project.assets.map((a) => [a.id, a] as const));

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.type !== "video") continue;
      const media = clip as VideoClip;
      const asset = assetsById.get(media.assetId);
      if (!asset) continue;
      const el = mediaPool.videoFor(clip.id, asset);
      if (!el) continue;
      if (!isActiveAt(clip, time)) continue;
      active.add(clip.id);

      const localTime = localTimeOf(clip, time);
      const speed = media.speed || 1;
      const target = clamp(media.inPoint + localTime * speed, 0, Math.max(0.01, asset.duration || el.duration || 1e6));
      const audible =
        !media.muted && !track.hidden && !track.muted && (soloTracks.length === 0 || track.solo === true) && options.masterVolume > 0;

      el.playbackRate = clamp(speed * options.rate, 0.0625, 16);
      el.muted = !audible;
      el.volume = clamp((media.volume ? evalParam(media.volume, localTime) : 1) * options.masterVolume, 0, 1);

      if (options.isPlaying) {
        if (Math.abs(el.currentTime - target) > 0.32 && el.seekable.length > 0) {
          try {
            el.currentTime = target;
          } catch {
            /* ignore */
          }
        }
        if (el.paused) void el.play().catch(() => undefined);
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.02) {
          try {
            el.currentTime = target;
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  mediaPool.pauseVideosExcept(active);
  return active;
}

/** Собирает список треков, влияющих на кадр (для инспектора/отладки). */
export function activeClipsAt(project: Project, time: number): { track: Track; clip: Clip }[] {
  const result: { track: Track; clip: Clip }[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (isActiveAt(clip, time)) result.push({ track, clip });
    }
  }
  return result;
}
