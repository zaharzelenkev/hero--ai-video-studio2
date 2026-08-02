"use client";

import { useProjectStore, findClip } from "@/store/projectStore";
import { param } from "@/lib/types";
import type { Clip, MotionGraphicConfig, MotionGraphicKind, TextClip } from "@/lib/types";
import {
  MG_KIND_MAP,
  MG_KINDS,
  defaultMotionGraphic,
  mgIcon,
  mgLabel,
} from "@/lib/motionGraphics";
import { TEXT_FONTS } from "@/lib/presets";
import { PanelSection, ToggleButton, EmptyHint, SliderField, SelectField, ColorField, NumberField, CheckboxField, TextField } from "./ui";

const ANIM_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Без анимации" },
  { value: "fade", label: "Fade" },
  { value: "slide-up", label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "pop", label: "Pop" },
  { value: "elastic", label: "Elastic" },
  { value: "stomp", label: "Stomp" },
  { value: "glitch", label: "Glitch" },
  { value: "typewriter", label: "Typewriter" },
  { value: "blur-in", label: "Blur In" },
  { value: "scale-in", label: "Scale In" },
  { value: "rotate-in", label: "Rotate In" },
  { value: "zoom", label: "Zoom" },
];

const CALL_OUT_STYLES: { value: string; label: string }[] = [
  { value: "bubble", label: "Пузырь" },
  { value: "box", label: "Плашка" },
  { value: "underline", label: "Подчёркивание" },
  { value: "highlight", label: "Маркер" },
  { value: "sticker", label: "Стикер" },
];

const CTA_STYLES: { value: string; label: string }[] = [
  { value: "button", label: "Кнопка" },
  { value: "bar", label: "Полоса" },
  { value: "card", label: "Карточка" },
];

const TRACKING_DIRS: { value: string; label: string }[] = [
  { value: "left", label: "Слева направо (бегущая строка)" },
  { value: "right", label: "Справа налево" },
  { value: "up", label: "Снизу вверх (тикер)" },
  { value: "down", label: "Сверху вниз" },
];

const KINETIC_STYLES: { value: string; label: string }[] = [
  { value: "wordBurst", label: "Word Burst" },
  { value: "wave", label: "Wave" },
  { value: "stomp", label: "Stomp" },
  { value: "elastic", label: "Elastic" },
  { value: "glitch", label: "Glitch" },
  { value: "typewriter", label: "Typewriter" },
  { value: "flip", label: "Flip" },
];

const CAPTION_STYLES: { value: string; label: string }[] = [
  { value: "classic", label: "Классика" },
  { value: "box", label: "Плашка" },
  { value: "highlight", label: "Маркер" },
  { value: "pop", label: "Pop" },
  { value: "karaoke", label: "Karaoke" },
];

const LOGO_STYLES: { value: string; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "zoom", label: "Zoom" },
  { value: "slide", label: "Slide" },
  { value: "rotate", label: "Rotate" },
  { value: "bounce", label: "Bounce" },
];

/** Виды, у которых есть кикер. */
const HAS_KICKER: MotionGraphicKind[] = ["title", "lowerThird", "logoReveal", "intro", "outro"];
/** Виды с подзаголовком. */
const HAS_SUBTEXT: MotionGraphicKind[] = ["title", "lowerThird", "intro", "outro"];
/** Виды с текстом как основным полем. */
const HAS_MAIN_TEXT: MotionGraphicKind[] = ["title", "lowerThird", "callout", "animatedCaptions", "logoReveal", "intro", "outro", "subtitle", "trackingText", "kinetic", "progressBar"];

