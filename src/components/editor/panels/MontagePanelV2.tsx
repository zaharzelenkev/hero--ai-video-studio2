"use client";

import { useProjectStore, findClip, assetOf } from "@/store/projectStore";
import { param } from "@/lib/types";
import type { AnimParam, AudioClip, CameraMotion, Clip, TextClip, Track, TransitionType, VideoClip } from "@/lib/types";
import { TRANSITIONS } from "@/lib/presets";
import { isPictureLocked } from "@/lib/pictureLock";
import ParamControl from "../ParamControl";
import { PanelSection, NumberField, SelectField, ToggleButton, EmptyHint } from "./ui";

const CAMERA_MOTIONS: { id: CameraMotion; label: string }[] = [
  { id: "none", label: "Статика" },
  { id: "zoom-in", label: "Наезд" },
  { id: "zoom-out", label: "Отъезд" },
  { id: "pan-left", label: "Панорама ←" },
  { id: "pan-right", label: "Панорама →" },
  { id: "pan-up", label: "Панорама ↑" },
  { id: "pan-down", label: "Панорама ↓" },
];

export default function MontagePanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);
  const detachAudio = useProjectStore((s) => s.detachAudio);
  const setClipSpeed = useProjectStore((s) => s.setClipSpeed);
  const alignSelectedToPlayhead = useProjectStore((s) => s.alignSelectedToPlayhead);
  const trimClip = useProjectStore((s) => s.trimClip);
  const setActivePage = useProjectStore((s) => s.setActivePage);

  const found = findClip(project, selectedClipId);
  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;
  if (!found) return <EmptyHint>Выберите клип на таймлайне — здесь появятся его параметры.</EmptyHint>;

  const { clip, track } = found;
  const localTime = Math.max(0, playhead - clip.start);
  const asset = assetOf(project, clip);
  const isVisual = clip.type === "video" || clip.type === "image";
  const media = clip as VideoClip;
  const audio = clip as AudioClip;

  // PICTURE LOCK: монтаж зафиксирован — страница «Монтаж» переходит в режим
  // просмотра. Тайминг, склейки, скорость и переходы больше не редактируются;
  // цвет, звук, титры и эффекты остаются доступными в своих разделах.
  if (isPictureLocked(project)) {
    return <LockedMontageNotice clip={clip} track={track} />;
  }

  const patch = (fn: (c: Clip) => Clip) => updateClip(clip.id, fn);
  const setParam = (key: keyof VideoClip, value: AnimParam) =>
    patch((c) => ({ ...(c as VideoClip), [key]: value }) as Clip);

  return (
    <div className="space-y-3">
      <PanelSection title="Клип" subtitle={track.name}>
        <input
          value={clip.name}
          onChange={(e) => patch((c) => ({ ...c, name: e.target.value }))}
          className="mb-2 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-violet-400/50"
          aria-label="Название клипа"
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Начало, с"
            value={clip.start}
            step={0.01}
            onChange={(v) => patch((c) => ({ ...c, start: Math.max(0, v) }))}
          />
          <NumberField
            label="Длительность, с"
            value={clip.duration}
            step={0.01}
            min={0.08}
            onChange={(v) => trimClip(clip.id, "out", clip.start + Math.max(0.08, v))}
          />
        </div>
        {(clip.type === "video" || clip.type === "audio") && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <NumberField
              label="In (источник)"
              value={(clip as VideoClip).inPoint}
              step={0.01}
              onChange={(v) => patch((c) => ({ ...(c as VideoClip), inPoint: Math.max(0, v) }) as Clip)}
            />
            <NumberField
              label="Out (источник)"
              value={(clip as VideoClip).outPoint}
              step={0.01}
              onChange={(v) => patch((c) => ({ ...(c as VideoClip), outPoint: Math.max(0, v) }) as Clip)}
            />
          </div>
        )}
        {asset && (
          <div className="mt-2 text-[10px] text-slate-500">
            Источник: <span className="text-slate-300">{asset.name}</span>
            {asset.width ? ` · ${asset.width}×${asset.height}` : ""}
            {asset.duration ? ` · ${asset.duration.toFixed(1)}с` : ""}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ToggleButton onClick={() => splitClipAt(clip.id, playhead)}>✂ Разрезать</ToggleButton>
          <ToggleButton onClick={() => duplicateClip(clip.id)}>⧉ Дублировать</ToggleButton>
          <ToggleButton onClick={alignSelectedToPlayhead}>⇥ К плейхеду</ToggleButton>
          {clip.type === "video" && <ToggleButton onClick={() => detachAudio(clip.id)}>🎚 Отделить звук</ToggleButton>}
          <ToggleButton tone="danger" onClick={() => removeClip(clip.id)}>
            🗑 Удалить
          </ToggleButton>
        </div>
      </PanelSection>

      {(clip.type === "video" || clip.type === "audio") && (
        <PanelSection title="Скорость и направление">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
              <ToggleButton key={s} active={Math.abs(((clip as VideoClip).speed ?? 1) - s) < 0.001} onClick={() => setClipSpeed(clip.id, s)}>
                {s}×
              </ToggleButton>
            ))}
          </div>
          <NumberField
            label="Точная скорость"
            value={(clip as VideoClip).speed ?? 1}
            step={0.05}
            min={0.1}
            max={8}
            onChange={(v) => setClipSpeed(clip.id, v)}
          />
          {clip.type === "video" && (
            <div className="mt-2 flex gap-1.5">
              <ToggleButton active={!!media.reversed} onClick={() => patch((c) => ({ ...(c as VideoClip), reversed: !(c as VideoClip).reversed }) as Clip)}>
                ⏪ Реверс
              </ToggleButton>
              <ToggleButton
                active={!!media.motionBlur?.enabled}
                onClick={() =>
                  patch((c) => {
                    const v = c as VideoClip;
                    return {
                      ...v,
                      motionBlur: { enabled: !v.motionBlur?.enabled, samples: v.motionBlur?.samples ?? 8, shutterAngle: v.motionBlur?.shutterAngle ?? 180 },
                    } as Clip;
                  })
                }
              >
                ✷ Motion blur
              </ToggleButton>
            </div>
          )}
        </PanelSection>
      )}

      {isVisual && (
        <>
          <PanelSection title="Трансформация" subtitle="◆ — ключевой кадр на плейхеде">
            <ParamControl
              label="Позиция X"
              param={media.x ?? param(0)}
              localTime={localTime}
              clipDuration={clip.duration}
              min={-1}
              max={1}
              onChange={(p) => setParam("x", p)}
            />
            <ParamControl
              label="Позиция Y"
              param={media.y ?? param(0)}
              localTime={localTime}
              clipDuration={clip.duration}
              min={-1}
              max={1}
              onChange={(p) => setParam("y", p)}
            />
            <ParamControl
              label="Масштаб"
              param={media.scale ?? param(1)}
              localTime={localTime}
              clipDuration={clip.duration}
              min={0.1}
              max={4}
              onChange={(p) => setParam("scale", p)}
            />
            <ParamControl
              label="Поворот, °"
              param={media.rotation ?? param(0)}
              localTime={localTime}
              clipDuration={clip.duration}
              min={-180}
              max={180}
              step={0.5}
              onChange={(p) => setParam("rotation", p)}
            />
            <ParamControl
              label="Прозрачность"
              param={media.opacity ?? param(1)}
              localTime={localTime}
              clipDuration={clip.duration}
              min={0}
              max={1}
              onChange={(p) => setParam("opacity", p)}
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              <ToggleButton active={!!media.flipH} onClick={() => patch((c) => ({ ...(c as VideoClip), flipH: !(c as VideoClip).flipH }) as Clip)}>
                ⇋ Отразить H
              </ToggleButton>
              <ToggleButton active={!!media.flipV} onClick={() => patch((c) => ({ ...(c as VideoClip), flipV: !(c as VideoClip).flipV }) as Clip)}>
                ⇵ Отразить V
              </ToggleButton>
              <ToggleButton
                onClick={() =>
                  patch((c) => ({ ...(c as VideoClip), x: param(0), y: param(0), scale: param(1), rotation: param(0), opacity: param(1) }) as Clip)
                }
              >
                ↺ Сброс
              </ToggleButton>
            </div>
          </PanelSection>

          <PanelSection title="Кадрирование и вписывание">
            <SelectField
              label="Вписывание"
              value={media.fitMode ?? "cover"}
              options={[
                { value: "cover", label: "Заполнить кадр (cover)" },
                { value: "contain", label: "Вписать целиком (contain)" },
              ]}
              onChange={(v) => patch((c) => ({ ...(c as VideoClip), fitMode: v as "cover" | "contain" }) as Clip)}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ToggleButton active={!!media.blurPad} onClick={() => patch((c) => ({ ...(c as VideoClip), blurPad: !(c as VideoClip).blurPad }) as Clip)}>
                ⬛ Размытые поля
              </ToggleButton>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["cropLeft", "Кроп слева"],
                  ["cropRight", "Кроп справа"],
                  ["cropTop", "Кроп сверху"],
                  ["cropBottom", "Кроп снизу"],
                ] as [keyof VideoClip, string][]
              ).map(([key, label]) => (
                <NumberField
                  key={String(key)}
                  label={label}
                  value={((media[key] as AnimParam | undefined)?.value ?? 0) * 100}
                  step={1}
                  min={0}
                  max={90}
                  suffix="%"
                  onChange={(v) => setParam(key, param(Math.max(0, Math.min(0.9, v / 100))))}
                />
              ))}
            </div>
            <div className="mt-2">
              <SelectField
                label="Движение камеры (Ken Burns)"
                value={media.cameraMotion ?? "none"}
                options={CAMERA_MOTIONS.map((m) => ({ value: m.id, label: m.label }))}
                onChange={(v) => patch((c) => ({ ...(c as VideoClip), cameraMotion: v as CameraMotion }) as Clip)}
              />
            </div>
          </PanelSection>

          <PanelSection title="Переходы">
            <SelectField
              label="Вход"
              value={media.transitionIn?.type ?? "cut"}
              options={TRANSITIONS.map((t) => ({ value: t.type, label: `${t.icon} ${t.label}` }))}
              onChange={(v) =>
                patch((c) => {
                  const vc = c as VideoClip;
                  return { ...vc, transitionIn: { type: v as TransitionType, duration: vc.transitionIn?.duration || 0.5 } } as Clip;
                })
              }
            />
            <NumberField
              label="Длительность входа, с"
              value={media.transitionIn?.duration ?? 0}
              step={0.05}
              min={0}
              max={5}
              onChange={(v) =>
                patch((c) => {
                  const vc = c as VideoClip;
                  return { ...vc, transitionIn: { type: vc.transitionIn?.type ?? "crossfade", duration: v } } as Clip;
                })
              }
            />
            <SelectField
              label="Выход"
              value={media.transitionOut?.type ?? "cut"}
              options={TRANSITIONS.map((t) => ({ value: t.type, label: `${t.icon} ${t.label}` }))}
              onChange={(v) =>
                patch((c) => {
                  const vc = c as VideoClip;
                  return { ...vc, transitionOut: { type: v as TransitionType, duration: vc.transitionOut?.duration || 0.5 } } as Clip;
                })
              }
            />
            <NumberField
              label="Длительность выхода, с"
              value={media.transitionOut?.duration ?? 0}
              step={0.05}
              min={0}
              max={5}
              onChange={(v) =>
                patch((c) => {
                  const vc = c as VideoClip;
                  return { ...vc, transitionOut: { type: vc.transitionOut?.type ?? "crossfade", duration: v } } as Clip;
                })
              }
            />
          </PanelSection>

          {clip.type === "video" && (
            <PanelSection title="Звук клипа">
              <ParamControl
                label="Громкость"
                param={media.volume ?? param(1)}
                localTime={localTime}
                clipDuration={clip.duration}
                min={0}
                max={2}
                onChange={(p) => setParam("volume", p)}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Fade in, с" value={media.fadeIn ?? 0} step={0.05} min={0} onChange={(v) => patch((c) => ({ ...(c as VideoClip), fadeIn: v }) as Clip)} />
                <NumberField label="Fade out, с" value={media.fadeOut ?? 0} step={0.05} min={0} onChange={(v) => patch((c) => ({ ...(c as VideoClip), fadeOut: v }) as Clip)} />
              </div>
              <div className="mt-2">
                <ToggleButton active={!!media.muted} onClick={() => patch((c) => ({ ...(c as VideoClip), muted: !(c as VideoClip).muted }) as Clip)}>
                  {media.muted ? "🔇 Звук выключен" : "🔊 Звук включён"}
                </ToggleButton>
              </div>
            </PanelSection>
          )}
        </>
      )}

      {clip.type === "audio" && (
        <PanelSection title="Аудиоклип">
          <div className="mb-2 text-[11px] text-slate-400">
            Громкость {(audio.volume?.value ?? 1).toFixed(2)} · fade {audio.fadeIn?.toFixed(2)}/{audio.fadeOut?.toFixed(2)}с
          </div>
          <ToggleButton onClick={() => setActivePage("sound")}>🎵 Открыть микшер</ToggleButton>
        </PanelSection>
      )}

      {(clip.type === "text" || clip.type === "subtitle") && (
        <PanelSection title="Текст">
          <textarea
            value={(clip as TextClip).text}
            onChange={(e) => patch((c) => ({ ...(c as TextClip), text: e.target.value }) as Clip)}
            rows={3}
            className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-slate-100 outline-none focus:border-violet-400/50"
          />
          <div className="mt-2">
            <ToggleButton onClick={() => setActivePage("text")}>📝 Открыть редактор титров</ToggleButton>
          </div>
        </PanelSection>
      )}
    </div>
  );
}

