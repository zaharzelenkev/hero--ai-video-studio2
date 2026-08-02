"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useProjectStore, findClip } from "@/store/projectStore";
import { defaultColorGrade, param } from "@/lib/types";
import type { AnimParam, Clip, ColorGrade, VideoClip, ColorPresetId } from "@/lib/types";
import { renderFrame } from "@/lib/editor/compositor";
import ParamControl from "../ParamControl";
import { PanelSection, ToggleButton, EmptyHint, SliderField } from "./ui";
import { COLOR_PRESETS, getPreset, applyPresetToParams } from "@/lib/colorPresets";
import { autoGrade, type ColorGradeParams, type AutoGradeResult, type RGBCurvesDef } from "@/lib/colorGrade";

const LUTS: { id: string; label: string }[] = [
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

/* ------------------------------------------------------------------ */
/* Scopes: гистограмма + vectorscope-подобная визуализация             */
/* ------------------------------------------------------------------ */

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
      const luma = new Array<number>(bins).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        const ri = Math.min(bins - 1, (data[i] * bins) >> 8);
        const gi = Math.min(bins - 1, (data[i + 1] * bins) >> 8);
        const bi = Math.min(bins - 1, (data[i + 2] * bins) >> 8);
        r[ri] += 1;
        g[gi] += 1;
        b[bi] += 1;
        const li = Math.min(bins - 1, ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * bins) >> 8);
        luma[li] += 1;
      }
      const maxAll = Math.max(...r, ...g, ...b, ...luma, 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#06060b";
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo((w / 4) * i, 0);
        ctx.lineTo((w / 4) * i, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, (h / 4) * i);
        ctx.lineTo(w, (h / 4) * i);
        ctx.stroke();
      }

      const drawChannel = (values: number[], color: string) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        values.forEach((v, i) => {
          const x = (i / (bins - 1)) * w;
          const y = h - (v / maxAll) * (h - 4);
          ctx.lineTo(x, y);
        });
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };

      // Luma waveform (background)
      ctx.globalAlpha = 0.7;
      drawChannel(luma, "rgba(255,255,255,0.25)");
      // RGB channels overlaid
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55;
      drawChannel(r, "rgba(248,113,113,0.65)");
      drawChannel(g, "rgba(74,222,128,0.65)");
      drawChannel(b, "rgba(96,165,250,0.65)");
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }, 350);
    return () => window.clearInterval(id);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={130}
      className="w-full rounded-lg border border-white/10 bg-black"
      aria-label="Гистограмма и осциллограмма кадра"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Mini Curves Editor                                                  */
/* ------------------------------------------------------------------ */

const CURVE_CHANNELS = [
  { key: "master" as const, label: "RGB", color: "#fff" },
  { key: "red" as const, label: "R", color: "#f44" },
  { key: "green" as const, label: "G", color: "#4f4" },
  { key: "blue" as const, label: "B", color: "#48f" },
];

