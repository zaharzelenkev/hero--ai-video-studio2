"use client";

import { useRef, useState } from "react";
import { useProjectStore, findClip } from "@/store/projectStore";
import { addKeyframe, evalParam, removeKeyframe } from "@/lib/keyframes";
import { defaultColorGrade, param } from "@/lib/types";
import type { AnimParam, AudioClip, Clip, Easing, Keyframe, TextClip, VideoClip } from "@/lib/types";
import { PanelSection, EmptyHint, ToggleButton, SelectField } from "./panels/ui";

interface ParamBinding {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get: (clip: Clip) => AnimParam;
  set: (clip: Clip, value: AnimParam) => Clip;
}

function videoBindings(): ParamBinding[] {
  const simple = (key: keyof VideoClip, label: string, min: number, max: number, step: number, fallback: number): ParamBinding => ({
    key: String(key),
    label,
    min,
    max,
    step,
    get: (clip) => ((clip as VideoClip)[key] as AnimParam) ?? param(fallback),
    set: (clip, value) => ({ ...(clip as VideoClip), [key]: value }) as Clip,
  });
  const grade = (key: "exposure" | "brightness" | "contrast" | "saturation", label: string): ParamBinding => ({
    key: `color.${key}`,
    label,
    min: key === "exposure" ? -3 : -1,
    max: key === "exposure" ? 3 : 1,
    step: 0.01,
    get: (clip) => (clip as VideoClip).color?.[key] ?? param(0),
    set: (clip, value) => {
      const video = clip as VideoClip;
      return { ...video, color: { ...(video.color ?? defaultColorGrade()), [key]: value } } as Clip;
    },
  });
  return [
    simple("opacity", "Прозрачность", 0, 1, 0.01, 1),
    simple("scale", "Масштаб", 0.1, 4, 0.01, 1),
    simple("x", "Позиция X", -1, 1, 0.01, 0),
    simple("y", "Позиция Y", -1, 1, 0.01, 0),
    simple("rotation", "Поворот", -180, 180, 0.5, 0),
    simple("volume", "Громкость", 0, 2, 0.01, 1),
    grade("exposure", "Экспозиция"),
    grade("brightness", "Яркость"),
    grade("contrast", "Контраст"),
    grade("saturation", "Насыщенность"),
  ];
}

function textBindings(): ParamBinding[] {
  const simple = (key: keyof TextClip, label: string, min: number, max: number, step: number, fallback: number): ParamBinding => ({
    key: String(key),
    label,
    min,
    max,
    step,
    get: (clip) => ((clip as TextClip)[key] as AnimParam) ?? param(fallback),
    set: (clip, value) => ({ ...(clip as TextClip), [key]: value }) as Clip,
  });
  return [
    simple("opacity", "Прозрачность", 0, 1, 0.01, 1),
    simple("scale", "Масштаб", 0.1, 3, 0.01, 1),
    simple("x", "Позиция X", -1, 1, 0.01, 0),
    simple("y", "Позиция Y", -1, 1, 0.01, 0),
    simple("rotation", "Поворот", -180, 180, 0.5, 0),
  ];
}

function audioBindings(): ParamBinding[] {
  return [
    {
      key: "volume",
      label: "Громкость",
      min: 0,
      max: 2,
      step: 0.01,
      get: (clip) => (clip as AudioClip).volume ?? param(1),
      set: (clip, value) => ({ ...(clip as AudioClip), volume: value }) as Clip,
    },
    {
      key: "pan",
      label: "Панорама",
      min: -1,
      max: 1,
      step: 0.01,
      get: (clip) => (clip as AudioClip).pan ?? param(0),
      set: (clip, value) => ({ ...(clip as AudioClip), pan: value }) as Clip,
    },
  ];
}

