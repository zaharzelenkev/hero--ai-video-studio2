"use client";

import { useState } from "react";
import { useProjectStore, timelineDuration } from "@/store/projectStore";
import { cloneProject, downloadBlob, exportFramePng, safeFilename, sliceProject } from "@/lib/editor/exportUtils";
import { saveBlob } from "@/lib/db";
import { uid } from "@/lib/id";
import { PanelSection, ToggleButton, EmptyHint, SelectField, NumberField, SliderField } from "./ui";
import { 
  masterAndRender, 
  renderAudioOnly, 
  getRenderQueue, 
  addToQueue, 
  exportSRT, 
  exportEDL, 
  exportXML, 
  exportLUTs, 
  exportProjectJSON,
  runMasteringQC,
  type RenderJob 
} from "@/lib/mastering";

const RESOLUTIONS = [
  { label: "4K UHD · 3840×2160", width: 3840, height: 2160 },
  { label: "Full HD · 1920×1080", width: 1920, height: 1080 },
  { label: "HD · 1280×720", width: 1280, height: 720 },
  { label: "Вертикально · 1080×1920", width: 1080, height: 1920 },
  { label: "Квадрат · 1080×1080", width: 1080, height: 1080 },
];

const FORMATS = [
  { id: "mp4", label: "MP4 (H.264)", ext: "mp4" },
  { id: "mov", label: "MOV (ProRes/H.264)", ext: "mov" },
  { id: "webm", label: "WebM (VP9)", ext: "webm" },
  { id: "gif", label: "GIF (анимация)", ext: "gif" },
] as const;

