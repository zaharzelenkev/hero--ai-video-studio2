"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import type { Track, Clip, VideoClip } from "@/lib/types";

export default function TimelineV2() {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const pxPerSecond = useProjectStore((s) => s.pxPerSecond);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const selectClip = useProjectStore((s) => s.selectClip);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);
  const updateClip = useProjectStore((s) => s.updateClip);
  const duration = project ? project.duration : 60;
  const tracks = project ? project.tracks : [];

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{ trackId: string; clipId: string; startX: number; originalStart: number } | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Custom horizontal scrollbar state
  const [scrollInfo, setScrollInfo] = useState({ left: 0, viewport: 0, max: 0, canScroll: false });

  const totalWidth = Math.max(600, duration * pxPerSecond + 200);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollInfo({
      left: el.scrollLeft,
      viewport: el.clientWidth,
      max: max > 0 ? max : 0,
      canScroll: max > 1,
    });
  }, []);

  useEffect(() => {
    updateScroll();
    window.addEventListener("resize", updateScroll);
    return () => window.removeEventListener("resize", updateScroll);
  }, [updateScroll, project, tracks.length, duration, pxPerSecond]);

  const getTimeFromX = (clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left - 112; // timeline offset
    return Math.max(0, Math.min(duration, x / pxPerSecond));
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const t = getTimeFromX(e.clientX);
    setHoverTime(t);
    if (dragInfo) {
      const delta = (e.clientX - dragInfo.startX) / pxPerSecond;
      const newStart = Math.max(0, dragInfo.originalStart + delta);
      // Update clip start in store
      updateClip(dragInfo.clipId, (c: Clip) => ({ ...c, start: newStart }));
    }
  }, [dragInfo, pxPerSecond, updateClip]);

  const handleMouseUp = useCallback(() => {
    setDragInfo(null);
  }, []);

  useEffect(() => {
    if (dragInfo) {
      window.addEventListener("mousemove", handleMouseMove as any);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove as any);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragInfo, handleMouseMove, handleMouseUp]);

  // --- Custom horizontal scrollbar handlers ---
  const thumbWidthPct = scrollInfo.max > 0 && scrollInfo.viewport > 0
    ? Math.max(12, (scrollInfo.viewport / (scrollInfo.viewport + scrollInfo.max)) * 100)
    : 100;
  const thumbLeftPct = scrollInfo.max > 0
    ? (scrollInfo.left / scrollInfo.max) * (100 - thumbWidthPct)
    : 0;

  const onThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = scrollRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startScroll = el.scrollLeft;
    const ratio = scrollInfo.max / scrollInfo.viewport;
    const onMove = (ev: MouseEvent) => {
      el.scrollLeft = startScroll + (ev.clientX - startX) * ratio;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onTrackMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-scroll-thumb]")) return;
    const el = scrollRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / Math.max(1, rect.width);
    el.scrollLeft = rel * (el.scrollWidth - el.clientWidth);
  };

  if (!project) return (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">Загрузка проекта...</div>
  );

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#0a0a12] select-none overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Timeline ruler */}
      <div className="flex h-6 border-b border-white/10 bg-[#0d0d16] relative overflow-hidden">
        <div className="w-28 shrink-0 bg-gradient-to-r from-[#0d0d16] to-[#0a0a12] border-r border-white/10 flex items-center justify-center text-[10px] text-slate-400 font-mono">TRK</div>
        <div className="flex-1 relative" style={{ width: totalWidth }}>
          {Array.from({ length: Math.ceil(duration / 10) + 1 }).map((_, i) => {
            const t = i * 10;
            return (
              <div key={i} className="absolute top-0 bottom-0 border-l border-white/10 text-[9px] text-slate-500 pl-1 font-mono leading-6" style={{ left: t * pxPerSecond }}>{t}s</div>
            );
          })}
          {/* Draggable playhead — одна ровная линия, без градиента и ручки */}
          <div
            className="absolute top-0 bottom-0 z-30 cursor-col-resize group"
            style={{ left: `calc(${playhead * pxPerSecond}px - 8px)`, width: 16 }}
            onMouseDown={(e) => {
              e.preventDefault();
              const rect = (e.currentTarget.parentElement as HTMLElement)?.getBoundingClientRect();
              const startX = e.clientX;
              const startTime = playhead;
              const onMove = (ev: MouseEvent) => {
                if (!rect) return;
                const delta = ev.clientX - startX;
                const newTime = Math.max(0, Math.min(duration, startTime + delta / pxPerSecond));
                useProjectStore.getState().setPlayhead(newTime);
              };
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          >
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[3px] bg-violet-400" />
          </div>
        </div>
      </div>

      <div ref={scrollRef} onScroll={updateScroll} className="flex-1 overflow-auto custom-scrollbar">
        <div className="relative flex" style={{ minWidth: totalWidth + 112 }}>
          {/* Track headers */}
          <div className="w-28 shrink-0 bg-[#0d0d16] border-r border-white/10 flex flex-col">
            {tracks.map((track: Track) => (
              <div key={track.id} className={`h-20 border-b border-white/5 flex items-center justify-center text-[10px] font-bold text-slate-300 ${track.muted ? "opacity-50" : ""} ${track.hidden ? "text-slate-600" : ""}`} title={track.name}>
                <button onClick={() => { const s = useProjectStore.getState(); s.toggleTrackProp(track.id, "hidden"); }} className="truncate px-1">{track.type === "video" ? "🎥" : track.type === "audio" ? "🎵" : track.type === "text" ? "📝" : "•"} <span className="truncate">{track.name}</span></button>
              </div>
            ))}
          </div>

          {/* Timeline area */}
          <div className="flex-1 relative bg-gradient-to-b from-[#08080f] to-[#0a0a12]">
            {/* The playhead continues through every track with the same flat color and
                width as the ruler — визуально это одна сплошная линия. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-4 -translate-x-1/2"
              style={{ left: playhead * pxPerSecond }}
            >
              <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-violet-400" />
            </div>
            {tracks.map((track: Track) => (
              <div key={track.id} className="h-20 border-b border-white/5 relative flex items-center" style={{ height: 80 }}>
                {track.clips.map((clip: Clip) => {
                  const c = clip as VideoClip;
                  const left = clip.start * pxPerSecond;
                  const width = Math.max(20, clip.duration * pxPerSecond);
                  const isSelected = selectedClipId === clip.id;
                  return (
                    <button
                      key={clip.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        selectClip(clip.id);
                        setDragInfo({ trackId: track.id, clipId: clip.id, startX: e.clientX, originalStart: clip.start });
                      }}
                      onDoubleClick={() => splitClipAt(clip.id, playhead)}
                      className={`absolute h-16 rounded-lg shadow-lg text-[9px] font-medium border transition-all overflow-hidden text-left px-1 py-0.5 ${isSelected ? "ring-2 ring-violet-400 z-10" : "hover:ring-1 hover:ring-violet-300/60"} ${c.reversed ? "bg-rose-900/60 border-rose-500/40 text-rose-100" : track.type === "audio" ? "bg-gradient-to-br from-amber-900/60 to-yellow-800/60 border-amber-400/30 text-slate-100" : track.type === "text" || track.type === "subtitle" ? "bg-gradient-to-br from-emerald-900/60 to-teal-800/60 border-emerald-400/30 text-slate-100" : "bg-gradient-to-br from-blue-900/60 to-sky-800/60 border-blue-400/30 text-slate-100"}`}
                      style={{ left: left + 112, width, top: 4 }}
                      title={`${clip.name}\nСтарт: ${clip.start.toFixed(2)}\nДлительность: ${clip.duration.toFixed(2)}\nДвойной клик - разделить`}
                      aria-label={`Клип ${clip.name}, начало ${clip.start.toFixed(1)}`}
                    >
                      <div className="truncate font-bold">{clip.name}</div>
                      <div className="flex gap-1 text-[8px] opacity-70">
                        {c.speed && c.speed !== 1 ? <span>⚡{c.speed}x</span> : null}
                        {c.reversed ? <span>↺</span> : null}
                        {c.color && c.color.lut && c.color.lut !== "none" ? <span>🎨</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom horizontal scrollbar — большая, человеческая полоса */}
      {scrollInfo.canScroll && (
        <div className="shrink-0 px-3 pb-2 pt-1.5 bg-[#0d0d16] border-t border-white/10">
          <div
            className="relative h-5 rounded-full bg-white/10 hover:bg-white/15 cursor-pointer shadow-inner shadow-black/40"
            onMouseDown={onTrackMouseDown}
            title="Прокрутка таймлайна"
          >
            <div
              data-scroll-thumb="true"
              onMouseDown={onThumbMouseDown}
              className="absolute top-0 h-5 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 shadow-lg shadow-violet-900/50 cursor-grab active:cursor-grabbing ring-1 ring-white/20"
              style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="h-6 bg-[#0d0d16] border-t border-white/10 flex items-center px-3 gap-3 text-[10px] text-slate-400 font-mono shrink-0">
        <span>Масштаб: {pxPerSecond}px/сек</span>
        <span>•</span>
        <span>Длительность: {duration.toFixed(2)}с</span>
        <span>•</span>
        <span>Клипов: {tracks.reduce((s, t) => s + t.clips.length, 0)}</span>
        {hoverTime !== null && <span>• Курсор: {hoverTime.toFixed(2)}с</span>}
      </div>
    </div>
  );
}
