"use client";

import { useProjectStore } from "@/store/projectStore";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}


function TransportTimeDisplay() {
  const playhead = useProjectStore((s) => s.playhead);
  const duration = useProjectStore((s) => s.project?.duration || 0);
  return (
    <span className="font-mono text-xs text-slate-300">
      {fmt(playhead)} / {fmt(duration)}
    </span>
  );
}

function TransportScrubber() {
  const playhead = useProjectStore((s) => s.playhead);
  const duration = useProjectStore((s) => s.project?.duration || 0);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  
  return (
    <input
      type="range"
      min={0}
      max={Math.max(0.1, duration)}
      step={0.01}
      value={Math.min(playhead, duration)}
      onPointerDown={() => {
         if (isPlaying) setPlaying(false);
      }}
      onChange={(e) => setPlayhead(parseFloat(e.target.value))}
      className="mx-2 h-1 flex-1 cursor-pointer accent-violet-500 hover:accent-violet-400"
    />
  );
}

export default function Transport() {
  const project = useProjectStore((s) => s.project);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const setPlaying = useProjectStore((s) => s.setPlaying);

  if (!project) return null;

  return (
    <div className="flex items-center gap-3 border-t border-white/10 bg-white/[0.02] px-4 py-2">
      <button
        onClick={() => setPlaying(!isPlaying)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-sm text-white shadow-lg shadow-violet-600/30 transition-all hover:scale-105 hover:shadow-violet-600/50 active:scale-95"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <button onClick={() => setPlayhead(0)} className="text-xs text-slate-400 transition-colors hover:text-white">
        ⏮ В начало
      </button>
      <TransportTimeDisplay />
      <TransportScrubber />
      <span className="text-[11px] text-slate-500">
        {project.resolution.width}×{project.resolution.height} · {project.fps} fps
      </span>
    </div>
  );
}
