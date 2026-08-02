"use client";

import { useEffect, useState } from "react";
import { useProjectStore, findClip } from "@/store/projectStore";
import { defaultVfx } from "@/lib/factories";
import { param } from "@/lib/types";
import type { BlendMode, Clip, VfxSettings, VideoClip } from "@/lib/types";
import { EFFECT_PRESETS } from "@/lib/presets";
import { renderFrame } from "@/lib/editor/compositor";
import { vfxBrush } from "@/lib/editor/vfxBrush";
import { bgRemovalService, interactiveSegmentService, type VfxModelStatus } from "@/lib/editor/mediaPipeVfx";
import { LUT_PRESETS_WITH_CUBE } from "@/lib/editor/lut";
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

const LUT_LABELS: Record<string, string> = {
  neutral: "Neutral",
  cinematic: "Cinematic",
  "teal-orange": "Teal&Orange",
  warm: "Warm",
  cool: "Cool",
  bw: "Ч/Б",
  vintage: "Vintage",
  vivid: "Vivid",
  moody: "Moody",
  dramatic: "Dramatic",
  "film-noir": "Noir",
  luxury: "Luxury",
};

function ModelStatus({ status }: { status: VfxModelStatus }) {
  const map: Record<VfxModelStatus, string> = {
    idle: "модель не загружена",
    loading: "загрузка модели…",
    ready: "модель готова",
    error: "ошибка (нет сети?)",
  };
  const color =
    status === "ready"
      ? "text-emerald-400"
      : status === "loading"
        ? "text-amber-400"
        : status === "error"
          ? "text-rose-400"
          : "text-slate-500";
  return <div className={`mt-1 text-[10px] ${color}`}>{map[status]}</div>;
}

/** Заголовок секции с выключателем эффекта. */
function EffectHeader({ title, enabled, onToggle, note }: { title: string; enabled: boolean; onToggle: (v: boolean) => void; note?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="accent-violet-500" />
      <span className="text-[11px] font-bold text-slate-200">{title}</span>
      {note && <span className="ml-auto text-[10px] text-slate-500">{note}</span>}
    </div>
  );
}

