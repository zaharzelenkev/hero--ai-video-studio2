"use client";

import { useSelectedClip } from "./common";
import ParamControl from "../ParamControl";
import { useProjectStore } from "@/store/projectStore";
import { LUT_PRESETS } from "@/lib/presets";
import type { ColorGrade, LutPreset, VideoClip } from "@/lib/types";

const LUT_LABELS: Record<LutPreset, string> = {
  none: "Без LUT",
  cinematic: "Cinematic",
  warm: "Тёплый",
  cool: "Холодный",
  bw: "Ч/Б",
  vintage: "Винтаж",
  vivid: "Сочный",
  moody: "Мрачный",
  dramatic: "Драматичный",
  neutral: "Нейтральный",
  "teal-orange": "Тил-Оранж",
  "film-noir": "Нуар"
};

export default function ColorPanel() {
  const updateClip = useProjectStore((s) => s.updateClip);
  const { clip, videoClip, localTime } = useSelectedClip();

  if (!videoClip || !clip) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Цвет</h3>
        <p className="text-xs text-slate-500">
          Выберите видео- или фото-клип на таймлайне, чтобы открыть цветокоррекцию: баланс белого, кривые (яркость,
          контраст, насыщенность, гамма), LUT-пресеты.
        </p>
      </div>
    );
  }

  const setColor = (fn: (c: ColorGrade) => ColorGrade) =>
    updateClip(clip.id, (c) => ({ ...c, color: fn((c as VideoClip).color) } as VideoClip));

  const c = videoClip.color;

  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Цветокоррекция — {videoClip.name}</h3>

      <div className="mb-4">
        <p className="mb-2 text-[11px] font-medium text-slate-300">LUT-пресеты</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(LUT_PRESETS) as LutPreset[]).map((lut) => (
            <button
              key={lut}
              onClick={() => setColor((cg) => ({ ...cg, lut }))}
              className={`rounded-md border px-2 py-1.5 text-[11px] ${
                c.lut === lut ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"
              }`}
            >
              {LUT_LABELS[lut]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-[11px] font-medium text-slate-300">Кривые / базовая коррекция</p>
        <ParamControl label="Яркость" param={c.brightness} localTime={localTime} clipDuration={videoClip.duration} min={-1} max={1} onChange={(p) => setColor((cg) => ({ ...cg, brightness: p }))} />
        <ParamControl label="Контраст" param={c.contrast} localTime={localTime} clipDuration={videoClip.duration} min={-1} max={1} onChange={(p) => setColor((cg) => ({ ...cg, contrast: p }))} />
        <ParamControl label="Насыщенность" param={c.saturation} localTime={localTime} clipDuration={videoClip.duration} min={-1} max={2} onChange={(p) => setColor((cg) => ({ ...cg, saturation: p }))} />
        <ParamControl label="Гамма" param={c.gamma} localTime={localTime} clipDuration={videoClip.duration} min={0.2} max={3} onChange={(p) => setColor((cg) => ({ ...cg, gamma: p }))} />
        <ParamControl label="Оттенок (°)" param={c.hue} localTime={localTime} clipDuration={videoClip.duration} min={-180} max={180} step={1} onChange={(p) => setColor((cg) => ({ ...cg, hue: p }))} />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-[11px] font-medium text-slate-300">Баланс белого</p>
        <ParamControl label="Температура (холод ↔ тепло)" param={c.temperature} localTime={localTime} clipDuration={videoClip.duration} min={-1} max={1} onChange={(p) => setColor((cg) => ({ ...cg, temperature: p }))} />
        <ParamControl label="Оттенок (зелёный ↔ пурпурный)" param={c.tint} localTime={localTime} clipDuration={videoClip.duration} min={-1} max={1} onChange={(p) => setColor((cg) => ({ ...cg, tint: p }))} />
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Все параметры можно анимировать по ключевым кадрам (◆) — например, плавно менять насыщенность в течение
        клипа. Превью в редакторе точно соответствует финальному экспорту.
      </p>
    </div>
  );
}
