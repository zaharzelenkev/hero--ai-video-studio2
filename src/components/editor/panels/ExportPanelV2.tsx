"use client";

import { useState } from "react";
import { useProjectStore, timelineDuration } from "@/store/projectStore";
import { cloneProject, downloadBlob, exportFramePng, safeFilename, sliceProject } from "@/lib/editor/exportUtils";
import { saveBlob } from "@/lib/db";
import { uid } from "@/lib/id";
import { PanelSection, ToggleButton, EmptyHint, SelectField, NumberField, SliderField } from "./ui";

const RESOLUTIONS = [
  { label: "4K UHD · 3840×2160", width: 3840, height: 2160 },
  { label: "Full HD · 1920×1080", width: 1920, height: 1080 },
  { label: "HD · 1280×720", width: 1280, height: 720 },
  { label: "Вертикально · 1080×1920", width: 1080, height: 1920 },
  { label: "Квадрат · 1080×1080", width: 1080, height: 1080 },
];

export default function ExportPanelV2() {
  const project = useProjectStore((s) => s.project);
  const setResolution = useProjectStore((s) => s.setResolution);
  const setFps = useProjectStore((s) => s.setFps);
  const updateProject = useProjectStore((s) => s.updateProject);
  const inPoint = useProjectStore((s) => s.inPoint);
  const outPoint = useProjectStore((s) => s.outPoint);
  const playhead = useProjectStore((s) => s.playhead);
  const persist = useProjectStore((s) => s.persist);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [useRange, setUseRange] = useState(false);

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const settings = project.exportSettings;
  const duration = timelineDuration(project);
  const rangeAvailable = inPoint !== null && outPoint !== null && outPoint > inPoint;
  const exportDuration = useRange && rangeAvailable ? (outPoint as number) - (inPoint as number) : duration;

  const patchSettings = (patch: Partial<typeof settings>) =>
    updateProject((p) => ({ ...p, exportSettings: { ...p.exportSettings, ...patch } }));

  const startExport = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    setProgress(0);
    try {
      const base = cloneProject(project);
      base.exportSettings = {
        ...base.exportSettings,
        width: base.resolution.width,
        height: base.resolution.height,
        fps: base.fps,
      };
      const target = useRange && rangeAvailable ? sliceProject(base, inPoint as number, outPoint as number) : base;
      const { renderProject } = await import("@/lib/render");
      const blob = await renderProject(
        target,
        (ratio) => setProgress(Math.max(0, Math.min(1, ratio))),
        (message) => setLog(message.slice(0, 160)),
      );
      const name = safeFilename(project.title, settings.format);
      setResult({ blob, name });
      downloadBlob(blob, name);

      // Сохраняем результат как превью проекта, чтобы он был доступен позже.
      const key = uid("blob");
      await saveBlob(key, blob);
      updateProject((p) => ({ ...p, previewBlobKey: key }), { history: false });
      await persist();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить экспорт");
    } finally {
      setBusy(false);
    }
  };

  const saveFrame = async () => {
    const blob = await exportFramePng(project, playhead);
    if (blob) downloadBlob(blob, safeFilename(`${project.title}_${playhead.toFixed(2)}`, "png"));
  };

  return (
    <div className="space-y-3">
      <PanelSection title="Формат">
        <div className="grid grid-cols-3 gap-1">
          {(["mp4", "webm", "gif"] as const).map((format) => (
            <button
              key={format}
              onClick={() => patchSettings({ format })}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                settings.format === format
                  ? "border-violet-400/60 bg-violet-500/25 text-violet-100"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10"
              }`}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Разрешение и частота кадров">
        <SelectField
          label="Пресет"
          value={`${project.resolution.width}x${project.resolution.height}`}
          options={[
            ...RESOLUTIONS.map((r) => ({ value: `${r.width}x${r.height}`, label: r.label })),
            { value: `${project.resolution.width}x${project.resolution.height}`, label: `Текущее · ${project.resolution.width}×${project.resolution.height}` },
          ].filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i)}
          onChange={(v) => {
            const [w, h] = v.split("x").map(Number);
            setResolution(w, h);
          }}
        />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumberField label="Ширина" value={project.resolution.width} step={2} onChange={(v) => setResolution(v, project.resolution.height)} />
          <NumberField label="Высота" value={project.resolution.height} step={2} onChange={(v) => setResolution(project.resolution.width, v)} />
          <NumberField label="FPS" value={project.fps} step={1} min={1} max={120} onChange={setFps} />
        </div>
      </PanelSection>

      <PanelSection title="Качество">
        <SliderField
          label="CRF (меньше — лучше)"
          value={settings.crf}
          min={14}
          max={34}
          step={1}
          onChange={(v) => patchSettings({ crf: Math.round(v) })}
          display={(v) => `${v} · ${v <= 19 ? "максимум" : v <= 24 ? "высокое" : v <= 28 ? "среднее" : "лёгкое"}`}
        />
      </PanelSection>

      <PanelSection title="Диапазон">
        <div className="flex flex-wrap gap-1.5">
          <ToggleButton active={!useRange} onClick={() => setUseRange(false)}>
            Весь проект · {duration.toFixed(1)}с
          </ToggleButton>
          <ToggleButton active={useRange} onClick={() => setUseRange(true)} title={rangeAvailable ? "" : "Сначала отметьте [ и ] в транспорте"}>
            Диапазон In/Out {rangeAvailable ? `· ${((outPoint as number) - (inPoint as number)).toFixed(1)}с` : "(не задан)"}
          </ToggleButton>
        </div>
      </PanelSection>

      <button
        onClick={() => void startExport()}
        disabled={busy || duration <= 0}
        className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? `Рендеринг… ${Math.round(progress * 100)}%` : `🚀 Экспортировать ${exportDuration.toFixed(1)}с`}
      </button>

      {busy && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
          <div className="truncate font-mono text-[9px] text-slate-500">{log}</div>
        </div>
      )}

      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">{error}</div>}

      {result && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
          Готово: {result.name} · {(result.blob.size / 1024 / 1024).toFixed(1)} МБ
          <button onClick={() => downloadBlob(result.blob, result.name)} className="ml-2 underline">
            скачать ещё раз
          </button>
        </div>
      )}

      <PanelSection title="Кадр">
        <ToggleButton onClick={() => void saveFrame()}>🖼 Сохранить текущий кадр (PNG)</ToggleButton>
      </PanelSection>
    </div>
  );
}