function MiniCurvesEditor({
  curves,
  onChange,
}: {
  curves: RGBCurvesDef | undefined;
  onChange: (c: RGBCurvesDef) => void;
}) {
  const [activeChannel, setActiveChannel] = useState<"master" | "red" | "green" | "blue">("master");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<number | null>(null);

  const current = curves?.[activeChannel] ?? [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const y = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if (dragging.current !== null) {
        const idx = dragging.current;
        if (idx === 0 || idx === current.length - 1) return; // keep endpoints fixed
        const newPoints = current.map((p, i) => (i === idx ? { x: clamp(p.x, 0, 1), y: clamp(y, 0, 1) } : p));
        // Ensure monotonic x
        if (idx > 0 && newPoints[idx].x <= newPoints[idx - 1].x) newPoints[idx] = { ...newPoints[idx], x: newPoints[idx - 1].x + 0.01 };
        if (idx < newPoints.length - 1 && newPoints[idx].x >= newPoints[idx + 1].x) newPoints[idx] = { ...newPoints[idx], x: newPoints[idx + 1].x - 0.01 };
        onChange({
          master: curves?.master ?? [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          red: curves?.red ?? [],
          green: curves?.green ?? [],
          blue: curves?.blue ?? [],
          [activeChannel]: newPoints,
        });
      }
    },
    [activeChannel, current, curves, onChange],
  );

  const pointsPath = current
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 200} ${(1 - p.y) * 200}`)
    .join(" ");

  const smoothPath = (() => {
    if (current.length < 2) return "";
    let d = `M ${current[0].x * 200} ${(1 - current[0].y) * 200}`;
    for (let i = 0; i < current.length - 1; i++) {
      const cp1x = current[i].x * 200 + (current[i + 1].x - current[i].x) * 200 * 0.4;
      const cp2x = current[i].x * 200 + (current[i + 1].x - current[i].x) * 200 * 0.6;
      d += ` C ${cp1x} ${(1 - current[i].y) * 200} ${cp2x} ${(1 - current[i + 1].y) * 200} ${current[i + 1].x * 200} ${(1 - current[i + 1].y) * 200}`;
    }
    return d;
  })();

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {CURVE_CHANNELS.map((ch) => (
          <button
            key={ch.key}
            onClick={() => setActiveChannel(ch.key)}
            className={`rounded px-2 py-0.5 text-[10px] font-bold transition ${
              activeChannel === ch.key
                ? "bg-white/15 text-white"
                : "bg-white/[0.03] text-slate-400 hover:bg-white/8"
            }`}
          >
            {ch.label}
          </button>
        ))}
        <button
          onClick={() => {
            onChange({
              master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
              red: [],
              green: [],
              blue: [],
            });
          }}
          className="ml-auto text-[9px] text-slate-500 hover:text-slate-200"
        >
          сброс
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        className="w-full aspect-square rounded-lg border border-white/10 bg-black/60 cursor-crosshair touch-none"
        onPointerDown={(e) => {
          const svg = svgRef.current;
          if (!svg) return;
          const rect = svg.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const y = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          // Find closest point
          let minDist = Infinity;
          let minIdx: number | null = null;
          current.forEach((p, i) => {
            const dx = p.x - x;
            const dy = p.y - y;
            const dist = dx * dx + dy * dy;
            if (dist < 0.02 && dist < minDist) {
              minDist = dist;
              minIdx = i;
            }
          });
          if (minIdx !== null && minIdx !== 0 && minIdx !== current.length - 1) {
            dragging.current = minIdx;
          }
          (e.target as SVGElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={handlePointer}
        onPointerUp={() => {
          dragging.current = null;
        }}
      >
        {/* Grid */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <line key={`gv${pct}`} x1={pct * 2} y1={0} x2={pct * 2} y2={200} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
        ))}
        {[0, 25, 50, 75, 100].map((pct) => (
          <line key={`gh${pct}`} x1={0} y1={pct * 2} x2={200} y2={pct * 2} stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
        ))}
        {/* Diagonal reference */}
        <line x1={0} y1={200} x2={200} y2={0} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} strokeDasharray="4 4" />
        {/* Curve fill */}
        <path d={`${pointsPath} L 200 200 L 0 200 Z`} fill={`${activeChannel === "red" ? "#f44" : activeChannel === "green" ? "#4f4" : activeChannel === "blue" ? "#48f" : "#fff"}20`} />
        {/* Smooth curve */}
        <path d={smoothPath} fill="none" stroke={CURVE_CHANNELS.find((c) => c.key === activeChannel)?.color ?? "#fff"} strokeWidth={1.5} opacity={0.8} />
        {/* Control points */}
        {current.map((p, i) => (
          <circle
            key={i}
            cx={p.x * 200}
            cy={(1 - p.y) * 200}
            r={i === 0 || i === current.length - 1 ? 3 : 5}
            fill={i === 0 || i === current.length - 1 ? "#555" : "#fff"}
            stroke={CURVE_CHANNELS.find((c) => c.key === activeChannel)?.color ?? "#fff"}
            strokeWidth={1.5}
            className="cursor-pointer"
          />
        ))}
      </svg>
      <div className="flex gap-1 flex-wrap">
        <ToggleButton
          onClick={() => {
            const newPt = { x: 0.5, y: 0.5 };
            let inserted = [...current];
            for (let i = 0; i < inserted.length - 1; i++) {
              if (inserted[i].x < 0.5 && inserted[i + 1].x > 0.5) {
                inserted.splice(i + 1, 0, newPt);
                break;
              }
            }
            if (inserted.length === current.length) {
              inserted.splice(inserted.length - 1, 0, newPt);
            }
            onChange({
              master: curves?.master ?? [{ x: 0, y: 0 }, { x: 1, y: 1 }],
              red: curves?.red ?? [],
              green: curves?.green ?? [],
              blue: curves?.blue ?? [],
              [activeChannel]: inserted,
            });
          }}
        >
          + Точка
        </ToggleButton>
        {current.length > 2 && (
          <ToggleButton
            onClick={() => {
              if (current.length <= 2) return;
              const pts = current.filter((_, i) => i !== Math.floor(current.length / 2));
              onChange({
                master: curves?.master ?? [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                red: curves?.red ?? [],
                green: curves?.green ?? [],
                blue: curves?.blue ?? [],
                [activeChannel]: pts,
              });
            }}
          >
            − Точка
          </ToggleButton>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Color Wheel Preview                                                  */
/* ------------------------------------------------------------------ */

function ColorWheelPreview({ r, g, b }: { r: number; g: number; b: number }) {
  const swatch = `rgb(${Math.round(128 + r * 127)}, ${Math.round(128 + g * 127)}, ${Math.round(128 + b * 127)})`;
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border border-white/20"
      style={{ background: swatch }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Main Panel                                                          */
/* ------------------------------------------------------------------ */

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

type TabId = "basic" | "curves" | "wheels" | "presets" | "lut" | "ai";

export default function ColorPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const [presetIntensity, setPresetIntensity] = useState(1);
  const [aiResult, setAiResult] = useState<AutoGradeResult | null>(null);


  const found = findClip(project, selectedClipId);
  const clip = found?.clip;
  const isVisual = clip && (clip.type === "video" || clip.type === "image");

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const media = clip as VideoClip | undefined;
  const color: ColorGrade = media?.color ?? defaultColorGrade();
  const localTime = clip ? Math.max(0, playhead - clip.start) : 0;

  const setColor = (fn: (c: ColorGrade) => ColorGrade) => {
    if (!clip) return;
    updateClip(clip.id, (c) => ({
      ...(c as VideoClip),
      color: fn((c as VideoClip).color ?? defaultColorGrade()),
    }) as Clip);
  };
  const setParam = (key: keyof ColorGrade, value: AnimParam) =>
    setColor((c) => ({ ...c, [key]: value }));

  const applyToAll = () => {
    if (!media) return;
    const grade = JSON.parse(JSON.stringify(media.color ?? defaultColorGrade())) as ColorGrade;
    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.type === "video" || c.type === "image"
            ? ({ ...(c as VideoClip), color: JSON.parse(JSON.stringify(grade)) } as Clip)
            : c,
        ),
      })),
    }));
    setMessage("Грейд применён ко всем видеоклипам");
    setTimeout(() => setMessage(""), 2200);
  };

  /** Авто-баланс (быстрый, по гистограмме) */
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
    const contrastVal = Math.max(-0.5, Math.min(0.9, 255 / span - 1));
    const midpoint = (low + high) / 2;
    const brightnessVal = Math.max(-0.5, Math.min(0.5, (128 - midpoint) / 255));
    setColor((c) => ({
      ...c,
      contrast: param(Number(contrastVal.toFixed(3))),
      brightness: param(Number(brightnessVal.toFixed(3))),
    }));
    setMessage("Авто-баланс применён по текущему кадру");
    setTimeout(() => setMessage(""), 2200);
  };

  /** AI Auto Grade: полный анализ сцены */
  const runAiAutoGrade = () => {
    if (!clip) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = 256;
    offscreen.height = 144;
    const octx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!octx) return;
    renderFrame(octx, project, playhead);
    const frame = octx.getImageData(0, 0, offscreen.width, offscreen.height);
    const result = autoGrade(frame.data, offscreen.width, offscreen.height);
    setAiResult(result);

    // Apply AI grade to clip
    setColor((c) => ({
      ...c,
      exposure: param(Number(result.params.exposure.toFixed(3))),
      contrast: param(Number(result.params.contrast.toFixed(3))),
      saturation: param(Number(result.params.saturation.toFixed(3))),
      vibrance: param(Number(result.params.vibrance.toFixed(3))),
      highlights: param(Number(result.params.highlights.toFixed(0))),
      shadows: param(Number(result.params.shadows.toFixed(0))),
      whites: param(Number(result.params.whites.toFixed(0))),
      blacks: param(Number(result.params.blacks.toFixed(0))),
      temperature: param(Number(result.params.temperature.toFixed(3))),
      tint: param(Number(result.params.tint.toFixed(3))),
      gamma: param(Number(result.params.gamma.toFixed(3))),
      skinToneProtection: result.params.skinToneProtection ?? 0,
      aiAutoGrade: {
        confidence: result.confidence,
        sceneType: result.sceneType,
        appliedAt: Date.now(),
      },
    }));
    setMessage(
      `AI Auto Grade: ${result.sceneType} (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
    );
    setTimeout(() => setMessage(""), 3500);
  };

  /** Применить пресет */
  const applyPreset = (presetId: ColorPresetId) => {
    const preset = getPreset(presetId);
    if (!preset || !media) return;
    // Конвертируем текущий грейд в ColorGradeParams для микса
    const currentParams: ColorGradeParams = {
      exposure: color.exposure.value,
      contrast: color.contrast.value,
      contrastPivot: 0.5,
      saturation: color.saturation.value,
      vibrance: color.vibrance.value,
      hue: color.hue.value,
      highlights: color.highlights.value,
      shadows: color.shadows.value,
      whites: color.whites.value,
      blacks: color.blacks.value,
      temperature: color.temperature.value,
      tint: color.tint.value,
      gamma: color.gamma.value,
      liftGammaGain: color.colorWheels
        ? {
            lift: color.colorWheels.lift,
            gamma: color.colorWheels.gamma,
            gain: color.colorWheels.gain,
          }
        : undefined,
      curves: color.curves
        ? {
            master: color.curves.master.points,
            red: color.curves.red.points,
            green: color.curves.green.points,
            blue: color.curves.blue.points,
          }
        : undefined,
      skinToneProtection: color.skinToneProtection ?? 0,
    };

    const mixed = applyPresetToParams(currentParams, preset, presetIntensity);
    setColor((c) => ({
      ...c,
      exposure: param(Number(mixed.exposure.toFixed(3))),
      contrast: param(Number(mixed.contrast.toFixed(3))),
      saturation: param(Number(mixed.saturation.toFixed(3))),
      vibrance: param(Number(mixed.vibrance.toFixed(3))),
      highlights: param(Number(mixed.highlights.toFixed(0))),
      shadows: param(Number(mixed.shadows.toFixed(0))),
      whites: param(Number(mixed.whites.toFixed(0))),
      blacks: param(Number(mixed.blacks.toFixed(0))),
      temperature: param(Number(mixed.temperature.toFixed(3))),
      tint: param(Number(mixed.tint.toFixed(3))),
      gamma: param(Number(mixed.gamma.toFixed(3))),
      skinToneProtection: mixed.skinToneProtection ?? 0,
      colorPreset: presetId,
      colorWheels: mixed.liftGammaGain
        ? {
            lift: mixed.liftGammaGain.lift,
            gamma: mixed.liftGammaGain.gamma,
            gain: mixed.liftGammaGain.gain,
          }
        : color.colorWheels,
      curves: mixed.curves
        ? {
            master: { points: mixed.curves.master },
            red: { points: mixed.curves.red },
            green: { points: mixed.curves.green },
            blue: { points: mixed.curves.blue },
          }
        : undefined,
    }));
    setMessage(`Пресет «${preset.name}» применён`);
    setTimeout(() => setMessage(""), 2200);
  };

  /* -------------------------------------------------------------- */
  /* Tabs                                                            */
  /* -------------------------------------------------------------- */

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "basic", label: "Basic", icon: "⚙" },
    { id: "curves", label: "Curves", icon: "📈" },
    { id: "wheels", label: "Wheels", icon: "🎨" },
    { id: "presets", label: "Presets", icon: "✨" },
    { id: "lut", label: "LUT", icon: "🎞" },
    { id: "ai", label: "AI", icon: "🤖" },
  ];

  /* -------------------------------------------------------------- */
  /* ColorWheels helpers                                              */
  /* -------------------------------------------------------------- */

  const wheels = color.colorWheels ?? {
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: 0, g: 0, b: 0 },
  };

  return (
    <div className="space-y-3">
      {/* ---- Scopes ---- */}
      <PanelSection title="Осциллограф" subtitle="RGB + Luma гистограмма">
        <Scopes />
      </PanelSection>

      {!isVisual ? (
        <EmptyHint>Выберите видео- или фото-клип, чтобы применить цветокоррекцию.</EmptyHint>
      ) : (
        <>
          {/* ---- Quick Actions ---- */}
          <div className="flex flex-wrap gap-1.5">
            <ToggleButton tone="accent" onClick={autoBalance}>
              ⚡ Авто-баланс
            </ToggleButton>
            <ToggleButton tone="accent" onClick={runAiAutoGrade}>
              🤖 AI Auto Grade
            </ToggleButton>
            <ToggleButton onClick={applyToAll}>≡ Применить ко всем</ToggleButton>
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
            <ToggleButton onClick={() => setColor(() => defaultColorGrade())}>
              ↺ Сброс
            </ToggleButton>
          </div>
          {message && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
              {message}
            </div>
          )}

          {/* AI result info */}
          {color.aiAutoGrade && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-1.5 text-[10px] text-violet-200">
              🤖 AI определил: <strong>{color.aiAutoGrade.sceneType}</strong> · уверенность {(
                color.aiAutoGrade.confidence * 100
              ).toFixed(0)}%
            </div>
          )}

          {/* ---- Tabs ---- */}
          <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-bold transition ${
                  activeTab === tab.id
                    ? "bg-violet-500/25 text-violet-100"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ====================== BASIC TAB ====================== */}
          {activeTab === "basic" && (
            <>
              <PanelSection title="Экспозиция">
                <ParamControl
                  label="Экспозиция, EV"
                  param={color.exposure}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-3}
                  max={3}
                  step={0.05}
                  onChange={(p) => setParam("exposure", p)}
                />
                <ParamControl
                  label="Контраст"
                  param={color.contrast}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-1}
                  max={1}
                  onChange={(p) => setParam("contrast", p)}
                />
                <ParamControl
                  label="Гамма"
                  param={color.gamma}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={0.2}
                  max={2.5}
                  step={0.01}
                  onChange={(p) => setParam("gamma", p)}
                />
              </PanelSection>

              <PanelSection title="Тоновые диапазоны">
                <ParamControl
                  label="Света (Highlights)"
                  param={color.highlights}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-100}
                  max={100}
                  step={1}
                  onChange={(p) => setParam("highlights", p)}
                />
                <ParamControl
                  label="Тени (Shadows)"
                  param={color.shadows}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-100}
                  max={100}
                  step={1}
                  onChange={(p) => setParam("shadows", p)}
                />
                <ParamControl
                  label="Белые (Whites)"
                  param={color.whites}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-100}
                  max={100}
                  step={1}
                  onChange={(p) => setParam("whites", p)}
                />
                <ParamControl
                  label="Чёрные (Blacks)"
                  param={color.blacks}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-100}
                  max={100}
                  step={1}
                  onChange={(p) => setParam("blacks", p)}
                />
              </PanelSection>

              <PanelSection title="Цвет">
                <ParamControl
                  label="Насыщенность"
                  param={color.saturation}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-1}
                  max={1}
                  onChange={(p) => setParam("saturation", p)}
                />
                <ParamControl
                  label="Vibrance (интеллектуальная)"
                  param={color.vibrance}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-1}
                  max={1}
                  onChange={(p) => setParam("vibrance", p)}
                />
                <ParamControl
                  label="Оттенок, °"
                  param={color.hue}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(p) => setParam("hue", p)}
                />
              </PanelSection>

              <PanelSection title="Баланс белого">
                <ParamControl
                  label="Температура (тёплый ↔ холодный)"
                  param={color.temperature}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-1}
                  max={1}
                  onChange={(p) => setParam("temperature", p)}
                />
                <ParamControl
                  label="Тинт (зелёный ↔ пурпурный)"
                  param={color.tint}
                  localTime={localTime}
                  clipDuration={clip.duration}
                  min={-1}
                  max={1}
                  onChange={(p) => setParam("tint", p)}
                />
              </PanelSection>

              <PanelSection title="Skin Tone Protection">
                <SliderField
                  label="Защита оттенков кожи"
                  value={color.skinToneProtection ?? 0}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) =>
                    setColor((c) => ({ ...c, skinToneProtection: v }))
                  }
                />
                <p className="text-[9px] text-slate-500">
                  Сохраняет естественные оттенки кожи при агрессивной цветокоррекции
                </p>
              </PanelSection>
            </>
          )}

          {/* ====================== CURVES TAB ====================== */}
          {activeTab === "curves" && (
            <PanelSection title="RGB Curves" subtitle="Поканальные и мастер-кривые">
              <MiniCurvesEditor
                curves={
                  color.curves
                    ? {
                        master: color.curves.master.points,
                        red: color.curves.red.points,
                        green: color.curves.green.points,
                        blue: color.curves.blue.points,
                      }
                    : {
                        master: [
                          { x: 0, y: 0 },
                          { x: 1, y: 1 },
                        ],
                        red: [],
                        green: [],
                        blue: [],
                      }
                }
                onChange={(c) =>
                  setColor((col) => ({
                    ...col,
                    curves: {
                      master: { points: c.master },
                      red: { points: c.red },
                      green: { points: c.green },
                      blue: { points: c.blue },
                    },
                  }))
                }
              />
            </PanelSection>
          )}

          {/* ====================== WHEELS TAB ====================== */}
          {activeTab === "wheels" && (
            <PanelSection
              title="Color Wheels"
              subtitle="Lift / Gamma / Gain — профессиональные цветовые колёса"
            >
              {(["lift", "gamma", "gain"] as const).map((wheel) => {
                const current = wheels[wheel];
                return (
                  <div
                    key={wheel}
                    className="mb-2 rounded-lg border border-white/5 bg-black/30 p-2"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <ColorWheelPreview
                        r={current.r}
                        g={current.g}
                        b={current.b}
                      />
                      <span className="text-[10px] font-bold uppercase text-slate-300">
                        {wheel === "lift"
                          ? "Lift · тени"
                          : wheel === "gamma"
                            ? "Gamma · средние"
                            : "Gain · света"}
                      </span>
                      <button
                        className="ml-auto text-[9px] text-slate-500 hover:text-slate-200"
                        onClick={() =>
                          setColor((c) => ({
                            ...c,
                            colorWheels: {
                              ...wheels,
                              [wheel]: { r: 0, g: 0, b: 0 },
                            },
                          }))
                        }
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
                        onChange={(v) =>
                          setColor((c) => ({
                            ...c,
                            colorWheels: {
                              ...wheels,
                              [wheel]: { ...current, [channel]: v },
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                );
              })}

              <ToggleButton
                onClick={() =>
                  setColor((c) => ({
                    ...c,
                    colorWheels: {
                      lift: { r: 0, g: 0, b: 0 },
                      gamma: { r: 0, g: 0, b: 0 },
                      gain: { r: 0, g: 0, b: 0 },
                    },
                  }))
                }
              >
                ↺ Сбросить все колёса
              </ToggleButton>
            </PanelSection>
          )}

          {/* ====================== PRESETS TAB ====================== */}
          {activeTab === "presets" && (
            <PanelSection title="Color Presets" subtitle="Профессиональные пресеты цветокоррекции">
              {/* Intensity slider */}
              <div className="mb-3">
                <SliderField
                  label="Интенсивность пресета"
                  value={presetIntensity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={setPresetIntensity}
                />
              </div>

              {/* Presets by category */}
              {(["cinematic", "platform", "style", "mood"] as const).map((cat) => {
                const catPresets = COLOR_PRESETS.filter((p) => p.category === cat);
                if (catPresets.length === 0) return null;
                const catLabel =
                  cat === "cinematic"
                    ? "🎬 Кинематографичные"
                    : cat === "platform"
                      ? "📱 Платформы"
                      : cat === "style"
                        ? "🎨 Стили"
                        : "🌡 Настроения";
                return (
                  <div key={cat} className="mb-3">
                    <div className="mb-1.5 text-[10px] font-bold uppercase text-slate-400">
                      {catLabel}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {catPresets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => applyPreset(preset.id as ColorPresetId)}
                          className={`rounded-lg border px-2 py-2 text-left transition ${
                            color.colorPreset === preset.id
                              ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10 hover:border-white/20"
                          }`}
                        >
                          <div className="text-[11px] font-bold">{preset.name}</div>
                          <div className="text-[9px] text-slate-500 leading-tight mt-0.5">
                            {preset.description.slice(0, 60)}…
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </PanelSection>
          )}

          {/* ====================== LUT TAB ====================== */}
          {activeTab === "lut" && (
            <PanelSection title="LUT / Look" subtitle="Стилизация через 3D LUT (33³)">
              <div className="grid grid-cols-3 gap-1">
                {LUTS.map((lut) => (
                  <button
                    key={lut.id}
                    onClick={() =>
                      setColor((c) => ({ ...c, lut: lut.id as ColorGrade["lut"] }))
                    }
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
              <p className="mt-2 text-[9px] text-slate-500">
                LUT применяется после основных параметров цветокоррекции. Используйте
                LUT как финальный творческий штрих.
              </p>
            </PanelSection>
          )}

          {/* ====================== AI TAB ====================== */}
          {activeTab === "ai" && (
            <PanelSection title="AI Auto Grade" subtitle="Искусственный интеллект анализирует сцену и подбирает цвет">
              <div className="space-y-3">
                <ToggleButton tone="accent" onClick={runAiAutoGrade}>
                  🤖 Запустить AI Auto Grade
                </ToggleButton>

                {aiResult && (
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-3 space-y-2">
                    <div className="text-[12px] font-bold text-violet-200">
                      Результат анализа
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-400">Тип сцены:</span>{" "}
                        <span className="text-white">{aiResult.sceneType}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Уверенность:</span>{" "}
                        <span className="text-white">
                          {(aiResult.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Медиана:</span>{" "}
                        <span className="text-white">
                          {(aiResult.histogram.median * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Дин. диапазон:</span>{" "}
                        <span className="text-white">
                          {aiResult.histogram.min.toFixed(2)} –{" "}
                          {aiResult.histogram.max.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Тени:</span>{" "}
                        <span className="text-white">
                          {(aiResult.histogram.shadows * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Света:</span>{" "}
                        <span className="text-white">
                          {(aiResult.histogram.highlights * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Применены: экспозиция, контраст, тени/света, баланс белого,
                      насыщенность, gamma
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-slate-500 leading-relaxed">
                  AI Auto Grade анализирует гистограмму кадра, определяет тип сцены
                  (портрет, пейзаж, низкая освещённость, яркая сцена) и автоматически
                  подбирает оптимальные параметры экспозиции, контраста, тоновых
                  диапазонов, баланса белого и насыщенности. Skin Tone Protection
                  включается автоматически для портретных сцен.
                </div>
              </div>
            </PanelSection>
          )}

          {/* ---- Skin Tone Protection indicator ---- */}
          {(color.skinToneProtection ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
              🛡 Skin Tone Protection активна:{" "}
              {((color.skinToneProtection ?? 0) * 100).toFixed(0)}%
            </div>
          )}
        </>
      )}
    </div>
  );
}
