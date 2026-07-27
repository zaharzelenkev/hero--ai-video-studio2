"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import { createTrack, createTextClip } from "@/lib/factories";
import type { Clip, Track, Marker } from "@/lib/types";

const TRACK_HEIGHT = 64;
const RULER_HEIGHT = 28;
const MIN_ZOOM = 20;
const MAX_ZOOM = 400;

interface DragState {
  clipId: string;
  mode: "move" | "trim-left" | "trim-right";
  startX: number;
  startY: number;
  originalClip: Clip;
  originalTrackId: string;
}

interface Selection {
  clipIds: Set<string>;
  groupId?: string;
}

function trackColor(track: Track) {
  if (track.type === "video") return "from-blue-600/70 to-blue-700/70 border-blue-400/40";
  if (track.type === "audio") return "from-green-600/70 to-green-700/70 border-green-400/40";
  if (track.type === "subtitle") return "from-purple-600/70 to-purple-700/70 border-purple-400/40";
  return "from-amber-600/70 to-amber-700/70 border-amber-400/40";
}

function clipLabel(clip: Clip) {
  if (clip.type === "text") return `📝 ${clip.text.slice(0, 18)}`;
  if (clip.type === "subtitle") return `💬 ${clip.text.slice(0, 18)}`;
  if (clip.type === "audio") return `🎵 ${clip.name}`;
  if (clip.type === "image") return `🖼️ ${clip.name}`;
  return `🎬 ${clip.name}`;
}

