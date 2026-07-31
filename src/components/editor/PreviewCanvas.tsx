"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import type { Clip, VideoClip, Track } from "@/lib/types";

function getAssetUrl(_assetId: string) {
  // In a real app, lookup from mediaCache / assets DB; here return placeholder
  return `https://placehold.co/640x360/1e1b2e/violet.png?text=Clip`;
}

export default function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const resolution = project?.resolution || { width: 1920, height: 1080 };

  const [imgCache, setImgCache] = useState<Record<string, HTMLImageElement>>({});

  // Load asset thumbnails
  useEffect(() => {
    if (!project) return;
    const assets = project.assets || [];
    const newCache: Record<string, HTMLImageElement> = { ...imgCache };
    assets.forEach((a) => {
      if (!newCache[a.id]) {
        const img = new Image();
        img.src = a.thumbnail || getAssetUrl(a.id);
        img.crossOrigin = "anonymous";
        img.onload = () => setImgCache((prev) => ({ ...prev, [a.id]: img }));
      }
    });
  }, [project]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = resolution.width || 1280;
    const h = resolution.height || 720;
    canvas.width = w;
    canvas.height = h;

    // Black background
    ctx.fillStyle = "#06060a";
    ctx.fillRect(0, 0, w, h);

    // Find clips active at playhead
    const activeClips: { clip: Clip; track: Track }[] = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (playhead >= clip.start && playhead < clip.start + clip.duration) {
          activeClips.push({ clip, track });
        }
      }
    }

    // Draw in track order (bottom tracks first for overlay logic)
    activeClips.forEach(({ clip, track: _track }) => {
      const video = clip as VideoClip;
      if (video.type === "video" || video.type === "image") {
        const img = imgCache[video.assetId];
        if (img) {
          // Apply basic transforms
          ctx.save();
          const cx = w / 2;
          const cy = h / 2;
          const scale = video.scale?.value ?? 1;
          const rot = video.rotation?.value ?? 0;
          const xOff = (video.x?.value ?? 0) * w;
          const yOff = (video.y?.value ?? 0) * h;
          const opacity = video.opacity?.value ?? 1;

          ctx.translate(cx + xOff, cy + yOff);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.scale(scale, scale);
          ctx.globalAlpha = opacity;

          // Crop
          const cropL = video.cropLeft?.value ?? 0;
          const cropR = video.cropRight?.value ?? 0;
          const cropT = video.cropTop?.value ?? 0;
          const cropB = video.cropBottom?.value ?? 0;

          // Draw with cover or contain logic
          const ar = w / h;
          const imgAr = img.width / img.height;
          let drawW = w, drawH = h;
          if (video.fitMode === "contain") {
            if (imgAr > ar) { drawW = w; drawH = w / imgAr; } else { drawH = h; drawW = h * imgAr; }
          } else {
            // cover
            if (imgAr > ar) { drawH = h; drawW = h * imgAr; } else { drawW = w; drawH = w / imgAr; }
          }

          // Blur / sharpen
          if (video.motionBlur?.enabled) {
            // simulated blur via low-res draw
            ctx.filter = `blur(${video.motionBlur.samples}px)`;
          }

          // Color grade approximation using canvas filter
          const color = video.color || { lut: "none", brightness: { value: 0 }, contrast: { value: 0 } };
          const bright = (color.brightness?.value ?? 0) * 100;
          const contrast = (color.contrast?.value ?? 0) * 100;
          const sat = (color.saturation?.value ?? 0) * 100;
          const hue = color.hue?.value ?? 0;
          ctx.filter = `brightness(${100 + bright}%) contrast(${100 + contrast}%) saturate(${100 + sat}%) hue-rotate(${hue}deg)`;

          // Draw image
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.filter = "none";
          ctx.restore();
          // If crop active, draw crop rectangle overlay
          if ((cropL + cropR + cropT + cropB) > 0.01) {
            ctx.save();
            ctx.strokeStyle = "rgba(255,200,50,0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(-drawW / 2 + cropL * drawW, -drawH / 2 + cropT * drawH, drawW * (1 - cropL - cropR), drawH * (1 - cropT - cropB));
            ctx.restore();
          }
        } else {
          // Fallback gradient
          ctx.save();
          ctx.fillStyle = `linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)`;
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          ctx.font = "bold 24px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(video.name || "Clip", 0, 8);
          ctx.restore();
        }
      } else if (clip.type === "text") {
        // Draw text clip
        const txt = clip as any;
        ctx.save();
        const cx = w / 2 + (txt.x?.value ?? 0) * w;
        const cy = h / 2 + (txt.y?.value ?? 0) * h;
        const scale = txt.scale?.value ?? 1;
        const rot = txt.rotation?.value ?? 0;
        const opacity = txt.opacity?.value ?? 1;
        ctx.translate(cx, cy);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.scale(scale, scale);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = txt.color || "#ffffff";
        ctx.font = `${txt.fontWeight || 700} ${txt.fontSize || 48}px "${txt.fontFamily || "Inter"}", sans-serif`;
        ctx.textAlign = txt.align || "center";
        ctx.textBaseline = "middle";
        // Animation: fade in based on clip time
        const localPlay = (playhead - txt.start) / (txt.duration || 1);
        let alpha = 1;
        if (txt.animationIn === "fade" && localPlay < 0.2) alpha = localPlay / 0.2;
        else if (txt.animationIn === "slide-up" && localPlay < 0.2) { ctx.translate(0, 40 * (1 - localPlay / 0.2)); }
        else if (txt.animationIn === "scale-in" && localPlay < 0.2) { ctx.scale(localPlay / 0.2, localPlay / 0.2); }
        ctx.globalAlpha = opacity * alpha;
        ctx.fillText(txt.text || "Текст", 0, 0);
        // Stroke if set
        if (txt.strokeColor && txt.strokeWidth) {
          ctx.strokeStyle = txt.strokeColor;
          ctx.lineWidth = txt.strokeWidth;
          ctx.strokeText(txt.text || "Текст", 0, 0);
        }
        ctx.restore();
      }
    });

    // Draw selected clip info overlay
    if (selectedClipId) {
      const sel = activeClips.find(c => c.clip.id === selectedClipId);
      if (sel) {
        const v = sel.clip as VideoClip;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(10, 10, 220, 70);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(v.name || "Клип", 20, 30);
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "#ddd";
        ctx.fillText(`Старт: ${v.start.toFixed(2)}с`, 20, 46);
        ctx.fillText(`Длительность: ${v.duration.toFixed(2)}с`, 20, 60);
        if (v.color?.lut && v.color.lut !== "none") ctx.fillText(`LUT: ${v.color.lut}`, 20, 73);
        ctx.restore();
      }
    }
  }, [canvasRef, project, playhead, imgCache, selectedClipId, resolution]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gradient-to-br from-[#08060c] to-[#120925] overflow-hidden shadow-inner rounded-xl m-1 border border-white/5 flex items-center justify-center">
      <canvas ref={canvasRef} className="shadow-2xl rounded-xl border border-white/10 max-w-full max-h-full object-contain" style={{ width: "100%", height: "100%", maxHeight: "70vh" }} aria-label="Предпросмотр проекта" />
      {/* Playback overlay */}
      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur rounded-lg px-2 py-1 text-[10px] font-mono text-amber-300 border border-white/10" aria-live="polite" aria-atomic="true">
        {project?.resolution ? `${resolution.width}×${resolution.height}` : "HD"} @ {project?.fps || 30}fps
      </div>
    </div>
  );
}
