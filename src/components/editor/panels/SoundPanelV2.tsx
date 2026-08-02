"use client";

import { useProjectStore, findClip } from "@/store/projectStore";
import type { AudioClip, Clip, VideoClip } from "@/lib/types";
import { param } from "@/lib/types";
import {
  defaultSoundDesign,
  applySoundDesignPreset,
  type SoundDesignPreset,
  type SoundDesignSettings,
} from "@/lib/soundDesign";
import ParamControl from "../ParamControl";
import { PanelSection, ToggleButton, EmptyHint, SliderField, CheckboxField, NumberField } from "./ui";
import { useState, useCallback } from "react";

// ─── Preset definitions ────────────────────────────────────────────────────
const PRESETS: { id: SoundDesignPreset; label: string; icon: string }[] = [
  { id: "podcast",       label: "Подкаст",         icon: "🎙️" },
  { id: "youtube",       label: "YouTube",         icon: "📺" },
  { id: "cinematic",     label: "Кино",            icon: "🎬" },
  { id: "interview",     label: "Интервью",        icon: "🗣️" },
  { id: "documentary",   label: "Документалка",    icon: "📹" },
  { id: "social-short",  label: "Reels/Shorts",    icon: "📱" },
  { id: "voiceover",     label: "Озвучка",         icon: "🎤" },
  { id: "music-video",   label: "Клип",            icon: "🎵" },
  { id: "ambient",       label: "Эмбиент",         icon: "🌊" },
];