type ExportFormat = "mp4" | "mov" | "webm" | "gif" | "audio";

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

  // NEW: Mastering & Queue
  const [qcReport, setQcReport] = useState<any>(null);
  const [queue, setQueue] = useState<RenderJob[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(["mp4"]);
  const [exportAudio, setExportAudio] = useState(false);
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav" | "aac">("mp3");
  const [exportXml, setExportXml] = useState(true);
  const [exportEdl, setExportEdl] = useState(true);
  const [exportSrt, setExportSrt] = useState(true);
  const [exportLut, setExportLut] = useState(true);
  const [exportProjectJson, setExportProjectJson] = useState(false);

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const settings = project.exportSettings;
  const duration = timelineDuration(project);
  const rangeAvailable = inPoint !== null && outPoint !== null && outPoint > inPoint;

  const patchSettings = (patch: Partial<typeof settings>) =>
    updateProject((p) => ({ ...p, exportSettings: { ...p.exportSettings, ...patch } }));

  const refreshQueue = () => setQueue(getRenderQueue());

  // === MASTERING PIPELINE ===
  const startMasteredExport = async (formats: ExportFormat[]) => {
    if (!project || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setProgress(0);
    setLog("AI Mastering: старт финального контроля качества...");
    setQcReport(null);

    try {
      const base = cloneProject(project);
      base.exportSettings = {
        ...base.exportSettings,
        width: base.resolution.width,
        height: base.resolution.height,
        fps: base.fps,
      };
      const target = useRange && rangeAvailable ? sliceProject(base, inPoint as number, outPoint as number) : base;

      // 1. Run full AI QC + auto-fix
      const { renderProject } = await import("@/lib/render");
      const { blob: finalBlob, report } = await masterAndRender(
        target,
        async (p, onProg, onLog) => {
          return await renderProject(p, onProg, onLog);
        },
        (r, stage) => {
          setProgress(Math.max(0, Math.min(0.98, r)));
          if (stage) setLog(stage);
        },
        (m) => setLog(m.slice(0, 180))
      );

      setQcReport(report);

      const name = safeFilename(project.title, settings.format || "mp4");
      setResult({ blob: finalBlob, name });
      downloadBlob(finalBlob, name);

      const key = uid("blob");
      await saveBlob(key, finalBlob);
      updateProject((p) => ({ ...p, previewBlobKey: key }), { history: false });
      await persist();

      // Add to queue
      addToQueue({
        projectId: project.id,
        format: settings.format as any,
        name,
        resultBlobKey: key,
        sizeMB: Math.round(finalBlob.size / 1024 / 1024),
        finishedAt: Date.now(),
      });
      refreshQueue();

      // Multi-format batch
      for (const fmt of formats) {
        if (fmt === settings.format) continue;
        await exportSingleFormat(target, fmt, project.title);
      }

      // Audio only
      if (exportAudio) {
        await exportAudioSeparate(target, project.title);
      }

      // Project exports
      await exportProjectAssets(target, project.title);

      setLog("Mastering & Rendering завершён. Все форматы готовы.");
    } catch (err: any) {
      setError(err?.message || "Ошибка мастеринга/рендера");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const exportSingleFormat = async (proj: any, fmt: ExportFormat, title: string) => {
    setLog(`Рендер дополнительного формата: ${fmt.toUpperCase()}...`);
    try {
      const { renderProject } = await import("@/lib/render");
      const p = cloneProject(proj);
      p.exportSettings = { ...p.exportSettings, format: fmt as any };
      const blob = await renderProject(p, undefined, (m) => setLog(m.slice(0, 120)));
      const name = safeFilename(title, fmt);
      downloadBlob(blob, name);

      const key = uid("blob");
      await saveBlob(key, blob);
      addToQueue({
        projectId: project!.id,
        format: fmt,
        name,
        resultBlobKey: key,
        sizeMB: Math.round(blob.size / 1024 / 1024),
      });
      refreshQueue();
    } catch (e) {
      console.warn("Multi-format export failed for", fmt, e);
    }
  };

  const exportAudioSeparate = async (proj: any, title: string) => {
    setLog(`Экспорт аудио отдельно (${audioFormat})...`);
    try {
      const blob = await renderAudioOnly(proj, audioFormat, undefined, (m) => setLog(m.slice(0, 100)));
      const name = safeFilename(title, audioFormat);
      downloadBlob(blob, name);

      const key = uid("blob");
      await saveBlob(key, blob);
      addToQueue({
        projectId: project!.id,
        format: "audio",
        name,
        resultBlobKey: key,
        sizeMB: Math.round(blob.size / 1024 / 1024),
      });
      refreshQueue();
    } catch (e) {
      setError("Не удалось экспортировать аудио: " + (e as Error).message);
    }
  };

  const exportProjectAssets = async (proj: any, title: string) => {
    const baseName = safeFilename(title, "zip").replace(".zip", "");

    // SRT
    if (exportSrt) {
      const srt = exportSRT(proj);
      const blob = new Blob([srt], { type: "text/plain" });
      downloadBlob(blob, `${baseName}.srt`);
    }

    // EDL
    if (exportEdl) {
      const edl = exportEDL(proj);
      const blob = new Blob([edl], { type: "text/plain" });
      downloadBlob(blob, `${baseName}.edl`);
    }

    // XML
    if (exportXml) {
      const xml = exportXML(proj);
      const blob = new Blob([xml], { type: "application/xml" });
      downloadBlob(blob, `${baseName}.xml`);
    }

    // Project JSON
    if (exportProjectJson) {
      const json = exportProjectJSON(proj);
      const blob = new Blob([json], { type: "application/json" });
      downloadBlob(blob, `${baseName}.project.json`);
    }

    // LUTs
    if (exportLut) {
      try {
        const luts = await exportLUTs(proj);
        for (const l of luts) {
          const blob = new Blob([l.content], { type: "text/plain" });
          downloadBlob(blob, l.name);
        }
        if (luts.length) setLog(`Экспортировано LUT: ${luts.length}`);
      } catch {}
    }
  };

  // Run QC only (no render)
  const runOnlyQC = async () => {
    if (!project) return;
    setBusy(true);
    setLog("AI QC: анализ проекта...");
    try {
      const report = await runMasteringQC(project, (m) => setLog(m));
      setQcReport(report);
      if (!report.overallOk) {
        // auto-apply recommended settings
        updateProject((p) => ({
          ...p,
          exportSettings: { ...p.exportSettings, ...report.recommendedSettings },
        }));
        setLog("QC нашёл проблемы — применены автоматические исправления.");
      }
    } catch (e) {
      setError("QC ошибка: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startExport = () => startMasteredExport(selectedFormats);

  const saveFrame = async () => {
    const blob = await exportFramePng(project, playhead);
    if (blob) downloadBlob(blob, safeFilename(`${project.title}_${playhead.toFixed(2)}`, "png"));
  };

  // Queue controls
  const clearQ = () => {
    import("@/lib/mastering").then(m => m.clearRenderQueue());
    setQueue([]);
  };

  return (
    <div className="space-y-3 text-[11px]">
      {/* QC REPORT */}
      {qcReport && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-2">
          <div className="font-bold text-emerald-300 mb-0.5">AI QC Report — {qcReport.overallOk ? "ГОТОВО" : "ИСПОРАВЛЕНО"}</div>
          <div className="text-[10px] text-emerald-200/90 max-h-20 overflow-auto">
            {qcReport.issues?.filter((i: any) => i.severity !== "ok").slice(0, 4).map((i: any, idx: number) => (
              <div key={idx}>• {i.message}</div>
            ))}
            {qcReport.fixesApplied?.length > 0 && <div className="text-emerald-400">Исправления: {qcReport.fixesApplied.join(", ")}</div>}
          </div>
        </div>
      )}

      {/* FORMATS MULTI SELECT */}
      <PanelSection title="Форматы (мульти-экспорт)">
        <div className="flex flex-wrap gap-1">
          {FORMATS.map((f) => {
            const active = selectedFormats.includes(f.id as any);
            return (
              <button
                key={f.id}
                onClick={() => {
                  setSelectedFormats((prev) =>
                    active ? prev.filter((x) => x !== f.id) : [...prev, f.id as any]
                  );
                }}
                className={`px-2 py-0.5 rounded text-[10px] border ${active ? "bg-violet-600 border-violet-400 text-white" : "border-white/10 bg-white/5"}`}
              >
                {f.label}
              </button>
            );
          })}
          <button
            onClick={() => setExportAudio(!exportAudio)}
            className={`px-2 py-0.5 rounded text-[10px] border ${exportAudio ? "bg-sky-600 border-sky-400" : "border-white/10 bg-white/5"}`}
          >
            🎵 Аудио
          </button>
        </div>

        {exportAudio && (
          <div className="mt-1 flex items-center gap-1 text-[10px]">
            <span className="text-slate-400">Аудио:</span>
            {(["mp3", "wav", "aac"] as const).map((af) => (
              <button key={af} onClick={() => setAudioFormat(af)} className={`px-1.5 py-px rounded ${audioFormat === af ? "bg-sky-500" : "bg-white/10"}`}>{af.toUpperCase()}</button>
            ))}
          </div>
        )}
      </PanelSection>

      {/* PROJECT EXPORTS */}
      <PanelSection title="Экспорт проекта">
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={exportXml} onChange={e => setExportXml(e.target.checked)} /> XML (FCP/DaVinci)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={exportEdl} onChange={e => setExportEdl(e.target.checked)} /> EDL
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={exportSrt} onChange={e => setExportSrt(e.target.checked)} /> SRT (субтитры)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={exportLut} onChange={e => setExportLut(e.target.checked)} /> LUT (.cube)
          </label>
          <label className="flex items-center gap-1.5 col-span-2">
            <input type="checkbox" checked={exportProjectJson} onChange={e => setExportProjectJson(e.target.checked)} /> Полный проект (.json)
          </label>
        </div>
      </PanelSection>

      {/* RESOLUTION + FPS + QUALITY */}
      <PanelSection title="Разрешение · FPS · Качество">
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
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          <NumberField label="Ширина" value={project.resolution.width} step={2} onChange={(v) => setResolution(v, project.resolution.height)} />
          <NumberField label="Высота" value={project.resolution.height} step={2} onChange={(v) => setResolution(project.resolution.width, v)} />
          <NumberField label="FPS" value={project.fps} step={1} min={1} max={120} onChange={setFps} />
        </div>

        <SliderField
          label="CRF"
          value={settings.crf}
          min={14}
          max={34}
          step={1}
          onChange={(v) => patchSettings({ crf: Math.round(v) })}
          display={(v) => `${v}`}
        />
      </PanelSection>

      <PanelSection title="Диапазон">
        <div className="flex flex-wrap gap-1.5">
          <ToggleButton active={!useRange} onClick={() => setUseRange(false)}>
            Весь проект · {duration.toFixed(1)}с
          </ToggleButton>
          <ToggleButton active={useRange} onClick={() => setUseRange(true)} title={rangeAvailable ? "" : "Сначала отметьте [ и ]"}>
            In/Out {rangeAvailable ? `· ${((outPoint as number) - (inPoint as number)).toFixed(1)}с` : ""}
          </ToggleButton>
        </div>
      </PanelSection>

      {/* MASTER BUTTON + QC */}
      <div className="flex gap-2">
        <button
          onClick={() => void startExport()}
          disabled={busy || duration <= 0}
          className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-violet-900/40 transition active:scale-[0.985] disabled:opacity-50"
        >
          {busy ? `🎬 Мастеринг + Рендер ${Math.round(progress * 100)}%` : `🚀 MASTERING &amp; RENDER`}
        </button>
        <button
          onClick={() => void runOnlyQC()}
          disabled={busy}
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10 disabled:opacity-50"
        >
          QC
        </button>
      </div>

      {busy && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-emerald-400 transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </div>
          <div className="truncate font-mono text-[9px] text-slate-400">{log}</div>
        </div>
      )}

      {error && <div className="rounded border border-rose-500/40 bg-rose-500/10 p-1.5 text-[10px] text-rose-300">{error}</div>}

      {result && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2 text-[10px] text-emerald-200">
          ✅ {result.name} · {(result.blob.size / 1024 / 1024).toFixed(1)} МБ
          <button onClick={() => downloadBlob(result.blob, result.name)} className="ml-2 underline">скачать</button>
        </div>
      )}

      {/* RENDER QUEUE */}
      <PanelSection title="Очередь рендера">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-slate-400">Jobs: {queue.length}</span>
          <button onClick={clearQ} className="text-[9px] text-rose-300 hover:underline">очистить</button>
        </div>
        <div className="max-h-[82px] overflow-auto space-y-0.5 text-[9px] font-mono bg-black/30 rounded p-1">
          {queue.length === 0 && <div className="text-slate-500">Очередь пуста. Добавляйте рендеры.</div>}
          {queue.slice(0, 6).map((j, i) => (
            <div key={i} className="flex justify-between px-1">
              <span className="truncate">{j.name}</span>
              <span className={j.status === "done" ? "text-emerald-400" : "text-amber-400"}>{j.status} {j.sizeMB ? j.sizeMB + "MB" : ""}</span>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Кадр">
        <ToggleButton onClick={() => void saveFrame()}>🖼 Сохранить текущий кадр (PNG)</ToggleButton>
      </PanelSection>

      <div className="text-[9px] text-center text-slate-500 pt-1">
        Перед рендером — автоматический AI QC + автоисправления.<br />Поддержка MP4 • MOV • WebM • GIF • Audio • XML/EDL/SRT/LUT
      </div>
    </div>
  );
}
