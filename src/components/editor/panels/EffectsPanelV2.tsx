"use client";

import { useState } from "react";
import { useProjectStore, findClip } from "@/store/projectStore";
import { param } from "@/lib/types";
import type { BlendMode, Clip, Mask, VideoClip } from "@/lib/types";
import { EFFECT_PRESETS } from "@/lib/presets";
import { renderFrame } from "@/lib/editor/compositor";
import { PanelSection, ToggleButton, EmptyHint, SliderField, SelectField, ColorField, CheckboxField } from "./ui";

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

function defaultMask(): Mask {
  return { enabled: true, shape: "rect", x: param(0.1), y: param(0.1), width: param(0.8), height: param(0.8), feather: 12, inverted: false };
}

export default function EffectsPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const [note, setNote] = useState("");

  const found = findClip(project, selectedClipId);
  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;
  if (!found || (found.clip.type !== "video" && found.clip.type !== "image")) {
    return <EmptyHint>Выберите видео- или фото-клип, чтобы добавить эффекты, хромакей или маску.</EmptyHint>;
  }

  const clip = found.clip as VideoClip;
  const patch = (fn: (c: VideoClip) => VideoClip) => updateClip(clip.id, (c) => fn(c as VideoClip) as Clip);

  const toggleEffect = (id: string) =>
    patch((c) => {
      const effects = c.effects ?? [];
      return { ...c, effects: effects.includes(id) ? effects.filter((e) => e !== id) : [...effects, id] };
    });

  /** Берём цвет фона прямо из текущего кадра — как пипетка в NLE. */
  const pickKeyColor = () => {
    const offscreen = document.createElement("canvas");
    offscreen.width = 160;
    offscreen.height = 90;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    renderFrame(ctx, project, playhead);
    const { data } = ctx.getImageData(2, 2, 6, 6);
    let r = 0;
    let g = 0;
    let b = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const hex = `#${[r / pixels, g / pixels, b / pixels]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")}`;
    patch((c) => ({ ...c, chroma: { ...c.chroma, enabled: true, color: hex } }));
    setNote(`Ключевой цвет: ${hex} (взят из левого верхнего угла кадра)`);
    setTimeout(() => setNote(""), 2600);
  };

  const mask = clip.mask;

  return (
    <div className="space-y-3">
      <PanelSection title="Эффекты" subtitle="применяются и в превью, и при экспорте">
        <div className="flex flex-wrap gap-1.5">
          {EFFECT_PRESETS.map((preset) => (
            <ToggleButton key={preset.id} active={clip.effects?.includes(preset.id)} onClick={() => toggleEffect(preset.id)}>
              {preset.label}
            </ToggleButton>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Хромакей">
        <CheckboxField
          label="Включить удаление фона"
          checked={!!clip.chroma?.enabled}
          onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, enabled: v } }))}
        />
        <ColorField label="Ключевой цвет" value={clip.chroma?.color ?? "#00ff00"} onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, color: v } }))} />
        <SliderField
          label="Схожесть"
          value={clip.chroma?.similarity ?? 0.22}
          min={0.01}
          max={0.9}
          step={0.01}
          onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, similarity: v } }))}
        />
        <SliderField
          label="Смешивание края"
          value={clip.chroma?.blend ?? 0.12}
          min={0.01}
          max={0.6}
          step={0.01}
          onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, blend: v } }))}
        />
        <ToggleButton onClick={pickKeyColor}>💧 Взять цвет из кадра</ToggleButton>
        {note && <div className="mt-1 text-[10px] text-emerald-400">{note}</div>}
      </PanelSection>

      <PanelSection title="Маска">
        <CheckboxField
          label="Включить маску"
          checked={!!mask?.enabled}
          onChange={(v) => patch((c) => ({ ...c, mask: c.mask ? { ...c.mask, enabled: v } : { ...defaultMask(), enabled: v } }))}
        />
        {mask?.enabled && (
          <>
            <SelectField
              label="Форма"
              value={mask.shape}
              options={[
                { value: "rect", label: "Прямоугольник" },
                { value: "ellipse", label: "Эллипс" },
              ]}
              onChange={(v) => patch((c) => ({ ...c, mask: { ...c.mask, shape: v as Mask["shape"] } }))}
            />
            <div className="mt-2">
              <SliderField label="X" value={mask.x.value} min={0} max={1} onChange={(v) => patch((c) => ({ ...c, mask: { ...c.mask, x: param(v) } }))} />
              <SliderField label="Y" value={mask.y.value} min={0} max={1} onChange={(v) => patch((c) => ({ ...c, mask: { ...c.mask, y: param(v) } }))} />
              <SliderField label="Ширина" value={mask.width.value} min={0.02} max={1} onChange={(v) => patch((c) => ({ ...c, mask: { ...c.mask, width: param(v) } }))} />
              <SliderField label="Высота" value={mask.height.value} min={0.02} max={1} onChange={(v) => patch((c) => ({ ...c, mask: { ...c.mask, height: param(v) } }))} />
              <SliderField label="Растушёвка, px" value={mask.feather} min={0} max={80} step={1} onChange={(v) => patch((c) => ({ ...c, mask: { ...c.mask, feather: v } }))} />
              <CheckboxField label="Инвертировать" checked={mask.inverted} onChange={(v) => patch((c) => ({ ...c, mask: { ...c.mask, inverted: v } }))} />
            </div>
          </>
        )}
      </PanelSection>

      <PanelSection title="Композитинг">
        <SelectField
          label="Режим наложения"
          value={clip.blendMode ?? "normal"}
          options={BLEND_MODES.map((m) => ({ value: m, label: m }))}
          onChange={(v) => patch((c) => ({ ...c, blendMode: v as BlendMode }))}
        />
        <div className="mt-2">
          <CheckboxField
            label="Motion blur"
            checked={!!clip.motionBlur?.enabled}
            onChange={(v) =>
              patch((c) => ({
                ...c,
                motionBlur: { enabled: v, samples: c.motionBlur?.samples ?? 8, shutterAngle: c.motionBlur?.shutterAngle ?? 180 },
              }))
            }
          />
          {clip.motionBlur?.enabled && (
            <SliderField
              label="Сила"
              value={clip.motionBlur.samples}
              min={2}
              max={32}
              step={1}
              onChange={(v) =>
                patch((c) => ({ ...c, motionBlur: { enabled: true, samples: v, shutterAngle: c.motionBlur?.shutterAngle ?? 180 } }))
              }
            />
          )}
        </div>
      </PanelSection>
    </div>
  );
}