/** Просмотр клипа в режиме зафиксированного монтажа (Picture Lock). */
function LockedMontageNotice({ clip, track }: { clip: Clip; track: Track }) {
  const setActivePage = useProjectStore((s) => s.setActivePage);
  const media = clip as VideoClip;
  const rows: Array<[string, string]> = [["Дорожка", track.name], ["Начало", `${clip.start.toFixed(2)} с`], ["Длительность", `${clip.duration.toFixed(2)} с`]];
  if (clip.type === "video" || clip.type === "image") {
    rows.push(["In / Out", `${media.inPoint.toFixed(2)} / ${media.outPoint.toFixed(2)} с`]);
    rows.push(["Скорость", `${(media.speed ?? 1).toFixed(2)}×`]);
  }
  if (clip.type === "video") {
    const tIn = media.transitionIn?.duration ? `${media.transitionIn.type} (${media.transitionIn.duration.toFixed(2)} с)` : "cut";
    const tOut = media.transitionOut?.duration ? `${media.transitionOut.type} (${media.transitionOut.duration.toFixed(2)} с)` : "cut";
    rows.push(["Переходы", `${tIn} → ${tOut}`]);
  }
  if (clip.type === "audio") {
    rows.push(["Громкость", `${(media.volume?.value ?? 1).toFixed(2)}`]);
  }
  if (clip.type === "text" || clip.type === "subtitle") {
    rows.push(["Текст", (clip as TextClip).text.slice(0, 60)]);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔒</span>
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-emerald-300">Picture Lock — монтаж зафиксирован</div>
            <div className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
              Склейки, тайминг, скорость и переходы доступны только для просмотра. Изменяются лишь цвет, звук, титры и эффекты.
            </div>
          </div>
        </div>
        <button
          onClick={() => setActivePage("lock")}
          className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-100 transition hover:bg-emerald-500/30"
        >
          📋 Открыть отчёт Picture Lock
        </button>
      </div>

      <PanelSection title="Клип (только просмотр)" subtitle={clip.name}>
        <div className="space-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-slate-500">{label}</span>
              <span className="truncate font-mono text-slate-200">{value}</span>
            </div>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}
