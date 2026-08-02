"use client";

import { addKeyframe, evalParam, removeKeyframe } from "@/lib/keyframes";
import { Icon } from "@/components/ui/Icon";
import type { AnimParam } from "@/lib/types";

export default function ParamControl({
  label,
  param,
  value: valueProp,
  localTime = 0,
  clipDuration = 0,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  displayFn,
  unit,
}: {
  label: string;
  param?: AnimParam;
  value?: AnimParam;
  localTime?: number;
  clipDuration?: number;
  min: number;
  max: number;
  step?: number;
  onChange: (p: AnimParam) => void;
  format?: (v: number) => string;
  displayFn?: (v: number) => string | number;
  unit?: string;
}) {
  const p = param ?? valueProp;
  if (!p) return null;

  const value = evalParam(p, localTime);
  const animated = p.keyframes.length > 0;

  const handleSlide = (v: number) => {
    if (animated) {
      onChange(addKeyframe(p, Math.max(0, localTime), v));
    } else {
      onChange({ ...p, value: v });
    }
  };

  const addKf = () => onChange(addKeyframe(p, Math.max(0, localTime), value));
  const clearKfs = () => onChange({ value, keyframes: [] });

  const displayValue = displayFn ? displayFn(value) : format ? format(value) : value.toFixed(2) + (unit || "");
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-300">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-slate-400">{displayValue}</span>
          <button
            title="Добавить ключевой кадр на плейхеде"
            onClick={addKf}
            className={`flex h-5 w-5 items-center justify-center rounded-md transition ${animated ? "bg-amber-500/20 text-amber-300" : "text-slate-500 hover:bg-amber-500/15 hover:text-amber-300"}`}
          >
            <Icon name="diamond" size={10} strokeWidth={2} />
          </button>
          {animated && (
            <button title="Убрать анимацию" onClick={clearKfs} className="flex h-5 w-5 items-center justify-center rounded-md text-slate-500 hover:bg-rose-500/15 hover:text-red-300">
              <Icon name="x" size={10} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => handleSlide(parseFloat(e.target.value))}
        className="h-4 w-full"
        style={{ ["--range-pct" as string]: `${Math.max(0, Math.min(100, pct))}%` }}
      />
      {animated && (
        <div className="relative mt-1 h-3 rounded bg-white/5">
          {p.keyframes.map((kf) => (
            <button
              key={kf.id}
              title={`t=${kf.time.toFixed(2)}s, v=${kf.value.toFixed(2)}`}
              onClick={() => onChange(removeKeyframe(p, kf.id))}
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-amber-400 hover:bg-red-400"
              style={{ left: `${clipDuration > 0 ? (kf.time / clipDuration) * 100 : 0}%` }}
            />
          ))}
          <div
            className="absolute top-0 h-full w-px bg-fuchsia-400"
            style={{ left: `${clipDuration > 0 ? (Math.max(0, localTime) / clipDuration) * 100 : 0}%` }}
          />
        </div>
      )}
    </div>
  );
}
