"use client";

import { useProjectStore } from "@/store/projectStore";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export default function Transport() {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const setPlaying = useProjectStore((s) => s.setPlaying);

  if (!project) return null;

  return (
    <div className="flex items-center gap-3 border-t border-white/10 bg-white/[0.02] px-4 py-2">
      <button
        onClick={() => setPlaying(!isPlaying)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-500"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <button onClick={() => setPlayhead(0)} className="text-xs text-slate-400 hover:text-white">
        ⏮ В начало
      </button>
      <span className="font-mono text-xs text-slate-300">
        {fmt(playhead)} / {fmt(project.duration)}
      </span>
      <input
        type="range"
        min={0}
        max={Math.max(0.1, project.duration)}
        step={0.01}
        value={Math.min(playhead, project.duration)}
        onChange={(e) => setPlayhead(parseFloat(e.target.value))}
        className="mx-2 h-1 flex-1 accent-violet-500"
      />
      <span className="text-[11px] text-slate-500">
        {project.resolution.width}×{project.resolution.height} · {project.fps} fps
      </span>
    </div>
  );
}
