"use client";

import { useProjectStore, findClip } from "@/store/projectStore";
import type { AudioClip, Clip, VideoClip } from "@/lib/types";
import { param } from "@/lib/types";
import ParamControl from "../ParamControl";
import { PanelSection, ToggleButton, EmptyHint, SliderField, CheckboxField, NumberField } from "./ui";

export default function SoundPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const toggleTrackProp = useProjectStore((s) => s.toggleTrackProp);
  const volume = useProjectStore((s) => s.volume);
  const setVolume = useProjectStore((s) => s.setVolume);
  const selectClip = useProjectStore((s) => s.selectClip);

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const found = findClip(project, selectedClipId);
  const clip = found?.clip;
  const audioTracks = project.tracks.filter((t) => t.type === "audio");

  const audioClip = clip && clip.type === "audio" ? (clip as AudioClip) : null;
  const videoClip = clip && clip.type === "video" ? (clip as VideoClip) : null;
  const localTime = clip ? Math.max(0, playhead - clip.start) : 0;

  const patchAudio = (fn: (c: AudioClip) => AudioClip) => {
    if (!audioClip) return;
    updateClip(audioClip.id, (c) => fn(c as AudioClip) as Clip);
  };

  return (
    <div className="space-y-3">
      <PanelSection title="Мастер">
        <SliderField label="Громкость предпросмотра" value={volume} min={0} max={1} onChange={setVolume} display={(v) => `${Math.round(v * 100)}%`} />
      </PanelSection>

      <PanelSection title="Микшер дорожек">
        {audioTracks.length === 0 ? (
          <div className="text-[11px] text-slate-500">Аудиодорожек пока нет — добавьте их на таймлайне.</div>
        ) : (
          <div className="space-y-1.5">
            {audioTracks.map((track) => (
              <div key={track.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                <span className="truncate text-[11px] font-semibold text-slate-200">{track.name}</span>
                <span className="text-[9px] text-slate-500">{track.clips.length} кл.</span>
                <div className="ml-auto flex gap-1">
                  <ToggleButton active={track.muted} onClick={() => toggleTrackProp(track.id, "muted")}>
                    M
                  </ToggleButton>
                  <ToggleButton active={track.solo === true} onClick={() => toggleTrackProp(track.id, "solo")}>
                    S
                  </ToggleButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      {videoClip && (
        <PanelSection title="Звук видеоклипа" subtitle={videoClip.name}>
          <ParamControl
            label="Громкость"
            param={videoClip.volume ?? param(1)}
            localTime={localTime}
            clipDuration={videoClip.duration}
            min={0}
            max={2}
            onChange={(p) => updateClip(videoClip.id, (c) => ({ ...(c as VideoClip), volume: p }) as Clip)}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Fade in, с" value={videoClip.fadeIn ?? 0} min={0} step={0.05} onChange={(v) => updateClip(videoClip.id, (c) => ({ ...(c as VideoClip), fadeIn: v }) as Clip)} />
            <NumberField label="Fade out, с" value={videoClip.fadeOut ?? 0} min={0} step={0.05} onChange={(v) => updateClip(videoClip.id, (c) => ({ ...(c as VideoClip), fadeOut: v }) as Clip)} />
          </div>
          <div className="mt-2">
            <CheckboxField label="Заглушить" checked={!!videoClip.muted} onChange={(v) => updateClip(videoClip.id, (c) => ({ ...(c as VideoClip), muted: v }) as Clip)} />
          </div>
        </PanelSection>
      )}

      {audioClip ? (
        <>
          <PanelSection title="Аудиоклип" subtitle={audioClip.name}>
            <ParamControl
              label="Громкость"
              param={audioClip.volume}
              localTime={localTime}
              clipDuration={audioClip.duration}
              min={0}
              max={2}
              onChange={(p) => patchAudio((c) => ({ ...c, volume: p }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Fade in, с" value={audioClip.fadeIn} min={0} step={0.05} onChange={(v) => patchAudio((c) => ({ ...c, fadeIn: v }))} />
              <NumberField label="Fade out, с" value={audioClip.fadeOut} min={0} step={0.05} onChange={(v) => patchAudio((c) => ({ ...c, fadeOut: v }))} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ToggleButton active={audioClip.muted} onClick={() => patchAudio((c) => ({ ...c, muted: !c.muted }))}>
                {audioClip.muted ? "🔇 Выключен" : "🔊 Включён"}
              </ToggleButton>
              <ToggleButton active={!!audioClip.loop} onClick={() => patchAudio((c) => ({ ...c, loop: !c.loop }))}>
                🔁 Зациклить
              </ToggleButton>
              <ToggleButton active={!!audioClip.normalize} onClick={() => patchAudio((c) => ({ ...c, normalize: !c.normalize }))}>
                📈 Нормализация
              </ToggleButton>
              <ToggleButton active={audioClip.denoise} onClick={() => patchAudio((c) => ({ ...c, denoise: !c.denoise }))}>
                🧹 Шумоподавление
              </ToggleButton>
            </div>
          </PanelSection>

          <PanelSection title="Эквалайзер" subtitle="дБ">
            <SliderField label="Низкие · 140 Гц" value={audioClip.eqLow} min={-15} max={15} step={0.5} onChange={(v) => patchAudio((c) => ({ ...c, eqLow: v }))} display={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} дБ`} />
            <SliderField label="Средние · 1.2 кГц" value={audioClip.eqMid} min={-15} max={15} step={0.5} onChange={(v) => patchAudio((c) => ({ ...c, eqMid: v }))} display={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} дБ`} />
            <SliderField label="Высокие · 6.5 кГц" value={audioClip.eqHigh} min={-15} max={15} step={0.5} onChange={(v) => patchAudio((c) => ({ ...c, eqHigh: v }))} display={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} дБ`} />
            <SliderField
              label="Панорама"
              value={audioClip.pan?.value ?? 0}
              min={-1}
              max={1}
              onChange={(v) => patchAudio((c) => ({ ...c, pan: param(v) }))}
              display={(v) => (v === 0 ? "центр" : v < 0 ? `L ${Math.round(-v * 100)}%` : `R ${Math.round(v * 100)}%`)}
            />
          </PanelSection>

          <PanelSection title="Компрессор">
            <CheckboxField
              label="Включить"
              checked={!!audioClip.compressor?.enabled}
              onChange={(v) =>
                patchAudio((c) => ({
                  ...c,
                  compressor: { threshold: c.compressor?.threshold ?? -20, ratio: c.compressor?.ratio ?? 4, attack: c.compressor?.attack ?? 5, release: c.compressor?.release ?? 60, enabled: v },
                }))
              }
            />
            {audioClip.compressor?.enabled && (
              <>
                <SliderField label="Порог" value={audioClip.compressor.threshold} min={-60} max={0} step={1} onChange={(v) => patchAudio((c) => ({ ...c, compressor: { ...c.compressor!, threshold: v } }))} display={(v) => `${v} дБ`} />
                <SliderField label="Ratio" value={audioClip.compressor.ratio} min={1} max={20} step={0.5} onChange={(v) => patchAudio((c) => ({ ...c, compressor: { ...c.compressor!, ratio: v } }))} display={(v) => `${v}:1`} />
                <SliderField label="Attack, мс" value={audioClip.compressor.attack} min={0} max={200} step={1} onChange={(v) => patchAudio((c) => ({ ...c, compressor: { ...c.compressor!, attack: v } }))} display={(v) => `${v} мс`} />
                <SliderField label="Release, мс" value={audioClip.compressor.release} min={10} max={800} step={5} onChange={(v) => patchAudio((c) => ({ ...c, compressor: { ...c.compressor!, release: v } }))} display={(v) => `${v} мс`} />
              </>
            )}
          </PanelSection>
        </>
      ) : (
        <PanelSection title="Аудиоклипы проекта">
          {audioTracks.flatMap((t) => t.clips).length === 0 ? (
            <div className="text-[11px] text-slate-500">Добавьте музыку или голос через «Медиа → Добавить медиа».</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {audioTracks.flatMap((t) => t.clips).map((c) => (
                <ToggleButton key={c.id} onClick={() => selectClip(c.id)}>
                  {c.name}
                </ToggleButton>
              ))}
            </div>
          )}
        </PanelSection>
      )}
    </div>
  );
}
