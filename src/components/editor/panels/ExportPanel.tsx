"use client";

import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { renderProject } from "@/lib/render";
import type { ExportSettings } from "@/lib/types";

const RESOLUTIONS: { label: string; width: number; height: number }[] = [
  { label: "480p (854×480)", width: 854, height: 480 },
  { label: "720p HD (1280×720)", width: 1280, height: 720 },
  { label: "1080p Full HD (1920×1080)", width: 1920, height: 1080 },
  { label: "Вертикальное 720×1280 (Reels/Shorts)", width: 720, height: 1280 },
  { label: "Квадрат 1080×1080", width: 1080, height: 1080 },
];

export default function ExportPanel() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  if (!project) return null;
  const settings = project.exportSettings;

  const setSettings = (fn: (s: ExportSettings) => ExportSettings) =>
    updateProject((p) => ({ ...p, exportSettings: fn(p.exportSettings) }));

  const handleExport = async () => {
    setRendering(true);
    setProgress(0);
    setResultUrl(null);
    try {
      const blob = await renderProject(
        project,
        (r) => setProgress(r),
        (m) => setLog(m),
      );
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setLog(
        raw.includes("fetch") || raw.includes("network")
          ? "Не удалось загрузить видеодвижок — проверьте подключение к интернету и попробуйте ещё раз."
          : raw || "Ошибка экспорта",
      );
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Экспорт</h3>

      <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-1 block text-[11px] text-slate-400">Разрешение</label>
        <select
          value={`${settings.width}x${settings.height}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split("x").map(Number);
            setSettings((s) => ({ ...s, width: w, height: h }));
          }}
          className="mb-3 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
        >
          {RESOLUTIONS.map((r) => (
            <option key={r.label} value={`${r.width}x${r.height}`}>
              {r.label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-[11px] text-slate-400">Формат</label>
        <select
          value={settings.format}
          onChange={(e) => setSettings((s) => ({ ...s, format: e.target.value as ExportSettings["format"] }))}
          className="mb-3 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
        >
          <option value="mp4">MP4 (H.264 + AAC)</option>
          <option value="webm">WebM (VP9 + Opus)</option>
        </select>

        <label className="mb-1 block text-[11px] text-slate-400">FPS: {settings.fps}</label>
        <input type="range" min={15} max={60} step={1} value={settings.fps} onChange={(e) => setSettings((s) => ({ ...s, fps: parseInt(e.target.value) }))} className="mb-3 h-1 w-full accent-violet-500" />

        <label className="mb-1 block text-[11px] text-slate-400">Качество (CRF, меньше = лучше): {settings.crf}</label>
        <input type="range" min={16} max={35} step={1} value={settings.crf} onChange={(e) => setSettings((s) => ({ ...s, crf: parseInt(e.target.value) }))} className="h-1 w-full accent-violet-500" />
      </div>

      <button
        disabled={rendering}
        onClick={handleExport}
        className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {rendering ? `Рендерим… ${Math.round(progress * 100)}%` : "🚀 Экспортировать видео"}
      </button>

      {rendering && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      )}

      {log && <p className="mt-2 break-all text-[10px] text-slate-500">{log}</p>}

      {resultUrl && (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <video src={resultUrl} controls className="mb-2 w-full rounded-md bg-black" />
          <a
            href={resultUrl}
            download={`${project.title || "video"}.${settings.format}`}
            className="block w-full rounded-lg border border-white/15 px-3 py-2 text-center text-xs font-medium text-slate-200 hover:bg-white/5"
          >
            ⬇️ Скачать файл
          </a>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Экспорт выполняется на вашем устройстве — файлы никуда не отправляются. Первый экспорт в новой вкладке может
        занять чуть больше времени, дальше это происходит быстрее.
      </p>
    </div>
  );
}
