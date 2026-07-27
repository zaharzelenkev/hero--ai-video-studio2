"use client";

import { useSelectedClip } from "./common";
import ParamControl from "../ParamControl";
import { useProjectStore } from "@/store/projectStore";
import { EFFECT_PRESETS, TRANSITIONS } from "@/lib/presets";
import type { Mask, TransitionType, VideoClip } from "@/lib/types";

export default function EffectsPanel() {
  const updateClip = useProjectStore((s) => s.updateClip);
  const { clip, videoClip, localTime } = useSelectedClip();

  if (!videoClip || !clip) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Эффекты и композитинг</h3>
        <p className="text-xs text-slate-500">
          Выберите видео/фото-клип, чтобы настроить хромакей (Chroma Key), маски и фильтры-эффекты, а также применить
          переход из библиотеки переходов.
        </p>
      </div>
    );
  }

  const setMask = (fn: (m: Mask) => Mask) => updateClip(clip.id, (c) => ({ ...c, mask: fn((c as VideoClip).mask) } as VideoClip));

  const toggleEffect = (id: string) =>
    updateClip(clip.id, (c) => {
      const vc = c as VideoClip;
      const has = vc.effects.includes(id);
      return { ...vc, effects: has ? vc.effects.filter((e) => e !== id) : [...vc.effects, id] };
    });

  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Эффекты и композитинг — {videoClip.name}</h3>

      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium text-slate-300">🟢 Chroma Key (кеинг)</p>
          <input
            type="checkbox"
            checked={videoClip.chroma.enabled}
            onChange={(e) => updateClip(clip.id, (c) => ({ ...c, chroma: { ...(c as VideoClip).chroma, enabled: e.target.checked } } as VideoClip))}
          />
        </div>
        {videoClip.chroma.enabled && (
          <div className="space-y-2">
            <label className="flex items-center justify-between text-[11px] text-slate-400">
              Цвет ключа
              <input
                type="color"
                value={videoClip.chroma.color}
                onChange={(e) => updateClip(clip.id, (c) => ({ ...c, chroma: { ...(c as VideoClip).chroma, color: e.target.value } } as VideoClip))}
                className="h-6 w-10 rounded border border-white/10 bg-transparent"
              />
            </label>
            <label className="block text-[11px] text-slate-400">
              Похожесть: {videoClip.chroma.similarity.toFixed(2)}
              <input
                type="range"
                min={0.01}
                max={1}
                step={0.01}
                value={videoClip.chroma.similarity}
                onChange={(e) => updateClip(clip.id, (c) => ({ ...c, chroma: { ...(c as VideoClip).chroma, similarity: parseFloat(e.target.value) } } as VideoClip))}
                className="mt-1 h-1 w-full accent-violet-500"
              />
            </label>
            <label className="block text-[11px] text-slate-400">
              Растушёвка краёв: {videoClip.chroma.blend.toFixed(2)}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={videoClip.chroma.blend}
                onChange={(e) => updateClip(clip.id, (c) => ({ ...c, chroma: { ...(c as VideoClip).chroma, blend: parseFloat(e.target.value) } } as VideoClip))}
                className="mt-1 h-1 w-full accent-violet-500"
              />
            </label>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium text-slate-300">🎭 Маска (с трекингом позиции по keyframes)</p>
          <input type="checkbox" checked={videoClip.mask.enabled} onChange={(e) => setMask((m) => ({ ...m, enabled: e.target.checked }))} />
        </div>
        {videoClip.mask.enabled && (
          <div className="space-y-2">
            <select
              value={videoClip.mask.shape}
              onChange={(e) => setMask((m) => ({ ...m, shape: e.target.value as Mask["shape"] }))}
              className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
            >
              <option value="rect">Прямоугольник</option>
              <option value="ellipse">Эллипс</option>
            </select>
            <ParamControl label="X" param={videoClip.mask.x} localTime={localTime} clipDuration={videoClip.duration} min={0} max={1} onChange={(p) => setMask((m) => ({ ...m, x: p }))} />
            <ParamControl label="Y" param={videoClip.mask.y} localTime={localTime} clipDuration={videoClip.duration} min={0} max={1} onChange={(p) => setMask((m) => ({ ...m, y: p }))} />
            <ParamControl label="Ширина" param={videoClip.mask.width} localTime={localTime} clipDuration={videoClip.duration} min={0.05} max={1} onChange={(p) => setMask((m) => ({ ...m, width: p }))} />
            <ParamControl label="Высота" param={videoClip.mask.height} localTime={localTime} clipDuration={videoClip.duration} min={0.05} max={1} onChange={(p) => setMask((m) => ({ ...m, height: p }))} />
            <label className="block text-[11px] text-slate-400">
              Растушёвка: {videoClip.mask.feather}px
              <input type="range" min={0} max={60} value={videoClip.mask.feather} onChange={(e) => setMask((m) => ({ ...m, feather: parseInt(e.target.value) }))} className="mt-1 h-1 w-full accent-violet-500" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              <input type="checkbox" checked={videoClip.mask.inverted} onChange={(e) => setMask((m) => ({ ...m, inverted: e.target.checked }))} />
              Инвертировать маску
            </label>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-[11px] font-medium text-slate-300">✨ Библиотека эффектов</p>
        <div className="grid grid-cols-2 gap-1.5">
          {EFFECT_PRESETS.map((fx) => (
            <button
              key={fx.id}
              onClick={() => toggleEffect(fx.id)}
              className={`rounded-md border px-2 py-1.5 text-[11px] ${
                videoClip.effects.includes(fx.id) ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"
              }`}
            >
              {fx.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-2 text-[11px] font-medium text-slate-300">🔀 Библиотека переходов (применится на вход клипа)</p>
        <div className="grid grid-cols-2 gap-1.5">
          {TRANSITIONS.map((t) => (
            <button
              key={t.type}
              onClick={() => updateClip(clip.id, (c) => ({ ...c, transitionIn: { type: t.type as TransitionType, duration: (c as VideoClip).transitionIn.duration || 0.6 } } as VideoClip))}
              className={`rounded-md border px-2 py-1.5 text-[11px] ${
                videoClip.transitionIn.type === t.type ? "border-violet-400 bg-violet-500/20 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
