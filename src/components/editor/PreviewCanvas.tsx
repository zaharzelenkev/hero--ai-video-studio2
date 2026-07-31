"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/store/projectStore";
import { evalParam } from "@/lib/keyframes";
import { EFFECT_PRESETS, LUT_PRESETS } from "@/lib/presets";
import type { TextClip, VideoClip } from "@/lib/types";
import { getAssetUrl, getImageElement, getVideoElement } from "./mediaCache";

function findActiveClip<T extends { start: number; duration: number }>(clips: T[], time: number): T | undefined {
  return clips.find((c) => time >= c.start && time < c.start + c.duration);
}

function buildFilterCss(clip: VideoClip, localTime: number): string {
  const c = clip.color;
  const brightness = evalParam(c.brightness, localTime);
  const contrast = evalParam(c.contrast, localTime);
  const saturation = evalParam(c.saturation, localTime);
  const hue = evalParam(c.hue, localTime);
  const parts = [
    `brightness(${1 + brightness})`,
    `contrast(${1 + contrast})`,
    `saturate(${Math.max(0, 1 + saturation)})`,
    `hue-rotate(${hue}deg)`,
  ];
  const lut = LUT_PRESETS[c.lut];
  if (lut?.css) parts.push(lut.css);
  for (const effectId of clip.effects || []) {
    const preset = EFFECT_PRESETS.find((e) => e.id === effectId);
    if (preset?.css) parts.push(preset.css);
  }
  return parts.join(" ");
}

