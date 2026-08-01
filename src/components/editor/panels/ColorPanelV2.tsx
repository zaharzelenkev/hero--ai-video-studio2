"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore, findClip } from "@/store/projectStore";
import { defaultColorGrade, param } from "@/lib/types";
import type { AnimParam, Clip, ColorGrade, LutPreset, VideoClip } from "@/lib/types";
import { renderFrame } from "@/lib/editor/compositor";
import ParamControl from "../ParamControl";
import { PanelSection, ToggleButton, EmptyHint, SliderField } from "./ui";

const LUTS: { id: LutPreset; label: string }[] = [
  { id: "none", label: "Без LUT" },
  { id: "neutral", label: "Neutral" },
  { id: "cinematic", label: "Cinematic" },
  { id: "teal-orange", label: "Teal & Orange" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "vivid", label: "Vivid" },
  { id: "moody", label: "Moody" },
  { id: "dramatic", label: "Dramatic" },
  { id: "luxury", label: "Luxury" },
  { id: "vintage", label: "Vintage" },
  { id: "bw", label: "Ч/Б" },
  { id: "film-noir", label: "Film Noir" },
];

let gradeClipboard: ColorGrade | null = null;

/** Осциллограф: RGB-гистограмма текущего кадра предпросмотра. */
function Scopes() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const offscreen = document.createElement("canvas");
    offscreen.width = 256;
    offscreen.height = 144;
    const octx = offscreen.getContext("2d", { willReadFrequently: true });
    const id = window.setInterval(() => {
      const canvas = canvasRef.current;
      const state = useProjectStore.getState();
      if (!canvas || !octx || !state.project) return;
      try {
        renderFrame(octx, state.project, state.playhead);
      } catch {
        return;
      }
      const { data } = octx.getImageData(0, 0, offscreen.width, offscreen.height);
      const bins = 64;
      const r = new Array<number>(bins).fill(0);
      const g = new Array<number>(bins).fill(0);
      const b = new Array<number>(bins).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        r[Math.min(bins - 1, (data[i] * bins) >> 8)] += 1;
        g[Math.min(bins - 1, (data[i + 1] * bins) >> 8)] += 1;
        b[Math.min(bins - 1, (data[i + 2] * bins) >> 8)] += 1;
      }
      const max = Math.max(...r, ...g, ...b, 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#06060b";
      ctx.fillRect(0, 0, w, h);
      const drawChannel = (values: number[], color: string) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        values.forEach((v, i) => {
          const x = (i / (bins - 1)) * w;
          const y = h - (v / max) * (h - 4);
          ctx.lineTo(x, y);
        });
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      ctx.globalCompositeOperation = "lighter";
      drawChannel(r, "rgba(248,113,113,0.55)");
      drawChannel(g, "rgba(74,222,128,0.55)");
      drawChannel(b, "rgba(96,165,250,0.55)");
      ctx.globalCompositeOperation = "source-over";
    }, 350);
    return () => window.clearInterval(id);
  }, []);

  return <canvas ref={canvasRef} width={320} height={110} className="w-full rounded-lg border border-white/10 bg-black" aria-label="Гистограмма кадра" />;
}

