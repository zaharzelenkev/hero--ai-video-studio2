"use client";

import { useState } from "react";
import type { AnimParam, Keyframe, Easing } from "@/lib/types";
import { uid } from "@/lib/id";

interface KeyframeEditorProps {
  label: string;
  value: AnimParam;
  min: number;
  max: number;
  onChange: (value: AnimParam) => void;
  clipDuration: number;
}

const EASING_OPTIONS: { value: Easing; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "easeIn", label: "Ease In" },
  { value: "easeOut", label: "Ease Out" },
  { value: "easeInOut", label: "Ease In Out" },
  { value: "cubicBezier", label: "Bezier (Custom)" },
];

export default function KeyframeEditor({
  label,
  value,
  min,
  max,
  onChange,
  clipDuration,
}: KeyframeEditorProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [selectedKeyframe, setSelectedKeyframe] = useState<string | null>(null);

  const addKeyframe = (time: number) => {
    const newKeyframe: Keyframe = {
      id: uid("kf"),
      time: Math.max(0, Math.min(clipDuration, time)),
      value: value.value,
      easing: "linear",
    };

    onChange({
      ...value,
      keyframes: [...value.keyframes, newKeyframe].sort((a, b) => a.time - b.time),
    });
  };

  const updateKeyframe = (id: string, updates: Partial<Keyframe>) => {
    onChange({
      ...value,
      keyframes: value.keyframes.map((kf) => (kf.id === id ? { ...kf, ...updates } : kf)),
    });
  };

  const removeKeyframe = (id: string) => {
    onChange({
      ...value,
      keyframes: value.keyframes.filter((kf) => kf.id !== id),
    });
    if (selectedKeyframe === id) setSelectedKeyframe(null);
  };

  const hasKeyframes = value.keyframes.length > 0;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-medium text-slate-300">{label}</label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">{value.value.toFixed(2)}</span>
          <button
            onClick={() => setShowEditor(!showEditor)}
            className={`rounded px-2 py-0.5 text-[9px] font-medium ${
              hasKeyframes
                ? "bg-violet-500/20 text-violet-300"
                : "bg-white/5 text-slate-400"
            }`}
          >
            {hasKeyframes ? `${value.keyframes.length} KF` : "Add KF"}
          </button>
        </div>
      </div>

      {/* Base Value Slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) / 200}
        value={value.value}
        onChange={(e) => onChange({ ...value, value: parseFloat(e.target.value) })}
        className="mb-2 h-1 w-full accent-violet-500"
      />

      {/* Keyframe Editor */}
      {showEditor && (
        <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-medium text-violet-300">Редактор кейфреймов</span>
            <button
              onClick={() => addKeyframe(clipDuration / 2)}
              className="rounded bg-violet-500/20 px-2 py-1 text-[9px] text-violet-300 hover:bg-violet-500/30"
            >
              + Добавить
            </button>
          </div>

          {/* Timeline visualization */}
          <div className="relative mb-3 h-16 rounded-md bg-black/30">
            <div className="absolute inset-0">
              {/* Grid lines */}
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full w-px bg-white/5"
                  style={{ left: `${(i / 4) * 100}%` }}
                />
              ))}

              {/* Value line */}
              <svg className="h-full w-full" preserveAspectRatio="none">
                <polyline
                  points={[
                    `0,${((max - value.value) / (max - min)) * 100}`,
                    ...value.keyframes.map(
                      (kf) =>
                        `${(kf.time / clipDuration) * 100},${((max - kf.value) / (max - min)) * 100}`
                    ),
                    `100,${((max - value.value) / (max - min)) * 100}`,
                  ].join(" ")}
                  fill="none"
                  stroke="rgb(167, 139, 250)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* Keyframe points */}
              {value.keyframes.map((kf) => (
                <button
                  key={kf.id}
                  onClick={() => setSelectedKeyframe(kf.id)}
                  className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                    selectedKeyframe === kf.id
                      ? "border-white bg-violet-400"
                      : "border-violet-400 bg-violet-600"
                  }`}
                  style={{
                    left: `${(kf.time / clipDuration) * 100}%`,
                    top: `${((max - kf.value) / (max - min)) * 100}%`,
                  }}
                  title={`Time: ${kf.time.toFixed(2)}s, Value: ${kf.value.toFixed(2)}`}
                />
              ))}
            </div>
          </div>

          {/* Keyframe List */}
          {value.keyframes.length > 0 ? (
            <div className="space-y-2">
              {value.keyframes.map((kf, index) => (
                <div
                  key={kf.id}
                  className={`rounded-md border p-2 ${
                    selectedKeyframe === kf.id
                      ? "border-violet-500/50 bg-violet-500/10"
                      : "border-white/10 bg-black/20"
                  }`}
                  onClick={() => setSelectedKeyframe(kf.id)}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-slate-300">
                      Keyframe {index + 1}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeKeyframe(kf.id);
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[9px] text-slate-400">Time (s)</label>
                      <input
                        type="number"
                        min={0}
                        max={clipDuration}
                        step={0.1}
                        value={kf.time}
                        onChange={(e) =>
                          updateKeyframe(kf.id, {
                            time: Math.max(0, Math.min(clipDuration, parseFloat(e.target.value) || 0)),
                          })
                        }
                        className="w-full rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-slate-100"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[9px] text-slate-400">Value</label>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={(max - min) / 100}
                        value={kf.value}
                        onChange={(e) =>
                          updateKeyframe(kf.id, {
                            value: Math.max(min, Math.min(max, parseFloat(e.target.value) || 0)),
                          })
                        }
                        className="w-full rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-slate-100"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>

                  <div className="mt-2">
                    <label className="mb-1 block text-[9px] text-slate-400">Easing</label>
                    <select
                      value={kf.easing}
                      onChange={(e) =>
                        updateKeyframe(kf.id, { easing: e.target.value as Easing })
                      }
                      className="w-full rounded border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {EASING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-[10px] text-slate-500">
              Нет кейфреймов. Нажмите &quot;Добавить&quot; для создания анимации.
            </p>
          )}

          {/* Clear All */}
          {value.keyframes.length > 0 && (
            <button
              onClick={() => onChange({ ...value, keyframes: [] })}
              className="mt-3 w-full rounded-md border border-red-400/30 px-2 py-1.5 text-[10px] text-red-300 hover:bg-red-500/10"
            >
              Удалить все кейфреймы
            </button>
          )}
        </div>
      )}
    </div>
  );
}