export default function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const project = useProjectStore((s) => s.project);
    const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const setPlaying = useProjectStore((s) => s.setPlaying);

  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Playback ticker.
  useEffect(() => {
    if (!isPlaying) {
      lastTsRef.current = null;
      return;
    }
    let raf: number;
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const p = projectRef.current;
      if (p) {
        const next = useProjectStore.getState().playhead + dt;
        if (next >= p.duration) {
          setPlayhead(0);
          setPlaying(false);
        } else {
          setPlayhead(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, setPlayhead, setPlaying]);

  // Draw loop.
  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const canvas = canvasRef.current;
      const p = projectRef.current;
      if (!canvas || !p) return;
      canvas.width = p.resolution.width;
      canvas.height = p.resolution.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const time = useProjectStore.getState().playhead;
      const videoTracks = p.tracks.filter((t) => t.type === "video" && !t.hidden);
      const textTracks = p.tracks.filter((t) => t.type === "text" && !t.hidden);

      for (let ti = 0; ti < videoTracks.length; ti++) {
        const track = videoTracks[ti];
        const clip = findActiveClip(track.clips as VideoClip[], time);
        if (!clip) continue;
        const asset = p.assets.find((a) => a.id === clip.assetId);
        if (!asset) continue;
        try {
          const url = await getAssetUrl(asset);
          if (cancelled) return;
          const localTime = time - clip.start;
          let el: HTMLVideoElement | HTMLImageElement;
          if (clip.type === "video") {
            const v = getVideoElement(asset.id, url);
            const targetTime = clip.inPoint + localTime * (clip.speed || 1);
            if (Math.abs(v.currentTime - targetTime) > 0.08) {
              try {
                v.currentTime = targetTime;
              } catch {
                /* ignore seek race */
              }
            }
            if (isPlaying && v.paused) v.play().catch(() => {});
            if (!isPlaying && !v.paused) v.pause();
            el = v;
          } else {
            el = getImageElement(asset.id, url);
          }

          const opacity = evalParam(clip.opacity, localTime);
          const scale = evalParam(clip.scale, localTime);
          const rotation = evalParam(clip.rotation, localTime);
          const x = evalParam(clip.x, localTime);
          const y = evalParam(clip.y, localTime);

          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
          ctx.filter = buildFilterCss(clip, localTime);

          const isBase = ti === 0;
          const naturalW = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth || canvas.width;
          const naturalH = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight || canvas.height;

          if (isBase) {
            // Cover-fit the canvas, then apply extra scale/rotation/offset on top.
            const coverScale = Math.max(canvas.width / naturalW, canvas.height / naturalH) * scale;
            const w = naturalW * coverScale;
            const h = naturalH * coverScale;

            // x represents the focus point (-1 to 1).
            // A shift of x=-1 means we want to show the LEFT side of the image,
            // which means we must shift the image to the RIGHT.
            let shiftX = -x * Math.max(0, w - canvas.width) / 2;
            let shiftY = -y * Math.max(0, h - canvas.height) / 2;

            // FACE-REFRAME (focusX/focusY): автомонтаж кадрирует cover-кроп по
            // детекту лиц, и ffmpeg-экспорт применяет тот же сдвиг через crop.
            // Раньше превью это игнорировало — пользователь видел один кадр,
            // а на экспорте получал ДРУГОЙ (WYSIWYG-разрыв). Семантика 1:1 с
            // filterGraph: окно canvas-размера центрируется на точке фокуса и
            // клампится внутрь изображения.
            if (clip.focusX) {
              const fx = clip.focusX ? evalParam(clip.focusX, localTime) : 0.5;
              const maxShiftX = Math.max(0, (w - canvas.width) / 2);
              const want = ((fx ?? 0.5) - 0.5) * w;
              shiftX = -Math.max(-maxShiftX, Math.min(maxShiftX, want));
            }
            if (clip.focusY) {
              const fy = clip.focusY ? evalParam(clip.focusY, localTime) : 0.5;
              const maxShiftY = Math.max(0, (h - canvas.height) / 2);
              const want = ((fy ?? 0.5) - 0.5) * h;
              shiftY = -Math.max(-maxShiftY, Math.min(maxShiftY, want));
            }

            const cx = canvas.width / 2 + shiftX;
            const cy = canvas.height / 2 + shiftY;

            if (clip.blurPad) {
              // BLUR-PAD (1:1 с экспортом): размытая подложка из того же кадра,
              // поверх — чёткий кадр целиком по центру.
              ctx.save();
              ctx.filter = `blur(16px) brightness(0.86) saturate(0.9) ${ctx.filter}`;
              ctx.translate(cx, cy);
              ctx.rotate((rotation * Math.PI) / 180);
              // Подложка чуть крупнее канваса — размытие не даёт тёмную кайму по краям
              ctx.drawImage(el, -w / 2 * 1.04, -h / 2 * 1.04, w * 1.04, h * 1.04);
              ctx.restore();
              // Передний план: contain-fit
              const fitScale = Math.min(canvas.width / naturalW, canvas.height / naturalH) * scale;
              const fw = naturalW * fitScale;
              const fh = naturalH * fitScale;
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((rotation * Math.PI) / 180);
              ctx.drawImage(el, -fw / 2, -fh / 2, fw, fh);
            } else {
            ctx.translate(cx, cy);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(el, -w / 2, -h / 2, w, h);
            }
          } else {
            const w = naturalW * scale;
            const h = naturalH * scale;
            const cx = canvas.width / 2 + x * canvas.width * 0.5;
            const cy = canvas.height / 2 + y * canvas.height * 0.5;
            ctx.translate(cx, cy);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(el, -w / 2, -h / 2, w, h);
          }
          ctx.restore();
        } catch {
          // asset not ready yet - skip frame
        }
      }

      // Text overlays
      for (const track of textTracks) {
        const clip = findActiveClip(track.clips as TextClip[], time);
        if (!clip) continue;
        const localTime = time - clip.start;
        const opacity = evalParam(clip.opacity, localTime);
        const scale = evalParam(clip.scale, localTime);
        const x = evalParam(clip.x, localTime);
        const y = evalParam(clip.y, localTime);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        const fontSize = clip.fontSize * scale * (canvas.width / 1280);
        ctx.font = `bold ${fontSize}px ${clip.fontFamily}, sans-serif`;
        ctx.textAlign = clip.align;
        ctx.textBaseline = "middle";
        const px = canvas.width / 2 + x * canvas.width * 0.5;
        const py = canvas.height / 2 + y * canvas.height * 0.5;
        if (clip.backgroundColor && clip.backgroundColor !== "transparent") {
          const metrics = ctx.measureText(clip.text);
          const padding = 14;
          const boxW = metrics.width + padding * 2;
          const boxH = fontSize + padding;
          let boxX = px - padding;
          if (clip.align === "center") boxX = px - boxW / 2;
          if (clip.align === "right") boxX = px - boxW + padding;
          ctx.fillStyle = clip.backgroundColor;
          ctx.fillRect(boxX, py - boxH / 2, boxW, boxH);
        }
        if (clip.strokeWidth) {
          ctx.lineWidth = clip.strokeWidth * (canvas.width / 1280);
          ctx.strokeStyle = clip.strokeColor || "#000000";
          ctx.strokeText(clip.text, px, py);
        }
        ctx.fillStyle = clip.color;
        ctx.fillText(clip.text, px, py);
        ctx.restore();
      }
    }

    draw();
    if (isPlaying) {
      const loop = () => {
        draw();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
      }, [project, isPlaying]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-black/60 p-4">
      <canvas ref={canvasRef} className="max-h-full max-w-full rounded-lg border border-white/10 shadow-2xl" />
    </div>
  );
}
