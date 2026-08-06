"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore, timelineDuration } from "@/store/projectStore";
import { audioMixer } from "@/lib/editor/audioMixer";
import { Icon, type IconName } from "@/components/ui/Icon";

export function formatTimecode(time: number, fps = 30): string {
  const safe = Math.max(0, time);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * fps);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

/**
 * Таймкод вынесен в отдельный компонент: при воспроизведении плейхед
 * обновляется 60 раз/с, и перерисовывать из-за этого всю панель транспорта
 * (кнопки, слайдеры, метры) не нужно — обновляется только цифры.
 */
function TimecodeControl({ fps, duration }: { fps: number; duration: number }) {
  const playhead = useProjectStore((s) => s.playhead);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commitTimecode = () => {
    setEditing(false);
    const parts = draft.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return;
    const [h = 0, m = 0, s = 0, f = 0] = parts.length === 4 ? parts : [0, ...parts];
    setPlayhead(h * 3600 + m * 60 + s + f / fps);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitTimecode}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitTimecode();
          if (e.key === "Escape") setEditing(false);
        }}
        className="timecode w-[128px] rounded-lg border border-violet-400/40 bg-black/60 px-2 py-1.5 text-center text-violet-100 outline-none"
        aria-label="Ввести таймкод"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(formatTimecode(playhead, fps));
        setEditing(true);
      }}
      title="Кликните, чтобы ввести таймкод"
      className="timecode rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-violet-200 transition hover:border-violet-400/40 hover:bg-black/60"
    >
      {formatTimecode(playhead, fps)}
      <span className="mx-1 text-slate-600">/</span>
      <span className="text-slate-400">{formatTimecode(duration, fps)}</span>
    </button>
  );
}

function TransportButton({
  icon,
  title,
  onClick,
  active,
  disabled,
}: {
  icon: IconName;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`transport-btn ${active ? "transport-btn-active" : ""}`}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

export default function Transport() {
  const project = useProjectStore((s) => s.project);
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
    const current = useProjectStore.getState().playhead;
    const prev = [...editPoints].reverse().find((p) => p < current - 0.02);
    setPlayhead(prev ?? 0);
  };
  const goNextEdit = () => {
    const current = useProjectStore.getState().playhead;
    const next = editPoints.find((p) => p > current + 0.02);
    setPlayhead(next ?? duration);
  };

  const volumePct = volume * 100;

  return (
    <div className="transport-bar flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 sm:gap-2 sm:px-3">
      {/* Транспорт */}
      <div className="flex items-center gap-1">
        <TransportButton icon="skip-back" title="В начало (Home)" onClick={() => setPlayhead(inPoint ?? 0)} />
        <TransportButton icon="chevrons-left" title="Предыдущая склейка" onClick={goPrevEdit} />
        <TransportButton
          icon="frame-back"
          title="Кадр назад (←)"
          onClick={() => setPlayhead(Math.max(0, useProjectStore.getState().playhead - 1 / fps))}
        />
        <button
          onClick={() => setPlaying(!isPlaying)}
          title={isPlaying ? "Пауза (Space)" : "Воспроизведение (Space)"}
          aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
          className={`transport-btn transport-play ${isPlaying ? "!bg-gradient-to-b from-rose-500 to-rose-600 !shadow-[0_6px_18px_-6px_rgba(248,113,113,0.5)]" : ""}`}
        >
          {isPlaying ? <Icon name="pause" size={15} /> : <Icon name="play" size={15} />}
        </button>
        <TransportButton
          icon="frame-forward"
          title="Кадр вперёд (→)"
          onClick={() => setPlayhead(Math.min(duration, useProjectStore.getState().playhead + 1 / fps))}
        />
        <TransportButton icon="chevrons-right" title="Следующая склейка" onClick={goNextEdit} />
        <TransportButton icon="skip-forward" title="В конец (End)" onClick={() => setPlayhead(outPoint ?? duration)} />
      </div>

      <div className="mx-0.5 h-6 w-px bg-white/[0.08]" />

      {/* Таймкод — отдельный лёгкий компонент, см. TimecodeControl */}
      <TimecodeControl fps={fps} duration={duration} />

      <div className="mx-0.5 h-6 w-px bg-white/[0.08]" />

      {/* Диапазон и маркеры */}
      <div className="flex items-center gap-1">
        <TransportButton icon="bracket-left" title="Отметить начало диапазона (I)" onClick={() => setInPoint(useProjectStore.getState().playhead)} active={inPoint !== null} />
        <TransportButton icon="bracket-right" title="Отметить конец диапазона (O)" onClick={() => setOutPoint(useProjectStore.getState().playhead)} active={outPoint !== null} />
        <TransportButton icon="x" title="Сбросить диапазон" onClick={clearRange} />
        <TransportButton icon="flag" title="Поставить маркер (M)" onClick={() => addMarker(useProjectStore.getState().playhead)} />
        <TransportButton icon="repeat" title="Зациклить воспроизведение (L)" onClick={() => setLoop(!loop)} active={loop} />
      </div>

      <div className="mx-0.5 h-6 w-px bg-white/[0.08]" />

      {/* Скорость */}
      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
        <Icon name="gauge" size={12} className="text-slate-500" />
        <select
          value={rate}
          onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
          className="rounded-lg border border-white/[0.08] bg-black/40 px-1.5 py-1.5 text-[11px] text-slate-200 outline-none transition hover:border-white/20"
          aria-label="Скорость воспроизведения"
        >
          {[0.25, 0.5, 1, 1.5, 2].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>

      {/* Громкость */}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex h-3 w-24 overflow-hidden rounded-full border border-white/[0.08] bg-black/60" title="Уровень звука">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-[width] duration-75"
            style={{ width: `${Math.min(100, level * 130)}%` }}
          />
        </div>
        <Icon name={volume <= 0 ? "volume-x" : volume < 0.5 ? "volume" : "volume-2"} size={14} className="shrink-0 text-slate-400" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="h-4 w-20 sm:w-24"
          style={{ ["--range-pct" as string]: `${volumePct}%` }}
          aria-label="Громкость предпросмотра"
        />
      </div>
    </div>
  );
}
