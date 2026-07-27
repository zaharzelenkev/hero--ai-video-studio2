"use client";

import { useProjectStore } from "@/store/projectStore";
import type { VideoClip, AudioClip, TransitionType } from "@/lib/types";
import ParamControl from "../ParamControl";

const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: "cut", label: "Cut (без перехода)" },
  { id: "crossfade", label: "Crossfade" },
  { id: "fadeblack", label: "Fade через чёрный" },
  { id: "fadewhite", label: "Fade через белый" },
  { id: "wipeleft", label: "Wipe Left" },
  { id: "wiperight", label: "Wipe Right" },
  { id: "wipeup", label: "Wipe Up" },
  { id: "wipedown", label: "Wipe Down" },
  { id: "slideup", label: "Slide Up" },
  { id: "slidedown", label: "Slide Down" },
  { id: "slideleft", label: "Slide Left" },
  { id: "slideright", label: "Slide Right" },
  { id: "zoom", label: "Zoom" },
  { id: "zoomin", label: "Zoom In" },
  { id: "zoomout", label: "Zoom Out" },
  { id: "circleopen", label: "Circle Open" },
  { id: "circleclose", label: "Circle Close" },
  { id: "dissolve", label: "Dissolve" },
  { id: "pixelize", label: "Pixelize" },
];

