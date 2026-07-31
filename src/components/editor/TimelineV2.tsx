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
  const [dragInfo, setDragInfo] = useState<{ trackId: string; clipId: string; startX: number; originalStart: number } | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const totalWidth = Math.max(600, duration * pxPerSecond + 200);

  const getTimeFromX = (clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left - 80; // timeline offset
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


  if (!project) return (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">Загрузка проекта...</div>
  );

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#0a0a12] select-none overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Timeline ruler */}
      <div className="flex h-6 border-b border-white/10 bg-[#0d0d16] relative overflow-hidden">
        <div className="w-20 shrink-0 bg-gradient-to-r from-[#0d0d16] to-[#0a0a12] border-r border-white/10 flex items-center justify-center text-[10px] text-slate-400 font-mono">TRK</div>
        <div className="flex-1 relative" style={{ width: totalWidth }}>
          {Array.from({ length: Math.ceil(duration / 10) + 1 }).map((_, i) => {
            const t = i * 10;
            return (
              <div key={i} className="absolute top-0 bottom-0 border-l border-white/10 text-[9px] text-slate-500 pl-1 font-mono leading-6" style={{ left: t * pxPerSecond }}>{t}s</div>
            );
          })}
          {/* Playhead line */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-400 via-fuchsia-400 to-rose-400 shadow-lg shadow-violet-500/50 z-20 pointer-events-none" style={{ left: playhead * pxPerSecond + 80 }} />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="flex" style={{ minWidth: totalWidth + 80 }}>
          {/* Track headers */}
          <div className="w-20 shrink-0 bg-[#0d0d16] border-r border-white/10 flex flex-col">
            {tracks.map((track: Track) => (
              <div key={track.id} className={`h-16 border-b border-white/5 flex items-center justify-center text-[10px] font-bold text-slate-300 ${track.muted ? "opacity-50" : ""} ${track.hidden ? "text-slate-600" : ""}`} title={track.name}>
                <button onClick={() => { const s = useProjectStore.getState(); s.toggleTrackProp(track.id, "hidden"); }} className="truncate px-1">{track.type === "video" ? "🎥" : track.type === "audio" ? "🎵" : track.type === "text" ? "📝" : "•"} <span className="truncate">{track.name}</span></button>
              </div>
            ))}
          </div>

          {/* Timeline area */}
          <div className="flex-1 relative bg-gradient-to-b from-[#08080f] to-[#0a0a12]">
            {tracks.map((track: Track) => (
              <div key={track.id} className="h-16 border-b border-white/5 relative flex items-center" style={{ height: 64 }}>
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
                      className={`absolute h-12 rounded-lg shadow-lg text-[9px] font-medium border transition-all overflow-hidden text-left px-1 py-0.5 ${isSelected ? "ring-2 ring-violet-400 z-10" : "hover:ring-1 hover:ring-violet-300/60"} ${c.reversed ? "bg-rose-900/60 border-rose-500/40 text-rose-100" : "bg-gradient-to-br from-violet-800/60 to-fuchsia-800/60 border-violet-400/30 text-slate-100"}`}
                      style={{ left: left + 80, width, top: 4 }}
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