export default function ColorPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [message, setMessage] = useState("");

  const found = findClip(project, selectedClipId);
  const clip = found?.clip;
  const isVisual = clip && (clip.type === "video" || clip.type === "image");

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const media = clip as VideoClip | undefined;
  const color: ColorGrade = media?.color ?? defaultColorGrade();
  const localTime = clip ? Math.max(0, playhead - clip.start) : 0;

  const setColor = (fn: (c: ColorGrade) => ColorGrade) => {
    if (!clip) return;
    updateClip(clip.id, (c) => ({ ...(c as VideoClip), color: fn((c as VideoClip).color ?? defaultColorGrade()) }) as Clip);
  };
  const setParam = (key: keyof ColorGrade, value: AnimParam) => setColor((c) => ({ ...c, [key]: value }));

  const applyToAll = () => {
    if (!media) return;
    const grade = JSON.parse(JSON.stringify(media.color ?? defaultColorGrade())) as ColorGrade;
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.type === "video" || c.type === "image" ? ({ ...(c as VideoClip), color: JSON.parse(JSON.stringify(grade)) } as Clip) : c)),
      })),
    }));
    setMessage("Грейд применён ко всем видеоклипам");
    setTimeout(() => setMessage(""), 2200);
  };

  /** Авто-баланс по гистограмме текущего кадра. */
  const autoBalance = () => {
    if (!clip) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = 192;
    offscreen.height = 108;
    const octx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!octx) return;
    renderFrame(octx, project, playhead);
    const { data } = octx.getImageData(0, 0, offscreen.width, offscreen.height);
    const luma: number[] = [];
    for (let i = 0; i < data.length; i += 16) {
      luma.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    }
    if (luma.length === 0) return;
    luma.sort((a, b) => a - b);
    const low = luma[Math.floor(luma.length * 0.02)];
    const high = luma[Math.floor(luma.length * 0.98)];
    const span = Math.max(1, high - low);
    const contrast = Math.max(-0.5, Math.min(0.9, 255 / span - 1));
    const midpoint = (low + high) / 2;
    const brightness = Math.max(-0.5, Math.min(0.5, (128 - midpoint) / 255));
    setColor((c) => ({ ...c, contrast: param(Number(contrast.toFixed(3))), brightness: param(Number(brightness.toFixed(3))) }));
    setMessage("Авто-баланс применён по текущему кадру");
    setTimeout(() => setMessage(""), 2200);
  };

  return (
    <div className="space-y-3">
      <PanelSection title="Осциллограф" subtitle="RGB-гистограмма кадра">
        <Scopes />
      </PanelSection>

      {!isVisual ? (
        <EmptyHint>Выберите видео- или фото-клип, чтобы применить цветокоррекцию.</EmptyHint>
      ) : (
        <>
          <PanelSection
            title="LUT / стиль"
            right={
              <div className="flex gap-1">
                <ToggleButton
                  onClick={() => {
                    gradeClipboard = JSON.parse(JSON.stringify(color));
                    setMessage("Грейд скопирован");
                    setTimeout(() => setMessage(""), 1800);
                  }}
                >
                  ⧉ Копировать
                </ToggleButton>
                <ToggleButton
                  onClick={() => {
                    if (!gradeClipboard) return;
                    setColor(() => JSON.parse(JSON.stringify(gradeClipboard)) as ColorGrade);
                  }}
                >
                  ⤵ Вставить
                </ToggleButton>
              </div>
            }
          >
            <div className="grid grid-cols-3 gap-1">
              {LUTS.map((lut) => (
                <button
                  key={lut.id}
                  onClick={() => setColor((c) => ({ ...c, lut: lut.id }))}
                  className={`rounded-lg border px-1.5 py-1 text-[10px] font-bold transition ${
                    color.lut === lut.id
                      ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {lut.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ToggleButton tone="accent" onClick={autoBalance}>
                ✨ Авто-баланс
              </ToggleButton>
              <ToggleButton onClick={applyToAll}>≡ Применить ко всем</ToggleButton>
              <ToggleButton onClick={() => setColor(() => defaultColorGrade())}>↺ Сброс</ToggleButton>
            </div>
            {message && <div className="mt-2 text-[10px] text-emerald-400">{message}</div>}
          </PanelSection>

          <PanelSection title="Экспозиция и тон">
            <ParamControl label="Экспозиция, EV" param={color.exposure} localTime={localTime} clipDuration={clip.duration} min={-3} max={3} step={0.05} onChange={(p) => setParam("exposure", p)} />
            <ParamControl label="Яркость" param={color.brightness} localTime={localTime} clipDuration={clip.duration} min={-1} max={1} onChange={(p) => setParam("brightness", p)} />
            <ParamControl label="Контраст" param={color.contrast} localTime={localTime} clipDuration={clip.duration} min={-1} max={1} onChange={(p) => setParam("contrast", p)} />
            <ParamControl label="Света" param={color.highlights} localTime={localTime} clipDuration={clip.duration} min={-100} max={100} step={1} onChange={(p) => setParam("highlights", p)} />
            <ParamControl label="Тени" param={color.shadows} localTime={localTime} clipDuration={clip.duration} min={-100} max={100} step={1} onChange={(p) => setParam("shadows", p)} />
            <ParamControl label="Белые" param={color.whites} localTime={localTime} clipDuration={clip.duration} min={-100} max={100} step={1} onChange={(p) => setParam("whites", p)} />
            <ParamControl label="Чёрные" param={color.blacks} localTime={localTime} clipDuration={clip.duration} min={-100} max={100} step={1} onChange={(p) => setParam("blacks", p)} />
            <ParamControl label="Гамма" param={color.gamma} localTime={localTime} clipDuration={clip.duration} min={0.2} max={2.5} step={0.01} onChange={(p) => setParam("gamma", p)} />
          </PanelSection>

          <PanelSection title="Цвет">
            <ParamControl label="Насыщенность" param={color.saturation} localTime={localTime} clipDuration={clip.duration} min={-1} max={1} onChange={(p) => setParam("saturation", p)} />
            <ParamControl label="Vibrance" param={color.vibrance} localTime={localTime} clipDuration={clip.duration} min={-1} max={1} onChange={(p) => setParam("vibrance", p)} />
            <ParamControl label="Оттенок, °" param={color.hue} localTime={localTime} clipDuration={clip.duration} min={-180} max={180} step={1} onChange={(p) => setParam("hue", p)} />
            <ParamControl label="Температура" param={color.temperature} localTime={localTime} clipDuration={clip.duration} min={-1} max={1} onChange={(p) => setParam("temperature", p)} />
            <ParamControl label="Тинт" param={color.tint} localTime={localTime} clipDuration={clip.duration} min={-1} max={1} onChange={(p) => setParam("tint", p)} />
          </PanelSection>

          <PanelSection title="Color Wheels" subtitle="Lift / Gamma / Gain">
            {(["lift", "gamma", "gain"] as const).map((wheel) => {
              const wheels = color.colorWheels ?? { lift: { r: 0, g: 0, b: 0 }, gamma: { r: 0, g: 0, b: 0 }, gain: { r: 0, g: 0, b: 0 } };
              const current = wheels[wheel];
              const swatch = `rgb(${Math.round(128 + current.r * 127)}, ${Math.round(128 + current.g * 127)}, ${Math.round(128 + current.b * 127)})`;
              return (
                <div key={wheel} className="mb-2 rounded-lg border border-white/5 bg-black/30 p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: swatch }} />
                    <span className="text-[10px] font-bold uppercase text-slate-300">
                      {wheel === "lift" ? "Lift · тени" : wheel === "gamma" ? "Gamma · средние" : "Gain · света"}
                    </span>
                    <button
                      className="ml-auto text-[9px] text-slate-500 hover:text-slate-200"
                      onClick={() => setColor((c) => ({ ...c, colorWheels: { ...wheels, [wheel]: { r: 0, g: 0, b: 0 } } }))}
                    >
                      сброс
                    </button>
                  </div>
                  {(["r", "g", "b"] as const).map((channel) => (
                    <SliderField
                      key={channel}
                      label={channel.toUpperCase()}
                      value={current[channel]}
                      min={-1}
                      max={1}
                      step={0.01}
                      onChange={(v) => setColor((c) => ({ ...c, colorWheels: { ...wheels, [wheel]: { ...current, [channel]: v } } }))}
                    />
                  ))}
                </div>
              );
            })}
          </PanelSection>
        </>
      )}
    </div>
  );
}