export default function MontagePanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-3xl shadow-inner border border-white/5">
          ✂️
        </div>
        <h3 className="mb-2 text-sm font-bold text-slate-200">Ничего не выбрано</h3>
        <p className="text-xs text-slate-500 max-w-[200px]">Выберите клип на таймлайне внизу, чтобы открыть его параметры.</p>
      </div>
    );
  }

  const clip = project.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId) as (VideoClip | AudioClip) | undefined;

  if (!clip) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Монтаж</h3>
        <p className="text-xs text-slate-500">Клип не найден</p>
      </div>
    );
  }

  const isVideo = clip.type === "video" || clip.type === "image";
  const hasTransitions = isVideo;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Профессиональный монтаж
      </h3>

      {/* Clip Info */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <h4 className="mb-2 text-[11px] font-semibold text-slate-300">Информация о клипе</h4>
        <div className="space-y-1 text-[10px] text-slate-400">
          <div className="flex justify-between">
            <span>Тип:</span>
            <span className="text-slate-300">{clip.type}</span>
          </div>
          <div className="flex justify-between">
            <span>Название:</span>
            <span className="text-slate-300">{clip.name}</span>
          </div>
          <div className="flex justify-between">
            <span>Длительность:</span>
            <span className="text-slate-300">{clip.duration.toFixed(2)}с</span>
          </div>
          <div className="flex justify-between">
            <span>Начало:</span>
            <span className="text-slate-300">{clip.start.toFixed(2)}с</span>
          </div>
        </div>
      </div>

      {/* Скорость и реверс */}
      {(clip.type === "video" || clip.type === "audio") && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Скорость</h4>

          <div className="mb-3">
            <label className="mb-1 block text-[10px] text-slate-400">
              Множитель: {clip.speed}x
            </label>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={clip.speed}
              onChange={(e) =>
                updateClip(selectedClipId, (c) => ({ ...c, speed: parseFloat(e.target.value) }))
              }
              className="mb-1 h-1 w-full accent-violet-500"
            />
            <div className="flex gap-1">
              {[0.25, 0.5, 1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => updateClip(selectedClipId, (c) => ({ ...c, speed }))}
                  className={`flex-1 rounded-md border px-2 py-1 text-[9px] ${
                    clip.speed === speed
                      ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                      : "border-white/10 text-slate-400"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {isVideo && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="reversed"
                checked={(clip as VideoClip).reversed || false}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({ ...c, reversed: e.target.checked }))
                }
                className="h-4 w-4 accent-violet-500"
              />
              <label htmlFor="reversed" className="text-xs text-slate-300">
                Воспроизвести задом наперёд
              </label>
            </div>
          )}
        </div>
      )}

      {/* Трансформация (только видео/фото) */}
      {isVideo && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Трансформация</h4>

          <ParamControl
            label="Позиция X"
            value={(clip as VideoClip).x}
            min={-1}
            max={1}
            onChange={(v) => updateClip(selectedClipId, (c) => ({ ...c, x: v }))}
          />

          <ParamControl
            label="Позиция Y"
            value={(clip as VideoClip).y}
            min={-1}
            max={1}
            onChange={(v) => updateClip(selectedClipId, (c) => ({ ...c, y: v }))}
          />

          <ParamControl
            label="Масштаб"
            value={(clip as VideoClip).scale}
            min={0.1}
            max={5}
            onChange={(v) => updateClip(selectedClipId, (c) => ({ ...c, scale: v }))}
            displayFn={(v) => `${(v * 100).toFixed(0)}%`}
          />

          <ParamControl
            label="Поворот"
            value={(clip as VideoClip).rotation}
            min={-180}
            max={180}
            onChange={(v) => updateClip(selectedClipId, (c) => ({ ...c, rotation: v }))}
            unit="°"
          />

          <ParamControl
            label="Прозрачность"
            value={(clip as VideoClip).opacity}
            min={0}
            max={1}
            onChange={(v) => updateClip(selectedClipId, (c) => ({ ...c, opacity: v }))}
            displayFn={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </div>
      )}

      {/* Обрезка (только видео/фото) */}
      {isVideo && (
        <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Обрезка</h4>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[9px] text-slate-400">Слева</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={((clip as VideoClip).cropLeft?.value || 0) * 100}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    cropLeft: { value: parseFloat(e.target.value) / 100 || 0, keyframes: [] },
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-[9px] text-slate-400">Справа</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={((clip as VideoClip).cropRight?.value || 0) * 100}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    cropRight: { value: parseFloat(e.target.value) / 100 || 0, keyframes: [] },
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-[9px] text-slate-400">Сверху</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={((clip as VideoClip).cropTop?.value || 0) * 100}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    cropTop: { value: parseFloat(e.target.value) / 100 || 0, keyframes: [] },
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-[9px] text-slate-400">Снизу</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={((clip as VideoClip).cropBottom?.value || 0) * 100}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    cropBottom: { value: parseFloat(e.target.value) / 100 || 0, keyframes: [] },
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* Flip (Video/Image only) */}
      {isVideo && (
        <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Отражение</h4>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() =>
                updateClip(selectedClipId, (c) => ({
                  ...c,
                  flipH: !(c as VideoClip).flipH,
                }))
              }
              className={`rounded-md border px-3 py-2 text-[10px] font-medium ${
                (clip as VideoClip).flipH
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/10 text-slate-400"
              }`}
            >
              ↔️ Горизонтально
            </button>
            <button
              onClick={() =>
                updateClip(selectedClipId, (c) => ({
                  ...c,
                  flipV: !(c as VideoClip).flipV,
                }))
              }
              className={`rounded-md border px-3 py-2 text-[10px] font-medium ${
                (clip as VideoClip).flipV
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/10 text-slate-400"
              }`}
            >
              ↕️ Вертикально
            </button>
          </div>
        </div>
      )}

      {/* Переходы */}
      {hasTransitions && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Переходы</h4>

          <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <label className="mb-2 block text-[10px] font-medium text-slate-300">
              Переход на входе
            </label>
            <select
              value={(clip as VideoClip).transitionIn.type}
              onChange={(e) =>
                updateClip(selectedClipId, (c) => ({
                  ...c,
                  transitionIn: {
                    ...(c as VideoClip).transitionIn,
                    type: e.target.value as TransitionType,
                  },
                }))
              }
              className="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
            >
              {TRANSITIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            {(clip as VideoClip).transitionIn.type !== "cut" && (
              <div>
                <label className="mb-1 block text-[10px] text-slate-400">
                  Длительность: {(clip as VideoClip).transitionIn.duration.toFixed(2)}с
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={(clip as VideoClip).transitionIn.duration}
                  onChange={(e) =>
                    updateClip(selectedClipId, (c) => ({
                      ...c,
                      transitionIn: {
                        ...(c as VideoClip).transitionIn,
                        duration: parseFloat(e.target.value),
                      },
                    }))
                  }
                  className="h-1 w-full accent-violet-500"
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <label className="mb-2 block text-[10px] font-medium text-slate-300">
              Переход на выходе
            </label>
            
            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="transition-out-enabled"
                checked={!!(clip as VideoClip).transitionOut}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    transitionOut: e.target.checked
                      ? { type: "fadeblack", duration: 0.6 }
                      : undefined,
                  }))
                }
                className="h-4 w-4 accent-violet-500"
              />
              <label htmlFor="transition-out-enabled" className="text-xs text-slate-300">
                Включить переход
              </label>
            </div>

            {(clip as VideoClip).transitionOut && (
              <>
                <select
                  value={(clip as VideoClip).transitionOut!.type}
                  onChange={(e) =>
                    updateClip(selectedClipId, (c) => ({
                      ...c,
                      transitionOut: {
                        ...(c as VideoClip).transitionOut!,
                        type: e.target.value as TransitionType,
                      },
                    }))
                  }
                  className="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
                >
                  {TRANSITIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <div>
                  <label className="mb-1 block text-[10px] text-slate-400">
                    Длительность: {(clip as VideoClip).transitionOut!.duration.toFixed(2)}с
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={(clip as VideoClip).transitionOut!.duration}
                    onChange={(e) =>
                      updateClip(selectedClipId, (c) => ({
                        ...c,
                        transitionOut: {
                          ...(c as VideoClip).transitionOut!,
                          duration: parseFloat(e.target.value),
                        },
                      }))
                    }
                    className="h-1 w-full accent-violet-500"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Trim/In-Out Points */}
      {(clip.type === "video" || clip.type === "audio") && (
        <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Обрезка временной линии</h4>
          
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                In Point: {clip.inPoint.toFixed(2)}с
              </label>
              <input
                type="number"
                min={0}
                max={clip.outPoint}
                step={0.1}
                value={clip.inPoint}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    inPoint: Math.max(0, parseFloat(e.target.value) || 0),
                  } as any))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Out Point: {clip.outPoint.toFixed(2)}с
              </label>
              <input
                type="number"
                min={clip.inPoint}
                step={0.1}
                value={clip.outPoint}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    outPoint: Math.max((c as any).inPoint, parseFloat(e.target.value) || (c as any).inPoint),
                  } as any))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* Lock Clip */}
      <div className="mb-6 flex items-center gap-2">
        <input
          type="checkbox"
          id="lock-clip"
          checked={clip.locked || false}
          onChange={(e) => updateClip(selectedClipId, (c) => ({ ...c, locked: e.target.checked }))}
          className="h-4 w-4 accent-violet-500"
        />
        <label htmlFor="lock-clip" className="text-xs text-slate-300">
          🔒 Заблокировать клип (защита от редактирования)
        </label>
      </div>
    </div>
  );
}
