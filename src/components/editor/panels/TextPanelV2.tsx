"use client";

import { useProjectStore, findClip } from "@/store/projectStore";
import { param } from "@/lib/types";
import type { Clip, TextAnimation, TextClip } from "@/lib/types";
import { TEXT_FONTS } from "@/lib/presets";
import { applyTextAnimation } from "@/lib/textAnimations";
import { PanelSection, ToggleButton, EmptyHint, SliderField, SelectField, ColorField, NumberField, CheckboxField } from "./ui";

const ANIMATIONS: TextAnimation[] = [
  "none",
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "pop",
  "typewriter",
  "blur-in",
  "scale-in",
  "bounce",
];

interface TitlePreset {
  id: string;
  label: string;
  apply: (clip: TextClip) => TextClip;
}

const PRESETS: TitlePreset[] = [
  {
    id: "headline",
    label: "Заголовок",
    apply: (c) => ({
      ...c,
      fontSize: 86,
      align: "center",
      x: param(0),
      y: param(-0.12),
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 0,
      backgroundColor: "transparent",
      style: { ...(c.style ?? { fontFamily: c.fontFamily, fontSize: 86, color: "#fff", backgroundColor: "transparent" }), fontWeight: 900 },
    }),
  },
  {
    id: "lower-third",
    label: "Нижняя треть",
    apply: (c) => ({
      ...c,
      fontSize: 46,
      align: "left",
      x: param(-0.26),
      y: param(0.3),
      backgroundColor: "rgba(0,0,0,0.55)",
      color: "#ffffff",
      strokeWidth: 0,
    }),
  },
  {
    id: "subtitle",
    label: "Субтитр",
    apply: (c) => ({
      ...c,
      fontSize: 42,
      align: "center",
      x: param(0),
      y: param(0.36),
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 5,
      backgroundColor: "transparent",
    }),
  },
  {
    id: "callout",
    label: "Акцент",
    apply: (c) => ({
      ...c,
      fontSize: 64,
      align: "center",
      x: param(0),
      y: param(0),
      color: "#fde68a",
      backgroundColor: "transparent",
      strokeColor: "#111827",
      strokeWidth: 6,
    }),
  },
];

