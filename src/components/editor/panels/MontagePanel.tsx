"use client";

import { useProjectStore } from "@/store/projectStore";
import { useSelectedClip } from "./common";
import ParamControl from "../ParamControl";
import { TRANSITIONS } from "@/lib/presets";
import type { TransitionType, VideoClip } from "@/lib/types";

export default function MontagePanel() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const updateClip = useProjectStore((s) => s.updateClip);
  const { clip, videoClip, localTime } = useSelectedClip();

  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Монтаж</h3>

      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-1 block text-[11px] text-slate-400">Название проекта</label>
        <input
          value={project?.title || ""}
          onChange={(e) => updateProject((p) => ({ ...p, title: e.target.value }))}
          className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-100"
        />
        <p className="mt-2 text-[11px] text-slate-500">
          Длительность: {project ? project.duration.toFixed(1) : 0}с · Клипов:{" "}
          {project?.tracks.reduce((n, t) => n + t.clips.length, 0)}
        </p>
      </div>

      {!clip && (
        <p className="text-xs text-slate-500">
          Выберите клип на таймлайне снизу, чтобы изменить его позицию, скорость и переход. Перетаскивайте клипы мышью,
          тяните за края чтобы обрезать, используйте кнопки «Разрезать/Дублировать/Удалить» на панели таймлайна.
        </p>
      )}

      {clip && (
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-[11px] font-medium text-slate-300">{clip.name || clip.type}</p>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <label className="flex flex-col gap-1">
                Начало (с)
                <input
                  type="number"
                  step={0.1}
                  value={clip.start.toFixed(2)}
                  onChange={(e) => updateClip(clip.id, (c) => ({ ...c, start: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                Длительность (с)
                <input
                  type="number"
                  step={0.1}
                  value={clip.duration.toFixed(2)}
                  onChange={(e) => updateClip(clip.id, (c) => ({ ...c, duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) }))}
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-slate-100"
                />
              </label>
            </div>
          </div>

          {videoClip && (
            <>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-2 text-[11px] font-medium text-slate-300">Скорость и переход</p>
                <label className="mb-3 block text-[11px] text-slate-400">
                  Скорость: {videoClip.speed.toFixed(2)}×
                  <input
                    type="range"
                    min={0.25}
                    max={3}
                    step={0.05}
                    value={videoClip.speed}
                    onChange={(e) => updateClip(clip.id, (c) => ({ ...c, speed: parseFloat(e.target.value) } as VideoClip))}
                    className="mt-1 h-1 w-full accent-violet-500"
                  />
                </label>
                <label className="mb-1 block text-[11px] text-slate-400">Переход при входе в клип</label>
                <select
                  value={videoClip.transitionIn.type}
                  onChange={(e) =>
                    updateClip(clip.id, (c) => ({ ...c, transitionIn: { ...(c as VideoClip).transitionIn, type: e.target.value as TransitionType } } as VideoClip))
                  }
                  className="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
                >
                  {TRANSITIONS.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>
                {videoClip.transitionIn.type !== "cut" && (
                  <label className="block text-[11px] text-slate-400">
                    Длительность перехода: {videoClip.transitionIn.duration.toFixed(2)}с
                    <input
                      type="range"
                      min={0.1}
                      max={2}
                      step={0.05}
                      value={videoClip.transitionIn.duration}
                      onChange={(e) =>
                        updateClip(clip.id, (c) => ({
                          ...c,
                          transitionIn: { ...(c as VideoClip).transitionIn, duration: parseFloat(e.target.value) },
                        } as VideoClip))
                      }
                      className="mt-1 h-1 w-full accent-violet-500"
                    />
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-2 text-[11px] font-medium text-slate-300">Позиция и трансформация (keyframes ◆)</p>
                <ParamControl
                  label="Прозрачность"
                  param={videoClip.opacity}
                  localTime={localTime}
                  clipDuration={videoClip.duration}
                  min={0}
                  max={1}
                  onChange={(p) => updateClip(clip.id, (c) => ({ ...c, opacity: p } as VideoClip))}
                />
                <ParamControl
                  label="Масштаб"
                  param={videoClip.scale}
                  localTime={localTime}
                  clipDuration={videoClip.duration}
                  min={0.2}
                  max={3}
                  onChange={(p) => updateClip(clip.id, (c) => ({ ...c, scale: p } as VideoClip))}
                />
                <ParamControl
                  label="Позиция X"
                  param={videoClip.x}
                  localTime={localTime}
                  clipDuration={videoClip.duration}
                  min={-1}
                  max={1}
                  onChange={(p) => updateClip(clip.id, (c) => ({ ...c, x: p } as VideoClip))}
                />
                <ParamControl
                  label="Позиция Y"
                  param={videoClip.y}
                  localTime={localTime}
                  clipDuration={videoClip.duration}
                  min={-1}
                  max={1}
                  onChange={(p) => updateClip(clip.id, (c) => ({ ...c, y: p } as VideoClip))}
                />
                <ParamControl
                  label="Поворот (°)"
                  param={videoClip.rotation}
                  localTime={localTime}
                  clipDuration={videoClip.duration}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(p) => updateClip(clip.id, (c) => ({ ...c, rotation: p } as VideoClip))}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
