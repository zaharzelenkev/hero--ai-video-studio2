"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore, timelineDuration } from "@/store/projectStore";
import { audioMixer } from "@/lib/editor/audioMixer";
import { Icon } from "@/components/ui/Icon";

export function formatTimecode(time: number, fps = 30): string {
  const safe = Math.max(0, time);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * fps);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

function TransportButton({
  label,
  title,
  onClick,
  active,
  wide,
}: {
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-8 items-center justify-center rounded-lg border text-[11px] font-bold transition ${
        wide ? "w-12" : "w-8"
      } ${
        active
          ? "border-violet-400/50 bg-violet-500/25 text-violet-100"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

export default function Transport() {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const loop = useProjectStore((s) => s.loop);
  const setLoop = useProjectStore((s) => s.setLoop);
  const rate = useProjectStore((s) => s.playbackRate);
  const setPlaybackRate = useProjectStore((s) => s.setPlaybackRate);
  const inPoint = useProjectStore((s) => s.inPoint);
  const outPoint = useProjectStore((s) => s.outPoint);
  const setInPoint = useProjectStore((s) => s.setInPoint);
  const setOutPoint = useProjectStore((s) => s.setOutPoint);
  const clearRange = useProjectStore((s) => s.clearRange);
  const volume = useProjectStore((s) => s.volume);
  const setVolume = useProjectStore((s) => s.setVolume);
  const addMarker = useProjectStore((s) => s.addMarker);

  const fps = project?.fps || 30;
  const duration = timelineDuration(project);
  const [level, setLevel] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const meterRef = useRef<number>(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = audioMixer.isPlaying() ? audioMixer.level() : 0;
      meterRef.current = meterRef.current * 0.6 + next * 0.4;
      setLevel(meterRef.current);
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const editPoints = useMemo(() => {
    if (!project) return [] as number[];
    const points = new Set<number>([0]);
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        points.add(Number(clip.start.toFixed(3)));
        points.add(Number((clip.start + clip.duration).toFixed(3)));
      }
    }
    for (const marker of project.markers) points.add(Number(marker.time.toFixed(3)));
    return [...points].sort((a, b) => a - b);
  }, [project]);

  const goPrevEdit = () => {
    const prev = [...editPoints].reverse().find((p) => p < playhead - 0.02);
    setPlayhead(prev ?? 0);
  };
  const goNextEdit = () => {
    const next = editPoints.find((p) => p > playhead + 0.02);
    setPlayhead(next ?? duration);
  };

  const commitTimecode = () => {
    setEditing(false);
    const parts = draft.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return;
    const [h = 0, m = 0, s = 0, f = 0] = parts.length === 4 ? parts : [0, ...parts];
    setPlayhead(h * 3600 + m * 60 + s + f / fps);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0b0b13] px-3 py-2">
      <div className="flex items-center gap-1">
        <TransportButton label="⏮" title="В начало (Home)" onClick={() => setPlayhead(inPoint ?? 0)} />
        <TransportButton label="⏪" title="Предыдущая склейка (↑)" onClick={goPrevEdit} />
        <TransportButton label="◀|" title="Кадр назад (←)" onClick={() => setPlayhead(Math.max(0, playhead - 1 / fps))} />
        <button
          onClick={() => setPlaying(!isPlaying)}
          title={isPlaying ? "Пауза (Space)" : "Воспроизведение (Space)"}
          aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
          className={`btn btn-primary h-8 w-14 !rounded-lg !px-0 text-sm ${
            isPlaying ? "!bg-gradient-to-b from-rose-500 to-rose-600 shadow-[0_6px_18px_-6px_rgba(248,113,113,0.5)]" : ""
          }`}
        >
          {isPlaying ? <Icon name="pause" size={14} /> : <Icon name="play" size={14} />}
        </button>
        <TransportButton label="|▶" title="Кадр вперёд (→)" onClick={() => setPlayhead(Math.min(duration, playhead + 1 / fps))} />
        <TransportButton label="⏩" title="Следующая склейка (↓)" onClick={goNextEdit} />
        <TransportButton label="⏭" title="В конец (End)" onClick={() => setPlayhead(outPoint ?? duration)} />
      </div>

      <div className="mx-1 h-6 w-px bg-white/10" />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitTimecode}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTimecode();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-[132px] rounded-lg border border-violet-400/40 bg-black/60 px-2 py-1 text-center font-mono text-xs text-violet-100 outline-none"
          aria-label="Ввести таймкод"
        />
      ) : (
        <button
          onClick={() => {
            setDraft(formatTimecode(playhead, fps));
            setEditing(true);
          }}
          title="Кликните, чтобы ввести таймкод"
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1 font-mono text-xs tabular-nums text-violet-200 hover:border-violet-400/40"
        >
          {formatTimecode(playhead, fps)}
          <span className="mx-1 text-slate-600">/</span>
          <span className="text-slate-400">{formatTimecode(duration, fps)}</span>
        </button>
      )}

      <div className="mx-1 h-6 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <TransportButton label="[" title="Отметить начало диапазона (I)" onClick={() => setInPoint(playhead)} active={inPoint !== null} />
        <TransportButton label="]" title="Отметить конец диапазона (O)" onClick={() => setOutPoint(playhead)} active={outPoint !== null} />
        <TransportButton label="✕" title="Сбросить диапазон" onClick={clearRange} />
        <TransportButton label="⚑" title="Поставить маркер (M)" onClick={() => addMarker(playhead)} />
        <TransportButton label="⟳" title="Зациклить воспроизведение (L)" onClick={() => setLoop(!loop)} active={loop} />
      </div>

      <div className="mx-1 h-6 w-px bg-white/10" />

      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
        Скорость
        <select
          value={rate}
          onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
          className="rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-slate-200 outline-none"
          aria-label="Скорость воспроизведения"
        >
          {[0.25, 0.5, 1, 1.5, 2].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex h-3 w-24 overflow-hidden rounded-full border border-white/10 bg-black/60" title="Уровень звука">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-[width] duration-75"
            style={{ width: `${Math.min(100, level * 130)}%` }}
          />
        </div>
        <span className="text-sm" aria-hidden>
          🔊
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="h-1 w-24 accent-violet-500"
          aria-label="Громкость предпросмотра"
        />
      </div>
    </div>
  );
}
