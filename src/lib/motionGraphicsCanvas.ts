/**
 * MONTIQ Motion Graphics — canvas-рендер превью и PNG-панели для экспорта.
 * Использует чистую математику из motionGraphics.ts.
 */

import type { TextClip } from "./types";
import { evalParam } from "./keyframes";
import {
  clamp,
  clamp01,
  easeOutBack,
  easeOutCubic,
  easeOutElastic,
  layoutMgText,
  mgActiveWordIndex,
  mgDisplayText,
  mgGroupMotion,
  mgPx,
  mgProgressValue,
  mgWordDur,
  mgWordProgress,
  mgWordStagger,
  wrapMgText,
  type MgOverlayResult,
  type MgPanelSpec,
} from "./motionGraphics";
import { mediaPool } from "./editor/resourcePool";

type Ctx = CanvasRenderingContext2D;

function rgba(hex: string, alpha: number): string {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp01(alpha).toFixed(3)})`;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, rad);
  } else {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}

/** Рисует панель (та же геометрия, что в PNG-оверлее экспорта). */
export function paintMgPanel(ctx: Ctx, spec: MgPanelSpec & { glow?: boolean }, w: number, h: number) {
  ctx.save();
  if (spec.glow) {
    // Полноэкранная подложка с мягким акцентным свечением.
    ctx.fillStyle = rgba(spec.bg, spec.alpha);
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.34, 10, w / 2, h * 0.34, Math.max(w, h) * 0.62);
    const accent = spec.borderColor || "#8b5cf6";
    g.addColorStop(0, rgba(accent, 0.28));
    g.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }
  if (spec.shadowEnabled && spec.shadowBlur && spec.shadowBlur > 0) {
    ctx.shadowColor = rgba(spec.shadowColor || "#000000", 0.6);
    ctx.shadowBlur = spec.shadowBlur;
    ctx.shadowOffsetY = Math.max(2, spec.shadowBlur * 0.18);
  }
  ctx.fillStyle = rgba(spec.bg, spec.alpha);
  rr(ctx, spec.x, spec.y, spec.w, spec.h, spec.r);
  ctx.fill();
  if (spec.borderColor && spec.borderWidth && spec.borderWidth > 0) {
    ctx.strokeStyle = rgba(spec.borderColor, 1);
    ctx.lineWidth = spec.borderWidth;
    rr(ctx, spec.x + spec.borderWidth / 2, spec.y + spec.borderWidth / 2, spec.w - spec.borderWidth, spec.h - spec.borderWidth, Math.max(0, spec.r - spec.borderWidth / 2));
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* превью                                                              */
/* ------------------------------------------------------------------ */

export interface MgDrawOptions {
  /** Картинка логотипа (из mediaPool), если задан logoAssetId. */
  logoImage?: HTMLImageElement | null;
}

function mgFont(family: string, weight: number, px: number, italic: boolean): string {
  return `${italic ? "italic " : ""}${weight} ${px.toFixed(1)}px "${family}", "Inter", system-ui, sans-serif`;
}

/**
 * Полный рендер моушн-графики в canvas-превью.
 * Все координаты внутри рисуются относительно начала координат группы
 * (центр кадра + clip.x/y), как и в FFmpeg-экспорте.
 */
export function drawMotionGraphic(ctx: Ctx, clip: TextClip, time: number, w: number, h: number, options: MgDrawOptions = {}) {
  const cfg = clip.motionGraphic;
  if (!cfg) return;
  const duration = Math.max(0.001, clip.duration);
  const localTime = clamp(time - clip.start, 0, duration);

  const opacity = clamp01(evalParam(clip.opacity, localTime));
  const scale = Math.max(0.001, evalParam(clip.scale, localTime));
  const rotation = evalParam(clip.rotation ?? { value: 0, keyframes: [] }, localTime);
  const x = w / 2 + evalParam(clip.x, localTime) * w;
  const y = h / 2 + evalParam(clip.y, localTime) * h;
  const g = mgGroupMotion(cfg, duration, localTime);

  ctx.save();
  ctx.globalAlpha = clamp01(opacity * g.alpha);
  ctx.translate(x + g.dx * w, y + g.dy * h);
  if (rotation + g.rotate) ctx.rotate(((rotation + g.rotate) * Math.PI) / 180);
  ctx.scale(scale * g.scale, scale * g.scale);
  if (g.blur > 0.5) {
    ctx.filter = `blur(${mgPx(g.blur, h).toFixed(2)}px)`;
  }

  const s = h / 1080;
  const px = (p1080: number) => p1080 * s;
  const mainPx = px(clip.fontSize);
  const text = mgDisplayText(clip);
  const family = clip.fontFamily || "Montserrat";
  const weight = cfg.fontWeight ?? 800;

  const setFont = (fpx: number, fam = family, wgt = weight) => {
    ctx.font = mgFont(fam, wgt, fpx, cfg.italic);
    const withSpacing = ctx as Ctx & { letterSpacing?: string };
    withSpacing.letterSpacing = cfg.letterSpacing ? `${mgPx(cfg.letterSpacing, h)}px` : "0px";
  };

  const measure = (t: string, fpx: number, fam: string, wgt: number): number => {
    setFont(fpx, fam, wgt);
    return ctx.measureText(t).width;
  };

  /** Рисует строку по центру/левому краю с эффектами. */
  const drawLine = (o: { raw: string; fpx: number; cx?: number; left?: number; midY: number; color: string; alpha?: number }) => {
    const content = o.raw;
    if (!content.trim()) return;
    setFont(o.fpx);
    const alpha = o.alpha ?? 1;
    ctx.save();
    ctx.globalAlpha = clamp01(ctx.globalAlpha * alpha);
    const xPos = o.left !== undefined ? o.left : (o.cx ?? 0) - ctx.measureText(content).width / 2;
    ctx.textBaseline = "middle"; // в экспорте baseline = midY + text_h/2 (то же самое)
    const strokeW = cfg.outlineEnabled ? Math.max(0.5, mgPx(cfg.outlineWidth, h)) : 0;
    if (cfg.shadowEnabled) {
      ctx.shadowColor = rgba(cfg.shadowColor, 0.55);
      ctx.shadowBlur = mgPx(cfg.shadowBlur, h) * 0.5;
      ctx.shadowOffsetY = mgPx(3, h);
    }
    if (strokeW > 0) {
      ctx.lineJoin = "round";
      ctx.strokeStyle = rgba(cfg.outlineColor, 1);
      ctx.lineWidth = strokeW;
      ctx.strokeText(content, xPos, o.midY);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(content, xPos, o.midY);
    ctx.restore();
  };

  const hasPanel = cfg.backgroundColor && cfg.backgroundColor !== "transparent" && cfg.panelOpacity > 0.02;
  const panelSpec = (x: number, y: number, pw: number, ph: number, r: number, alpha = cfg.panelOpacity, borderColor?: string | null, borderWidth?: number): MgPanelSpec => ({
    x, y, w: pw, h: ph, r,
    bg: cfg.backgroundColor, alpha,
    borderColor: borderColor ?? null,
    borderWidth: borderWidth ?? 0,
    shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: mgPx(cfg.shadowBlur, h),
  });

  /* ---------------- TITLE ---------------- */
  if (cfg.kind === "title") {
    const kPx = px(Math.round(clip.fontSize * 0.34));
    const subPx = px(Math.round(clip.fontSize * 0.4));
    const maxW = w * 0.72;
    const kicker = cfg.kicker ? cfg.kicker.toUpperCase() : "";
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: 0, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const subLines = cfg.subtext ? wrapMgText(cfg.subtext, maxW, subPx, family, weight, measure) : [];
    const kH = kicker ? kPx * 1.7 : 0;
    const subH = subLines.length * subPx * 1.5;
    const contentH = kH + layout.height + (subLines.length ? subH + px(12) : 0);
    const padX = w * 0.045;
    const padY = px(26);
    const boxW = Math.max(layout.maxW, measure(kicker, kPx, family, weight), ...subLines.map((l) => measure(l, subPx, family, weight))) + padX * 2;
    const boxH = contentH + padY * 2;
    if (hasPanel) {
      paintMgPanel(ctx, panelSpec(-boxW / 2, -boxH / 2, boxW, boxH, px(cfg.radius)), w, h);
    }
    let yCursor = -contentH / 2;
    if (kicker) {
      drawLine({ raw: kicker, fpx: kPx, cx: 0, midY: yCursor + kPx * 0.6, color: cfg.accentColor });
      yCursor += kH - px(8);
    }
    layout.lines.forEach((l) => {
      drawLine({ raw: l.text, fpx: mainPx, cx: 0, midY: yCursor + (l.y - layout.top) + mainPx * 0.6, color: clip.color || "#ffffff" });
    });
    yCursor += layout.height;
    if (subLines.length) {
      yCursor += px(12);
      subLines.forEach((l, i) => {
        drawLine({ raw: l, fpx: subPx, cx: 0, midY: yCursor + i * subPx * 1.5 + subPx * 0.6, color: cfg.secondaryColor });
      });
    }
  }

  /* ---------------- LOWER THIRD ---------------- */
  else if (cfg.kind === "lowerThird") {
    const namePx = px(clip.fontSize);
    const rolePx = px(Math.round(clip.fontSize * 0.62));
    const kicker = cfg.kicker || "ИМЯ";
    const role = cfg.subtext || "";
    const barW = Math.max(5, px(7));
    const padX = w * 0.022;
    const padY = px(16);
    const nameW = measure(kicker, namePx, family, weight);
    const roleW = role ? measure(role, rolePx, family, weight) : 0;
    const boxW = Math.max(nameW, roleW) + padX * 2 + barW + px(12);
    const boxH = padY * 2 + namePx * 1.4 + (role ? rolePx * 1.5 : 0);
    if (hasPanel) {
      paintMgPanel(ctx, panelSpec(0, -boxH / 2, boxW, boxH, px(cfg.radius)), w, h);
    }
    ctx.fillStyle = cfg.accentColor;
    rr(ctx, px(2), -boxH / 2 + px(2), barW, boxH - px(4), px(3));
    ctx.fill();
    const textLeft = barW + padX + px(6);
    drawLine({ raw: kicker, fpx: namePx, left: textLeft, midY: -boxH / 2 + padY + namePx * 0.65, color: clip.color || "#ffffff" });
    if (role) {
      drawLine({ raw: role, fpx: rolePx, left: textLeft, midY: -boxH / 2 + padY + namePx * 1.4 + rolePx * 0.6, color: cfg.secondaryColor });
    }
  }

  /* ---------------- CALLOUT ---------------- */
  else if (cfg.kind === "callout") {
    const maxW = w * 0.5;
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: 0, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const padX = px(26);
    const padY = px(18);
    const boxW = layout.maxW + padX * 2;
    const boxH = layout.height + padY * 2;
    const tailH = px(22);
    const style = cfg.calloutStyle;
    const boxX = -boxW / 2;
    const boxY = -boxH - tailH;
    const tail = (color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, boxY + boxH);
      ctx.lineTo(-px(12), boxY + boxH + tailH);
      ctx.lineTo(px(12), boxY + boxH + tailH);
      ctx.closePath();
      ctx.fill();
    };
    if (style === "bubble" || style === "box" || style === "sticker") {
      const spec: MgPanelSpec = {
        x: boxX, y: boxY, w: boxW, h: boxH,
        r: style === "sticker" ? px(14) : px(cfg.radius),
        bg: style === "box" ? (hasPanel ? cfg.backgroundColor : "#0b0b14") : cfg.accentColor,
        alpha: style === "box" ? cfg.panelOpacity : 0.92,
        borderColor: style === "box" ? cfg.accentColor : null,
        borderWidth: style === "box" ? Math.max(2, px(3)) : 0,
        shadowEnabled: cfg.shadowEnabled, shadowColor: cfg.shadowColor, shadowBlur: mgPx(cfg.shadowBlur, h),
      };
      paintMgPanel(ctx, spec, w, h);
      if (style !== "sticker") tail(style === "box" ? cfg.backgroundColor : cfg.accentColor);
      layout.lines.forEach((l) => {
        drawLine({ raw: l.text, fpx: mainPx, cx: 0, midY: boxY + padY + (l.y - layout.top) + mainPx * 0.6, color: "#ffffff" });
      });
    } else if (style === "highlight") {
      const hlH = layout.height + px(16);
      paintMgPanel(ctx, { ...panelSpec(boxX, boxY, boxW, hlH, px(cfg.radius), 0.85), bg: cfg.accentColor }, w, h);
      layout.lines.forEach((l) => {
        drawLine({ raw: l.text, fpx: mainPx, cx: 0, midY: boxY + px(8) + (l.y - layout.top) + mainPx * 0.6, color: "#ffffff" });
      });
    } else {
      // underline
      const uW = layout.maxW + px(24);
      const uH = Math.max(4, px(5));
      const uY = boxY + layout.height + px(8);
      drawLine({ raw: text, fpx: mainPx, cx: 0, midY: boxY + mainPx * 0.6, color: clip.color || "#ffffff" });
      ctx.fillStyle = cfg.accentColor;
      rr(ctx, -uW / 2, uY, uW, uH, uH / 2);
      ctx.fill();
    }
  }

  /* ---------------- PROGRESS BAR ---------------- */
  else if (cfg.kind === "progressBar") {
    const labelTxt = cfg.showLabel ? text : "";
    const labelPx = px(clip.fontSize || 28);
    const trackW = w * cfg.barWidth;
    const trackH = px(cfg.barThickness);
    const gap = px(16);
    const labelW = labelTxt ? measure(labelTxt, labelPx, family, weight) : 0;
    const pctPx = px(Math.round((clip.fontSize || 28) * 0.9));
    const pctTxt = cfg.showPercent ? `${Math.round(mgProgressValue(cfg, localTime) * 100)}%` : "";
    const pctW = pctTxt ? measure(pctTxt, pctPx, family, weight) : 0;
    const rowW = labelW + gap + trackW + gap + pctW;
    let trackX: number;
    let trackY: number;
    let rowMode = false;
    if (rowW < w * 0.94) {
      rowMode = true;
      const rowLeft = (w - rowW) / 2;
      trackX = rowLeft - w / 2 + labelW + gap;
      trackY = -trackH / 2;
      if (labelTxt) drawLine({ raw: labelTxt, fpx: labelPx, left: rowLeft - w / 2, midY: labelPx * 0.35, color: clip.color || "#ffffff" });
    } else {
      trackX = -trackW / 2;
      trackY = px(14);
      if (labelTxt) drawLine({ raw: labelTxt, fpx: labelPx, cx: 0, midY: -px(16) + labelPx * 0.35, color: clip.color || "#ffffff" });
    }
    const r = cfg.barRounded ? trackH / 2 : 0;
    const progress = mgProgressValue(cfg, localTime);
    const fillW = trackW * progress;
    if (hasPanel) {
      paintMgPanel(ctx, panelSpec(trackX - px(6), trackY - px(6), trackW + px(12), trackH + px(12), r + px(6), cfg.panelOpacity), w, h);
    }
    // Трек
    ctx.fillStyle = rgba("#ffffff", 0.18);
    rr(ctx, trackX, trackY, trackW, trackH, r);
    ctx.fill();
    // Заливка
    ctx.fillStyle = cfg.accentColor;
    rr(ctx, trackX, trackY, Math.max(0, fillW), trackH, r);
    ctx.fill();
    if (pctTxt) {
      const pctX = rowMode ? trackX + trackW + gap : trackX + trackW - pctW;
      drawLine({ raw: pctTxt, fpx: pctPx, cx: pctX, midY: trackY + trackH / 2 + pctPx * 0.1, color: clip.color || "#ffffff" });
    }
  }

  /* ---------------- CAPTIONS / SUBTITLE ---------------- */
  else if (cfg.kind === "animatedCaptions" || cfg.kind === "subtitle") {
    const maxW = w * 0.82;
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: 0, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const count = Math.max(1, layout.words.length);
    const stagger = mgWordStagger(count, duration, cfg.kineticStagger);
    const wordDur = mgWordDur(stagger);
    const boxPadX = px(28);
    const boxPadY = px(18);
    const style = cfg.captionStyle;
    const blockTop = -layout.height / 2;
    const hasBox = style === "box" || (hasPanel && style !== "classic" && style !== "highlight");
    if (hasBox) {
      paintMgPanel(ctx, panelSpec(-layout.maxW / 2 - boxPadX, blockTop - boxPadY, layout.maxW + boxPadX * 2, layout.height + boxPadY * 2, px(cfg.radius)), w, h);
    }
    if (style === "highlight") {
      layout.lines.forEach((l, li) => {
        const lineStart = li * layout.lineHeight;
        const a = clamp01((localTime - lineStart) / 0.3);
        if (a <= 0) return;
        const barH = Math.max(6, px(8));
        ctx.globalAlpha = ctx.globalAlpha * a * 0.85;
        ctx.fillStyle = cfg.accentColor;
        rr(ctx, l.left - px(10), l.y - layout.top + blockTop + mainPx * 0.55 - barH / 2, l.w + px(20), barH, barH / 2);
        ctx.fill();
        ctx.globalAlpha = ctx.globalAlpha / Math.max(0.001, a * 0.85);
      });
    }
    const activeIdx = style === "karaoke" ? mgActiveWordIndex(localTime, stagger) : -1;
    layout.words.forEach((ww) => {
      const wp = mgWordProgress(localTime, ww.index, stagger, wordDur);
      let wa = clamp01(wp * 2);
      let ws = 1;
      if (style === "pop") {
        wa = clamp01(wp * 1.5);
        ws = easeOutBack(wp);
      }
      if (wa <= 0.001) return;
      const cx = ww.cx;
      const midY = blockTop + ww.line * layout.lineHeight + mainPx * 0.6;
      ctx.save();
      ctx.globalAlpha = clamp01(ctx.globalAlpha * wa);
      ctx.translate(cx, midY);
      ctx.scale(ws, ws);
      setFont(mainPx);
      if (cfg.shadowEnabled) {
        ctx.shadowColor = rgba(cfg.shadowColor, 0.55);
        ctx.shadowBlur = mgPx(cfg.shadowBlur, h) * 0.5;
        ctx.shadowOffsetY = mgPx(3, h);
      }
      ctx.fillStyle = style === "karaoke" && ww.index <= activeIdx ? cfg.accentColor : clip.color || "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (cfg.outlineEnabled && cfg.outlineWidth > 0) {
        ctx.lineJoin = "round";
        ctx.strokeStyle = rgba(cfg.outlineColor, 1);
        ctx.lineWidth = mgPx(cfg.outlineWidth, h);
        ctx.strokeText(ww.word, 0, 0);
      }
      ctx.fillText(ww.word, 0, 0);
      ctx.restore();
    });
  }

  /* ---------------- LOGO REVEAL ---------------- */
  else if (cfg.kind === "logoReveal") {
    const logoSize = Math.min(w, h) * 0.18;
    const wordmarkPx = px(clip.fontSize);
    const kickerPx = px(Math.round(clip.fontSize * 0.4));
    const hasImage = !!cfg.logoAssetId && !!options.logoImage;
    const wordmarkW = measure(text, wordmarkPx, family, weight);
    const gap = px(18);
    const totalH = logoSize + gap + wordmarkPx * 1.4 + (cfg.kicker ? kickerPx * 1.6 : 0);
    const top = -totalH / 2;
    if (hasPanel) {
      const boxW = Math.max(logoSize, wordmarkW) + px(60);
      paintMgPanel(ctx, panelSpec(-boxW / 2, top - px(28), boxW, totalH + px(56), px(cfg.radius)), w, h);
    }
    const logoDelay = 0.25;
    const logoDur = Math.max(0.3, cfg.inDuration * 0.7);
    const lp = clamp01((localTime - logoDelay) / logoDur);
    let la = lp;
    let ls = 1;
    let ldx = 0;
    let ldy = 0;
    let lrot = 0;
    switch (cfg.logoStyle) {
      case "zoom":
        ls = 0.2 + 0.8 * easeOutBack(lp);
        la = clamp01(lp * 2);
        break;
      case "fade":
        la = clamp01(lp * 2);
        break;
      case "slide":
        ldx = (1 - easeOutCubic(lp)) * 0.3;
        la = clamp01(lp * 2);
        break;
      case "bounce":
        la = clamp01(lp * 2);
        ldy = Math.abs(Math.sin(localTime * 5)) * 0.04 * (1 - clamp01((localTime - 0.9) / 0.5));
        break;
      case "rotate":
        la = clamp01(lp * 2);
        lrot = (1 - easeOutCubic(lp)) * 90;
        ls = 0.5 + 0.5 * easeOutCubic(lp);
        break;
    }
    const logoY = top + logoSize / 2;
    ctx.save();
    ctx.globalAlpha = clamp01(ctx.globalAlpha * la);
    ctx.translate(ldx * w, ldy * h + logoY);
    if (lrot) ctx.rotate((lrot * Math.PI) / 180);
    ctx.scale(ls, ls);
    if (hasImage && options.logoImage) {
      const img = options.logoImage;
      const iw = img.naturalWidth || logoSize;
      const ih = img.naturalHeight || logoSize;
      const scaleF = Math.max(iw, ih) > 0 ? logoSize / Math.max(iw, ih) : 1;
      const dw = iw * scaleF;
      const dh = ih * scaleF;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      setFont(logoSize * 1.05);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = cfg.accentColor;
      ctx.fillText(cfg.logoText || "M", 0, 0);
    }
    ctx.restore();
    const wmP = clamp01((localTime - (logoDelay + 0.45)) / 0.4);
    drawLine({ raw: text, fpx: wordmarkPx, cx: 0, midY: top + logoSize + gap + wordmarkPx * 0.7, color: clip.color || "#ffffff", alpha: wmP });
    if (cfg.kicker) {
      drawLine({ raw: cfg.kicker.toUpperCase(), fpx: kickerPx, cx: 0, midY: top - px(10) + kickerPx * 0.6, color: cfg.accentColor });
    }
  }

  /* ---------------- INTRO / OUTRO ---------------- */
  else if (cfg.kind === "intro" || cfg.kind === "outro") {
    const isOutro = cfg.kind === "outro";
    if (hasPanel) {
      paintMgPanel(ctx, { x: -w / 2, y: -h / 2, w, h, r: 0, bg: cfg.backgroundColor, alpha: cfg.panelOpacity, glow: true, borderColor: cfg.accentColor }, w, h);
    }
    const kicker = cfg.kicker || (isOutro ? "СПАСИБО ЗА ПРОСМОТР" : "");
    const kickerPx = px(Math.round(clip.fontSize * 0.32));
    const subPx = px(Math.round(clip.fontSize * 0.38));
    const logoSize = Math.min(w, h) * 0.12;
    const logoY = -h * (isOutro ? 0.26 : 0.24);
    if (cfg.logoText) {
      setFont(logoSize * 1.1);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = cfg.accentColor;
      ctx.fillText(cfg.logoText, 0, logoY);
    }
    let yCursor = -h * (isOutro ? 0.12 : 0.14);
    if (kicker) {
      drawLine({ raw: kicker.toUpperCase(), fpx: kickerPx, cx: 0, midY: yCursor, color: cfg.accentColor });
      yCursor += kickerPx * 1.8;
    }
    const maxW = w * 0.8;
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: 0, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    layout.lines.forEach((l) => {
      drawLine({ raw: l.text, fpx: mainPx, cx: 0, midY: yCursor + (l.y - layout.top) + mainPx * 0.6, color: clip.color || "#ffffff" });
    });
    yCursor += layout.height + px(20);
    if (isOutro) {
      const btnW = Math.max(px(220), measure(cfg.ctaLabel || "Подписаться", px(40), family, weight) + px(90));
      const btnH = px(72);
      const btnY = yCursor;
      const pulse = 1 + 0.025 * Math.sin(2 * Math.PI * 1.6 * localTime);
      ctx.save();
      ctx.translate(0, btnY);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = cfg.accentColor;
      rr(ctx, -btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
      ctx.fill();
      ctx.restore();
      drawLine({ raw: cfg.ctaLabel || "Подписаться", fpx: px(40), cx: 0, midY: btnY + btnH / 2, color: "#ffffff" });
      yCursor += btnH + px(24);
    }
    if (cfg.subtext) {
      const subLines = wrapMgText(cfg.subtext, maxW, subPx, family, weight, measure);
      subLines.forEach((l, i) => {
        drawLine({ raw: l, fpx: subPx, cx: 0, midY: yCursor + i * subPx * 1.5 + subPx * 0.6, color: cfg.secondaryColor });
      });
    }
  }

  /* ---------------- CTA ---------------- */
  else if (cfg.kind === "cta") {
    const style = cfg.ctaStyle;
    const btnLabel = cfg.ctaLabel || clip.text || "Подписаться";
    const title = clip.text && clip.text !== btnLabel ? clip.text : "";
    const sub = cfg.ctaSubtext || "";
    const subPx = px(Math.round(clip.fontSize * 0.55));
    const titlePx = px(Math.round(clip.fontSize * 1.15));
    const btnPx = px(clip.fontSize);
    const btnH = px(64);
    const pulse = 1 + 0.025 * Math.sin(2 * Math.PI * 1.6 * localTime);
    if (style === "button") {
      const btnW = Math.max(px(180), measure(btnLabel, btnPx, family, weight) + px(80));
      ctx.save();
      ctx.scale(pulse, pulse);
      ctx.fillStyle = cfg.accentColor;
      rr(ctx, -btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
      ctx.fill();
      ctx.restore();
      drawLine({ raw: `${btnLabel}  →`, fpx: btnPx, cx: 0, midY: 0, color: "#ffffff" });
      if (sub) {
        drawLine({ raw: sub, fpx: subPx, cx: 0, midY: btnH / 2 + subPx * 1.1, color: cfg.secondaryColor });
      }
    } else if (style === "bar") {
      const barW = w * 0.86;
      const barH = px(92);
      paintMgPanel(ctx, panelSpec(-barW / 2, -barH / 2, barW, barH, px(cfg.radius)), w, h);
      const btnW = Math.max(px(150), measure(btnLabel, btnPx, family, weight) + px(60));
      const btnX = barW / 2 - btnW - px(16);
      ctx.save();
      ctx.translate(btnX + btnW / 2, 0);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = cfg.accentColor;
      rr(ctx, -btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
      ctx.fill();
      ctx.restore();
      if (title) {
        drawLine({ raw: title, fpx: titlePx, left: -barW / 2 + px(28), midY: titlePx * 0.1, color: clip.color || "#ffffff" });
      }
      drawLine({ raw: btnLabel, fpx: btnPx, cx: btnX + btnW / 2, midY: 0, color: "#ffffff" });
    } else {
      // card
      const maxW = w * 0.5;
      const titleLayout = title ? layoutMgText({ text: title, px: titlePx, maxW, cx: 0, top: 0, lineHeight: titlePx * cfg.lineHeight, align: "center", family, weight, measure }) : null;
      const subLines = sub ? wrapMgText(sub, maxW, subPx, family, weight, measure) : [];
      const btnW = Math.max(px(180), measure(btnLabel, btnPx, family, weight) + px(80));
      const contentH = (titleLayout?.height ?? 0) + (subLines.length ? subLines.length * subPx * 1.5 + px(10) : 0) + btnH + px(36);
      const boxW = Math.max(maxW, btnW) + px(64);
      const boxH = contentH + px(48);
      paintMgPanel(ctx, panelSpec(-boxW / 2, -boxH / 2, boxW, boxH, px(cfg.radius)), w, h);
      let yCursor = -contentH / 2 + px(12);
      if (titleLayout) {
        titleLayout.lines.forEach((l) => {
          drawLine({ raw: l.text, fpx: titlePx, cx: 0, midY: yCursor + (l.y - titleLayout.top) + titlePx * 0.6, color: clip.color || "#ffffff" });
        });
        yCursor += titleLayout.height + px(10);
      }
      subLines.forEach((l, i) => {
        drawLine({ raw: l, fpx: subPx, cx: 0, midY: yCursor + i * subPx * 1.5 + subPx * 0.6, color: cfg.secondaryColor });
      });
      if (subLines.length) yCursor += subLines.length * subPx * 1.5 + px(16);
      ctx.save();
      ctx.translate(0, yCursor);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = cfg.accentColor;
      rr(ctx, -btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
      ctx.fill();
      ctx.restore();
      drawLine({ raw: btnLabel, fpx: btnPx, cx: 0, midY: yCursor + btnH / 2, color: "#ffffff" });
    }
  }

  /* ---------------- TRACKING TEXT ---------------- */
  else if (cfg.kind === "trackingText") {
    const trackPx = px(clip.fontSize);
    const dir = cfg.trackingDirection;
    const speed = cfg.trackingSpeed;
    if (dir === "up" || dir === "down") {
      const lines = wrapMgText(text, w * 0.95, trackPx, family, weight, measure);
      const lineH = trackPx * cfg.lineHeight;
      const blockH = lines.length * lineH;
      lines.forEach((l, i) => {
        const offset = (localTime * speed * h + i * lineH) % (h + blockH + lineH * 2);
        const midY = (dir === "up" ? h + trackPx - offset : -trackPx + offset) - h / 2;
        drawLine({ raw: l, fpx: trackPx, cx: 0, midY, color: clip.color || "#ffffff" });
      });
    } else {
      const textW = measure(text, trackPx, family, weight);
      const speedPx = speed * w;
      const span = w + 2 * textW;
      const offset = (localTime * speedPx) % span;
      const leftEdge = dir === "left" ? w + textW - offset : -textW + offset;
      drawLine({ raw: text, fpx: trackPx, left: leftEdge - w / 2, midY: trackPx * 0.05, color: clip.color || "#ffffff" });
    }
  }

  /* ---------------- KINETIC ---------------- */
  else if (cfg.kind === "kinetic") {
    const maxW = w * 0.86;
    const layout = layoutMgText({ text, px: mainPx, maxW, cx: 0, top: 0, lineHeight: mainPx * cfg.lineHeight, align: "center", family, weight, measure });
    const count = Math.max(1, layout.words.length);
    const stagger = mgWordStagger(count, duration, cfg.kineticStagger);
    const wordDur = mgWordDur(stagger);
    const style = cfg.kineticStyle;
    const blockTop = -layout.height / 2;
    if (hasPanel) {
      paintMgPanel(ctx, panelSpec(-layout.maxW / 2 - px(32), blockTop - px(24), layout.maxW + px(64), layout.height + px(48), px(cfg.radius)), w, h);
    }
    layout.words.forEach((ww) => {
      const wp = mgWordProgress(localTime, ww.index, stagger, wordDur);
      let wa = clamp01(wp * 2);
      let ws = 1;
      let dx = 0;
      let dy = 0;
      switch (style) {
        case "wordBurst":
          wa = clamp01(wp * 1.5);
          ws = easeOutBack(wp);
          dx = ((ww.index % 3) - 1) * 0.03 * (1 - wp);
          break;
        case "wave":
          wa = clamp01(wp * 2);
          dy = Math.sin(localTime * 7.54 + ww.index * 0.9) * 0.022 * h;
          break;
        case "stomp":
          wa = clamp01(wp * 1.2);
          ws = 1 + (1 - easeOutCubic(wp)) * 4;
          dy = wp > 0.9 ? Math.sin((wp - 0.9) * 45) * 0.01 * h : 0;
          break;
        case "elastic":
          wa = clamp01(wp * 2);
          ws = easeOutElastic(wp);
          break;
        case "glitch": {
          const flicker = (localTime * 17 + ww.index) % 1 < 0.25 ? 0.6 : 1;
          wa = flicker * clamp01(wp * 2);
          dx = (Math.sin(localTime * 60 + ww.index * 7) + 0.5 * Math.sin(localTime * 97 + ww.index * 13)) * 0.012 * (0.4 + 0.6 * wp) * w;
          break;
        }
        case "typewriter":
          wa = clamp01(wp * 3);
          ws = 1 + (1 - clamp01(wp * 2.2)) * 6 * 0.02;
          break;
        case "flip":
          wa = clamp01(wp * 1.5);
          ws = easeOutBack(wp);
          break;
      }
      if (wa <= 0.002) return;
      const cx = ww.cx + dx;
      const midY = blockTop + ww.line * layout.lineHeight + mainPx * 0.6 + dy;
      ctx.save();
      ctx.globalAlpha = clamp01(ctx.globalAlpha * wa);
      ctx.translate(cx, midY);
      if (style === "flip") ctx.scale(1, Math.max(0.01, ws));
      else ctx.scale(ws, ws);
      setFont(mainPx);
      if (cfg.shadowEnabled) {
        ctx.shadowColor = rgba(cfg.shadowColor, 0.55);
        ctx.shadowBlur = mgPx(cfg.shadowBlur, h) * 0.5;
        ctx.shadowOffsetY = mgPx(3, h);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (style === "glitch") {
        ctx.fillStyle = cfg.accentColor;
        ctx.globalAlpha = clamp01(ctx.globalAlpha * 0.55);
        ctx.fillText(ww.word, 3, 0);
        ctx.fillStyle = "#67e8f9";
        ctx.globalAlpha = clamp01(ctx.globalAlpha * 0.45);
        ctx.fillText(ww.word, -3, 0);
        ctx.globalAlpha = ctx.globalAlpha / 0.45;
        ctx.fillStyle = clip.color || "#ffffff";
      }
      ctx.fillText(ww.word, 0, 0);
      ctx.restore();
    });
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* PNG-панели для экспорта                                             */
/* ------------------------------------------------------------------ */

let overlayCounter = 0;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Рендерит панель в PNG (точно как в превью) для FFmpeg-оверлея. */
export function renderMgOverlayPng(clip: TextClip, W: number, H: number, spec: MgPanelSpec): MgOverlayResult | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paintMgPanel(ctx, spec, W, H);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    return null;
  }
  const idx = dataUrl.indexOf(",");
  if (idx < 0) return null;
  overlayCounter += 1;
  return { path: `mgpanel_${clip.id}_${overlayCounter}.png`, png: base64ToBytes(dataUrl.slice(idx + 1)) };
}

/** Загрузка картинки логотипа из медиапула (возвращает null, пока грузится). */
export function logoImageFor(clip: TextClip, assets: { id: string; kind: string }[] | null | undefined): HTMLImageElement | null {
  const cfg = clip.motionGraphic;
  if (!cfg?.logoAssetId) return null;
  const asset = assets?.find((a) => a.id === cfg.logoAssetId);
  if (!asset) return null;
  const full = asset as Parameters<typeof mediaPool.imageFor>[0];
  return mediaPool.imageFor(full);
}
