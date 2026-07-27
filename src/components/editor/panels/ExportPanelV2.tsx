"use client";

import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { renderProject } from "@/lib/render";
import type { ExportSettings } from "@/lib/types";

const RESOLUTIONS: { label: string; width: number; height: number }[] = [
  { label: "480p (854×480)", width: 854, height: 480 },
  { label: "720p HD (1280×720)", width: 1280, height: 720 },
  { label: "1080p Full HD (1920×1080)", width: 1920, height: 1080 },
  { label: "1440p 2K (2560×1440)", width: 2560, height: 1440 },
  { label: "2160p 4K (3840×2160)", width: 3840, height: 2160 },
  { label: "Вертикальное 720×1280 (Reels/Shorts)", width: 720, height: 1280 },
  { label: "Вертикальное 1080×1920 (Stories)", width: 1080, height: 1920 },
  { label: "Квадрат 1080×1080", width: 1080, height: 1080 },
];

const PRESETS = [
  { id: "ultrafast", label: "Ultra Fast (для превью)" },
  { id: "fast", label: "Fast" },
  { id: "medium", label: "Medium (рекомендуется)" },
  { id: "slow", label: "Slow (высокое качество)" },
  { id: "veryslow", label: "Very Slow (максимум качества)" },
];

export default function ExportPanelV2() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!project) return null;
  const settings = project.exportSettings;

  const setSettings = (fn: (s: ExportSettings) => ExportSettings) =>
    updateProject((p) => ({ ...p, exportSettings: fn(p.exportSettings) }));

  const handleExport = async () => {
    setRendering(true);
    setProgress(0);
    setResultUrl(null);
    setLog("");
    
    try {
      const blob = await renderProject(
        project,
        (r) => setProgress(r),
        (m) => setLog(m)
      );
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setLog(
        raw.includes("fetch") || raw.includes("network")
          ? "Не удалось загрузить видеодвижок — проверьте подключение к интернету и попробуйте ещё раз."
          : raw || "Ошибка экспорта"
      );
    } finally {
      setRendering(false);
    }
  };

  const estimatedFileSize = () => {
    const bitrate = settings.bitrate || (settings.crf <= 23 ? 8000 : settings.crf <= 28 ? 4000 : 2000);
    const sizeMB = (project.duration * bitrate) / 8000;
    return sizeMB.toFixed(1);
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Профессиональный экспорт
      </h3>

      {/* Quick Presets */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Быстрые пресеты</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setSettings((s) => ({ ...s, width: 1920, height: 1080, fps: 30, format: "mp4", crf: 23 }));
            }}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-medium text-slate-300 hover:bg-white/10"
          >
            🎬 YouTube 1080p
          </button>
          <button
            onClick={() => {
              setSettings((s) => ({ ...s, width: 1080, height: 1920, fps: 30, format: "mp4", crf: 23 }));
            }}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-medium text-slate-300 hover:bg-white/10"
          >
            📱 Shorts/Reels
          </button>
          <button
            onClick={() => {
              setSettings((s) => ({ ...s, width: 1080, height: 1080, fps: 30, format: "mp4", crf: 23 }));
            }}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-medium text-slate-300 hover:bg-white/10"
          >
            📷 Instagram Feed
          </button>
          <button
            onClick={() => {
              setSettings((s) => ({ ...s, width: 1280, height: 720, fps: 60, format: "mp4", crf: 20 }));
            }}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-medium text-slate-300 hover:bg-white/10"
          >
            🎮 Gaming 60fps
          </button>
        </div>
      </div>

      {/* Resolution */}
      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Разрешение</label>
        <select
          value={`${settings.width}x${settings.height}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split("x").map(Number);
            setSettings((s) => ({ ...s, width: w, height: h }));
          }}
          className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
        >
          {RESOLUTIONS.map((r) => (
            <option key={r.label} value={`${r.width}x${r.height}`}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Format */}
      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Формат</label>
        <div className="grid grid-cols-3 gap-2">
          {(["mp4", "webm", "mov"] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSettings((s) => ({ ...s, format: fmt }))}
              className={`rounded-md border px-2 py-2 text-[10px] font-medium ${
                settings.format === fmt
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/10 text-slate-400"
              }`}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* FPS */}
      <div className="mb-4">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">
          FPS: {settings.fps}
        </label>
        <input
          type="range"
          min={15}
          max={120}
          step={15}
          value={settings.fps}
          onChange={(e) => setSettings((s) => ({ ...s, fps: parseInt(e.target.value) }))}
          className="mb-2 h-1 w-full accent-violet-500"
        />
        <div className="flex gap-1">
          {[24, 30, 60].map((fps) => (
            <button
              key={fps}
              onClick={() => setSettings((s) => ({ ...s, fps }))}
              className={`flex-1 rounded-md border px-2 py-1 text-[9px] ${
                settings.fps === fps
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                  : "border-white/10 text-slate-400"
              }`}
            >
              {fps}
            </button>
          ))}
        </div>
      </div>

      {/* Quality */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">
          Качество (CRF: {settings.crf})
        </label>
        <input
          type="range"
          min={16}
          max={35}
          step={1}
          value={settings.crf}
          onChange={(e) => setSettings((s) => ({ ...s, crf: parseInt(e.target.value) }))}
          className="mb-2 h-1 w-full accent-violet-500"
        />
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>Лучше (больше размер)</span>
          <span>Хуже (меньше размер)</span>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          Примерный размер: ~{estimatedFileSize()} MB
        </p>
      </div>

      {/* Advanced Settings */}
      <div className="mb-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="mb-3 flex w-full items-center justify-between text-[11px] font-semibold text-slate-300"
        >
          <span>⚙️ Расширенные настройки</span>
          <span>{showAdvanced ? "▼" : "▶"}</span>
        </button>

        {showAdvanced && (
          <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">Preset скорости</label>
              <select
                value={settings.preset || "medium"}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    preset: e.target.value as ExportSettings["preset"],
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">Битрейт (kbps)</label>
              <input
                type="number"
                min={500}
                max={50000}
                step={500}
                value={settings.bitrate || ""}
                placeholder="Авто"
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    bitrate: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">Codec</label>
              <select
                value={settings.codec || "h264"}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    codec: e.target.value as ExportSettings["codec"],
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-100"
              >
                <option value="h264">H.264 (совместимость)</option>
                <option value="h265">H.265 (меньше размер)</option>
                <option value="vp9">VP9 (WebM)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="audio-only"
                checked={settings.audioOnly || false}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, audioOnly: e.target.checked }))
                }
                className="h-4 w-4 accent-violet-500"
              />
              <label htmlFor="audio-only" className="text-[10px] text-slate-300">
                Экспортировать только аудио
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Export Button */}
      <button
        disabled={rendering}
        onClick={handleExport}
        className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-900/40 transition-all hover:shadow-xl disabled:opacity-40"
      >
        {rendering ? `⏳ Рендеринг... ${Math.round(progress * 100)}%` : "🚀 Экспортировать видео"}
      </button>

      {/* Progress */}
      {rendering && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 transition-all"
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
      )}

      {/* Log */}
      {log && (
        <p className={`mt-2 break-all text-[10px] ${log.includes("Ошибка") || log.includes("удалось") ? "text-red-400" : "text-slate-500"}`}>
          {log}
        </p>
      )}

      {/* Result */}
      {resultUrl && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] shadow-lg">
          <video src={resultUrl} controls className="w-full bg-black" />
          <div className="p-3">
            <a
              href={resultUrl}
              download={`${project.title || "montiq-video"}.${settings.format}`}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:shadow-xl"
            >
              <span>⬇️</span>
              <span>Скачать файл</span>
            </a>
          </div>
        </div>
      )}

      <p className="mt-4 text-[10px] leading-relaxed text-slate-500">
        💡 Экспорт выполняется локально на вашем устройстве. Файлы никуда не отправляются.
        Первый рендер может занять больше времени.
      </p>
    </div>
  );
}
