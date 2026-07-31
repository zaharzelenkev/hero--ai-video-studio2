"use client";

import { useState, useEffect, useCallback } from "react";
import { useProjectStore } from "@/store/projectStore";

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(ms).padStart(3, "0")}`;
}

export default function Transport() {
  const playhead = useProjectStore((s) => s.playhead);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const duration = useProjectStore((s) => s.project ? s.project.duration : 0);

  const [loop, setLoop] = useState(false);
  const [draggable, setDraggable] = useState(false);

  const tick = useCallback(() => {
    if (!isPlaying) return;
    const next = playhead + 1 / 60;
    if (next >= duration) {
      if (loop) setPlayhead(0);
      else { setPlayhead(duration); setPlaying(false); }
    } else {
      setPlayhead(next);
    }
  }, [isPlaying, playhead, duration, loop, setPlayhead, setPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const id = setInterval(() => {
      tick();
      frame++;
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [isPlaying, tick]);

  const goStart = () => setPlayhead(0);
  const goEnd = () => setPlayhead(Math.max(0, duration - 0.1));
  const stepBack = () => setPlayhead(Math.max(0, playhead - 1));
  const stepForward = () => setPlayhead(Math.min(duration - 0.01, playhead + 1));

  return (
    <div className="flex items-center gap-2 border-t border-white/10 bg-gradient-to-r from-[#0d0d16] to-[#0a0a12] px-3 py-2 shadow-2xl shrink-0 z-30 select-none" aria-label="Транспорт">
      <button onClick={goStart} title="В начало" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-slate-200 hover:bg-white/10 transition" aria-label="В начало">⏮</button>
      <button onClick={stepBack} title="Назад 1 сек" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-slate-200 hover:bg-white/10 transition" aria-label="Назад">◀◀</button>
      
      <button
        onClick={() => setPlaying(!isPlaying)}
        aria-label={isPlaying ? "Пауза" : "Воспроизведение"}
        title={isPlaying ? "Пауза" : "Воспроизведение"}
        className={`flex h-9 w-14 items-center justify-center rounded-xl text-sm font-bold shadow-lg transition-all ${isPlaying ? "bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-rose-500/30" : "bg-gradient-to-r from-blue-700 to-cyan-600 text-white shadow-blue-500/20 hover:brightness-110"}`}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      <button onClick={stepForward} title="Вперед 1 сек" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-slate-200 hover:bg-white/10 transition" aria-label="Вперед">▶▶</button>
      <button onClick={goEnd} title="В конец" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-slate-200 hover:bg-white/10 transition" aria-label="В конец">⏭</button>

      <div className="mx-2 h-6 w-px bg-white/10" />

      <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-2.5 py-1 min-w-[130px] justify-center font-mono text-xs tabular-nums text-slate-200" aria-live="polite" aria-atomic="true">
        <span title="Текущее время">{fmt(playhead)}</span>
        <span className="text-slate-500">/</span>
        <span title="Общая длительность" className="text-slate-400">{fmt(duration)}</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => setLoop(!loop)}
          aria-pressed={loop}
          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold border transition ${loop ? "bg-amber-500/20 border-amber-400/40 text-amber-300" : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"}`}
          title={loop ? "Отключить зацикливание" : "Зациклить"}
        >
          🔄 {loop ? "Loop ON" : "Loop"}
        </button>
        <button
          onClick={() => setDraggable(d => !d)}
          aria-label="Перетаскивание"
          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold border transition ${draggable ? "bg-violet-500/20 border-violet-400/40 text-amber-300" : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"}`}
          title="Точное перетаскивание на таймлайне"
        >
          ✋ {draggable ? "Drag" : "Drag"}
        </button>
      </div>
    </div>
  );
}