export default function TimelineV2() {
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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selection, setSelection] = useState<Selection>({ clipIds: new Set() });
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId?: string } | null>(null);
  const [magnetEnabled, setMagnetEnabled] = useState(true);

  // Snap to grid (every 0.5 seconds when zoomed in)
  const snapToGrid = useCallback(
    (time: number) => {
      if (!snapEnabled) return time;
      const gridSize = pxPerSecond > 100 ? 0.1 : pxPerSecond > 50 ? 0.5 : 1;
      return Math.round(time / gridSize) * gridSize;
    },
    [snapEnabled, pxPerSecond]
  );

  // Magnet snap to other clips and playhead
  const magnetSnap = useCallback(
    (time: number, excludeClipId?: string) => {
      if (!magnetEnabled || !project) return time;
      
      const threshold = 10 / pxPerSecond; // 10px threshold
      const snapPoints: number[] = [playhead];
      
      // Add all clip boundaries as snap points
      project.tracks.forEach((track) => {
        track.clips.forEach((clip) => {
          if (clip.id !== excludeClipId) {
            snapPoints.push(clip.start);
            snapPoints.push(clip.start + clip.duration);
          }
        });
      });
      
      // Find closest snap point
      for (const point of snapPoints) {
        if (Math.abs(time - point) < threshold) {
          return point;
        }
      }
      
      return time;
    },
    [magnetEnabled, project, playhead, pxPerSecond]
  );

  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clip: Clip, mode: "move" | "trim-left" | "trim-right") => {
      e.stopPropagation();
      const track = project?.tracks.find((t) => t.id === clip.trackId);
      if (track?.locked) {
        selectClip(clip.id);
        return;
      }
      
      if (e.shiftKey && mode === "move") {
        // Multi-select
        const newSelection = new Set(selection.clipIds);
        if (newSelection.has(clip.id)) {
          newSelection.delete(clip.id);
        } else {
          newSelection.add(clip.id);
        }
        setSelection({ clipIds: newSelection });
      } else {
        selectClip(clip.id);
        setSelection({ clipIds: new Set([clip.id]) });
      }
      
      setDrag({
        clipId: clip.id,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        originalClip: clip,
        originalTrackId: clip.trackId,
      });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [selectClip, project, selection]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !project) return;
      
      const dxSec = (e.clientX - drag.startX) / pxPerSecond;
      const dyPx = e.clientY - drag.startY;
      
      updateClip(drag.clipId, (c) => {
        if (drag.mode === "move") {
          let newStart = snapToGrid(drag.originalClip.start + dxSec);
          newStart = magnetSnap(newStart, drag.clipId);
          newStart = Math.max(0, newStart);
          
          // Check if moved to different track
          const trackIndex = Math.floor(Math.abs(dyPx) / TRACK_HEIGHT);
          if (Math.abs(dyPx) > TRACK_HEIGHT / 2) {
            const tracksOfType = project.tracks.filter((t) => t.type === c.type);
            const currentIndex = tracksOfType.findIndex((t) => t.id === drag.originalTrackId);
            const direction = dyPx > 0 ? 1 : -1;
            const newIndex = currentIndex + direction * (trackIndex > 0 ? 1 : 0);
            
            if (newIndex >= 0 && newIndex < tracksOfType.length) {
              const newTrack = tracksOfType[newIndex];
              return { ...c, start: newStart, trackId: newTrack.id };
            }
          }
          
          return { ...c, start: newStart };
        }
        
        if (drag.mode === "trim-right") {
          const newDuration = Math.max(0.1, drag.originalClip.duration + dxSec);
          if ("outPoint" in c && "inPoint" in drag.originalClip) {
            const origAny = drag.originalClip as Clip & { inPoint: number; outPoint: number };
            return { ...c, duration: newDuration, outPoint: origAny.inPoint + newDuration } as Clip;
          }
          return { ...c, duration: newDuration };
        }
        
        // trim-left
        const maxShift = drag.originalClip.duration - 0.1;
        const shift = Math.max(-drag.originalClip.start, Math.min(maxShift, dxSec));
        if ("inPoint" in drag.originalClip) {
          const origAny = drag.originalClip as Clip & { inPoint: number };
          return {
            ...c,
            start: drag.originalClip.start + shift,
            duration: drag.originalClip.duration - shift,
            inPoint: Math.max(0, origAny.inPoint + shift),
          } as Clip;
        }
        return { ...c, start: drag.originalClip.start + shift, duration: drag.originalClip.duration - shift };
      });
    },
    [drag, pxPerSecond, updateClip, snapToGrid, magnetSnap, project]
  );

  const endDrag = useCallback(() => {
    if (drag) persist();
    setDrag(null);
  }, [drag, persist]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      
      // Delete selected clips
      if ((e.key === "Delete" || e.key === "Backspace") && selection.clipIds.size > 0) {
        e.preventDefault();
        selection.clipIds.forEach((id) => removeClip(id));
        setSelection({ clipIds: new Set() });
      }
      
      // Duplicate (Cmd/Ctrl + D)
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedClipId) {
        e.preventDefault();
        duplicateClip(selectedClipId);
      }
      
      // Split at playhead (S)
      if (e.key === "s" && selectedClipId) {
        e.preventDefault();
        splitClipAt(selectedClipId, playhead);
      }
      
      // Toggle snap (N)
      if (e.key === "n") {
        e.preventDefault();
        setSnapEnabled((v) => !v);
      }
      
      // Toggle magnet (M)
      if (e.key === "m") {
        e.preventDefault();
        setMagnetEnabled((v) => !v);
      }
    },
    [selection, selectedClipId, removeClip, duplicateClip, splitClipAt, playhead]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, clipId?: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  }, []);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, []);

  if (!project) return null;

  const totalWidth = Math.max(1200, (project.duration + 20) * pxPerSecond);
  const selectedClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
  const markers = project.markers || [];

  return (
    <div className="flex h-full flex-col border-t border-white/10 bg-[#0d0d16]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              updateProject((p) => ({
                ...p,
                tracks: [...p.tracks, createTrack("video", `Видео ${p.tracks.filter((t) => t.type === "video").length + 1}`)],
              }))
            }
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
            title="Добавить видеодорожку"
          >
            ➕ Видео
          </button>
          <button
            onClick={() =>
              updateProject((p) => ({
                ...p,
                tracks: [...p.tracks, createTrack("audio", `Аудио ${p.tracks.filter((t) => t.type === "audio").length + 1}`)],
              }))
            }
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
            title="Добавить аудиодорожку"
          >
            ➕ Аудио
          </button>
          <button
            onClick={() =>
              updateProject((p) => ({
                ...p,
                tracks: [...p.tracks, createTrack("text", `Текст ${p.tracks.filter((t) => t.type === "text").length + 1}`)],
              }))
            }
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
            title="Добавить текстовую дорожку"
          >
            ➕ Текст
          </button>
        </div>

        <div className="flex items-center gap-3">
          {selectedClip && (
            <>
              <button
                onClick={() => splitClipAt(selectedClip.id, playhead)}
                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
                title="Разрезать на плейхеде (S)"
              >
                ✂️ Разрезать
              </button>
              <button
                onClick={() => duplicateClip(selectedClip.id)}
                className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5"
                title="Дублировать (Cmd+D)"
              >
                ⧉ Дублировать
              </button>
              <button
                onClick={() => removeClip(selectedClip.id)}
                className="rounded-md border border-red-400/30 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10"
                title="Удалить (Delete)"
              >
                🗑 Удалить
              </button>
            </>
          )}
          
          <div className="h-4 w-px bg-white/10" />
          
          <button
            onClick={() => setSnapEnabled((v) => !v)}
            className={`rounded-md border px-2 py-1 text-[11px] ${
              snapEnabled ? "border-violet-400/50 bg-violet-500/20 text-violet-300" : "border-white/10 text-slate-400"
            }`}
            title="Привязка к сетке (N)"
          >
            📐 Snap
          </button>
          
          <button
            onClick={() => setMagnetEnabled((v) => !v)}
            className={`rounded-md border px-2 py-1 text-[11px] ${
              magnetEnabled ? "border-violet-400/50 bg-violet-500/20 text-violet-300" : "border-white/10 text-slate-400"
            }`}
            title="Магнит (M)"
          >
            🧲 Magnet
          </button>
          
          <div className="h-4 w-px bg-white/10" />
          
          <span className="text-[11px] text-slate-500">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            value={pxPerSecond}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="h-1 w-24 accent-violet-500"
          />
          <span className="text-[11px] text-slate-500">{Math.round((pxPerSecond / MAX_ZOOM) * 100)}%</span>
        </div>
      </div>

      {/* Timeline Content */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto scroll-smooth custom-scrollbar"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onContextMenu={(e) => handleContextMenu(e)}
      >
        <div style={{ width: totalWidth + 180, position: "relative" }}>
          {/* Ruler */}
          <div
            className="sticky top-0 z-20 flex cursor-pointer border-b border-white/10 bg-[#0d0d16]"
            style={{ height: RULER_HEIGHT, paddingLeft: 180 }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              setPlayhead(Math.max(0, x / pxPerSecond));
            }}
          >
            {Array.from({ length: Math.ceil(totalWidth / pxPerSecond) + 1 }).map((_, i) => (
              <div key={i} style={{ width: pxPerSecond }} className="relative shrink-0 border-r border-white/5">
                <span className="absolute left-1 top-0.5 text-[10px] font-medium text-slate-400">
                  {Math.floor(i / 60)}:{String(i % 60).padStart(2, "0")}
                </span>
                {/* Sub-divisions */}
                {pxPerSecond > 80 && (
                  <div className="absolute left-1/2 top-2 h-1.5 w-px bg-white/10" />
                )}
              </div>
            ))}
          </div>

          {/* Markers */}
          {markers.map((marker) => (
            <div
              key={marker.id}
              className="absolute top-0 z-10 flex flex-col items-center"
              style={{ left: 180 + marker.time * pxPerSecond }}
            >
              <div
                className="h-3 w-3 -translate-x-1/2 cursor-pointer rounded-full border-2 border-white bg-amber-500"
                title={marker.label}
              />
              <div className="h-full w-px bg-amber-500/30" />
            </div>
          ))}

          {/* Tracks */}
          {project.tracks.map((track, trackIndex) => (
            <div
              key={track.id}
              className="flex border-b border-white/5"
              style={{ height: track.height || TRACK_HEIGHT }}
            >
              {/* Track Header */}
              <div className="sticky left-0 z-10 flex w-[180px] shrink-0 flex-col justify-between border-r border-white/10 bg-[#12121d] px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={track.name}
                    onChange={(e) =>
                      updateProject((p) => ({
                        ...p,
                        tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, name: e.target.value } : t)),
                      }))
                    }
                    className="w-24 truncate bg-transparent text-[11px] font-medium text-slate-300 outline-none"
                  />
                  <button
                    onClick={() =>
                      updateProject((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== track.id) }))
                    }
                    className="text-[10px] text-slate-500 hover:text-red-400"
                    title="Удалить дорожку"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    title="Показать/скрыть"
                    onClick={() => toggleTrackProp(track.id, "hidden")}
                    className={`flex h-5 w-5 items-center justify-center rounded ${
                      track.hidden ? "bg-white/5 opacity-40" : "hover:bg-white/5"
                    }`}
                  >
                    {track.hidden ? "👁️‍🗨️" : "👁️"}
                  </button>
                  <button
                    title="Звук"
                    onClick={() => toggleTrackProp(track.id, "muted")}
                    className={`flex h-5 w-5 items-center justify-center rounded ${
                      track.muted ? "bg-white/5 opacity-40" : "hover:bg-white/5"
                    }`}
                  >
                    {track.muted ? "🔇" : "🔊"}
                  </button>
                  <button
                    title="Заблокировать"
                    onClick={() => toggleTrackProp(track.id, "locked")}
                    className={`flex h-5 w-5 items-center justify-center rounded ${
                      track.locked ? "bg-amber-500/20 text-amber-400" : "hover:bg-white/5"
                    }`}
                  >
                    {track.locked ? "🔒" : "🔓"}
                  </button>
                  {track.type === "audio" && (
                    <button
                      title="Solo"
                      onClick={() =>
                        updateProject((p) => ({
                          ...p,
                          tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, solo: !t.solo } : t)),
                        }))
                      }
                      className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${
                        track.solo ? "bg-yellow-500/20 text-yellow-400" : "text-slate-500 hover:bg-white/5"
                      }`}
                    >
                      S
                    </button>
                  )}
                </div>
              </div>

              {/* Track Content */}
              <div className="relative flex-1">
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    onPointerDown={(e) => onClipPointerDown(e, clip, "move")}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectClip(clip.id);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, clip.id)}
                    className={`absolute top-1 flex h-[calc(100%-8px)] cursor-grab items-center overflow-hidden rounded-lg border bg-gradient-to-br px-2 text-[10px] font-medium text-white shadow-lg ${trackColor(
                      track
                    )} ${selectedClipId === clip.id ? "ring-2 ring-white" : ""} ${
                      selection.clipIds.has(clip.id) ? "ring-2 ring-violet-400" : ""
                    } ${clip.locked ? "cursor-not-allowed opacity-60" : ""}`}
                    style={{
                      left: clip.start * pxPerSecond,
                      width: Math.max(8, clip.duration * pxPerSecond),
                    }}
                  >
                    {/* Left trim handle */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onClipPointerDown(e, clip, "trim-left");
                      }}
                      className="absolute left-0 top-0 h-full w-3 cursor-ew-resize bg-black/40 hover:bg-white/40 transition-colors z-20 flex items-center justify-center border-r border-white/20 hover:border-violet-400"
                    />
                    
                    {/* Clip label */}
                    <span className="truncate">{clipLabel(clip)}</span>
                    
                    {/* Group indicator */}
                    {clip.group && (
                      <span className="ml-1 text-[8px] opacity-60">⚡</span>
                    )}
                    
                    {/* Right trim handle */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onClipPointerDown(e, clip, "trim-right");
                      }}
                      className="absolute right-0 top-0 h-full w-3 cursor-ew-resize bg-black/40 hover:bg-white/40 transition-colors z-20 flex items-center justify-center border-l border-white/20 hover:border-violet-400"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 z-30 h-full w-px bg-gradient-to-b from-fuchsia-400 to-fuchsia-600"
            style={{ left: 180 + playhead * pxPerSecond }}
          >
            <div className="h-4 w-4 -translate-x-1/2 rounded-full bg-fuchsia-400 shadow-lg shadow-fuchsia-500/50" />
            <div className="absolute left-1/2 top-4 -translate-x-1/2 text-[9px] font-bold text-fuchsia-300">
              {Math.floor(playhead / 60)}:{String(Math.floor(playhead % 60)).padStart(2, "0")}.{String(Math.floor((playhead % 1) * 100)).padStart(2, "0")}
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-white/10 bg-[#1a1a24] py-1 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.clipId ? (
            <>
              <button
                onClick={() => {
                  duplicateClip(contextMenu.clipId!);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-white/5"
              >
                ⧉ Дублировать
              </button>
              <button
                onClick={() => {
                  splitClipAt(contextMenu.clipId!, playhead);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-white/5"
              >
                ✂️ Разрезать
              </button>
              <div className="my-1 h-px bg-white/10" />
              <button
                onClick={() => {
                  removeClip(contextMenu.clipId!);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-red-300 hover:bg-red-500/10"
              >
                🗑 Удалить
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                updateProject((p) => ({
                  ...p,
                  markers: [...(p.markers || []), { id: `marker_${Date.now()}`, time: playhead, label: "Маркер" }],
                }));
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-left text-[11px] text-slate-300 hover:bg-white/5"
            >
              📍 Добавить маркер
            </button>
          )}
        </div>
      )}

      {/* Help overlay */}
      <div className="border-t border-white/10 bg-[#0d0d16] px-3 py-1.5 text-[10px] text-slate-500">
        <span className="mr-4">Space - воспроизведение</span>
        <span className="mr-4">S - разрезать</span>
        <span className="mr-4">Cmd+D - дублировать</span>
        <span className="mr-4">N - привязка</span>
        <span className="mr-4">M - магнит</span>
        <span className="mr-4">Shift+Click - мульти-выбор</span>
      </div>
    </div>
  );
}
