"use client";

import { useProjectStore } from "@/store/projectStore";
import type { VideoClip, LutPreset } from "@/lib/types";
import { ParamControl } from "../ParamControl";

const LUT_PRESETS: { id: LutPreset; label: string }[] = [
  { id: "none", label: "Без LUT" },
  { id: "cinematic", label: "Кинематографичный" },
  { id: "warm", label: "Тёплый" },
  { id: "cool", label: "Холодный" },
  { id: "bw", label: "Чёрно-белый" },
  { id: "vintage", label: "Винтаж" },
  { id: "vivid", label: "Яркий" },
  { id: "moody", label: "Настроенческий" },
  { id: "dramatic", label: "Драматичный" },
  { id: "neutral", label: "Нейтральный" },
  { id: "teal-orange", label: "Teal & Orange" },
  { id: "film-noir", label: "Нуар" },
];

export default function ColorPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Цветокоррекция
        </h3>
        <p className="text-xs text-slate-500">Выберите видео- или фото-клип на таймлайне</p>
      </div>
    );
  }

  const clip = project.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId) as VideoClip | undefined;

  if (!clip || (clip.type !== "video" && clip.type !== "image")) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Цветокоррекция
        </h3>
        <p className="text-xs text-slate-500">Цветокоррекция доступна только для видео и фото</p>
      </div>
    );
  }

  const updateColor = (fn: (c: VideoClip["color"]) => VideoClip["color"]) => {
    updateClip(selectedClipId, (c) => {
      if (c.type !== "video" && c.type !== "image") return c;
      return { ...c, color: fn((c as VideoClip).color) };
    });
  };

  const color = clip.color;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Профессиональная цветокоррекция
      </h3>

      {/* LUT Presets */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">LUT Preset</label>
        <select
          value={color.lut}
          onChange={(e) => updateColor((c) => ({ ...c, lut: e.target.value as LutPreset }))}
          className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
        >
          {LUT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      {/* Basic Adjustments */}
      <div className="mb-6">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Основные настройки</h4>
        
        <ParamControl
          label="Яркость"
          value={color.brightness}
          min={-1}
          max={1}
          onChange={(v) => updateColor((c) => ({ ...c, brightness: v }))}
        />
        
        <ParamControl
          label="Контраст"
          value={color.contrast}
          min={-1}
          max={1}
          onChange={(v) => updateColor((c) => ({ ...c, contrast: v }))}
        />
        
        <ParamControl
          label="Насыщенность"
          value={color.saturation}
          min={-1}
          max={1}
          onChange={(v) => updateColor((c) => ({ ...c, saturation: v }))}
        />
        
        <ParamControl
          label="Vibrance"
          value={color.vibrance}
          min={-1}
          max={1}
          onChange={(v) => updateColor((c) => ({ ...c, vibrance: v }))}
        />
        
        <ParamControl
          label="Оттенок"
          value={color.hue}
          min={-180}
          max={180}
          onChange={(v) => updateColor((c) => ({ ...c, hue: v }))}
          unit="°"
        />
      </div>

      {/* Exposure & Tone */}
      <div className="mb-6">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Экспозиция и тон</h4>
        
        <ParamControl
          label="Exposure"
          value={color.exposure}
          min={-3}
          max={3}
          onChange={(v) => updateColor((c) => ({ ...c, exposure: v }))}
          unit=" EV"
        />
        
        <ParamControl
          label="Highlights"
          value={color.highlights}
          min={-100}
          max={100}
          onChange={(v) => updateColor((c) => ({ ...c, highlights: v }))}
        />
        
        <ParamControl
          label="Shadows"
          value={color.shadows}
          min={-100}
          max={100}
          onChange={(v) => updateColor((c) => ({ ...c, shadows: v }))}
        />
        
        <ParamControl
          label="Whites"
          value={color.whites}
          min={-100}
          max={100}
          onChange={(v) => updateColor((c) => ({ ...c, whites: v }))}
        />
        
        <ParamControl
          label="Blacks"
          value={color.blacks}
          min={-100}
          max={100}
          onChange={(v) => updateColor((c) => ({ ...c, blacks: v }))}
        />
        
        <ParamControl
          label="Gamma"
          value={color.gamma}
          min={0.1}
          max={3}
          onChange={(v) => updateColor((c) => ({ ...c, gamma: v }))}
        />
      </div>

      {/* Temperature & Tint */}
      <div className="mb-6">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Баланс белого</h4>
        
        <ParamControl
          label="Temperature"
          value={color.temperature}
          min={-1}
          max={1}
          onChange={(v) => updateColor((c) => ({ ...c, temperature: v }))}
        />
        
        <ParamControl
          label="Tint"
          value={color.tint}
          min={-1}
          max={1}
          onChange={(v) => updateColor((c) => ({ ...c, tint: v }))}
        />
      </div>

      {/* Advanced Tools (placeholder for future) */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <h4 className="mb-2 text-[11px] font-semibold text-slate-300">Продвинутые инструменты</h4>
        <div className="space-y-2 text-[10px] text-slate-500">
          <div className="flex items-center justify-between">
            <span>RGB Curves</span>
            <button className="rounded bg-white/5 px-2 py-1 text-slate-400 hover:bg-white/10">
              Скоро
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>HSL Controls</span>
            <button className="rounded bg-white/5 px-2 py-1 text-slate-400 hover:bg-white/10">
              Скоро
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>Color Wheels</span>
            <button className="rounded bg-white/5 px-2 py-1 text-slate-400 hover:bg-white/10">
              Скоро
            </button>
          </div>
        </div>
      </div>

      {/* Reset button */}
      <button
        onClick={() =>
          updateClip(selectedClipId, (c) => {
            if (c.type !== "video" && c.type !== "image") return c;
            const { defaultColorGrade } = require("@/lib/types");
            return { ...c, color: defaultColorGrade() };
          })
        }
        className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
      >
        Сбросить все настройки
      </button>
    </div>
  );
}