export default function EffectsPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const [note, setNote] = useState("");
  const [, force] = useState(0);

  // Подписка на состояние кисти и статусы моделей (перерисовка кнопок).
  useEffect(() => {
    const unsub = vfxBrush.subscribe(() => force((n) => n + 1));
    const timer = window.setInterval(() => force((n) => n + 1), 600);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  const found = findClip(project, selectedClipId);
  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;
  if (!found || (found.clip.type !== "video" && found.clip.type !== "image")) {
    return <EmptyHint>Выберите видео- или фото-клип, чтобы добавить эффекты, хромакей, удаление фона или маску.</EmptyHint>;
  }

  const clip = found.clip as VideoClip;
  const patch = (fn: (c: VideoClip) => VideoClip) => updateClip(clip.id, (c) => fn(c as VideoClip) as Clip);
  const vfx: VfxSettings = clip.vfx ?? defaultVfx();
  const setVfx = (fn: (v: VfxSettings) => VfxSettings) => patch((c) => ({ ...c, vfx: fn(c.vfx ?? defaultVfx()) }));

  const showNote = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(""), 2600);
  };

  const toggleEffect = (id: string) =>
    patch((c) => {
      const effects = c.effects ?? [];
      return { ...c, effects: effects.includes(id) ? effects.filter((e) => e !== id) : [...effects, id] };
    });

  /** Пипетка: берём ключевой цвет из текущего кадра. */
  const pickKeyColor = () => {
    const offscreen = document.createElement("canvas");
    offscreen.width = 160;
    offscreen.height = 90;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx || !project) return;
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
    showNote(`Ключевой цвет: ${hex} (из левого верхнего угла кадра)`);
  };

  const brushActive = vfxBrush.isActive(clip.id);

  return (
    <div className="space-y-3">
      {note && <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">{note}</div>}

      {/* ---------------- Хромакей ---------------- */}
      <PanelSection title="Хромакей" subtitle="зелёный / синий экран">
        <CheckboxField
          label="Включить хромакей"
          checked={!!clip.chroma?.enabled}
          onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, enabled: v } }))}
        />
        {clip.chroma?.enabled && (
          <>
            <ColorField label="Ключевой цвет" value={clip.chroma?.color ?? "#00ff00"} onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, color: v } }))} />
            <SliderField label="Схожесть" value={clip.chroma?.similarity ?? 0.22} min={0.01} max={0.9} step={0.01} onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, similarity: v } }))} />
            <SliderField label="Мягкость края" value={clip.chroma?.blend ?? 0.12} min={0.01} max={0.6} step={0.01} onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, blend: v } }))} />
            <SliderField label="Деспилл (убрать ореол)" value={clip.chroma?.despill ?? 0.35} min={0} max={1} step={0.01} onChange={(v) => patch((c) => ({ ...c, chroma: { ...c.chroma, despill: v } }))} />
            <div className="mt-1 flex gap-1.5">
              <ToggleButton onClick={pickKeyColor}>💧 Взять цвет из кадра</ToggleButton>
              <ToggleButton
                onClick={() =>
                  patch((c) => ({
                    ...c,
                    chroma: { ...c.chroma, enabled: false, color: "#00ff00", similarity: 0.22, blend: 0.12, despill: 0.35 },
                  }))
                }
              >
                ↺ Сброс
              </ToggleButton>
            </div>
          </>
        )}
      </PanelSection>

      {/* ---------------- Удаление фона (AI) ---------------- */}
      <PanelSection title="Удаление фона" subtitle="MediaPipe SelfieSegmentation">
        <CheckboxField label="Вырезать человека из кадра" checked={!!vfx.backgroundRemoval.enabled} onChange={(v) => setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, enabled: v } }))} />
        {vfx.backgroundRemoval.enabled && (
          <>
            <SelectField
              label="Что вместо фона"
              value={vfx.backgroundRemoval.fill}
              options={[
                { value: "transparent", label: "Прозрачность (видно нижний слой)" },
                { value: "blur", label: "Размытый фон" },
                { value: "color", label: "Заливка цветом" },
              ]}
              onChange={(v) => setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, fill: v as VfxSettings["backgroundRemoval"]["fill"] } }))}
            />
            {vfx.backgroundRemoval.fill === "color" && (
              <ColorField label="Цвет заливки" value={vfx.backgroundRemoval.color} onChange={(v) => setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, color: v } }))} />
            )}
            {vfx.backgroundRemoval.fill === "blur" && (
              <SliderField label="Сила размытия фона" value={vfx.backgroundRemoval.blurAmount} min={2} max={60} step={1} onChange={(v) => setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, blurAmount: v } }))} />
            )}
            <SliderField label="Растушёвка края, px" value={vfx.backgroundRemoval.edgeSmooth} min={0} max={30} step={1} onChange={(v) => setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, edgeSmooth: v } }))} />
            <SliderField label="Непрозрачность переднего плана" value={vfx.backgroundRemoval.foregroundOpacity} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, foregroundOpacity: v } }))} />
            <SliderField label="Порог уверенности" value={vfx.backgroundRemoval.threshold} min={0} max={0.9} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, threshold: v } }))} />
            <ModelStatus status={vfx.backgroundRemoval.modelStatus ?? bgRemovalService.status} />
            <div className="mt-1 flex gap-1.5">
              <ToggleButton
                tone="accent"
                onClick={() => {
                  setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, modelStatus: "loading" } }));
                  void bgRemovalService.ensureLoaded().then((ok) =>
                    setVfx((f) => ({ ...f, backgroundRemoval: { ...f.backgroundRemoval, modelStatus: ok ? "ready" : "error" } })),
                  );
                }}
              >
                ⬇ Загрузить модель
              </ToggleButton>
            </div>
          </>
        )}
      </PanelSection>

      {/* ---------------- Удаление объекта ---------------- */}
      <PanelSection title="Удаление объекта" subtitle="кисть + инпейнтинг (FMM)">
        <CheckboxField
          label="Удалять закрашенные области"
          checked={!!vfx.objectRemoval.enabled}
          onChange={(v) => setVfx((f) => ({ ...f, objectRemoval: { ...f.objectRemoval, enabled: v } }))}
        />
        {vfx.objectRemoval.enabled && (
          <>
            <div className="mb-1 flex flex-wrap gap-1.5">
              <ToggleButton tone={brushActive ? "accent" : "default"} onClick={() => (brushActive ? vfxBrush.setActive(null) : vfxBrush.setActive(clip.id))}>
                {brushActive ? "🖌 Кисть активна — рисуйте по превью" : "🖌 Рисовать кистью"}
              </ToggleButton>
              <ToggleButton
                onClick={() =>
                  setVfx((f) => ({ ...f, objectRemoval: { ...f.objectRemoval, strokes: [], region: undefined } }))
                }
              >
                🧹 Очистить
              </ToggleButton>
            </div>
            <SliderField
              label="Радиус кисти"
              value={vfx.objectRemoval.brushRadius * 100}
              min={0.5}
              max={20}
              step={0.1}
              display={(v) => `${v.toFixed(1)}% кадра`}
              onChange={(v) => {
                vfxBrush.setRadius(v / 100);
                setVfx((f) => ({ ...f, objectRemoval: { ...f.objectRemoval, brushRadius: v / 100 } }));
              }}
            />
            <div className="mb-1 flex flex-wrap gap-1.5">
              <ToggleButton
                tone="accent"
                onClick={() => {
                  vfxBrush.setActive(clip.id);
                  vfxBrush.state.aiPickClipId = clip.id;
                  setVfx((f) => ({ ...f, objectRemoval: { ...f.objectRemoval, modelStatus: "loading" } }));
                  void interactiveSegmentService.ensureLoaded().then((ok) =>
                    setVfx((f) => ({
                      ...f,
                      objectRemoval: { ...f.objectRemoval, modelStatus: ok ? "ready" : "error" },
                    })),
                  );
                  showNote("Кликните по объекту в превью — AI выделит его контур");
                }}
              >
                🎯 AI-выделение (клик по объекту)
              </ToggleButton>
              <ToggleButton onClick={() => (vfxBrush.state.aiPickClipId = null)}>✕ Отмена AI</ToggleButton>
            </div>
            <ModelStatus status={vfx.objectRemoval.modelStatus ?? interactiveSegmentService.status} />
            <div className="mt-1 text-[10px] text-slate-500">
              Закрашенные области ({(vfx.objectRemoval.strokes?.length ?? 0) + (vfx.objectRemoval.region?.polygon?.length ? 1 : 0)}) заменяются
              содержимым окружения — content-aware fill в реальном времени.
            </div>
          </>
        )}
      </PanelSection>

      {/* ---------------- LUT Pipeline ---------------- */}
      <PanelSection title="LUT-конвейер" subtitle="настоящий 3D LUT (33³)">
        <EffectHeader
          title="Применить LUT"
          enabled={!!vfx.lut.enabled}
          onToggle={(v) => setVfx((f) => ({ ...f, lut: { ...f.lut, enabled: v } }))}
        />
        {vfx.lut.enabled && (
          <>
            <div className="mb-2 grid grid-cols-3 gap-1">
              {LUT_PRESETS_WITH_CUBE.map((id) => (
                <button
                  key={id}
                  onClick={() => setVfx((f) => ({ ...f, lut: { ...f.lut, preset: id } }))}
                  className={`rounded-lg border px-1.5 py-1 text-[10px] font-bold transition ${
                    vfx.lut.preset === id
                      ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {LUT_LABELS[id] ?? id}
                </button>
              ))}
            </div>
            <SliderField label="Интенсивность" value={vfx.lut.amount} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, lut: { ...f.lut, amount: v } }))} />
            <div className="text-[10px] text-slate-500">
              Один и тот же .cube-грид применяется в превью (трилинейная интерполяция) и в экспорте (lut3d).
            </div>
          </>
        )}
      </PanelSection>

      {/* ---------------- Свечение ---------------- */}
      <PanelSection title="Свечение (Glow)">
        <EffectHeader title="Glow" enabled={!!vfx.glow.enabled} onToggle={(v) => setVfx((f) => ({ ...f, glow: { ...f.glow, enabled: v } }))} />
        {vfx.glow.enabled && (
          <>
            <SliderField label="Радиус, px" value={vfx.glow.radius} min={1} max={60} step={1} onChange={(v) => setVfx((f) => ({ ...f, glow: { ...f.glow, radius: v } }))} />
            <SliderField label="Сила" value={vfx.glow.strength} min={0} max={1.5} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, glow: { ...f.glow, strength: v } }))} />
            <SliderField label="Порог яркости" value={vfx.glow.threshold} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, glow: { ...f.glow, threshold: v } }))} />
          </>
        )}
      </PanelSection>

      {/* ---------------- Bloom ---------------- */}
      <PanelSection title="Bloom">
        <EffectHeader title="Bloom" enabled={!!vfx.bloom.enabled} onToggle={(v) => setVfx((f) => ({ ...f, bloom: { ...f.bloom, enabled: v } }))} />
        {vfx.bloom.enabled && (
          <>
            <SliderField label="Радиус, px" value={vfx.bloom.radius} min={1} max={80} step={1} onChange={(v) => setVfx((f) => ({ ...f, bloom: { ...f.bloom, radius: v } }))} />
            <SliderField label="Сила" value={vfx.bloom.strength} min={0} max={1.5} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, bloom: { ...f.bloom, strength: v } }))} />
            <SliderField label="Порог яркости" value={vfx.bloom.threshold} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, bloom: { ...f.bloom, threshold: v } }))} />
          </>
        )}
      </PanelSection>

      {/* ---------------- Световые лучи ---------------- */}
      <PanelSection title="Световые лучи (God Rays)">
        <EffectHeader title="Лучи" enabled={!!vfx.lightRays.enabled} onToggle={(v) => setVfx((f) => ({ ...f, lightRays: { ...f.lightRays, enabled: v } }))} />
        {vfx.lightRays.enabled && (
          <>
            <SliderField label="Источник X" value={vfx.lightRays.centerX} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, lightRays: { ...f.lightRays, centerX: v } }))} />
            <SliderField label="Источник Y" value={vfx.lightRays.centerY} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, lightRays: { ...f.lightRays, centerY: v } }))} />
            <SliderField label="Длина" value={vfx.lightRays.length} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, lightRays: { ...f.lightRays, length: v } }))} />
            <SliderField label="Сила" value={vfx.lightRays.strength} min={0} max={1.5} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, lightRays: { ...f.lightRays, strength: v } }))} />
            <SliderField label="Число лучей" value={vfx.lightRays.rayCount} min={2} max={24} step={1} onChange={(v) => setVfx((f) => ({ ...f, lightRays: { ...f.lightRays, rayCount: v } }))} />
          </>
        )}
      </PanelSection>

      {/* ---------------- Motion Blur ---------------- */}
      <PanelSection title="Motion Blur" subtitle="направленное размытие движения">
        <CheckboxField
          label="Включить"
          checked={!!clip.motionBlur?.enabled}
          onChange={(v) =>
            patch((c) => ({
              ...c,
              motionBlur: { enabled: v, samples: c.motionBlur?.samples ?? 8, shutterAngle: c.motionBlur?.shutterAngle ?? 180, angle: c.motionBlur?.angle ?? 0 },
            }))
          }
        />
        {clip.motionBlur?.enabled && (
          <>
            <SliderField label="Угол, °" value={clip.motionBlur.angle ?? 0} min={0} max={360} step={1} onChange={(v) => patch((c) => ({ ...c, motionBlur: { ...(c.motionBlur as NonNullable<VideoClip["motionBlur"]>), angle: v } }))} />
            <SliderField label="Длина размытия" value={clip.motionBlur.samples ?? 8} min={2} max={32} step={1} display={(v) => `${v} px`} onChange={(v) => patch((c) => ({ ...c, motionBlur: { ...(c.motionBlur as NonNullable<VideoClip["motionBlur"]>), samples: v } }))} />
          </>
        )}
      </PanelSection>

      {/* ---------------- Плёночное зерно ---------------- */}
      <PanelSection title="Плёночное зерно">
        <EffectHeader title="Зерно" enabled={!!vfx.filmGrain.enabled} onToggle={(v) => setVfx((f) => ({ ...f, filmGrain: { ...f.filmGrain, enabled: v } }))} />
        {vfx.filmGrain.enabled && (
          <>
            <SliderField label="Количество" value={vfx.filmGrain.amount} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, filmGrain: { ...f.filmGrain, amount: v } }))} />
            <SliderField label="Крупность, px" value={vfx.filmGrain.size} min={1} max={16} step={0.5} onChange={(v) => setVfx((f) => ({ ...f, filmGrain: { ...f.filmGrain, size: v } }))} />
            <CheckboxField label="Монохромное (только яркость)" checked={vfx.filmGrain.monochrome} onChange={(v) => setVfx((f) => ({ ...f, filmGrain: { ...f.filmGrain, monochrome: v } }))} />
            <ToggleButton onClick={() => setVfx((f) => ({ ...f, filmGrain: { ...f.filmGrain, seed: Math.floor(Math.random() * 100000) } }))}>🎲 Новый узор</ToggleButton>
          </>
        )}
      </PanelSection>

      {/* ---------------- Дисторсия ---------------- */}
      <PanelSection title="Дисторсия объектива">
        <EffectHeader title="Искажение" enabled={!!vfx.lensDistortion.enabled} onToggle={(v) => setVfx((f) => ({ ...f, lensDistortion: { ...f.lensDistortion, enabled: v } }))} />
        {vfx.lensDistortion.enabled && (
          <>
            <SliderField label="Величина" value={vfx.lensDistortion.amount} min={-1} max={1} step={0.01} display={(v) => (v < 0 ? `${(-v * 100).toFixed(0)}% бочка` : v > 0 ? `${(v * 100).toFixed(0)}% подушка` : "0")} onChange={(v) => setVfx((f) => ({ ...f, lensDistortion: { ...f.lensDistortion, amount: v } }))} />
          </>
        )}
      </PanelSection>

      {/* ---------------- Резкость ---------------- */}
      <PanelSection title="Резкость (Unsharp Mask)">
        <EffectHeader title="Резкость" enabled={!!vfx.sharpen.enabled} onToggle={(v) => setVfx((f) => ({ ...f, sharpen: { ...f.sharpen, enabled: v } }))} />
        {vfx.sharpen.enabled && (
          <>
            <SliderField label="Сила" value={vfx.sharpen.amount} min={0} max={2} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, sharpen: { ...f.sharpen, amount: v } }))} />
            <SliderField label="Радиус, px" value={vfx.sharpen.radius} min={0.5} max={4} step={0.1} onChange={(v) => setVfx((f) => ({ ...f, sharpen: { ...f.sharpen, radius: v } }))} />
          </>
        )}
      </PanelSection>

      {/* ---------------- Шумоподавление ---------------- */}
      <PanelSection title="Шумоподавление">
        <EffectHeader title="Денойз" enabled={!!vfx.noiseReduction.enabled} onToggle={(v) => setVfx((f) => ({ ...f, noiseReduction: { ...f.noiseReduction, enabled: v } }))} />
        {vfx.noiseReduction.enabled && (
          <>
            <SliderField label="Сила" value={vfx.noiseReduction.amount} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, noiseReduction: { ...f.noiseReduction, amount: v } }))} />
            <SliderField label="Радиус" value={vfx.noiseReduction.radius} min={1} max={3} step={1} onChange={(v) => setVfx((f) => ({ ...f, noiseReduction: { ...f.noiseReduction, radius: v } }))} />
            <div className="text-[10px] text-slate-500">Билатеральный фильтр: убирает шум, сохраняя границы.</div>
          </>
        )}
      </PanelSection>

      {/* ---------------- Виньетка ---------------- */}
      <PanelSection title="Виньетка">
        <EffectHeader title="Виньетка" enabled={!!vfx.vignette.enabled} onToggle={(v) => setVfx((f) => ({ ...f, vignette: { ...f.vignette, enabled: v } }))} />
        {vfx.vignette.enabled && (
          <>
            <SliderField label="Сила" value={vfx.vignette.strength} min={0} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, vignette: { ...f.vignette, strength: v } }))} />
            <SliderField label="Мягкость края" value={vfx.vignette.feather} min={0.05} max={1} step={0.01} onChange={(v) => setVfx((f) => ({ ...f, vignette: { ...f.vignette, feather: v } }))} />
          </>
        )}
      </PanelSection>

      {/* ---------------- Композитинг ---------------- */}
      <PanelSection title="Композитинг слоёв" subtitle="blend-режим, прозрачность, порядок">
        <SelectField
          label="Режим наложения (слой поверх нижних)"
          value={clip.blendMode ?? "normal"}
          options={BLEND_MODES.map((m) => ({ value: m, label: m }))}
          onChange={(v) => patch((c) => ({ ...c, blendMode: v as BlendMode }))}
        />
        <div className="mt-2">
          <SliderField
            label="Прозрачность слоя"
            value={clip.opacity ? clip.opacity.value : 1}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => patch((c) => ({ ...c, opacity: param(v) }))}
          />
        </div>
        <div className="text-[10px] text-slate-500">
          Слой с blend-режимом смешивается со всем, что под ним. Режимы работают и в превью, и при экспорте.
        </div>
      </PanelSection>

      {/* ---------------- Быстрые пресеты (legacy) ---------------- */}
      <PanelSection title="Быстрые пресеты" subtitle="размытие, зеркало, полосы (классика)">
        <div className="flex flex-wrap gap-1.5">
          {EFFECT_PRESETS.map((preset) => (
            <ToggleButton key={preset.id} active={clip.effects?.includes(preset.id)} onClick={() => toggleEffect(preset.id)}>
              {preset.label}
            </ToggleButton>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}
