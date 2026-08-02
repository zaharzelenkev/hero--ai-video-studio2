"use client";

import { useState } from "react";
import { useProjectStore, findClip } from "@/store/projectStore";
import { param } from "@/lib/types";
import type { BlendMode, Clip, LutPreset, Mask, VfxSettings, VideoClip } from "@/lib/types";
import { EFFECT_PRESETS } from "@/lib/presets";
import { renderFrame } from "@/lib/editor/compositor";
import { mergeVfxSettings } from "@/lib/editor/vfx";
import {
  PanelSection,
  ToggleButton,
  EmptyHint,
  SliderField,
  SelectField,
  ColorField,
  CheckboxField,
  NumberField,
} from "./ui";

const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "colorDodge",
  "colorBurn",
  "hardLight",
  "softLight",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
];

const LUTS: { id: LutPreset; label: string }[] = [
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

const VFX_KEYS: Record<string, keyof VfxSettings> = {
  "background-removal": "backgroundRemoval",
  "object-removal": "objectRemoval",
  glow: "glow",
  "light-rays": "lightRays",
  "film-grain": "filmGrain",
  "lens-distortion": "lensDistortion",
  bloom: "bloom",
  sharpen: "sharpen",
  "noise-reduction": "noiseReduction",
  vignette: "vignette",
  "lut-pipeline": "lutPipeline",
};

const EFFECT_GROUPS = [
  {
    title: "Ключинг и ретушь",
    ids: ["background-removal", "object-removal"],
  },
  {
    title: "Оптика и свет",
    ids: ["glow", "light-rays", "bloom", "lens-distortion", "vignette"],
  },
  {
    title: "Детализация",
    ids: ["sharpen", "noise-reduction", "film-grain", "motion-blur"],
  },
  {
    title: "Цветовой pipeline",
    ids: ["lut-pipeline"],
  },
];

function defaultMask(): Mask {
  return { enabled: true, shape: "rect", x: param(0.1), y: param(0.1), width: param(0.8), height: param(0.8), feather: 12, inverted: false };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

export default function EffectsPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateProject = useProjectStore((s) => s.updateProject);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const moveTrack = useProjectStore((s) => s.moveTrack);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const [note, setNote] = useState("");

  const found = findClip(project, selectedClipId);
  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;
  if (!found || (found.clip.type !== "video" && found.clip.type !== "image")) {
    return <EmptyHint>Выберите видео- или фото-клип, чтобы добавить VFX, хромакей или маску.</EmptyHint>;
  }

  const clip = found.clip as VideoClip;
  const vfx = mergeVfxSettings(clip.vfx);
  const patch = (fn: (c: VideoClip) => VideoClip) => updateClip(clip.id, (c) => fn(c as VideoClip) as Clip);
  const setVfx = (fn: (v: VfxSettings) => VfxSettings) => patch((c) => ({ ...c, vfx: fn(mergeVfxSettings(c.vfx)) }));

  const isEnabled = (id: string): boolean => {
    if (id === "motion-blur") return !!clip.motionBlur?.enabled;
    const key = VFX_KEYS[id];
    return key ? Boolean((vfx[key] as { enabled?: boolean }).enabled) || clip.effects?.includes(id) === true : clip.effects?.includes(id) === true;
  };

  const setEnabled = (id: string, enabled: boolean) => {
    if (id === "motion-blur") {
      patch((c) => ({
        ...c,
        motionBlur: {
          enabled,
          samples: c.motionBlur?.samples ?? 8,
          shutterAngle: c.motionBlur?.shutterAngle ?? 180,
        },
        effects: enabled ? [...new Set([...(c.effects ?? []), id])] : (c.effects ?? []).filter((e) => e !== id),
      }));
      return;
    }
    const key = VFX_KEYS[id];
    if (!key) return;
    patch((c) => {
      const current = mergeVfxSettings(c.vfx);
      const next = { ...current, [key]: { ...(current[key] as object), enabled } } as VfxSettings;
      if (key === "lensDistortion" && enabled && Math.abs(next.lensDistortion.amount) < 0.0001) {
        next.lensDistortion.amount = 0.35;
      }
      if (key === "lutPipeline" && enabled && next.lutPipeline.preset === "none") {
        next.lutPipeline.preset = "cinematic";
      }
      return {
        ...c,
        vfx: next,
        effects: enabled ? [...new Set([...(c.effects ?? []), id])] : (c.effects ?? []).filter((e) => e !== id),
      };
    });
  };

  const setObject = (key: "x" | "y" | "width" | "height" | "feather" | "iterations", value: number) =>
    setVfx((current) => ({
      ...current,
      objectRemoval: {
        ...current.objectRemoval,
        [key]: key === "iterations" ? Math.round(clamp(value, 1, 32)) : key === "feather" ? clamp(value, 0, 1) : clamp(value, 0, 1),
      },
    }));

  /** Берём цвет фона из четырёх углов текущего кадра для export-colorkey. */
  const sampleBackground = () => {
    const offscreen = document.createElement("canvas");
    offscreen.width = 160;
    offscreen.height = 90;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    renderFrame(ctx, project, playhead);
    const points = [[2, 2], [157, 2], [2, 87], [157, 87]];
    let r = 0;
    let g = 0;
    let b = 0;
    for (const [x, y] of points) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      r += pixel[0];
      g += pixel[1];
      b += pixel[2];
    }
    const color = rgbToHex(r / points.length, g / points.length, b / points.length);
    setVfx((current) => ({
      ...current,
      backgroundRemoval: { ...current.backgroundRemoval, enabled: true, mode: "color", sampleColor: color },
    }));
    setEnabled("background-removal", true);
    setNote(`Фон сэмплирован: ${color}`);
    window.setTimeout(() => setNote(""), 2200);
  };

  const requestObjectSelection = () => {
    window.dispatchEvent(new Event("montiq:vfx-object-select"));
    setNote("Потяните рамку вокруг объекта прямо в окне Preview");
    window.setTimeout(() => setNote(""), 3500);
  };

  const videoTracks = project.tracks.filter((track) => track.type === "video");

  return (
    <div className="space-y-3">
      <PanelSection title="VFX stack" subtitle="каждая кнопка запускает реальный pixel/filter pass">
        {EFFECT_GROUPS.map((group) => (
          <div key={group.title} className="mb-2 last:mb-0">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{group.title}</div>
            <div className="flex flex-wrap gap-1.5">
              {group.ids.map((id) => {
                const preset = EFFECT_PRESETS.find((item) => item.id === id);
                return (
                  <ToggleButton key={id} active={isEnabled(id)} onClick={() => setEnabled(id, !isEnabled(id))}>
                    {preset?.label ?? id}
                  </ToggleButton>
                );
              })}
            </div>
          </div>
        ))}
      </PanelSection>

      <PanelSection title="Chroma Key" subtitle="цветовой matte + spill suppression">
        <CheckboxField label="Включить Chroma Key" checked={!!clip.chroma?.enabled} onChange={(enabled) => patch((c) => ({ ...c, chroma: { ...(c.chroma ?? { color: "#00ff00", similarity: 0.22, blend: 0.12 }), enabled } }))} />
        <ColorField label="Ключевой цвет" value={clip.chroma?.color ?? "#00ff00"} onChange={(value) => patch((c) => ({ ...c, chroma: { ...(c.chroma ?? { enabled: true, similarity: 0.22, blend: 0.12 }), color: value } }))} />
        <SliderField label="Порог сходства" value={clip.chroma?.similarity ?? 0.22} min={0.01} max={0.9} step={0.01} onChange={(value) => patch((c) => ({ ...c, chroma: { ...(c.chroma ?? { enabled: true, color: "#00ff00", blend: 0.12 }), similarity: value } }))} />
        <SliderField label="Мягкость края" value={clip.chroma?.blend ?? 0.12} min={0.01} max={0.6} step={0.01} onChange={(value) => patch((c) => ({ ...c, chroma: { ...(c.chroma ?? { enabled: true, color: "#00ff00", similarity: 0.22 }), blend: value } }))} />
      </PanelSection>

      <PanelSection title="Background Removal" subtitle="adaptive border segmentation / color matte">
        <CheckboxField label="Удалять связный фон" checked={vfx.backgroundRemoval.enabled} onChange={(enabled) => setEnabled("background-removal", enabled)} />
        <SelectField label="Алгоритм" value={vfx.backgroundRemoval.mode} options={[{ value: "adaptive", label: "Adaptive: фон по границе" }, { value: "color", label: "Color: sampleColor" }]} onChange={(value) => setVfx((current) => ({ ...current, backgroundRemoval: { ...current.backgroundRemoval, mode: value as "adaptive" | "color" } }))} />
        <ColorField label="Sample color (для export)" value={vfx.backgroundRemoval.sampleColor} onChange={(value) => setVfx((current) => ({ ...current, backgroundRemoval: { ...current.backgroundRemoval, sampleColor: value, mode: "color" } }))} />
        <SliderField label="Порог фона" value={vfx.backgroundRemoval.threshold} min={0.02} max={0.8} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, backgroundRemoval: { ...current.backgroundRemoval, threshold: value } }))} />
        <SliderField label="Мягкость matte" value={vfx.backgroundRemoval.softness} min={0.01} max={0.5} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, backgroundRemoval: { ...current.backgroundRemoval, softness: value } }))} />
        <SliderField label="Сглаживание края" value={vfx.backgroundRemoval.edgeBlur} min={0} max={8} step={1} onChange={(value) => setVfx((current) => ({ ...current, backgroundRemoval: { ...current.backgroundRemoval, edgeBlur: value } }))} />
        <ToggleButton onClick={sampleBackground}>💧 Сэмплировать углы кадра</ToggleButton>
      </PanelSection>

      <PanelSection title="Object Removal" subtitle="inpainting по выделенной области">
        <CheckboxField label="Включить восстановление фона" checked={vfx.objectRemoval.enabled} onChange={(enabled) => setEnabled("object-removal", enabled)} />
        <ToggleButton active={vfx.objectRemoval.enabled} onClick={requestObjectSelection}>▣ Выделить объект в Preview</ToggleButton>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label="X, %" value={vfx.objectRemoval.x * 100} step={1} min={0} max={100} onChange={(value) => setObject("x", value / 100)} />
          <NumberField label="Y, %" value={vfx.objectRemoval.y * 100} step={1} min={0} max={100} onChange={(value) => setObject("y", value / 100)} />
          <NumberField label="Ширина, %" value={vfx.objectRemoval.width * 100} step={1} min={1} max={100} onChange={(value) => setObject("width", value / 100)} />
          <NumberField label="Высота, %" value={vfx.objectRemoval.height * 100} step={1} min={1} max={100} onChange={(value) => setObject("height", value / 100)} />
        </div>
        <SliderField label="Feather" value={vfx.objectRemoval.feather} min={0} max={0.5} step={0.01} onChange={(value) => setObject("feather", value)} />
        <SliderField label="Итерации inpaint" value={vfx.objectRemoval.iterations} min={1} max={32} step={1} onChange={(value) => setObject("iterations", value)} />
        <div className="mt-1 text-[10px] leading-relaxed text-slate-500">Алгоритм распространяет пиксели границы внутрь области; область сохраняется в проекте и уходит в export как delogo/inpaint pass.</div>
      </PanelSection>

      <PanelSection title="Glow / Light Rays / Bloom" subtitle="bright-pass + blur + screen composite">
        <CheckboxField label="Glow" checked={vfx.glow.enabled} onChange={(enabled) => setEnabled("glow", enabled)} />
        {vfx.glow.enabled && <>
          <SliderField label="Glow threshold" value={vfx.glow.threshold} min={0.1} max={0.98} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, glow: { ...current.glow, threshold: value } }))} />
          <SliderField label="Glow radius" value={vfx.glow.radius} min={1} max={60} step={1} onChange={(value) => setVfx((current) => ({ ...current, glow: { ...current.glow, radius: value } }))} />
          <SliderField label="Glow intensity" value={vfx.glow.intensity} min={0} max={2} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, glow: { ...current.glow, intensity: value } }))} />
        </>}
        <CheckboxField label="Light Rays" checked={vfx.lightRays.enabled} onChange={(enabled) => setEnabled("light-rays", enabled)} />
        {vfx.lightRays.enabled && <>
          <SliderField label="Ray threshold" value={vfx.lightRays.threshold} min={0.1} max={0.98} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, lightRays: { ...current.lightRays, threshold: value } }))} />
          <SliderField label="Длина лучей" value={vfx.lightRays.length} min={0.02} max={1} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, lightRays: { ...current.lightRays, length: value } }))} />
          <SliderField label="Сила лучей" value={vfx.lightRays.intensity} min={0} max={2} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, lightRays: { ...current.lightRays, intensity: value } }))} />
          <div className="grid grid-cols-2 gap-2"><NumberField label="Источник X, %" value={vfx.lightRays.originX * 100} min={0} max={100} onChange={(value) => setVfx((current) => ({ ...current, lightRays: { ...current.lightRays, originX: clamp(value / 100, 0, 1) } }))} /><NumberField label="Источник Y, %" value={vfx.lightRays.originY * 100} min={0} max={100} onChange={(value) => setVfx((current) => ({ ...current, lightRays: { ...current.lightRays, originY: clamp(value / 100, 0, 1) } }))} /></div>
          <NumberField label="Поворот веера, °" value={vfx.lightRays.angle} step={1} min={-180} max={180} onChange={(value) => setVfx((current) => ({ ...current, lightRays: { ...current.lightRays, angle: clamp(value, -180, 180) } }))} />
        </>}
        <CheckboxField label="Bloom" checked={vfx.bloom.enabled} onChange={(enabled) => setEnabled("bloom", enabled)} />
        {vfx.bloom.enabled && <>
          <SliderField label="Bloom threshold" value={vfx.bloom.threshold} min={0.1} max={0.99} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, bloom: { ...current.bloom, threshold: value } }))} />
          <SliderField label="Bloom radius" value={vfx.bloom.radius} min={1} max={100} step={1} onChange={(value) => setVfx((current) => ({ ...current, bloom: { ...current.bloom, radius: value } }))} />
          <SliderField label="Bloom intensity" value={vfx.bloom.intensity} min={0} max={2} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, bloom: { ...current.bloom, intensity: value } }))} />
        </>}
      </PanelSection>

      <PanelSection title="Motion Blur / Film Grain" subtitle="temporal samples + deterministic grain">
        <CheckboxField label="Motion Blur" checked={isEnabled("motion-blur")} onChange={(enabled) => setEnabled("motion-blur", enabled)} />
        {isEnabled("motion-blur") && <>
          <SliderField label="Samples" value={clip.motionBlur?.samples ?? 8} min={2} max={32} step={1} onChange={(value) => patch((c) => ({ ...c, motionBlur: { enabled: true, samples: value, shutterAngle: c.motionBlur?.shutterAngle ?? 180 } }))} />
          <SliderField label="Shutter angle" value={clip.motionBlur?.shutterAngle ?? 180} min={10} max={360} step={1} onChange={(value) => patch((c) => ({ ...c, motionBlur: { enabled: true, samples: c.motionBlur?.samples ?? 8, shutterAngle: value } }))} />
        </>}
        <CheckboxField label="Film Grain" checked={vfx.filmGrain.enabled} onChange={(enabled) => setEnabled("film-grain", enabled)} />
        {vfx.filmGrain.enabled && <>
          <SliderField label="Количество зерна" value={vfx.filmGrain.amount} min={0.01} max={1} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, filmGrain: { ...current.filmGrain, amount: value } }))} />
          <SliderField label="Размер зерна" value={vfx.filmGrain.size} min={1} max={3} step={1} onChange={(value) => setVfx((current) => ({ ...current, filmGrain: { ...current.filmGrain, size: value } }))} />
          <CheckboxField label="Монохромное" checked={vfx.filmGrain.monochrome} onChange={(value) => setVfx((current) => ({ ...current, filmGrain: { ...current.filmGrain, monochrome: value } }))} />
        </>}
      </PanelSection>

      <PanelSection title="Lens Distortion / Sharpen / Noise Reduction">
        <CheckboxField label="Lens Distortion" checked={vfx.lensDistortion.enabled} onChange={(enabled) => setEnabled("lens-distortion", enabled)} />
        {vfx.lensDistortion.enabled && <SliderField label="Barrel ← / pincushion →" value={vfx.lensDistortion.amount} min={-1} max={1} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, lensDistortion: { ...current.lensDistortion, amount: value } }))} />}
        <CheckboxField label="Sharpen" checked={vfx.sharpen.enabled} onChange={(enabled) => setEnabled("sharpen", enabled)} />
        {vfx.sharpen.enabled && <SliderField label="Sharpen amount" value={vfx.sharpen.amount} min={0.01} max={2} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, sharpen: { ...current.sharpen, amount: value } }))} />}
        <CheckboxField label="Noise Reduction" checked={vfx.noiseReduction.enabled} onChange={(enabled) => setEnabled("noise-reduction", enabled)} />
        {vfx.noiseReduction.enabled && <SliderField label="Denoise amount" value={vfx.noiseReduction.amount} min={0.01} max={1} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, noiseReduction: { ...current.noiseReduction, amount: value } }))} />}
        <CheckboxField label="Vignette" checked={vfx.vignette.enabled} onChange={(enabled) => setEnabled("vignette", enabled)} />
        {vfx.vignette.enabled && <><SliderField label="Vignette intensity" value={vfx.vignette.intensity} min={0.01} max={1} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, vignette: { ...current.vignette, intensity: value } }))} /><SliderField label="Размер центра" value={vfx.vignette.size} min={0.1} max={1} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, vignette: { ...current.vignette, size: value } }))} /></>}
      </PanelSection>

      <PanelSection title="LUT Pipeline" subtitle="пиксельный LUT stage после matte и до grain">
        <CheckboxField label="Включить LUT pipeline" checked={vfx.lutPipeline.enabled} onChange={(enabled) => setEnabled("lut-pipeline", enabled)} />
        <SelectField label="LUT" value={vfx.lutPipeline.preset} options={LUTS.map((item) => ({ value: item.id, label: item.label }))} onChange={(value) => setVfx((current) => ({ ...current, lutPipeline: { ...current.lutPipeline, preset: value as LutPreset } }))} />
        <SliderField label="LUT intensity" value={vfx.lutPipeline.intensity} min={0} max={1} step={0.01} onChange={(value) => setVfx((current) => ({ ...current, lutPipeline: { ...current.lutPipeline, intensity: value } }))} />
      </PanelSection>

      <PanelSection title="Composite Layers" subtitle="реальный стек video tracks: снизу вверх">
        <CheckboxField label="Включить композитинг слоёв" checked={project.compositing?.enabled !== false} onChange={(enabled) => updateProject((current) => ({ ...current, compositing: { enabled } }))} />
        <div className="space-y-1">
          {videoTracks.map((track, index) => (
            <div key={track.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${track.id === found.track.id || track.id === selectedTrackId ? "border-violet-400/40 bg-violet-500/10" : "border-white/10 bg-black/20"}`}>
              <button className="min-w-0 flex-1 truncate text-left text-[10px] text-slate-300" onClick={() => selectTrack(track.id)} title="Выбрать слой">{index === 0 ? "▾ " : "↥ "}{track.name} · {track.clips.length} клип.</button>
              <button className="rounded px-1 text-[10px] text-slate-400 hover:bg-white/10 disabled:opacity-30" disabled={index === 0} onClick={() => moveTrack(track.id, -1)} title="Поднять слой">↑</button>
              <button className="rounded px-1 text-[10px] text-slate-400 hover:bg-white/10 disabled:opacity-30" disabled={index === videoTracks.length - 1} onClick={() => moveTrack(track.id, 1)} title="Опустить слой">↓</button>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] leading-relaxed text-slate-500">Порядок дорожек определяет порядок отрисовки. Blend Mode выбранного клипа применяется только к его изолированному слою.</div>
      </PanelSection>

      <PanelSection title="Blend Modes" subtitle="Canvas globalCompositeOperation + FFmpeg masked blend">
        <SelectField label="Режим выбранного слоя" value={clip.blendMode ?? "normal"} options={BLEND_MODES.map((mode) => ({ value: mode, label: mode }))} onChange={(value) => patch((c) => ({ ...c, blendMode: value as BlendMode }))} />
      </PanelSection>

      <PanelSection title="Маска клипа">
        <CheckboxField label="Включить маску" checked={!!clip.mask?.enabled} onChange={(enabled) => patch((c) => ({ ...c, mask: c.mask ? { ...c.mask, enabled } : { ...defaultMask(), enabled } }))} />
        {clip.mask?.enabled && <>
          <SelectField label="Форма" value={clip.mask.shape} options={[{ value: "rect", label: "Прямоугольник" }, { value: "ellipse", label: "Эллипс" }, { value: "polygon", label: "Polygon" }]} onChange={(value) => patch((c) => ({ ...c, mask: { ...c.mask, shape: value as Mask["shape"] } }))} />
          <SliderField label="X" value={clip.mask.x.value} min={0} max={1} onChange={(value) => patch((c) => ({ ...c, mask: { ...c.mask, x: param(value) } }))} />
          <SliderField label="Y" value={clip.mask.y.value} min={0} max={1} onChange={(value) => patch((c) => ({ ...c, mask: { ...c.mask, y: param(value) } }))} />
          <SliderField label="Ширина" value={clip.mask.width.value} min={0.02} max={1} onChange={(value) => patch((c) => ({ ...c, mask: { ...c.mask, width: param(value) } }))} />
          <SliderField label="Высота" value={clip.mask.height.value} min={0.02} max={1} onChange={(value) => patch((c) => ({ ...c, mask: { ...c.mask, height: param(value) } }))} />
          <SliderField label="Feather, px" value={clip.mask.feather} min={0} max={80} step={1} onChange={(value) => patch((c) => ({ ...c, mask: { ...c.mask, feather: value } }))} />
          <CheckboxField label="Инвертировать" checked={clip.mask.inverted} onChange={(value) => patch((c) => ({ ...c, mask: { ...c.mask, inverted: value } }))} />
        </>}
      </PanelSection>

      {note && <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-300">{note}</div>}
    </div>
  );
}
