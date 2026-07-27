"use client";

import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import type { TextClip, TextAnimation, TextStyle } from "@/lib/types";
import ParamControl from "../ParamControl";
import { createTextClip } from "@/lib/factories";

const FONT_FAMILIES = [
  "DejaVu Sans",
  "DejaVu Sans Bold",
  "Liberation Sans",
  "Liberation Serif",
  "Liberation Mono",
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
  "Impact",
];

const TEXT_ANIMATIONS: { id: TextAnimation; label: string }[] = [
  { id: "none", label: "Без анимации" },
  { id: "fade", label: "Fade" },
  { id: "slide-up", label: "Slide Up" },
  { id: "slide-down", label: "Slide Down" },
  { id: "slide-left", label: "Slide Left" },
  { id: "slide-right", label: "Slide Right" },
  { id: "pop", label: "Pop" },
  { id: "scale-in", label: "Scale In" },
  { id: "bounce", label: "Bounce" },
  { id: "typewriter", label: "Typewriter" },
  { id: "blur-in", label: "Blur In" },
  { id: "rotate-in", label: "Rotate In" },
];

export default function TextPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [showStyleAdvanced, setShowStyleAdvanced] = useState(false);

  const addTextClip = () => {
    if (!project) return;
    const textTrack = project.tracks.find((t) => t.type === "text");
    if (!textTrack) return;

    const newClip = createTextClip({
      trackId: textTrack.id,
      start: playhead,
      duration: 3,
    });

    updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === textTrack.id ? { ...t, clips: [...t.clips, newClip] } : t
      ),
    }));
  };

  if (!project) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Текст</h3>
        <p className="text-xs text-slate-500">Загрузите проект</p>
      </div>
    );
  }

  const clip = selectedClipId
    ? (project.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === selectedClipId) as TextClip | undefined)
    : undefined;

  if (!clip || clip.type !== "text") {
    return (
      <div className="p-4">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Текст и титры
        </h3>

        <button
          onClick={addTextClip}
          className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2.5 text-xs font-semibold text-white shadow-lg"
        >
          ➕ Добавить текст на плейхеде
        </button>

        <p className="mt-3 text-[10px] text-slate-500">
          Или выберите текстовый клип на таймлайне для редактирования
        </p>
      </div>
    );
  }

  const style = clip.style || ({} as TextStyle);

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Профессиональный текстовый редактор
      </h3>

      {/* Text Content */}
      <div className="mb-6">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Текст</label>
        <textarea
          value={clip.text}
          onChange={(e) => updateClip(selectedClipId!, (c) => ({ ...c, text: e.target.value }))}
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-100 outline-none focus:border-violet-500/50"
          placeholder="Введите текст..."
        />
      </div>

      {/* Font Settings */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Шрифт</h4>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-400">Семейство</label>
          <select
            value={clip.fontFamily}
            onChange={(e) =>
              updateClip(selectedClipId!, (c) => ({ ...c, fontFamily: e.target.value }))
            }
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
          >
            {FONT_FAMILIES.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-400">Размер: {clip.fontSize}px</label>
          <input
            type="range"
            min={12}
            max={200}
            step={2}
            value={clip.fontSize}
            onChange={(e) =>
              updateClip(selectedClipId!, (c) => ({ ...c, fontSize: parseInt(e.target.value) }))
            }
            className="h-1 w-full accent-violet-500"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-400">Начертание</label>
          <select
            value={style.fontWeight || 400}
            onChange={(e) =>
              updateClip(selectedClipId!, (c) => ({
                ...c,
                style: { ...style, fontWeight: parseInt(e.target.value) },
              }))
            }
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
          >
            <option value={100}>Thin</option>
            <option value={300}>Light</option>
            <option value={400}>Regular</option>
            <option value={600}>Semi-Bold</option>
            <option value={700}>Bold</option>
            <option value={900}>Black</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              updateClip(selectedClipId!, (c) => ({
                ...c,
                style: { ...style, fontStyle: style.fontStyle === "italic" ? "normal" : "italic" },
              }))
            }
            className={`rounded-md border px-2 py-1.5 text-[10px] font-medium ${
              style.fontStyle === "italic"
                ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                : "border-white/10 text-slate-400"
            }`}
          >
            <i>Italic</i>
          </button>
          <div>
            <label className="mb-1 block text-[9px] text-slate-400">Letter Spacing</label>
            <input
              type="number"
              min={-5}
              max={10}
              step={0.5}
              value={style.letterSpacing || 0}
              onChange={(e) =>
                updateClip(selectedClipId!, (c) => ({
                  ...c,
                  style: { ...style, letterSpacing: parseFloat(e.target.value) || 0 },
                }))
              }
              className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Цвета</h4>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-400">Цвет текста</label>
          <input
            type="color"
            value={clip.color}
            onChange={(e) => updateClip(selectedClipId!, (c) => ({ ...c, color: e.target.value } as any))}
            className="h-10 w-full rounded-md border border-white/10"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-400">Цвет фона</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={clip.backgroundColor === "transparent" ? "#000000" : clip.backgroundColor}
              onChange={(e) =>
                updateClip(selectedClipId!, (c) => ({ ...c, backgroundColor: e.target.value } as any))
              }
              className="h-10 flex-1 rounded-md border border-white/10"
              disabled={clip.backgroundColor === "transparent"}
            />
            <button
              onClick={() =>
                updateClip(selectedClipId!, (c) => ({
                    ...c,
                    backgroundColor: (c as any).backgroundColor === "transparent" ? "#000000" : "transparent",
                  } as any))
              }
              className={`rounded-md border px-3 text-[10px] ${
                clip.backgroundColor === "transparent"
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/10 text-slate-400"
              }`}
            >
              Transparent
            </button>
          </div>
        </div>
      </div>

      {/* Alignment */}
      <div className="mb-6">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Выравнивание</label>
        <div className="grid grid-cols-3 gap-2">
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              onClick={() => updateClip(selectedClipId!, (c) => ({ ...c, align }))}
              className={`rounded-md border px-2 py-2 text-[10px] font-medium ${
                clip.align === align
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/10 text-slate-400"
              }`}
            >
              {align === "left" ? "⬅️ Left" : align === "center" ? "↔️ Center" : "➡️ Right"}
            </button>
          ))}
        </div>
      </div>

      {/* Position & Transform */}
      <div className="mb-6">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Позиция и трансформация</h4>

        <ParamControl
          label="X (горизонталь)"
          value={clip.x}
          min={-1}
          max={1}
          onChange={(v) => updateClip(selectedClipId!, (c) => ({ ...c, x: v }))}
        />

        <ParamControl
          label="Y (вертикаль)"
          value={clip.y}
          min={-1}
          max={1}
          onChange={(v) => updateClip(selectedClipId!, (c) => ({ ...c, y: v }))}
        />

        <ParamControl
          label="Масштаб"
          value={clip.scale}
          min={0.1}
          max={3}
          onChange={(v) => updateClip(selectedClipId!, (c) => ({ ...c, scale: v }))}
          displayFn={(v) => `${(v * 100).toFixed(0)}%`}
        />

        {clip.rotation && (
          <ParamControl
            label="Поворот"
            value={clip.rotation}
            min={-180}
            max={180}
            onChange={(v) => updateClip(selectedClipId!, (c) => ({ ...c, rotation: v }))}
            unit="°"
          />
        )}

        <ParamControl
          label="Прозрачность"
          value={clip.opacity}
          min={0}
          max={1}
          onChange={(v) => updateClip(selectedClipId!, (c) => ({ ...c, opacity: v }))}
          displayFn={(v) => `${(v * 100).toFixed(0)}%`}
        />
      </div>

      {/* Animations */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Анимации</h4>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-400">Появление</label>
          <select
            value={clip.animationIn}
            onChange={(e) =>
              updateClip(selectedClipId!, (c) => ({
                ...c,
                animationIn: e.target.value as TextAnimation,
              }))
            }
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
          >
            {TEXT_ANIMATIONS.map((anim) => (
              <option key={anim.id} value={anim.id}>
                {anim.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[10px] text-slate-400">Исчезновение</label>
          <select
            value={clip.animationOut}
            onChange={(e) =>
              updateClip(selectedClipId!, (c) => ({
                ...c,
                animationOut: e.target.value as TextAnimation,
              }))
            }
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
          >
            {TEXT_ANIMATIONS.map((anim) => (
              <option key={anim.id} value={anim.id}>
                {anim.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Advanced Styling */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <button
          onClick={() => setShowStyleAdvanced(!showStyleAdvanced)}
          className="mb-3 flex w-full items-center justify-between text-[11px] font-semibold text-slate-300"
        >
          <span>Продвинутое оформление</span>
          <span>{showStyleAdvanced ? "▼" : "▶"}</span>
        </button>

        {showStyleAdvanced && (
          <div className="space-y-4">
            {/* Shadow */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-medium text-slate-300">Тень</label>
                <input
                  type="checkbox"
                  checked={style.shadow?.enabled || false}
                  onChange={(e) =>
                    updateClip(selectedClipId!, (c) => ({
                      ...c,
                      style: {
                        ...style,
                        shadow: {
                          enabled: e.target.checked,
                          color: "#000000",
                          offsetX: 2,
                          offsetY: 2,
                          blur: 4,
                          ...style.shadow,
                        },
                      },
                    }))
                  }
                  className="h-4 w-4 accent-violet-500"
                />
              </div>

              {style.shadow?.enabled && (
                <div className="ml-2 space-y-2">
                  <input
                    type="color"
                    value={style.shadow.color}
                    onChange={(e) =>
                      updateClip(selectedClipId!, (c) => ({
                        ...c,
                        style: {
                          ...style,
                          shadow: { ...style.shadow!, color: e.target.value },
                        },
                      }))
                    }
                    className="h-8 w-full rounded-md border border-white/10"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="X"
                      value={style.shadow.offsetX}
                      onChange={(e) =>
                        updateClip(selectedClipId!, (c) => ({
                          ...c,
                          style: {
                            ...style,
                            shadow: { ...style.shadow!, offsetX: parseInt(e.target.value) || 0 },
                          },
                        }))
                      }
                      className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
                    />
                    <input
                      type="number"
                      placeholder="Y"
                      value={style.shadow.offsetY}
                      onChange={(e) =>
                        updateClip(selectedClipId!, (c) => ({
                          ...c,
                          style: {
                            ...style,
                            shadow: { ...style.shadow!, offsetY: parseInt(e.target.value) || 0 },
                          },
                        }))
                      }
                      className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={style.shadow.blur}
                    onChange={(e) =>
                      updateClip(selectedClipId!, (c) => ({
                        ...c,
                        style: {
                          ...style,
                          shadow: { ...style.shadow!, blur: parseInt(e.target.value) },
                        },
                      }))
                    }
                    className="h-1 w-full accent-violet-500"
                  />
                </div>
              )}
            </div>

            {/* Stroke */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[10px] font-medium text-slate-300">Обводка</label>
                <input
                  type="checkbox"
                  checked={style.stroke?.enabled || false}
                  onChange={(e) =>
                    updateClip(selectedClipId!, (c) => ({
                      ...c,
                      style: {
                        ...style,
                        stroke: {
                          enabled: e.target.checked,
                          color: "#000000",
                          width: 2,
                          ...style.stroke,
                        },
                      },
                    }))
                  }
                  className="h-4 w-4 accent-violet-500"
                />
              </div>

              {style.stroke?.enabled && (
                <div className="ml-2 space-y-2">
                  <input
                    type="color"
                    value={style.stroke.color}
                    onChange={(e) =>
                      updateClip(selectedClipId!, (c) => ({
                        ...c,
                        style: {
                          ...style,
                          stroke: { ...style.stroke!, color: e.target.value },
                        },
                      }))
                    }
                    className="h-8 w-full rounded-md border border-white/10"
                  />
                  <div>
                    <label className="mb-1 block text-[9px] text-slate-400">
                      Ширина: {style.stroke.width}px
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={style.stroke.width}
                      onChange={(e) =>
                        updateClip(selectedClipId!, (c) => ({
                          ...c,
                          style: {
                            ...style,
                            stroke: { ...style.stroke!, width: parseInt(e.target.value) },
                          },
                        }))
                      }
                      className="h-1 w-full accent-violet-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="space-y-2">
        <button
          onClick={addTextClip}
          className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
        >
          ➕ Добавить новый текст
        </button>
      </div>
    </div>
  );
}