// ─── Section Toggle (defined outside render to avoid re-creation) ────────
function SectionToggle({ id, title, subtitle, enabled, expandedSection, setExpandedSection, onToggle, children }: {
  id: string; title: string; subtitle?: string; enabled: boolean;
  expandedSection: string | null;
  setExpandedSection: (v: string | null) => void;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const isOpen = expandedSection === id;
  return (
    <div className="rounded-lg border border-white/10 bg-black/30">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpandedSection(isOpen ? null : id)}
      >
        <span className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
        <span className="flex-1 text-[11px] font-semibold text-slate-200">{title}</span>
        {subtitle && <span className="text-[9px] text-slate-500">{subtitle}</span>}
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[9px] font-medium text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {enabled ? "ON" : "OFF"}
        </button>
        <span className="text-[10px] text-slate-500">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && <div className="border-t border-white/5 px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}

export default function SoundPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const toggleTrackProp = useProjectStore((s) => s.toggleTrackProp);
  const volume = useProjectStore((s) => s.volume);
  const setVolume = useProjectStore((s) => s.setVolume);
  const selectClip = useProjectStore((s) => s.selectClip);
  const updateProject = useProjectStore((s) => s.updateProject);

  const [expandedSection, setExpandedSection] = useState<string | null>("master");
  const [duckingPreview, setDuckingPreview] = useState(false);

  // ─── Sound Design helpers (before early return for hooks rules) ─────────
  const sd: SoundDesignSettings = project?.soundDesign ?? defaultSoundDesign();

  const patchSd = useCallback(
    (patch: Partial<SoundDesignSettings>) => {
      const base = project?.soundDesign ?? defaultSoundDesign();
      const next = { ...base, ...patch };
      updateProject((p) => ({ ...p, soundDesign: next }));
    },
    [project, updateProject],
  );

  const applyPreset = useCallback(
    (presetId: SoundDesignPreset) => {
      const base = project?.soundDesign ?? defaultSoundDesign();
      const presetPatch = applySoundDesignPreset(presetId);
      const next = { ...base, ...presetPatch };
      updateProject((p) => ({ ...p, soundDesign: next }));
    },
    [project, updateProject],
  );

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

  const toggle = (key: keyof SoundDesignSettings) => {
    const section = sd[key] as { enabled?: boolean } | undefined;
    if (!section) return;
    patchSd({ [key]: { ...section, enabled: !section.enabled } } as Partial<SoundDesignSettings>);
  };

  return (
    <div className="space-y-3">
      {/* ─── Мастер ────────────────────────────────────────────────────── */}
      <PanelSection title="Мастер">
        <SliderField label="Громкость предпросмотра" value={volume} min={0} max={1} onChange={setVolume} display={(v) => `${Math.round(v * 100)}%`} />
      </PanelSection>

      {/* ─── Пресеты ───────────────────────────────────────────────────── */}
      <PanelSection title="🎛️ Sound Design — Пресеты" subtitle="Одно нажатие — профессиональная обработка">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <ToggleButton
              key={p.id}
              onClick={() => applyPreset(p.id)}
            >
              {p.icon} {p.label}
            </ToggleButton>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 rounded bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={() => {
            updateProject((p) => ({ ...p, soundDesign: defaultSoundDesign() }));
          }}
        >
          Сбросить всё
        </button>
      </PanelSection>

      {/* ─── AI Noise Removal ──────────────────────────────────────────── */}
      <SectionToggle id="noiseRemoval" title="🧹 AI Noise Removal" subtitle="Шумоподавление" enabled={sd.noiseRemoval.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("noiseRemoval" as keyof SoundDesignSettings)}>
        <SliderField
          label="Интенсивность"
          value={sd.noiseRemoval.amount}
          min={0} max={1} step={0.05}
          onChange={(v) => patchSd({ noiseRemoval: { ...sd.noiseRemoval, amount: v } })}
          display={(v) => `${Math.round(v * 100)}%`}
        />
        <SliderField
          label="Порог шума"
          value={sd.noiseRemoval.thresholdDb}
          min={-60} max={-20} step={1}
          onChange={(v) => patchSd({ noiseRemoval: { ...sd.noiseRemoval, thresholdDb: v } })}
          display={(v) => `${v} дБ`}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="HP фильтр, Гц"
            value={sd.noiseRemoval.highpassHz}
            min={20} max={200} step={5}
            onChange={(v) => patchSd({ noiseRemoval: { ...sd.noiseRemoval, highpassHz: v } })}
          />
          <NumberField
            label="LP фильтр, Гц"
            value={sd.noiseRemoval.lowpassHz}
            min={5000} max={20000} step={500}
            onChange={(v) => patchSd({ noiseRemoval: { ...sd.noiseRemoval, lowpassHz: v } })}
          />
        </div>
      </SectionToggle>

      {/* ─── Voice Enhancement ─────────────────────────────────────────── */}
      <SectionToggle id="voiceEnhance" title="🗣️ Voice Enhancement" subtitle="Читаемость голоса" enabled={sd.voiceEnhance.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("voiceEnhance" as keyof SoundDesignSettings)}>
        <SliderField
          label="Присутствие (3.5 кГц)"
          value={sd.voiceEnhance.presence}
          min={0} max={12} step={0.5}
          onChange={(v) => patchSd({ voiceEnhance: { ...sd.voiceEnhance, presence: v } })}
          display={(v) => `+${v.toFixed(1)} дБ`}
        />
        <SliderField
          label="Воздух (10 кГц)"
          value={sd.voiceEnhance.air}
          min={0} max={6} step={0.5}
          onChange={(v) => patchSd({ voiceEnhance: { ...sd.voiceEnhance, air: v } })}
          display={(v) => `+${v.toFixed(1)} дБ`}
        />
        <SliderField
          label="Тело (250 Гц)"
          value={sd.voiceEnhance.body}
          min={-6} max={6} step={0.5}
          onChange={(v) => patchSd({ voiceEnhance: { ...sd.voiceEnhance, body: v } })}
          display={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} дБ`}
        />
        <SliderField
          label="Убрать муть (350 Гц)"
          value={sd.voiceEnhance.mudRemoval}
          min={0} max={1} step={0.05}
          onChange={(v) => patchSd({ voiceEnhance: { ...sd.voiceEnhance, mudRemoval: v } })}
          display={(v) => `${Math.round(v * 100)}%`}
        />
        <SliderField
          label="De-Esser (7 кГц)"
          value={sd.voiceEnhance.deEss}
          min={0} max={12} step={0.5}
          onChange={(v) => patchSd({ voiceEnhance: { ...sd.voiceEnhance, deEss: v } })}
          display={(v) => `−${v.toFixed(1)} дБ`}
        />
      </SectionToggle>

      {/* ─── Voice Isolation ───────────────────────────────────────────── */}
      <SectionToggle id="voiceIsolation" title="🎯 Voice Isolation" subtitle="Изоляция голоса" enabled={sd.voiceIsolation.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("voiceIsolation" as keyof SoundDesignSettings)}>
        <SliderField
          label="Сила изоляции"
          value={sd.voiceIsolation.strength}
          min={0} max={1} step={0.05}
          onChange={(v) => patchSd({ voiceIsolation: { ...sd.voiceIsolation, strength: v } })}
          display={(v) => `${Math.round(v * 100)}%`}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="НЧ граница, Гц"
            value={sd.voiceIsolation.lowCut}
            min={40} max={200} step={5}
            onChange={(v) => patchSd({ voiceIsolation: { ...sd.voiceIsolation, lowCut: v } })}
          />
          <NumberField
            label="ВЧ граница, Гц"
            value={sd.voiceIsolation.highCut}
            min={6000} max={18000} step={500}
            onChange={(v) => patchSd({ voiceIsolation: { ...sd.voiceIsolation, highCut: v } })}
          />
        </div>
      </SectionToggle>

      {/* ─── Auto Compressor ───────────────────────────────────────────── */}
      <SectionToggle id="compressor" title="📊 Auto Compressor" subtitle="Динамическая компрессия" enabled={sd.compressor.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("compressor" as keyof SoundDesignSettings)}>
        <SliderField
          label="Порог"
          value={sd.compressor.threshold}
          min={-60} max={0} step={1}
          onChange={(v) => patchSd({ compressor: { ...sd.compressor, threshold: v } })}
          display={(v) => `${v} дБ`}
        />
        <SliderField
          label="Ratio"
          value={sd.compressor.ratio}
          min={1} max={20} step={0.5}
          onChange={(v) => patchSd({ compressor: { ...sd.compressor, ratio: v } })}
          display={(v) => `${v}:1`}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Attack, мс"
            value={sd.compressor.attack}
            min={0} max={200} step={1}
            onChange={(v) => patchSd({ compressor: { ...sd.compressor, attack: v } })}
          />
          <NumberField
            label="Release, мс"
            value={sd.compressor.release}
            min={10} max={1000} step={5}
            onChange={(v) => patchSd({ compressor: { ...sd.compressor, release: v } })}
          />
        </div>
        <SliderField
          label="Колено"
          value={sd.compressor.knee}
          min={0} max={30} step={1}
          onChange={(v) => patchSd({ compressor: { ...sd.compressor, knee: v } })}
          display={(v) => `${v} дБ`}
        />
        <SliderField
          label="Makeup Gain"
          value={sd.compressor.makeupGain}
          min={0} max={24} step={0.5}
          onChange={(v) => patchSd({ compressor: { ...sd.compressor, makeupGain: v } })}
          display={(v) => `+${v.toFixed(1)} дБ`}
        />
      </SectionToggle>

      {/* ─── Limiter ───────────────────────────────────────────────────── */}
      <SectionToggle id="limiter" title="🔒 Limiter" subtitle="True-peak защита" enabled={sd.limiter.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("limiter" as keyof SoundDesignSettings)}>
        <SliderField
          label="Ceiling"
          value={sd.limiter.ceiling}
          min={-6} max={0} step={0.5}
          onChange={(v) => patchSd({ limiter: { ...sd.limiter, ceiling: v } })}
          display={(v) => `${v} дБ`}
        />
        <SliderField
          label="Release"
          value={sd.limiter.release}
          min={10} max={200} step={5}
          onChange={(v) => patchSd({ limiter: { ...sd.limiter, release: v } })}
          display={(v) => `${v} мс`}
        />
      </SectionToggle>

      {/* ─── Loudness Normalization ────────────────────────────────────── */}
      <SectionToggle id="loudnessNorm" title="📈 Loudness Normalization" subtitle="EBU R128 / LUFS" enabled={sd.loudnessNorm.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("loudnessNorm" as keyof SoundDesignSettings)}>
        <SliderField
          label="Целевая громкость"
          value={sd.loudnessNorm.targetLufs}
          min={-24} max={-8} step={1}
          onChange={(v) => patchSd({ loudnessNorm: { ...sd.loudnessNorm, targetLufs: v } })}
          display={(v) => `${v} LUFS`}
        />
        <SliderField
          label="True Peak"
          value={sd.loudnessNorm.truePeak}
          min={-4} max={0} step={0.5}
          onChange={(v) => patchSd({ loudnessNorm: { ...sd.loudnessNorm, truePeak: v } })}
          display={(v) => `${v} дБ`}
        />
        <SliderField
          label="Loudness Range"
          value={sd.loudnessNorm.range}
          min={5} max={20} step={1}
          onChange={(v) => patchSd({ loudnessNorm: { ...sd.loudnessNorm, range: v } })}
          display={(v) => `${v} LU`}
        />
        <div className="mt-1 text-[9px] text-slate-500">
          YouTube: −14 LUFS · Podcast: −16 LUFS · Spotify: −14 LUFS
        </div>
      </SectionToggle>

      {/* ─── Ducking ───────────────────────────────────────────────────── */}
      <SectionToggle id="ducking" title="🔉 Ducking" subtitle="Музыка под голос" enabled={sd.ducking.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("ducking" as keyof SoundDesignSettings)}>
        <SliderField
          label="Глубина"
          value={sd.ducking.depth}
          min={0} max={1} step={0.05}
          onChange={(v) => patchSd({ ducking: { ...sd.ducking, depth: v } })}
          display={(v) => `${Math.round(v * 100)}%`}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Attack, с"
            value={sd.ducking.attack}
            min={0} max={0.5} step={0.01}
            onChange={(v) => patchSd({ ducking: { ...sd.ducking, attack: v } })}
          />
          <NumberField
            label="Release, с"
            value={sd.ducking.release}
            min={0} max={2} step={0.05}
            onChange={(v) => patchSd({ ducking: { ...sd.ducking, release: v } })}
          />
        </div>
        <SliderField
          label="Порог голоса"
          value={sd.ducking.voiceThresholdDb}
          min={-60} max={-20} step={1}
          onChange={(v) => patchSd({ ducking: { ...sd.ducking, voiceThresholdDb: v } })}
          display={(v) => `${v} дБ`}
        />
        <ToggleButton active={duckingPreview} onClick={() => setDuckingPreview(!duckingPreview)}>
          {duckingPreview ? "👁️ Превью кривой" : "👁️ Превью кривой"}
        </ToggleButton>
      </SectionToggle>

      {/* ─── EQ ────────────────────────────────────────────────────────── */}
      <SectionToggle id="eq" title="🎚️ EQ" subtitle="6-полосный параметрический" enabled={sd.eq.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("eq" as keyof SoundDesignSettings)}>
        {sd.eq.bands.map((band, i) => (
          <div key={i} className="mb-2 rounded border border-white/5 p-2">
            <div className="mb-1 flex items-center gap-2">
              <CheckboxField
                label={`Полоса ${i + 1} — ${band.frequency >= 1000 ? (band.frequency / 1000).toFixed(1) + " кГц" : band.frequency + " Гц"}`}
                checked={band.enabled}
                onChange={(v) => {
                  const bands = [...sd.eq.bands];
                  bands[i] = { ...bands[i], enabled: v };
                  patchSd({ eq: { ...sd.eq, bands } });
                }}
              />
              <select
                className="rounded bg-white/5 px-1 py-0.5 text-[9px] text-slate-300"
                value={band.type}
                onChange={(e) => {
                  const bands = [...sd.eq.bands];
                  bands[i] = { ...bands[i], type: e.target.value as typeof band.type };
                  patchSd({ eq: { ...sd.eq, bands } });
                }}
              >
                <option value="highpass">HP</option>
                <option value="lowshelf">Low Shelf</option>
                <option value="peaking">Peak</option>
                <option value="highshelf">High Shelf</option>
                <option value="lowpass">LP</option>
              </select>
            </div>
            {band.enabled && (
              <div className="grid grid-cols-3 gap-1">
                <NumberField
                  label="Гц"
                  value={band.frequency}
                  min={20} max={20000} step={10}
                  onChange={(v) => {
                    const bands = [...sd.eq.bands];
                    bands[i] = { ...bands[i], frequency: v };
                    patchSd({ eq: { ...sd.eq, bands } });
                  }}
                />
                <SliderField
                  label="дБ"
                  value={band.gain}
                  min={-24} max={24} step={0.5}
                  onChange={(v) => {
                    const bands = [...sd.eq.bands];
                    bands[i] = { ...bands[i], gain: v };
                    patchSd({ eq: { ...sd.eq, bands } });
                  }}
                  display={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`}
                />
                <SliderField
                  label="Q"
                  value={band.Q}
                  min={0.1} max={10} step={0.1}
                  onChange={(v) => {
                    const bands = [...sd.eq.bands];
                    bands[i] = { ...bands[i], Q: v };
                    patchSd({ eq: { ...sd.eq, bands } });
                  }}
                  display={(v) => v.toFixed(1)}
                />
              </div>
            )}
          </div>
        ))}
        <CheckboxField
          label="EQ включён"
          checked={sd.eq.enabled}
          onChange={(v) => patchSd({ eq: { ...sd.eq, enabled: v } })}
        />
      </SectionToggle>

      {/* ─── Stereo Enhancement ────────────────────────────────────────── */}
      <SectionToggle id="stereoEnhance" title="🔊 Stereo Enhancement" subtitle="Стерео-картина" enabled={sd.stereoEnhance.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("stereoEnhance" as keyof SoundDesignSettings)}>
        <SliderField
          label="Ширина стерео"
          value={sd.stereoEnhance.width}
          min={0} max={2} step={0.05}
          onChange={(v) => patchSd({ stereoEnhance: { ...sd.stereoEnhance, width: v } })}
          display={(v) => v < 0.1 ? "Моно" : v < 0.9 ? `Уже ${Math.round(v * 100)}%` : v > 1.1 ? `Шире ${Math.round(v * 100)}%` : "Норма"}
        />
        <SliderField
          label="Баланс L/R"
          value={sd.stereoEnhance.balance}
          min={-1} max={1} step={0.05}
          onChange={(v) => patchSd({ stereoEnhance: { ...sd.stereoEnhance, balance: v } })}
          display={(v) => v === 0 ? "Центр" : v < 0 ? `L ${Math.round(-v * 100)}%` : `R ${Math.round(v * 100)}%`}
        />
        <SliderField
          label="Haas Delay"
          value={sd.stereoEnhance.haasDelay}
          min={0} max={20} step={0.5}
          onChange={(v) => patchSd({ stereoEnhance: { ...sd.stereoEnhance, haasDelay: v } })}
          display={(v) => `${v.toFixed(1)} мс`}
        />
      </SectionToggle>

      {/* ─── Foley ─────────────────────────────────────────────────────── */}
      <SectionToggle id="foley" title="🎬 Foley" subtitle="Звуковые эффекты" enabled={sd.foley.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("foley" as keyof SoundDesignSettings)}>
        <div className="flex flex-wrap gap-1.5">
          {(["footstep", "door", "whoosh", "click", "typing", "paper", "glass", "notification", "transition"] as const).map((type) => (
            <ToggleButton
              key={type}
              onClick={() => {
                const time = playhead;
                const events = [...sd.foley.events, { type, time, volume: 0.7, pitch: 1 }];
                patchSd({ foley: { enabled: sd.foley.enabled, events } });
              }}
            >
              {type} @ {playhead.toFixed(1)}с
            </ToggleButton>
          ))}
        </div>
        {sd.foley.events.length > 0 && (
          <div className="mt-2 space-y-1">
            {sd.foley.events.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-white/5 px-2 py-1">
                <span className="text-[10px] text-slate-300">{ev.type}</span>
                <span className="text-[9px] text-slate-500">{ev.time.toFixed(2)}с</span>
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={ev.volume}
                  className="flex-1"
                  onChange={(e) => {
                    const events = [...sd.foley.events];
                    events[i] = { ...events[i], volume: parseFloat(e.target.value) };
                    patchSd({ foley: { enabled: sd.foley.enabled, events } });
                  }}
                />
                <button
                  type="button"
                  className="text-[9px] text-red-400 hover:text-red-300"
                  onClick={() => {
                    const events = sd.foley.events.filter((_, j) => j !== i);
                    patchSd({ foley: { enabled: sd.foley.enabled, events } });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionToggle>

      {/* ─── Room Tone ─────────────────────────────────────────────────── */}
      <SectionToggle id="roomTone" title="🏠 Room Tone" subtitle="Фон помещения" enabled={sd.roomTone.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("roomTone" as keyof SoundDesignSettings)}>
        <div className="flex flex-wrap gap-1.5">
          {(["studio", "office", "room", "hall", "outdoor", "cafe"] as const).map((room) => (
            <ToggleButton
              key={room}
              active={sd.roomTone.room === room}
              onClick={() => patchSd({ roomTone: { ...sd.roomTone, room } })}
            >
              {room}
            </ToggleButton>
          ))}
        </div>
        <SliderField
          label="Громкость"
          value={sd.roomTone.volume}
          min={0} max={1} step={0.01}
          onChange={(v) => patchSd({ roomTone: { ...sd.roomTone, volume: v } })}
          display={(v) => `${Math.round(v * 100)}%`}
        />
      </SectionToggle>

      {/* ─── AI Music Selection ────────────────────────────────────────── */}
      <SectionToggle id="musicSelection" title="🎵 AI Music Selection" subtitle="Автоподбор музыки" enabled={sd.musicSelection.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("musicSelection" as keyof SoundDesignSettings)}>
        <CheckboxField
          label="Автоподбор под настроение"
          checked={sd.musicSelection.autoMatch}
          onChange={(v) => patchSd({ musicSelection: { ...sd.musicSelection, autoMatch: v } })}
        />
        <div className="flex flex-wrap gap-1.5">
          {(["none", "lofi", "electronic", "cinematic", "ambient", "acoustic", "corporate"] as const).map((style) => (
            <ToggleButton
              key={style}
              active={sd.musicSelection.style === style}
              onClick={() => patchSd({ musicSelection: { ...sd.musicSelection, style, autoMatch: false } })}
            >
              {style === "none" ? "натив" : style}
            </ToggleButton>
          ))}
        </div>
        <NumberField
          label="Целевой BPM (0 = авто)"
          value={sd.musicSelection.targetBpm}
          min={0} max={200} step={1}
          onChange={(v) => patchSd({ musicSelection: { ...sd.musicSelection, targetBpm: v } })}
        />
      </SectionToggle>

      {/* ─── AI Beat Sync ──────────────────────────────────────────────── */}
      <SectionToggle id="beatSync" title="🥁 AI Beat Sync" subtitle="Привязка к биту" enabled={sd.beatSync.enabled} expandedSection={expandedSection} setExpandedSection={setExpandedSection} onToggle={() => toggle("beatSync" as keyof SoundDesignSettings)}>
        <CheckboxField
          label="Переходы → downbeat"
          checked={sd.beatSync.snapTransitions}
          onChange={(v) => patchSd({ beatSync: { ...sd.beatSync, snapTransitions: v } })}
        />
        <CheckboxField
          label="Речь → бит"
          checked={sd.beatSync.snapSpeechStart}
          onChange={(v) => patchSd({ beatSync: { ...sd.beatSync, snapSpeechStart: v } })}
        />
        <SliderField
          label="Допуск привязки"
          value={sd.beatSync.snapTolerance}
          min={0.1} max={1} step={0.05}
          onChange={(v) => patchSd({ beatSync: { ...sd.beatSync, snapTolerance: v } })}
          display={(v) => `±${v.toFixed(2)}с`}
        />
      </SectionToggle>

      {/* ─── Микшер дорожек ────────────────────────────────────────────── */}
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

      {/* ─── Звук видеоклипа ───────────────────────────────────────────── */}
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

      {/* ─── Аудиоклип (детали) ────────────────────────────────────────── */}
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

          <PanelSection title="Эквалайзер (клип)" subtitle="дБ">
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

          <PanelSection title="Компрессор (клип)">
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