export default function TextPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);
  const addTextClip = useProjectStore((s) => s.addTextClip);
  const selectClip = useProjectStore((s) => s.selectClip);

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const found = findClip(project, selectedClipId);
  const clip = found && (found.clip.type === "text" || found.clip.type === "subtitle") ? (found.clip as TextClip) : null;
  const textClips = project.tracks.filter((t) => t.type === "text" || t.type === "subtitle").flatMap((t) => t.clips);

  const patch = (fn: (c: TextClip) => TextClip) => {
    if (!clip) return;
    updateClip(clip.id, (c) => fn(c as TextClip) as Clip);
  };

  if (!clip) {
    return (
      <div className="space-y-3">
        <PanelSection title="Титры">
          <ToggleButton tone="accent" onClick={() => addTextClip()}>
            ＋ Добавить титр на плейхеде
          </ToggleButton>
          {textClips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {textClips.map((c) => (
                <ToggleButton key={c.id} onClick={() => selectClip(c.id)}>
                  {(c as TextClip).text?.slice(0, 18) || c.name}
                </ToggleButton>
              ))}
            </div>
          )}
        </PanelSection>
        <EmptyHint>Выберите титр на таймлайне или создайте новый — здесь появятся шрифт, стиль и анимация.</EmptyHint>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PanelSection title="Текст" subtitle={`${clip.duration.toFixed(2)}с`}>
        <textarea
          value={clip.text}
          onChange={(e) => patch((c) => ({ ...c, text: e.target.value }))}
          rows={3}
          className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-slate-100 outline-none focus:border-violet-400/50"
          aria-label="Текст титра"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <ToggleButton key={preset.id} onClick={() => patch(preset.apply)}>
              {preset.label}
            </ToggleButton>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Шрифт и цвет">
        <SelectField
          label="Гарнитура"
          value={clip.fontFamily}
          options={TEXT_FONTS.map((f) => ({ value: f, label: f }))}
          onChange={(v) => patch((c) => ({ ...c, fontFamily: v }))}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label="Кегль" value={clip.fontSize} min={8} max={300} step={1} onChange={(v) => patch((c) => ({ ...c, fontSize: v }))} />
          <NumberField
            label="Насыщенность"
            value={clip.style?.fontWeight ?? 700}
            min={100}
            max={900}
            step={100}
            onChange={(v) =>
              patch((c) => ({
                ...c,
                style: { ...(c.style ?? { fontFamily: c.fontFamily, fontSize: c.fontSize, color: c.color, backgroundColor: c.backgroundColor }), fontWeight: v },
              }))
            }
          />
        </div>
        <ColorField label="Цвет текста" value={clip.color || "#ffffff"} onChange={(v) => patch((c) => ({ ...c, color: v }))} />
        <ColorField
          label="Цвет подложки"
          value={clip.backgroundColor && clip.backgroundColor !== "transparent" ? clip.backgroundColor : "#000000"}
          onChange={(v) => patch((c) => ({ ...c, backgroundColor: v }))}
        />
        <CheckboxField
          label="Без подложки"
          checked={!clip.backgroundColor || clip.backgroundColor === "transparent"}
          onChange={(v) => patch((c) => ({ ...c, backgroundColor: v ? "transparent" : "#000000" }))}
        />
        <ColorField label="Цвет обводки" value={clip.strokeColor || "#000000"} onChange={(v) => patch((c) => ({ ...c, strokeColor: v }))} />
        <SliderField label="Толщина обводки" value={clip.strokeWidth ?? 0} min={0} max={20} step={0.5} onChange={(v) => patch((c) => ({ ...c, strokeWidth: v }))} />
        <SelectField
          label="Выравнивание"
          value={clip.align}
          options={[
            { value: "left", label: "По левому краю" },
            { value: "center", label: "По центру" },
            { value: "right", label: "По правому краю" },
          ]}
          onChange={(v) => patch((c) => ({ ...c, align: v as TextClip["align"] }))}
        />
      </PanelSection>

      <PanelSection title="Положение">
        <SliderField label="X" value={clip.x?.value ?? 0} min={-0.6} max={0.6} onChange={(v) => patch((c) => ({ ...c, x: param(v) }))} />
        <SliderField label="Y" value={clip.y?.value ?? 0} min={-0.6} max={0.6} onChange={(v) => patch((c) => ({ ...c, y: param(v) }))} />
        <SliderField label="Масштаб" value={clip.scale?.value ?? 1} min={0.2} max={3} onChange={(v) => patch((c) => ({ ...c, scale: param(v) }))} />
        <SliderField label="Прозрачность" value={clip.opacity?.value ?? 1} min={0} max={1} onChange={(v) => patch((c) => ({ ...c, opacity: param(v) }))} />
        <div className="flex flex-wrap gap-1.5">
          <ToggleButton onClick={() => patch((c) => ({ ...c, y: param(-0.3) }))}>↑ Верх</ToggleButton>
          <ToggleButton onClick={() => patch((c) => ({ ...c, y: param(0) }))}>• Центр</ToggleButton>
          <ToggleButton onClick={() => patch((c) => ({ ...c, y: param(0.32) }))}>↓ Низ</ToggleButton>
        </div>
      </PanelSection>

      <PanelSection title="Анимация">
        <SelectField
          label="Вход"
          value={clip.animationIn}
          options={ANIMATIONS.map((a) => ({ value: a, label: a }))}
          onChange={(v) => patch((c) => ({ ...c, animationIn: v as TextAnimation }))}
        />
        <div className="mt-2">
          <SelectField
            label="Выход"
            value={clip.animationOut}
            options={ANIMATIONS.map((a) => ({ value: a, label: a }))}
            onChange={(v) => patch((c) => ({ ...c, animationOut: v as TextAnimation }))}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ToggleButton
            tone="accent"
            onClick={() =>
              patch((c) => {
                const copy = JSON.parse(JSON.stringify(c)) as TextClip;
                applyTextAnimation(copy, copy.animationIn, copy.y?.value ?? 0, copy.duration);
                return copy;
              })
            }
            title="Пересчитать ключевые кадры под выбранную анимацию"
          >
            ⚡ Применить анимацию
          </ToggleButton>
          <ToggleButton
            onClick={() =>
              patch((c) => ({
                ...c,
                x: param(c.x?.value ?? 0),
                y: param(c.y?.value ?? 0),
                opacity: param(1),
                scale: param(c.scale?.value ?? 1),
              }))
            }
          >
            ↺ Убрать ключи
          </ToggleButton>
        </div>
      </PanelSection>
    </div>
  );
}
