"use client";

import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";

export default function ExportPanelV2() {
  const project = useProjectStore((s) => s.project);
  const [format, setFormat] = useState<"mp4" | "webm" | "gif" | "mov">("mp4");
  const [quality, setQuality] = useState(80);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!project) return <div className="text-sm text-slate-400">Нет проекта для экспорта.</div>;

  const handleExport = () => {
    setExporting(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setExporting(false);
          return 100;
        }
        return p + 10;
      });
    }, 300);
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-gradient-to-r from-violet-900/30 to-fuchsia-900/30 border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Экспорт</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {(["mp4","webm","gif","mov"] as const).map(f => (
            <button key={f} onClick={() => setFormat(f)} className={`rounded-lg px-3 py-2 text-xs font-bold border transition ${format === f ? "bg-violet-600 text-white border-violet-400 shadow-lg" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`} aria-label={`Формат ${f}`}>{f.toUpperCase()}</button>
          ))}
        </div>
        <label className="text-[10px] text-slate-400 block mb-1">Качество (CRF / RGB)</label>
        <input type="range" min={0} max={100} value={quality} onChange={(e) => setQuality(parseInt(e.target.value))} className="w-full h-1.5 rounded-full bg-gradient-to-r from-violet-800 to-fuchsia-800" aria-label="Качество" />
        <div className="text-xs text-slate-300 mt-1">{quality}% — {quality < 30 ? "Отличное" : quality < 60 ? "Хорошее" : "Среднее"}</div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Разрешение и FPS</h3>
        <div className="flex gap-2 text-xs text-slate-300">
          <span>Размер: <b>{project.resolution.width}×{project.resolution.height}</b></span>
          <span>FPS: <b>{project.fps}</b></span>
        </div>
      </section>

      <button
        onClick={handleExport}
        disabled={exporting}
        className={`w-full rounded-xl py-3 text-sm font-bold shadow-lg transition ${exporting ? "bg-amber-600 text-white shadow-amber-500/30" : "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-violet-500/30 hover:brightness-110"}`}
        aria-label={exporting ? "Экспорт в процессе" : "Начать экспорт"}
      >
        {exporting ? `Экспорт... ${progress}%` : "🚀 Начать экспорт"}
      </button>
      {exporting && <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-400 shadow-lg" style={{ width: `${progress}%` }} /></div>}
    </div>
  );
}