function KeyframeLane({
  binding,
  clip,
  localTime,
  onSelect,
  selectedId,
}: {
  binding: ParamBinding;
  clip: Clip;
  localTime: number;
  onSelect: (kf: Keyframe | null, binding: ParamBinding) => void;
  selectedId: string | null;
}) {
  const updateClip = useProjectStore((s) => s.updateClip);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const value = binding.get(clip);
  const current = evalParam(value, localTime);

  const startDrag = (event: React.PointerEvent, kf: Keyframe) => {
    event.stopPropagation();
    event.preventDefault();
    useProjectStore.getState().beginHistory();
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const time = ratio * clip.duration;
      updateClip(
        clip.id,
        (c) => {
          const p = binding.get(c);
          const keyframes = p.keyframes.map((k) => (k.id === kf.id ? { ...k, time } : k)).sort((a, b) => a.time - b.time);
          return binding.set(c, { ...p, keyframes });
        },
        { history: false },
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="mb-2 rounded-lg border border-white/10 bg-black/30 p-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-200">{binding.label}</span>
        <span className="font-mono text-[10px] text-violet-300">{current.toFixed(2)}</span>
        <div className="ml-auto flex gap-1">
          <button
            title="Добавить ключевой кадр на плейхеде"
            onClick={() => updateClip(clip.id, (c) => binding.set(c, addKeyframe(binding.get(c), Math.max(0, localTime), evalParam(binding.get(c), localTime))))}
            className="rounded bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-200 hover:bg-amber-500/35"
          >
            ◆
          </button>
          <button
            title="Убрать всю анимацию параметра"
            onClick={() => updateClip(clip.id, (c) => binding.set(c, { value: evalParam(binding.get(c), localTime), keyframes: [] }))}
            className="rounded bg-white/5 px-1.5 text-[10px] text-slate-400 hover:bg-rose-500/20 hover:text-rose-200"
          >
            ✕
          </button>
        </div>
      </div>
      <div
        ref={laneRef}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
          const time = ratio * clip.duration;
          updateClip(clip.id, (c) => binding.set(c, addKeyframe(binding.get(c), time, evalParam(binding.get(c), time))));
        }}
        className="relative h-7 rounded bg-[#0a0a12]"
        title="Двойной клик — добавить ключ, перетаскивание — сдвинуть"
      >
        <div className="absolute inset-y-0 w-px bg-fuchsia-400/70" style={{ left: `${clip.duration > 0 ? (localTime / clip.duration) * 100 : 0}%` }} />
        {value.keyframes.map((kf) => (
          <button
            key={kf.id}
            onPointerDown={(e) => startDrag(e, kf)}
            onClick={() => onSelect(kf, binding)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              updateClip(clip.id, (c) => binding.set(c, removeKeyframe(binding.get(c), kf.id)));
            }}
            title={`t=${kf.time.toFixed(2)}с · v=${kf.value.toFixed(2)} · ${kf.easing}`}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border ${
              selectedId === kf.id ? "border-white bg-violet-400" : "border-amber-200/60 bg-amber-400"
            }`}
            style={{ left: `${clip.duration > 0 ? (kf.time / clip.duration) * 100 : 0}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function KeyframeEditor() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const [selected, setSelected] = useState<{ kf: Keyframe; binding: ParamBinding } | null>(null);

  const found = findClip(project, selectedClipId);
  if (!found) return <EmptyHint>Выберите клип, чтобы анимировать его параметры ключевыми кадрами.</EmptyHint>;

  const clip = found.clip;
  const localTime = Math.max(0, playhead - clip.start);
  const bindings =
    clip.type === "audio" ? audioBindings() : clip.type === "text" || clip.type === "subtitle" ? textBindings() : videoBindings();

  return (
    <div className="space-y-3">
      <PanelSection title="Ключевые кадры" subtitle={clip.name}>
        {bindings.map((binding) => (
          <KeyframeLane
            key={binding.key}
            binding={binding}
            clip={clip}
            localTime={localTime}
            selectedId={selected?.kf.id ?? null}
            onSelect={(kf, b) => setSelected(kf ? { kf, binding: b } : null)}
          />
        ))}
      </PanelSection>

      {selected && (
        <PanelSection title="Выбранный ключ" subtitle={`${selected.binding.label} · ${selected.kf.time.toFixed(2)}с`}>
          <SelectField
            label="Сглаживание"
            value={selected.kf.easing}
            options={[
              { value: "linear", label: "Линейно" },
              { value: "easeIn", label: "Ease In" },
              { value: "easeOut", label: "Ease Out" },
              { value: "easeInOut", label: "Ease In-Out" },
            ]}
            onChange={(v) => {
              updateClip(clip.id, (c) => {
                const p = selected.binding.get(c);
                return selected.binding.set(c, {
                  ...p,
                  keyframes: p.keyframes.map((k) => (k.id === selected.kf.id ? { ...k, easing: v as Easing } : k)),
                });
              });
              setSelected({ ...selected, kf: { ...selected.kf, easing: v as Easing } });
            }}
          />
          <div className="mt-2 flex gap-1.5">
            <ToggleButton
              tone="danger"
              onClick={() => {
                updateClip(clip.id, (c) => selected.binding.set(c, removeKeyframe(selected.binding.get(c), selected.kf.id)));
                setSelected(null);
              }}
            >
              🗑 Удалить ключ
            </ToggleButton>
          </div>
        </PanelSection>
      )}
    </div>
  );
}