export default function MotionGraphicsPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);
  const addMotionGraphic = useProjectStore((s) => s.addMotionGraphic);
  const selectClip = useProjectStore((s) => s.selectClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const setActivePage = useProjectStore((s) => s.setActivePage);

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const found = findClip(project, selectedClipId);
  const clip = found && (found.clip.type === "text" || found.clip.type === "subtitle") ? (found.clip as TextClip) : null;
  const mg = clip?.motionGraphic ?? null;

  const mgClips = project.tracks
    .filter((t) => t.type === "text" || t.type === "subtitle")
    .flatMap((t) => t.clips)
    .filter((c) => (c as TextClip).motionGraphic) as TextClip[];

  const patch = (fn: (c: TextClip, cfg: MotionGraphicConfig) => TextClip) => {
    if (!clip || !mg) return;
    updateClip(clip.id, (c) => {
      const tc = c as TextClip;
      const cfg = tc.motionGraphic;
      if (!cfg) return c;
      return fn(tc, cfg) as Clip;
    });
  };

  const patchCfg = (fn: (cfg: MotionGraphicConfig) => MotionGraphicConfig) => {
    patch((c, cfg) => ({ ...c, motionGraphic: fn(cfg) }));
  };

  /* ------------------------- галерея видов ------------------------- */
  if (!clip || !mg) {
    return (
      <div className="space-y-3">
        <PanelSection title="Моушн-графика" subtitle={`${mgClips.length} на таймлайне`}>
          <div className="grid grid-cols-2 gap-1.5">
            {MG_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => addMotionGraphic(kind.id)}
                title={kind.desc}
                className="group rounded-xl border border-white/10 bg-white/[0.03] p-2 text-left transition hover:border-violet-400/40 hover:bg-violet-500/10"
              >
                <div className="flex items-center gap-1.5 text-[13px]">
                  <span>{kind.icon}</span>
                  <span className="truncate text-[11px] font-bold text-slate-100">{kind.label}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-slate-500 group-hover:text-slate-400">{kind.desc}</p>
                <div className="mt-1.5 text-[10px] font-bold text-violet-300">＋ Добавить</div>
              </button>
            ))}
          </div>
        </PanelSection>

        {mgClips.length > 0 && (
          <PanelSection title="На таймлайне">
            <div className="flex flex-wrap gap-1.5">
              {mgClips.map((c) => (
                <ToggleButton key={c.id} onClick={() => selectClip(c.id)} title={`${c.start.toFixed(2)}s — ${(c.start + c.duration).toFixed(2)}s`}>
                  {mgIcon(c.motionGraphic!.kind)} {mgLabel(c.motionGraphic!.kind)} · {(c.text || "").slice(0, 14) || c.name}
                </ToggleButton>
              ))}
            </div>
          </PanelSection>
        )}

        {clip && !mg && (
          <PanelSection title="Обычный титр">
            <EmptyHint>
              Это обычный титр. Настройки моушн-графики появятся здесь после преобразования:
            </EmptyHint>
            <div className="mt-2">
              <ToggleButton tone="accent" onClick={() => patchConvert(setActivePage)}>
                🪄 Преобразовать в моушн-графику
              </ToggleButton>
            </div>
          </PanelSection>
        )}
      </div>
    );
  }

  /* ---------------------- редактор моушн-графики ---------------------- */
  const kind = mg.kind;
  const setKind = (k: MotionGraphicKind) => {
    patch((c) => {
      const fresh = defaultMotionGraphic(k);
      return {
        ...c,
        // Основной текст сохраняется, остальное — дефолты нового вида.
        motionGraphic: fresh,
        fontSize: MG_KIND_MAP[k].fontSize,
        name: `${mgIcon(k)} ${mgLabel(k)}`,
      };
    });
  };

  const imageAssets = project.assets.filter((a) => a.kind === "image");

  return (
    <div className="space-y-3">
      {/* Тип и текст */}
      <PanelSection title="Вид" subtitle={`${mgLabel(kind)} · ${clip.duration.toFixed(2)}с`}>
        <SelectField
          label="Тип моушн-графики"
          value={kind}
          options={MG_KINDS.map((k) => ({ value: k.id, label: `${k.icon} ${k.label}` }))}
          onChange={(v) => setKind(v as MotionGraphicKind)}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label="Длительность, сек" value={clip.duration} min={0.3} max={120} step={0.1} onChange={(v) => updateClip(clip.id, (c) => ({ ...c, duration: Math.max(0.3, v) } as Clip))} />
          <NumberField label="Кегль (1080p)" value={clip.fontSize} min={10} max={400} step={1} onChange={(v) => patch((c) => ({ ...c, fontSize: v, style: { ...(c.style ?? { fontFamily: c.fontFamily, fontSize: c.fontSize, color: c.color, backgroundColor: "transparent" }), fontSize: v } }))} />
        </div>
        {HAS_MAIN_TEXT.includes(kind) && (
          <div className="mt-2">
            <TextField label="Основной текст" rows={2} value={clip.text} onChange={(v) => patch((c) => ({ ...c, text: v }))} />
          </div>
        )}
        {HAS_KICKER.includes(kind) && (
          <div className="mt-2">
            <TextField label="Кикер (верхняя надпись)" value={mg.kicker} onChange={(v) => patchCfg((cfg) => ({ ...cfg, kicker: v }))} />
          </div>
        )}
        {HAS_SUBTEXT.includes(kind) && (
          <div className="mt-2">
            <TextField label="Подзаголовок" value={mg.subtext} onChange={(v) => patchCfg((cfg) => ({ ...cfg, subtext: v }))} />
          </div>
        )}
        {(kind === "cta" || kind === "outro") && (
          <div className="mt-2 space-y-2">
            <TextField label="Текст кнопки CTA" value={mg.ctaLabel} onChange={(v) => patchCfg((cfg) => ({ ...cfg, ctaLabel: v }))} />
            {kind === "cta" && <TextField label="Подпись под CTA" value={mg.ctaSubtext} onChange={(v) => patchCfg((cfg) => ({ ...cfg, ctaSubtext: v }))} />}
          </div>
        )}
        {(kind === "logoReveal" || kind === "intro" || kind === "outro") && (
          <div className="mt-2 space-y-2">
            <TextField label="Логотип-монограмма" value={mg.logoText} onChange={(v) => patchCfg((cfg) => ({ ...cfg, logoText: v }))} />
            <SelectField
              label="Логотип-картинка (из медиатеки)"
              value={mg.logoAssetId ?? ""}
              options={[{ value: "", label: "— Монограмма —" }, ...imageAssets.map((a) => ({ value: a.id, label: a.name }))]}
              onChange={(v) => patchCfg((cfg) => ({ ...cfg, logoAssetId: v || null }))}
            />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <CheckboxField label="Все буквы заглавные" checked={mg.uppercase} onChange={(v) => patchCfg((cfg) => ({ ...cfg, uppercase: v }))} />
        </div>
      </PanelSection>

      {/* Шрифт */}
      <PanelSection title="Шрифт">
        <SelectField
          label="Гарнитура"
          value={clip.fontFamily}
          options={TEXT_FONTS.map((f) => ({ value: f, label: f }))}
          onChange={(v) => patch((c) => ({ ...c, fontFamily: v, style: { ...(c.style ?? { fontFamily: c.fontFamily, fontSize: c.fontSize, color: c.color, backgroundColor: "transparent" }), fontFamily: v } }))}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label="Насыщенность" value={mg.fontWeight} min={100} max={900} step={100} onChange={(v) => patchCfg((cfg) => ({ ...cfg, fontWeight: v }))} />
          <NumberField label="Межбуквенный интервал" value={mg.letterSpacing} min={-5} max={40} step={0.5} onChange={(v) => patchCfg((cfg) => ({ ...cfg, letterSpacing: v }))} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label="Межстрочный интервал" value={mg.lineHeight} min={0.8} max={2.2} step={0.02} onChange={(v) => patchCfg((cfg) => ({ ...cfg, lineHeight: v }))} />
          <div className="flex items-end pb-1">
            <CheckboxField label="Курсив" checked={mg.italic} onChange={(v) => patchCfg((cfg) => ({ ...cfg, italic: v }))} />
          </div>
        </div>
      </PanelSection>

      {/* Цвета и оформление */}
      <PanelSection title="Цвета и оформление">
        <ColorField label="Цвет текста" value={clip.color || "#ffffff"} onChange={(v) => patch((c) => ({ ...c, color: v }))} />
        <ColorField label="Акцент (линии, кнопки, бары)" value={mg.accentColor} onChange={(v) => patchCfg((cfg) => ({ ...cfg, accentColor: v }))} />
        <ColorField label="Вторичный текст" value={mg.secondaryColor} onChange={(v) => patchCfg((cfg) => ({ ...cfg, secondaryColor: v }))} />
        <ColorField label="Цвет подложки" value={mg.backgroundColor.startsWith("#") ? mg.backgroundColor : "#0b0b14"} onChange={(v) => patchCfg((cfg) => ({ ...cfg, backgroundColor: v }))} />
        <SliderField label="Непрозрачность подложки" value={mg.panelOpacity} min={0} max={1} onChange={(v) => patchCfg((cfg) => ({ ...cfg, panelOpacity: v }))} display={(v) => `${Math.round(v * 100)}%`} />
        <CheckboxField label="Без подложки" checked={mg.panelOpacity < 0.02} onChange={(v) => patchCfg((cfg) => ({ ...cfg, panelOpacity: v ? 0 : 0.75 }))} />
        <NumberField label="Скругление углов, px" value={mg.radius} min={0} max={120} step={1} onChange={(v) => patchCfg((cfg) => ({ ...cfg, radius: v }))} />
        <div className="mt-2 space-y-1">
          <CheckboxField label="Тень" checked={mg.shadowEnabled} onChange={(v) => patchCfg((cfg) => ({ ...cfg, shadowEnabled: v }))} />
          {mg.shadowEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <ColorField label="Цвет тени" value={mg.shadowColor} onChange={(v) => patchCfg((cfg) => ({ ...cfg, shadowColor: v }))} />
              <NumberField label="Размытие тени" value={mg.shadowBlur} min={0} max={120} step={1} onChange={(v) => patchCfg((cfg) => ({ ...cfg, shadowBlur: v }))} />
            </div>
          )}
          <CheckboxField label="Обводка текста" checked={mg.outlineEnabled} onChange={(v) => patchCfg((cfg) => ({ ...cfg, outlineEnabled: v }))} />
          {mg.outlineEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <ColorField label="Цвет обводки" value={mg.outlineColor} onChange={(v) => patchCfg((cfg) => ({ ...cfg, outlineColor: v }))} />
              <NumberField label="Толщина обводки" value={mg.outlineWidth} min={1} max={30} step={1} onChange={(v) => patchCfg((cfg) => ({ ...cfg, outlineWidth: v }))} />
            </div>
          )}
        </div>
      </PanelSection>

      {/* Анимация */}
      <PanelSection title="Анимация">
        <SelectField label="Вход" value={mg.animationIn} options={ANIM_OPTIONS} onChange={(v) => patchCfg((cfg) => ({ ...cfg, animationIn: v as MotionGraphicConfig["animationIn"] }))} />
        <div className="mt-2">
          <SelectField label="Выход" value={mg.animationOut} options={ANIM_OPTIONS} onChange={(v) => patchCfg((cfg) => ({ ...cfg, animationOut: v as MotionGraphicConfig["animationOut"] }))} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label="Длит. входа, сек" value={mg.inDuration} min={0} max={3} step={0.05} onChange={(v) => patchCfg((cfg) => ({ ...cfg, inDuration: v }))} />
          <NumberField label="Длит. выхода, сек" value={mg.outDuration} min={0} max={3} step={0.05} onChange={(v) => patchCfg((cfg) => ({ ...cfg, outDuration: v }))} />
        </div>
        {(kind === "kinetic" || kind === "animatedCaptions" || kind === "subtitle") && (
          <div className="mt-2">
            <SliderField label="Пауза между словами, сек" value={mg.kineticStagger} min={0.04} max={0.6} step={0.01} onChange={(v) => patchCfg((cfg) => ({ ...cfg, kineticStagger: v }))} display={(v) => `${v.toFixed(2)}с`} />
          </div>
        )}
      </PanelSection>

      {/* Вид-специфичные настройки */}
      {kind === "progressBar" && (
        <PanelSection title="Progress Bar">
          <SliderField label="Прогресс" value={mg.progress.value} min={0} max={1} step={0.01} onChange={(v) => patchCfg((cfg) => ({ ...cfg, progress: param(v) }))} display={(v) => `${Math.round(v * 100)}%`} />
          <div className="flex flex-wrap gap-1.5">
            <ToggleButton
              tone="accent"
              onClick={() =>
                patchCfg((cfg) => ({
                  ...cfg,
                  progress: {
                    value: 0,
                    keyframes: [
                      { id: "mgp_in", time: 0, value: 0, easing: "easeInOut" },
                      { id: "mgp_out", time: clip.duration, value: 1, easing: "easeInOut" },
                    ],
                  },
                }))
              }
            >
              ⚡ Анимировать 0 → 100%
            </ToggleButton>
            <ToggleButton onClick={() => patchCfg((cfg) => ({ ...cfg, progress: param(mg.progress.value ?? 0.4) }))}>
              ↺ Убрать ключи
            </ToggleButton>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <SliderField label="Ширина бара" value={mg.barWidth} min={0.15} max={0.95} onChange={(v) => patchCfg((cfg) => ({ ...cfg, barWidth: v }))} display={(v) => `${Math.round(v * 100)}%`} />
            <NumberField label="Толщина, px" value={mg.barThickness} min={4} max={60} step={1} onChange={(v) => patchCfg((cfg) => ({ ...cfg, barThickness: v }))} />
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <CheckboxField label="Скруглённый" checked={mg.barRounded} onChange={(v) => patchCfg((cfg) => ({ ...cfg, barRounded: v }))} />
            <CheckboxField label="Проценты" checked={mg.showPercent} onChange={(v) => patchCfg((cfg) => ({ ...cfg, showPercent: v }))} />
            <CheckboxField label="Подпись" checked={mg.showLabel} onChange={(v) => patchCfg((cfg) => ({ ...cfg, showLabel: v }))} />
          </div>
        </PanelSection>
      )}

      {kind === "callout" && (
        <PanelSection title="Callout">
          <SelectField label="Стиль выноски" value={mg.calloutStyle} options={CALL_OUT_STYLES} onChange={(v) => patchCfg((cfg) => ({ ...cfg, calloutStyle: v as MotionGraphicConfig["calloutStyle"] }))} />
        </PanelSection>
      )}

      {kind === "cta" && (
        <PanelSection title="CTA">
          <SelectField label="Стиль" value={mg.ctaStyle} options={CTA_STYLES} onChange={(v) => patchCfg((cfg) => ({ ...cfg, ctaStyle: v as MotionGraphicConfig["ctaStyle"] }))} />
        </PanelSection>
      )}

      {kind === "trackingText" && (
        <PanelSection title="Tracking Text">
          <SelectField label="Направление" value={mg.trackingDirection} options={TRACKING_DIRS} onChange={(v) => patchCfg((cfg) => ({ ...cfg, trackingDirection: v as MotionGraphicConfig["trackingDirection"] }))} />
          <div className="mt-2">
            <SliderField label="Скорость" value={mg.trackingSpeed} min={0.02} max={1.2} step={0.01} onChange={(v) => patchCfg((cfg) => ({ ...cfg, trackingSpeed: v }))} display={(v) => `${v.toFixed(2)} кадра/с`} />
          </div>
        </PanelSection>
      )}

      {kind === "kinetic" && (
        <PanelSection title="Kinetic Typography">
          <SelectField label="Стиль" value={mg.kineticStyle} options={KINETIC_STYLES} onChange={(v) => patchCfg((cfg) => ({ ...cfg, kineticStyle: v as MotionGraphicConfig["kineticStyle"] }))} />
        </PanelSection>
      )}

      {(kind === "animatedCaptions" || kind === "subtitle") && (
        <PanelSection title="Стиль подписей">
          <SelectField label="Стиль" value={mg.captionStyle} options={CAPTION_STYLES} onChange={(v) => patchCfg((cfg) => ({ ...cfg, captionStyle: v as MotionGraphicConfig["captionStyle"] }))} />
        </PanelSection>
      )}

      {kind === "logoReveal" && (
        <PanelSection title="Logo Reveal">
          <SelectField label="Стиль появления" value={mg.logoStyle} options={LOGO_STYLES} onChange={(v) => patchCfg((cfg) => ({ ...cfg, logoStyle: v as MotionGraphicConfig["logoStyle"] }))} />
        </PanelSection>
      )}

      {/* Положение */}
      <PanelSection title="Положение">
        <SliderField label="X" value={clip.x?.value ?? 0} min={-0.6} max={0.6} onChange={(v) => patch((c) => ({ ...c, x: param(v) }))} />
        <SliderField label="Y" value={clip.y?.value ?? 0} min={-0.6} max={0.6} onChange={(v) => patch((c) => ({ ...c, y: param(v) }))} />
        <SliderField label="Масштаб" value={clip.scale?.value ?? 1} min={0.2} max={3} onChange={(v) => patch((c) => ({ ...c, scale: param(v) }))} />
        <SliderField label="Прозрачность" value={clip.opacity?.value ?? 1} min={0} max={1} onChange={(v) => patch((c) => ({ ...c, opacity: param(v) }))} />
        <div className="flex flex-wrap gap-1.5">
          <ToggleButton onClick={() => patch((c) => ({ ...c, y: param(-0.3) }))}>↑ Верх</ToggleButton>
          <ToggleButton onClick={() => patch((c) => ({ ...c, y: param(0) }))}>• Центр</ToggleButton>
          <ToggleButton onClick={() => patch((c) => ({ ...c, y: param(0.34) }))}>↓ Низ</ToggleButton>
          <ToggleButton onClick={() => patch((c) => ({ ...c, x: param(-0.42) }))}>← Лево</ToggleButton>
          <ToggleButton onClick={() => patch((c) => ({ ...c, x: param(0.42) }))}>→ Право</ToggleButton>
        </div>
      </PanelSection>

      {/* Действия */}
      <PanelSection title="Клип">
        <div className="flex flex-wrap gap-1.5">
          <ToggleButton onClick={() => duplicateClip(clip.id)}>⧉ Дублировать</ToggleButton>
          <ToggleButton tone="danger" onClick={() => removeClip(clip.id)}>🗑 Удалить</ToggleButton>
        </div>
        {mgClips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mgClips.filter((c) => c.id !== clip.id).map((c) => (
              <ToggleButton key={c.id} onClick={() => selectClip(c.id)}>
                {mgIcon(c.motionGraphic!.kind)} {mgLabel(c.motionGraphic!.kind)}
              </ToggleButton>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  );
}

/** Преобразование обычного титра в моушн-графику. */
function patchConvert(setActivePage: (page: "motion") => void) {
  const state = useProjectStore.getState();
  const found = findClip(state.project, state.selectedClipId);
  if (!found || found.clip.type !== "text") return;
  const tc = found.clip as TextClip;
  if (tc.motionGraphic) return;
  const cfg = defaultMotionGraphic("title");
  state.updateClip(tc.id, (c) => {
    const clip = c as TextClip;
    const converted: TextClip = {
      ...clip,
      name: `${mgIcon("title")} ${mgLabel("title")}`,
      motionGraphic: { ...cfg, kicker: "НОВЫЙ ПРОЕКТ", subtext: "" },
      style: {
        ...(clip.style ?? { fontFamily: clip.fontFamily, fontSize: clip.fontSize, color: clip.color, backgroundColor: "transparent" }),
        fontWeight: cfg.fontWeight,
      },
    };
    return converted as Clip;
  });
  setActivePage("motion");
}
