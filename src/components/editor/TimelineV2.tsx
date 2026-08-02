"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore, timelineDuration, findClip } from "@/store/projectStore";
import { mediaPool } from "@/lib/editor/resourcePool";
import { importFilesAsAssets } from "@/lib/editor/mediaImport";
import { isPictureLocked } from "@/lib/pictureLock";
import type { AudioClip, Clip, MediaAsset, TextClip, Track, VideoClip } from "@/lib/types";

const HEADER_WIDTH = 176;
const RULER_HEIGHT = 30;
const DEFAULT_HEIGHTS: Record<string, number> = { video: 76, audio: 60, text: 52, subtitle: 48 };
const TRIM_HANDLE = 9;

export const ASSET_DND_TYPE = "application/x-montiq-asset";

function trackHeight(track: Track): number {
  return track.height ?? DEFAULT_HEIGHTS[track.type] ?? 64;
}

function shortTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  if (t < 10) return `${t.toFixed(1)}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function rulerStep(pxPerSecond: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const c of candidates) {
    if (c * pxPerSecond >= 78) return c;
  }
  return 900;
}

interface DragState {
  kind: "move" | "trim-in" | "trim-out" | "scrub" | "marquee";
  clipId?: string;
  edge?: "in" | "out";
  grabOffset?: number;
  startX: number;
  startY: number;
  currentX?: number;
  currentY?: number;
  originStarts?: Record<string, number>;
  originTrackId?: string;
  moved?: boolean;
}

/* ------------------------------------------------------------------ */
/* clip visuals                                                        */
/* ------------------------------------------------------------------ */

function Filmstrip({ clip, asset, width }: { clip: VideoClip; asset: MediaAsset | undefined; width: number }) {
  const [, force] = useState(0);
  useEffect(() => mediaPool.subscribe(() => force((n) => n + 1)), []);
  if (!asset) return null;
  const frames = mediaPool.filmstripFor(asset, 14);
  if (!frames || frames.length === 0) return null;

  const tileWidth = 58;
  const count = Math.max(1, Math.ceil(width / tileWidth));
  const speed = clip.speed || 1;
  const tiles: string[] = [];
  for (let i = 0; i < count; i++) {
    const sourceTime = clip.inPoint + ((i * tileWidth) / Math.max(1, width)) * clip.duration * speed;
    const ratio = asset.duration > 0 ? Math.min(0.999, Math.max(0, sourceTime / asset.duration)) : 0;
    tiles.push(frames[Math.min(frames.length - 1, Math.floor(ratio * frames.length))]);
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded-[5px] opacity-90">
      {tiles.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt="" draggable={false} style={{ width: tileWidth }} className="h-full shrink-0 object-cover" />
      ))}
    </div>
  );
}

function Waveform({ clip, asset, width, height }: { clip: AudioClip; asset: MediaAsset | undefined; width: number; height: number }) {
  const [, force] = useState(0);
  useEffect(() => mediaPool.subscribe(() => force((n) => n + 1)), []);
  const peaks = asset ? mediaPool.peaksFor(asset) : null;
  const points = useMemo(() => {
    if (!peaks || peaks.length === 0 || !asset) return "";
    const speed = clip.speed || 1;
    const columns = Math.max(12, Math.min(600, Math.round(width / 2)));
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = 0; i < columns; i++) {
      const sourceTime = clip.inPoint + (i / columns) * clip.duration * speed;
      const ratio = asset.duration > 0 ? sourceTime / asset.duration : 0;
      const peak = peaks[Math.min(peaks.length - 1, Math.max(0, Math.floor(ratio * peaks.length)))] ?? 0;
      const x = (i / (columns - 1)) * width;
      const amp = Math.max(0.5, peak * (height / 2 - 3));
      top.push(`${x.toFixed(1)},${(height / 2 - amp).toFixed(1)}`);
      bottom.push(`${x.toFixed(1)},${(height / 2 + amp).toFixed(1)}`);
    }
    return [...top, ...bottom.reverse()].join(" ");
  }, [peaks, asset, clip.inPoint, clip.duration, clip.speed, width, height]);

  if (!points) {
    return <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber-200/30" />;
  }
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
      <polygon points={points} fill="rgba(253, 230, 138, 0.55)" />
    </svg>
  );
}

function ClipBlock({
  clip,
  track,
  asset,
  pxPerSecond,
  selected,
  onPointerDown,
}: {
  clip: Clip;
  track: Track;
  asset: MediaAsset | undefined;
  pxPerSecond: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, clip: Clip, zone: "body" | "in" | "out") => void;
}) {
  const width = Math.max(6, clip.duration * pxPerSecond);
  const height = trackHeight(track) - 8;
  const isVideo = clip.type === "video" || clip.type === "image";
  const isAudio = clip.type === "audio";

  const palette = isAudio
    ? "from-amber-600/40 to-amber-800/50 border-amber-300/40"
    : clip.type === "text" || clip.type === "subtitle"
      ? "from-emerald-600/40 to-teal-800/50 border-emerald-300/40"
      : (clip as VideoClip).reversed
        ? "from-rose-700/50 to-rose-900/60 border-rose-300/40"
        : "from-sky-600/40 to-indigo-800/50 border-sky-300/40";

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown(e, clip, "body")}
      style={{ left: clip.start * pxPerSecond, width, height, top: 4 }}
      title={`${clip.name}\n${clip.start.toFixed(2)}s → ${(clip.start + clip.duration).toFixed(2)}s (${clip.duration.toFixed(2)}s)`}
      className={`group absolute overflow-hidden rounded-md border bg-gradient-to-b ${palette} ${
        selected ? "shadow-[0_0_0_2px_rgba(167,139,250,0.95)] z-20" : "z-10 hover:brightness-110"
      } ${track.locked ? "opacity-60" : ""}`}
    >
      {isVideo && <Filmstrip clip={clip as VideoClip} asset={asset} width={width} />}
      {isAudio && <Waveform clip={clip as AudioClip} asset={asset} width={width} height={height} />}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 bg-black/45 px-1.5 py-[2px] backdrop-blur-[2px]">
        <span className="truncate text-[10px] font-semibold text-white/90">
          {clip.type === "text" ? `T · ${(clip as TextClip).text?.slice(0, 24) || "Текст"}` : clip.name}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[9px] text-white/60">{clip.duration.toFixed(1)}s</span>
      </div>

      {(clip as VideoClip).transitionIn && (clip as VideoClip).transitionIn?.duration > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-white/45 to-transparent"
          style={{ width: Math.min(width, ((clip as VideoClip).transitionIn.duration || 0) * pxPerSecond) }}
        />
      )}

      {!track.locked && (
        <>
          <div
            onPointerDown={(e) => onPointerDown(e, clip, "in")}
            className="absolute inset-y-0 left-0 z-30 cursor-ew-resize bg-white/0 transition group-hover:bg-white/25"
            style={{ width: TRIM_HANDLE }}
          />
          <div
            onPointerDown={(e) => onPointerDown(e, clip, "out")}
            className="absolute inset-y-0 right-0 z-30 cursor-ew-resize bg-white/0 transition group-hover:bg-white/25"
            style={{ width: TRIM_HANDLE }}
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* track header                                                        */
/* ------------------------------------------------------------------ */

function TrackHeader({ track, index, total }: { track: Track; index: number; total: number }) {
  const toggleTrackProp = useProjectStore((s) => s.toggleTrackProp);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const renameTrack = useProjectStore((s) => s.renameTrack);
  const moveTrack = useProjectStore((s) => s.moveTrack);
  const setTrackHeight = useProjectStore((s) => s.setTrackHeight);
  const selectedTrackId = useProjectStore((s) => s.selectedTrackId);
  const selectTrack = useProjectStore((s) => s.selectTrack);
  const closeGaps = useProjectStore((s) => s.closeGapsOnTrack);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(track.name);

  const icon = track.type === "video" ? "🎞" : track.type === "audio" ? "🎵" : track.type === "text" ? "𝐓" : "💬";
  const active = selectedTrackId === track.id;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = trackHeight(track);
    const onMove = (ev: PointerEvent) => setTrackHeight(track.id, startHeight + (ev.clientY - startY));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const toggleClass = (on: boolean, tone: string) =>
    `flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold transition ${
      on ? tone : "bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300"
    }`;

  return (
    <div
      onClick={() => selectTrack(track.id)}
      style={{ height: trackHeight(track) }}
      className={`relative flex w-[176px] shrink-0 flex-col justify-center gap-1 border-b border-r border-white/10 px-2 ${
        active ? "bg-violet-500/10" : "bg-[#0d0d16]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs" aria-hidden>
          {icon}
        </span>
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              renameTrack(track.id, draft.trim() || track.name);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameTrack(track.id, draft.trim() || track.name);
                setRenaming(false);
              }
            }}
            className="w-full rounded border border-violet-400/40 bg-black/60 px-1 text-[11px] text-white outline-none"
          />
        ) : (
          <button
            onDoubleClick={() => {
              setDraft(track.name);
              setRenaming(true);
            }}
            className="truncate text-left text-[11px] font-bold text-slate-200"
            title="Двойной клик — переименовать"
          >
            {track.name}
          </button>
        )}
        <span className="ml-auto font-mono text-[9px] text-slate-500">{track.clips.length}</span>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={() => toggleTrackProp(track.id, "hidden")} className={toggleClass(track.hidden, "bg-slate-500/40 text-white")} title="Видимость дорожки">
          👁
        </button>
        <button onClick={() => toggleTrackProp(track.id, "muted")} className={toggleClass(track.muted, "bg-rose-500/40 text-white")} title="Заглушить (M)">
          M
        </button>
        <button onClick={() => toggleTrackProp(track.id, "solo")} className={toggleClass(track.solo === true, "bg-amber-500/50 text-black")} title="Solo">
          S
        </button>
        <button onClick={() => toggleTrackProp(track.id, "locked")} className={toggleClass(track.locked, "bg-violet-500/40 text-white")} title="Заблокировать">
          🔒
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => closeGaps(track.id)}
            className="flex h-5 w-5 items-center justify-center rounded bg-white/5 text-[9px] text-slate-400 hover:bg-white/10 hover:text-white"
            title="Убрать пустоты на дорожке"
          >
            ⇥
          </button>
          <button
            onClick={() => moveTrack(track.id, -1)}
            disabled={index === 0}
            className="flex h-5 w-5 items-center justify-center rounded bg-white/5 text-[9px] text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Выше"
          >
            ▲
          </button>
          <button
            onClick={() => moveTrack(track.id, 1)}
            disabled={index === total - 1}
            className="flex h-5 w-5 items-center justify-center rounded bg-white/5 text-[9px] text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
            title="Ниже"
          >
            ▼
          </button>
          <button
            onClick={() => removeTrack(track.id)}
            className="flex h-5 w-5 items-center justify-center rounded bg-white/5 text-[9px] text-rose-300 hover:bg-rose-500/20"
            title="Удалить дорожку"
          >
            ✕
          </button>
        </div>
      </div>

      <div onPointerDown={startResize} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-violet-500/40" title="Высота дорожки" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* toolbar                                                             */
