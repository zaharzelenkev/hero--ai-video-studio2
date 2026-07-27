"use client";

import { useCallback, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { createTrack, createTextClip } from "@/lib/factories";
import type { Clip, Track } from "@/lib/types";

const TRACK_HEIGHT = 52;
const RULER_HEIGHT = 24;

function trackColor(track: Track) {
  if (track.type === "video") return "from-sky-600/70 to-sky-700/70 border-sky-400/40";
  if (track.type === "audio") return "from-emerald-600/70 to-emerald-700/70 border-emerald-400/40";
  return "from-amber-600/70 to-amber-700/70 border-amber-400/40";
}

function clipLabel(clip: Clip) {
  if (clip.type === "text") return `📝 ${clip.text.slice(0, 18)}`;
  if (clip.type === "audio") return `🎵 ${clip.name}`;
  if (clip.type === "image") return `🖼️ ${clip.name}`;
  return `🎬 ${clip.name}`;
}

export default function Timeline() {
  const project = useProjectStore((s) => s.project);
  const pxPerSecond = useProjectStore((s) => s.pxPerSecond);
  const setZoom = useProjectStore((s) => s.setZoom);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const selectClip = useProjectStore((s) => s.selectClip);
  const playhead = useProjectStore((s) => s.playhead);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateProject = useProjectStore((s) => s.updateProject);
  const removeClip = useProjectStore((s) => s.removeClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);
  const toggleTrackProp = useProjectStore((s) => s.toggleTrackProp);
  const persist = useProjectStore((s) => s.persist);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<null | { clipId: string; mode: "move" | "trim-left" | "trim-right"; startX: number; orig: Clip }>(
    null,
  );

  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clip: Clip, mode: "move" | "trim-left" | "trim-right") => {
      e.stopPropagation();
      const track = project?.tracks.find((t) => t.id === clip.trackId);
      if (track?.locked) {
        selectClip(clip.id);
        return;
      }
      selectClip(clip.id);
      setDrag({ clipId: clip.id, mode, startX: e.clientX, orig: clip });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [selectClip, project],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      const dxSec = (e.clientX - drag.startX) / pxPerSecond;
      updateClip(drag.clipId, (c) => {
        if (drag.mode === "move") {
          return { ...c, start: Math.max(0, drag.orig.start + dxSec) };
        }
        if (drag.mode === "trim-right") {
          const newDuration = Math.max(0.2, drag.orig.duration + dxSec);
          if ("outPoint" in c && "inPoint" in drag.orig) {
            const origAny = drag.orig as Clip & { inPoint: number; outPoint: number };
            return { ...c, duration: newDuration, outPoint: origAny.inPoint + newDuration } as Clip;
          }
          return { ...c, duration: newDuration };
        }
        // trim-left
        const maxShift = drag.orig.duration - 0.2;
        const shift = Math.max(-drag.orig.start, Math.min(maxShift, dxSec));
        if ("inPoint" in drag.orig) {
          const origAny = drag.orig as Clip & { inPoint: number };
          return {
            ...c,
            start: drag.orig.start + shift,
            duration: drag.orig.duration - shift,
            inPoint: Math.max(0, origAny.inPoint + shift),
          } as Clip;
        }
        return { ...c, start: drag.orig.start + shift, duration: drag.orig.duration - shift };
      });
    },
    [drag, pxPerSecond, updateClip],
  );

  const endDrag = useCallback(() => {
    if (drag) persist();
    setDrag(null);
  }, [drag, persist]);

  if (!project) return null;

  const totalWidth = Math.max(800, (project.duration + 20) * pxPerSecond);
  const selectedClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);

  return (
    <div className="flex h-full flex-col border-t border-white/10 bg-[#0d0d16]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <button
          onClick={() => updateProject((p) => ({ ...p, tracks: [...p.tracks, createTrack("video", `Видео ${p.tracks.filter((t) => t.type === "video").length + 1}`)] }))}
          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
        >
          + Видео-дорожка
        </button>
        <button
          onClick={() => updateProject((p) => ({ ...p, tracks: [...p.tracks, createTrack("audio", `Аудио ${p.tracks.filter((t) => t.type === "audio").length + 1}`)] }))}
          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
        >
          + Аудио-дорожка
        </button>
        <button
          onClick={() => {
            updateProject((p) => {
              const textTrack = p.tracks.find((t) => t.type === "text") ?? createTrack("text", "Титры");
              const exists = p.tracks.some((t) => t.id === textTrack.id);
              const clip = createTextClip({ trackId: textTrack.id, start: playhead, duration: 3 });
              const tracks = exists
                ? p.tracks.map((t) => (t.id === textTrack.id ? { ...t, clips: [...t.clips, clip] } : t))
                : [...p.tracks, { ...textTrack, clips: [clip] }];
              return { ...p, tracks };
            });
          }}
          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
        >
          + Текст на плейхеде
        </button>

        <div className="ml-auto flex items-center gap-2">
          {selectedClip && (
            <>
              <button
                onClick={() => splitClipAt(selectedClip.id, playhead)}
                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
              >
                ✂️ Разрезать на плейхеде
              </button>
              <button
                onClick={() => duplicateClip(selectedClip.id)}
                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
              >
                ⧉ Дублировать
              </button>
              <button
                onClick={() => removeClip(selectedClip.id)}
                className="rounded-md border border-red-400/30 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
              >
                🗑 Удалить
              </button>
            </>
          )}
          <span className="text-[11px] text-slate-500">Zoom</span>
          <input
            type="range"
            min={20}
            max={300}
            value={pxPerSecond}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="h-1 w-24 accent-violet-500"
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div style={{ width: totalWidth + 140, position: "relative" }}>
          {/* Ruler */}
          <div
            className="sticky top-0 z-10 flex cursor-pointer border-b border-white/10 bg-[#0d0d16]"
            style={{ height: RULER_HEIGHT, paddingLeft: 140 }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              setPlayhead(Math.max(0, x / pxPerSecond));
            }}
          >
            {Array.from({ length: Math.ceil(totalWidth / pxPerSecond) + 1 }).map((_, i) => (
              <div key={i} style={{ width: pxPerSecond }} className="relative shrink-0 border-r border-white/5">
                <span className="absolute left-1 top-0.5 text-[9px] text-slate-500">{i}s</span>
              </div>
            ))}
          </div>

          {/* Tracks */}
          {project.tracks.map((track) => (
            <div key={track.id} className="flex border-b border-white/5" style={{ height: TRACK_HEIGHT }}>
              <div className="sticky left-0 z-10 flex w-[140px] shrink-0 items-center justify-between gap-1 border-r border-white/10 bg-[#12121d] px-2">
                <span className="truncate text-[11px] font-medium text-slate-300">{track.name}</span>
                <div className="flex gap-1 text-[10px]">
                  <button
                    title="Показать/скрыть"
                    onClick={() => toggleTrackProp(track.id, "hidden")}
                    className={track.hidden ? "opacity-40" : ""}
                  >
                    👁
                  </button>
                  <button
                    title="Звук"
                    onClick={() => toggleTrackProp(track.id, "muted")}
                    className={track.muted ? "opacity-40" : ""}
                  >
                    🔊
                  </button>
                  <button
                    title="Заблокировать"
                    onClick={() => toggleTrackProp(track.id, "locked")}
                    className={track.locked ? "text-amber-400" : ""}
                  >
                    🔒
                  </button>
                </div>
              </div>
              <div className="relative flex-1">
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    onPointerDown={(e) => onClipPointerDown(e, clip, "move")}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectClip(clip.id);
                    }}
                    className={`absolute top-1 flex h-[calc(100%-8px)] cursor-grab items-center overflow-hidden rounded-md border bg-gradient-to-b px-2 text-[10px] font-medium text-white/90 ${trackColor(
                      track,
                    )} ${selectedClipId === clip.id ? "ring-2 ring-white" : ""}`}
                    style={{ left: clip.start * pxPerSecond, width: Math.max(6, clip.duration * pxPerSecond) }}
                  >
                    <div
                      onPointerDown={(e) => onClipPointerDown(e, clip, "trim-left")}
                      className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/10"
                    />
                    <span className="truncate">{clipLabel(clip)}</span>
                    <div
                      onPointerDown={(e) => onClipPointerDown(e, clip, "trim-right")}
                      className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/10"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 z-20 h-full w-px bg-fuchsia-400"
            style={{ left: 140 + playhead * pxPerSecond }}
          >
            <div className="h-3 w-3 -translate-x-1/2 rounded-full bg-fuchsia-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