/* ------------------------------------------------------------------ */

function TimelineToolbar({ onFit }: { onFit: () => void }) {
  const tool = useProjectStore((s) => s.tool);
  const setTool = useProjectStore((s) => s.setTool);
  const snapping = useProjectStore((s) => s.snapping);
  const toggleSnapping = useProjectStore((s) => s.toggleSnapping);
  const ripple = useProjectStore((s) => s.ripple);
  const toggleRipple = useProjectStore((s) => s.toggleRipple);
  const splitAtPlayhead = useProjectStore((s) => s.splitAtPlayhead);
  const removeSelected = useProjectStore((s) => s.removeSelected);
  const rippleDeleteSelected = useProjectStore((s) => s.rippleDeleteSelected);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const detachAudio = useProjectStore((s) => s.detachAudio);
  const createTrack = useProjectStore((s) => s.createTrack);
  const addTextClip = useProjectStore((s) => s.addTextClip);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const pxPerSecond = useProjectStore((s) => s.pxPerSecond);
  const setZoom = useProjectStore((s) => s.setZoom);

  const btn = (active: boolean) =>
    `flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold transition ${
      active
        ? "border-violet-400/50 bg-violet-500/25 text-violet-100"
        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-[#0b0b13] px-2 py-1.5">
      <button onClick={() => setTool("select")} className={btn(tool === "select")} title="Выделение (V)">
        ⬉ Выбор
      </button>
      <button onClick={() => setTool("razor")} className={btn(tool === "razor")} title="Лезвие — резать клипы (C)">
        ✂ Лезвие
      </button>
      <button onClick={() => setTool("hand")} className={btn(tool === "hand")} title="Панорамирование таймлайна (H)">
        ✋ Рука
      </button>

      <div className="mx-1 h-5 w-px bg-white/10" />

      <button onClick={toggleSnapping} className={btn(snapping)} title="Магнит (N)">
        🧲 Магнит
      </button>
      <button onClick={toggleRipple} className={btn(ripple)} title="Ripple: сдвигать соседние клипы при удалении">
        ⇹ Ripple
      </button>

      <div className="mx-1 h-5 w-px bg-white/10" />

      <button onClick={splitAtPlayhead} className={btn(false)} title="Разрезать на плейхеде (S)">
        ✂ Разрез
      </button>
      <button onClick={() => (ripple ? rippleDeleteSelected() : removeSelected())} className={btn(false)} title="Удалить выделенное (Del)">
        🗑 Удалить
      </button>
      <button onClick={() => selectedClipId && duplicateClip(selectedClipId)} className={btn(false)} title="Дублировать (Ctrl+D)">
        ⧉ Дубль
      </button>
      <button onClick={() => selectedClipId && detachAudio(selectedClipId)} className={btn(false)} title="Отделить звук от видео">
        🎚 Отделить звук
      </button>

      <div className="mx-1 h-5 w-px bg-white/10" />

      <button onClick={() => createTrack("video")} className={btn(false)} title="Добавить видеодорожку">
        + Видео
      </button>
      <button onClick={() => createTrack("audio")} className={btn(false)} title="Добавить аудиодорожку">
        + Аудио
      </button>
      <button onClick={() => addTextClip()} className={btn(false)} title="Добавить титр на плейхеде">
        + Титр
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={() => setZoom(pxPerSecond / 1.4)} className={btn(false)} title="Отдалить (Ctrl+−)">
          −
        </button>
        <input
          type="range"
          min={4}
          max={400}
          step={1}
          value={pxPerSecond}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="h-1 w-28 accent-violet-500"
          aria-label="Масштаб таймлайна"
        />
        <button onClick={() => setZoom(pxPerSecond * 1.4)} className={btn(false)} title="Приблизить (Ctrl+=)">
          +
        </button>
        <button onClick={onFit} className={btn(false)} title="Вместить проект (Shift+Z)">
          ⤢ Вместить
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* main timeline                                                       */
/* ------------------------------------------------------------------ */

export default function TimelineV2() {
  const project = useProjectStore((s) => s.project);
  const pxPerSecond = useProjectStore((s) => s.pxPerSecond);
  const playhead = useProjectStore((s) => s.playhead);
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const tool = useProjectStore((s) => s.tool);
  const snapping = useProjectStore((s) => s.snapping);
  const inPoint = useProjectStore((s) => s.inPoint);
  const outPoint = useProjectStore((s) => s.outPoint);
  const isPlaying = useProjectStore((s) => s.isPlaying);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [importing, setImporting] = useState(false);

  const duration = timelineDuration(project);
  const contentSeconds = Math.max(duration + 12, 40);
  const contentWidth = contentSeconds * pxPerSecond;
  const assetsById = useMemo(() => new Map((project?.assets ?? []).map((a) => [a.id, a] as const)), [project?.assets]);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = rulerRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, (clientX - rect.left) / pxPerSecond);
    },
    [pxPerSecond],
  );

  /* --------------------------- snapping ---------------------------- */
  const snapTargets = useCallback(
    (excludeClipIds: Set<string>): number[] => {
      if (!project) return [0];
      const points: number[] = [0, playhead];
      if (inPoint !== null) points.push(inPoint);
      if (outPoint !== null) points.push(outPoint);
      for (const marker of project.markers) points.push(marker.time);
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          if (excludeClipIds.has(clip.id)) continue;
          points.push(clip.start, clip.start + clip.duration);
        }
      }
      return points;
    },
    [project, playhead, inPoint, outPoint],
  );

  const applySnap = useCallback(
    (value: number, excludeClipIds: Set<string>, extra: number[] = []): number => {
      if (!snapping) return value;
      const threshold = 9 / pxPerSecond;
      let best = value;
      let bestDistance = threshold;
      for (const target of [...snapTargets(excludeClipIds), ...extra]) {
        const distance = Math.abs(target - value);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = target;
        }
      }
      return best;
    },
    [snapping, pxPerSecond, snapTargets],
  );

  /* --------------------------- pointer handling -------------------- */
  const finishDrag = useCallback(() => {
    dragRef.current = null;
    setMarquee(null);
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const state = useProjectStore.getState();
      const currentProject = state.project;
      if (!currentProject) return;
      const time = timeFromClientX(event.clientX);
      drag.moved = drag.moved || Math.abs(event.clientX - drag.startX) > 2 || Math.abs(event.clientY - drag.startY) > 2;

      if (drag.kind === "scrub") {
        state.setPlayhead(applySnap(time, new Set(), []));
        return;
      }

      if (drag.kind === "marquee") {
        drag.currentX = event.clientX;
        drag.currentY = event.clientY;
        const x = Math.min(drag.startX, event.clientX);
        const y = Math.min(drag.startY, event.clientY);
        const w = Math.abs(event.clientX - drag.startX);
        const h = Math.abs(event.clientY - drag.startY);
        setMarquee({ x, y, w, h });
        const hits: string[] = [];
        const rect = rulerRef.current?.getBoundingClientRect();
        if (rect) {
          const t0 = Math.max(0, (x - rect.left) / pxPerSecond);
          const t1 = Math.max(0, (x + w - rect.left) / pxPerSecond);
          document.querySelectorAll<HTMLElement>("[data-lane-track]").forEach((lane) => {
            const laneRect = lane.getBoundingClientRect();
            if (laneRect.bottom < y || laneRect.top > y + h) return;
            const trackId = lane.dataset.laneTrack;
            const track = currentProject.tracks.find((t) => t.id === trackId);
            if (!track) return;
            for (const clip of track.clips) {
              if (clip.start + clip.duration >= t0 && clip.start <= t1) hits.push(clip.id);
            }
          });
        }
        state.selectClips(hits);
        return;
      }

      if (!drag.clipId) return;
      const found = findClip(currentProject, drag.clipId);
      if (!found) return;

      if (drag.kind === "move") {
        const exclude = new Set(Object.keys(drag.originStarts ?? {}));
        const rawStart = Math.max(0, time - (drag.grabOffset ?? 0));
        const snappedStart = applySnap(rawStart, exclude);
        const snappedEnd = applySnap(rawStart + found.clip.duration, exclude) - found.clip.duration;
        const start = Math.abs(snappedStart - rawStart) <= Math.abs(snappedEnd - rawStart) ? snappedStart : snappedEnd;
        const delta = start - (drag.originStarts?.[drag.clipId] ?? found.clip.start);

        // Определяем дорожку под курсором (перенос между дорожками).
        let targetTrackId = found.track.id;
        const single = Object.keys(drag.originStarts ?? {}).length <= 1;
        if (single) {
          const elements = document.elementsFromPoint(event.clientX, event.clientY);
          for (const el of elements) {
            const lane = (el as HTMLElement).closest?.("[data-lane-track]") as HTMLElement | null;
            if (lane?.dataset.laneTrack) {
              const candidate = currentProject.tracks.find((t) => t.id === lane.dataset.laneTrack);
              if (candidate && !candidate.locked && isCompatible(found.clip, candidate)) targetTrackId = candidate.id;
              break;
            }
          }
        }

        for (const [clipId, originStart] of Object.entries(drag.originStarts ?? {})) {
          const nextStart = Math.max(0, originStart + delta);
          state.moveClip(clipId, clipId === drag.clipId ? targetTrackId : findClip(currentProject, clipId)?.track.id ?? targetTrackId, nextStart, {
            history: false,
          });
        }
        return;
      }

      if (drag.kind === "trim-in" || drag.kind === "trim-out") {
        const exclude = new Set([drag.clipId]);
        const snapped = applySnap(time, exclude);
        state.trimClip(drag.clipId, drag.kind === "trim-in" ? "in" : "out", snapped, { history: false });
      }
    };

    const onUp = () => {
      if (dragRef.current) finishDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [applySnap, finishDrag, pxPerSecond, timeFromClientX]);

  const onClipPointerDown = useCallback(
    (event: React.PointerEvent, clip: Clip, zone: "body" | "in" | "out") => {
      event.stopPropagation();
      const state = useProjectStore.getState();
      const currentProject = state.project;
      if (!currentProject) return;
      const track = currentProject.tracks.find((t) => t.clips.some((c) => c.id === clip.id));
      if (!track || track.locked) return;

      // PICTURE LOCK: монтаж зафиксирован — клипы нельзя двигать, обрезать
      // и разрезать; выделение и навигация остаются доступными.
      if (isPictureLocked(currentProject)) {
        state.selectClip(clip.id, event.shiftKey || event.metaKey || event.ctrlKey);
        return;
      }

      if (state.tool === "razor") {
        state.beginHistory();
        state.splitClipAt(clip.id, timeFromClientX(event.clientX));
        return;
      }

      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      if (!state.selectedClipIds.includes(clip.id) || additive) {
        state.selectClip(clip.id, additive);
      }

      state.beginHistory();
      const selection = useProjectStore.getState().selectedClipIds;
      const ids = selection.includes(clip.id) ? selection : [clip.id];
      const originStarts: Record<string, number> = {};
      for (const id of ids) {
        const target = findClip(currentProject, id);
        if (target) originStarts[id] = target.clip.start;
      }

      dragRef.current = {
        kind: zone === "body" ? "move" : zone === "in" ? "trim-in" : "trim-out",
        clipId: clip.id,
        startX: event.clientX,
        startY: event.clientY,
        grabOffset: timeFromClientX(event.clientX) - clip.start,
        originStarts,
        originTrackId: track.id,
      };
    },
    [timeFromClientX],
  );

  const onLanePointerDown = useCallback(
    (event: React.PointerEvent) => {
      const state = useProjectStore.getState();
      if (state.tool === "hand") return;
      const time = timeFromClientX(event.clientX);
      if (event.shiftKey) {
        dragRef.current = { kind: "marquee", startX: event.clientX, startY: event.clientY };
        return;
      }
      state.clearSelection();
      state.setPlayhead(time);
      dragRef.current = { kind: "scrub", startX: event.clientX, startY: event.clientY };
    },
    [timeFromClientX],
  );

  const onRulerPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const state = useProjectStore.getState();
      state.setPlayhead(timeFromClientX(event.clientX));
      dragRef.current = { kind: "scrub", startX: event.clientX, startY: event.clientY };
    },
    [timeFromClientX],
  );

  /* --------------------------- drop targets ------------------------ */
  const handleDrop = useCallback(
    async (event: React.DragEvent, trackId: string) => {
      event.preventDefault();
      const state = useProjectStore.getState();
      const time = Math.max(0, timeFromClientX(event.clientX));
      const assetId = event.dataTransfer.getData(ASSET_DND_TYPE);
      if (assetId) {
        state.addClipFromAsset(assetId, { trackId, start: time });
        return;
      }
      const files = Array.from(event.dataTransfer.files || []);
      if (files.length === 0) return;
      setImporting(true);
      try {
        const assets = await importFilesAsAssets(files);
        state.addAssets(assets);
        let cursor = time;
        for (const asset of assets) {
          const created = useProjectStore.getState().addClipFromAsset(asset.id, {
            trackId: asset.kind === "audio" ? undefined : trackId,
            start: cursor,
          });
          if (created) {
            const clip = findClip(useProjectStore.getState().project, created)?.clip;
            cursor += clip?.duration ?? 4;
          }
        }
      } finally {
        setImporting(false);
      }
    },
    [timeFromClientX],
  );

  /* --------------------------- zoom & scroll ----------------------- */
  const fitToWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el || duration <= 0) return;
    const available = el.clientWidth - HEADER_WIDTH - 40;
    useProjectStore.getState().setZoom(Math.max(4, available / duration));
  }, [duration]);

  // Горячая клавиша «вместить проект» приходит из оболочки редактора.
  useEffect(() => {
    const handler = () => fitToWindow();
    window.addEventListener("montiq:timeline-fit", handler);
    return () => window.removeEventListener("montiq:timeline-fit", handler);
  }, [fitToWindow]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const state = useProjectStore.getState();
        const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12;
        state.setZoom(state.pxPerSecond * factor);
      } else if (event.shiftKey) {
        event.preventDefault();
        el.scrollLeft += event.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Автопрокрутка за плейхедом во время воспроизведения.
  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = playhead * pxPerSecond;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth - HEADER_WIDTH;
    if (x < viewLeft || x > viewRight - 80) {
      el.scrollLeft = Math.max(0, x - (el.clientWidth - HEADER_WIDTH) * 0.35);
    }
  }, [playhead, pxPerSecond, isPlaying]);

  if (!project) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Проект не загружен</div>;
  }

  const step = rulerStep(pxPerSecond);
  const tickCount = Math.ceil(contentSeconds / step) + 1;

  return (
    <div className="relative flex h-full flex-col bg-[#08080f]">
      <TimelineToolbar onFit={fitToWindow} />

      {isPictureLocked(project) && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
          🔒 Picture Lock — таймлайн зафиксирован (доступны: цвет, звук, титры, эффекты)
        </div>
      )}

      <div ref={scrollRef} className="relative flex-1 overflow-auto">
        <div className="relative" style={{ width: HEADER_WIDTH + contentWidth, minWidth: "100%" }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex bg-[#0b0b13]" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 z-40 flex w-[176px] shrink-0 items-center border-b border-r border-white/10 bg-[#0b0b13] px-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
              Timeline
            </div>
            <div
              ref={rulerRef}
              onPointerDown={onRulerPointerDown}
              className="relative shrink-0 cursor-col-resize border-b border-white/10"
              style={{ width: contentWidth, height: RULER_HEIGHT }}
            >
              {inPoint !== null && outPoint !== null && outPoint > inPoint && (
                <div
                  className="absolute inset-y-0 bg-violet-500/20"
                  style={{ left: inPoint * pxPerSecond, width: (outPoint - inPoint) * pxPerSecond }}
                />
              )}
              {Array.from({ length: tickCount }).map((_, i) => {
                const t = i * step;
                return (
                  <div key={i} className="absolute inset-y-0" style={{ left: t * pxPerSecond }}>
                    <div className="h-full w-px bg-white/15" />
                    <span className="absolute left-1 top-0.5 select-none font-mono text-[9px] text-slate-500">{shortTime(t)}</span>
                  </div>
                );
              })}
              {project.markers.map((marker) => (
                <button
                  key={marker.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    if (e.altKey) useProjectStore.getState().removeMarker(marker.id);
                    else useProjectStore.getState().setPlayhead(marker.time);
                  }}
                  title={`${marker.label} — клик: перейти, Alt+клик: удалить`}
                  className="absolute bottom-0 z-20 h-3 w-3 -translate-x-1/2 rounded-sm"
                  style={{ left: marker.time * pxPerSecond, background: marker.color || "#f59e0b" }}
                />
              ))}
            </div>
          </div>

          {/* Tracks */}
          {project.tracks.map((track, index) => (
            <div key={track.id} className="flex">
              <div className="sticky left-0 z-20">
                <TrackHeader track={track} index={index} total={project.tracks.length} />
              </div>
              <div
                data-lane-track={track.id}
                onPointerDown={onLanePointerDown}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => void handleDrop(e, track.id)}
                className={`relative shrink-0 border-b border-white/[0.06] ${
                  track.hidden ? "opacity-40" : ""
                } ${index % 2 === 0 ? "bg-[#0a0a12]" : "bg-[#0b0b14]"}`}
                style={{ width: contentWidth, height: trackHeight(track) }}
              >
                {/* сетка секунд */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px)",
                    backgroundSize: `${step * pxPerSecond}px 100%`,
                  }}
                />
                {track.clips.map((clip) => (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    track={track}
                    asset={assetsById.get((clip as VideoClip).assetId)}
                    pxPerSecond={pxPerSecond}
                    selected={selectedClipIds.includes(clip.id)}
                    onPointerDown={onClipPointerDown}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-40 w-px bg-violet-400"
            style={{ left: HEADER_WIDTH + playhead * pxPerSecond }}
          >
            <div className="absolute -left-[5px] top-0 h-3 w-[11px] rounded-b-sm bg-violet-400" />
          </div>
        </div>
      </div>

      {marquee && (
        <div
          className="pointer-events-none fixed z-50 border border-violet-400/70 bg-violet-500/15"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}

      {importing && (
        <div className="absolute inset-x-0 bottom-0 z-50 bg-violet-600/90 px-3 py-1 text-center text-[11px] font-bold text-white">
          Импортируем файлы в проект…
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-white/10 bg-[#0b0b13] px-3 py-1 text-[10px] text-slate-500">
        <span>
          Клипов:{" "}
          <b className="text-slate-300">{project.tracks.reduce((n: number, t: Track) => n + t.clips.length, 0)}</b>
        </span>
        <span>
          Длительность: <b className="text-slate-300">{duration.toFixed(2)}s</b>
        </span>
        <span className="hidden sm:inline">Shift+тяга — рамка выделения · Ctrl+колесо — зум · перетащите файл на дорожку</span>
        {tool === "razor" && <span className="text-rose-300">Режим лезвия: клик по клипу режет его</span>}
      </div>
    </div>
  );
}

function isCompatible(clip: Clip, track: Track): boolean {
  if (clip.type === "audio") return track.type === "audio";
  if (clip.type === "text") return track.type === "text" || track.type === "subtitle";
  if (clip.type === "subtitle") return track.type === "subtitle" || track.type === "text";
  return track.type === "video";
}
