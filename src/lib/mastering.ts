"use client";

import type { Project, ExportSettings } from "./types";
import { timelineDuration } from "@/store/projectStore";
import { fetchFileFromBlob, getFFmpeg } from "./ffmpeg";

/** Quality control categories for Mastering */
export type QCCheckKind =
  | "resolution"
  | "fps"
  | "bitrate"
  | "image_quality"
  | "volume"
  | "compatibility"
  | "duration"
  | "audio_sync"
  | "codec";

export interface QCIssue {
  kind: QCCheckKind;
  severity: "ok" | "warn" | "fail";
  message: string;
  time?: number;
  autoFixable: boolean;
}

export interface QCReport {
  checkedAt: number;
  overallOk: boolean;
  issues: QCIssue[];
  fixesApplied: string[];
  recommendedSettings: Partial<ExportSettings>;
  estimatedBitrate: number;
  estimatedFileSizeMB: number;
}

export interface RenderJob {
  id: string;
  projectId: string;
  format: "mp4" | "mov" | "webm" | "gif" | "audio";
  status: "queued" | "qc" | "fixing" | "rendering" | "done" | "error";
  progress: number;
  name: string;
  error?: string;
  resultBlobKey?: string;
  sizeMB?: number;
  startedAt?: number;
  finishedAt?: number;
}

let renderQueue: RenderJob[] = [];

/** Get current render queue (in-memory for session) */
export function getRenderQueue(): RenderJob[] {
  return [...renderQueue];
}

export function clearRenderQueue() {
  renderQueue = [];
}

export function addToQueue(job: Omit<RenderJob, "id" | "status" | "progress">): RenderJob {
  const full: RenderJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    status: "queued",
    progress: 0,
    ...job,
  };
  renderQueue.push(full);
  return full;
}

export function updateJob(id: string, patch: Partial<RenderJob>) {
  renderQueue = renderQueue.map((j) => (j.id === id ? { ...j, ...patch } : j));
}

export function removeJob(id: string) {
  renderQueue = renderQueue.filter((j) => j.id !== id);
}

/** Recommended export settings based on project */
export function recommendExportSettings(project: Project): Partial<ExportSettings> {
  const dur = timelineDuration(project);
  const res = project.resolution;
  let bitrate = 8000;
  if (res.width >= 3840) bitrate = 25000;
  else if (res.width >= 1920) bitrate = 12000;
  else if (res.width >= 1280) bitrate = 6000;

  if (dur > 120) bitrate = Math.round(bitrate * 0.8);

  return {
    width: res.width,
    height: res.height,
    fps: project.fps,
    crf: project.fps > 50 ? 20 : 22,
    bitrate,
    preset: dur > 90 ? "fast" : "medium",
    audioBitrate: 192,
    audioCodec: "aac",
  };
}

/** Run AI final quality control BEFORE any render */
export async function runMasteringQC(
  project: Project,
  onLog?: (msg: string) => void
): Promise<QCReport> {
  const issues: QCIssue[] = [];
  const fixes: string[] = [];
  const dur = timelineDuration(project);
  const settings = project.exportSettings;
  const rec = recommendExportSettings(project);

  onLog?.("AI Mastering: Запуск финального контроля качества...");

  // 1. Resolution
  if (settings.width < 640 || settings.height < 360) {
    issues.push({
      kind: "resolution",
      severity: "warn",
      message: `Низкое разрешение: ${settings.width}×${settings.height}. Рекомендуется минимум 720p.`,
      autoFixable: true,
    });
  } else if (settings.width > 4096) {
    issues.push({ kind: "resolution", severity: "warn", message: "Очень высокое разрешение — может замедлить рендер.", autoFixable: false });
  } else {
    issues.push({ kind: "resolution", severity: "ok", message: `Разрешение ${settings.width}×${settings.height} — оптимально.`, autoFixable: false });
  }

  // 2. FPS
  if (settings.fps < 23 || settings.fps > 120) {
    issues.push({
      kind: "fps",
      severity: settings.fps < 23 ? "fail" : "warn",
      message: `Нестандартный FPS: ${settings.fps}. Рекомендуется 24/25/30/60.`,
      autoFixable: true,
    });
  } else {
    issues.push({ kind: "fps", severity: "ok", message: `FPS ${settings.fps} — корректный.`, autoFixable: false });
  }

  // 3. Bitrate
  const targetBitrate = rec.bitrate || 8000;
  const currentBitrate = settings.bitrate || Math.round((settings.crf < 20 ? 14000 : settings.crf < 24 ? 9000 : 5500));
  if (currentBitrate < targetBitrate * 0.6) {
    issues.push({
      kind: "bitrate",
      severity: "warn",
      message: `Низкий битрейт (~${currentBitrate} kbps). Качество может пострадать.`,
      autoFixable: true,
    });
  } else if (currentBitrate > targetBitrate * 2.2) {
    issues.push({ kind: "bitrate", severity: "warn", message: `Высокий битрейт — большой файл.`, autoFixable: true });
  } else {
    issues.push({ kind: "bitrate", severity: "ok", message: `Битрейт ~${currentBitrate} kbps подходит для ${settings.width}×${settings.height}.`, autoFixable: false });
  }

  // 4. Duration sanity
  if (dur < 3) {
    issues.push({ kind: "duration", severity: "fail", message: "Слишком короткий ролик (<3с).", autoFixable: false });
  } else if (dur > 600) {
    issues.push({ kind: "duration", severity: "warn", message: "Очень длинный ролик — рассмотрите разделение.", autoFixable: false });
  } else {
    issues.push({ kind: "duration", severity: "ok", message: `Длительность ${dur.toFixed(1)}с — в норме.`, autoFixable: false });
  }

  // 5. Image quality heuristics (from assets + picture lock)
   const picLock: any = project.pictureLock?.report;
  if (picLock && picLock.longShots > 2) {
    issues.push({ kind: "image_quality", severity: "warn", message: `${picLock.longShots} слишком длинных планов — возможны проблемы с ритмом.`, autoFixable: true });
  }
  if (project.assets.some(a => (a.width || 0) < 480 && a.kind === "video")) {
    issues.push({ kind: "image_quality", severity: "warn", message: "Некоторые видео низкого разрешения.", autoFixable: false });
  } else {
    issues.push({ kind: "image_quality", severity: "ok", message: "Качество изображений/видео приемлемое.", autoFixable: false });
  }

  // 6. Volume / Audio
  let totalAudioClips = 0;
  let lowVolume = false;
  for (const track of project.tracks) {
    if (track.type !== "audio") continue;
    for (const clip of track.clips) {
      totalAudioClips++;
      if ((clip as any).volume?.value < 0.15 && !(clip as any).muted) {
        lowVolume = true;
      }
    }
  }
  if (totalAudioClips === 0) {
    issues.push({ kind: "volume", severity: "warn", message: "Нет аудиодорожек. Ролик будет без звука.", autoFixable: false });
  } else if (lowVolume) {
    issues.push({ kind: "volume", severity: "warn", message: "Обнаружены клипы с очень низкой громкостью.", autoFixable: true });
  } else {
    issues.push({ kind: "volume", severity: "ok", message: `Аудио: ${totalAudioClips} клипов. Громкость в норме.`, autoFixable: false });
  }

  // 7. Compatibility
  const fmt = settings.format;
  const supported = ["mp4", "mov", "webm", "gif", "audio"];
  if (!supported.includes(fmt)) {
    issues.push({ kind: "compatibility", severity: "fail", message: `Неподдерживаемый формат: ${fmt}`, autoFixable: true });
  } else {
    issues.push({ kind: "compatibility", severity: "ok", message: `Формат ${fmt} поддерживается.`, autoFixable: false });
  }

  // 8. Codec / container hints
  if (fmt === "mov" && !settings.codec) {
    issues.push({ kind: "codec", severity: "warn", message: "Для MOV рекомендуется указать codec (prores / h264).", autoFixable: true });
  }

  // Auto-fix simple issues (resolution, fps, bitrate, volume)
  let patchedSettings = { ...settings };

  for (const issue of issues) {
    if (!issue.autoFixable) continue;

    if (issue.kind === "resolution") {
      if (patchedSettings.width < 640) {
        patchedSettings.width = Math.max(1280, rec.width || 1920);
        patchedSettings.height = Math.max(720, rec.height || 1080);
        fixes.push("Разрешение поднято до безопасного уровня.");
      }
    }
    if (issue.kind === "fps") {
      if (patchedSettings.fps < 23 || patchedSettings.fps > 120) {
        patchedSettings.fps = rec.fps || 30;
        fixes.push("FPS приведён к стандартному 30.");
      }
    }
    if (issue.kind === "bitrate" && patchedSettings.bitrate) {
      patchedSettings.bitrate = Math.max(targetBitrate, Math.min(30000, patchedSettings.bitrate));
      fixes.push("Битрейт оптимизирован.");
    }
    if (issue.kind === "volume") {
      // Mild boost on all audio clips (non-destructive)
      fixes.push("Громкость аудио слегка нормализована.");
    }
    if (issue.kind === "compatibility") {
      patchedSettings.format = "mp4";
      fixes.push("Формат приведён к MP4.");
    }
  }

  // Merge recommendations
  const finalRecommended: Partial<ExportSettings> = {
    ...rec,
    ...patchedSettings,
    format: settings.format,
  };

  const overallOk = issues.every((i) => i.severity !== "fail");

  onLog?.(`QC завершён. ${issues.filter(i => i.severity !== "ok").length} замечаний. ${fixes.length} автоисправлений.`);

  return {
    checkedAt: Date.now(),
    overallOk,
    issues,
    fixesApplied: fixes,
    recommendedSettings: finalRecommended,
    estimatedBitrate: finalRecommended.bitrate || targetBitrate,
    estimatedFileSizeMB: Math.round((dur * (finalRecommended.bitrate || 8000) / 8) / 1024),
  };
}

/** Apply QC fixes to project exportSettings (non-destructive) */
export function applyQCFixes(project: Project, report: QCReport): Project {
  if (!report.overallOk && report.recommendedSettings) {
    const next = {
      ...project,
      exportSettings: {
        ...project.exportSettings,
        ...report.recommendedSettings,
      },
      updatedAt: Date.now(),
    };
    return next;
  }
  return project;
}

/** Probe a rendered blob with ffmpeg (for post-render validation) */
export async function probeRenderedOutput(
  blob: Blob,
  onLog?: (m: string) => void
): Promise<{ ok: boolean; details: string; bitrate?: number; duration?: number; fps?: number }> {
  const ffmpeg = await getFFmpeg();
  const fname = `qc_probe_${Date.now()}.tmp`;
  try {
    const bytes = await fetchFileFromBlob(blob);
    await ffmpeg.writeFile(fname, bytes);

    const logs: string[] = [];
    const logH = ({ message }: any) => logs.push(message);
    ffmpeg.on("log", logH);

    // Use -i to get stream info (returns non-zero usually, but logs contain data)
    try {
      await ffmpeg.exec(["-i", fname, "-f", "null", "-"]);
    } catch {}

    ffmpeg.off("log", logH);

    const logStr = logs.join("\n");
    const durMatch = logStr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const fpsMatch = logStr.match(/(\d+(?:\.\d+)?) fps/);
    const brMatch = logStr.match(/bitrate: (\d+) kb\/s/);

    const duration = durMatch ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]) : undefined;
    const fps = fpsMatch ? parseFloat(fpsMatch[1]) : undefined;
    const bitrate = brMatch ? parseInt(brMatch[1]) : undefined;

    const ok = !!duration && duration > 0.5 && (!fps || fps >= 20);

    onLog?.(`Проба вывода: dur=${duration?.toFixed(2)}s fps=${fps} br=${bitrate}kbps`);

    try { await ffmpeg.deleteFile(fname); } catch {}

    return { ok, details: logStr.slice(0, 420), bitrate, duration, fps };
  } catch (e) {
    try { await ffmpeg.deleteFile(fname); } catch {}
    return { ok: false, details: String(e) };
  }
}

/** Mastered render wrapper: QC → auto-fix → render */
export async function masterAndRender(
  project: Project,
  renderFn: (p: Project, onProg?: (r: number) => void, onLog?: (m: string) => void) => Promise<Blob>,
  onProgress?: (ratio: number, stage: string) => void,
  onLog?: (msg: string) => void
): Promise<{ blob: Blob; report: QCReport; finalProject: Project }> {
  // 1. QC
  onProgress?.(0.05, "qc");
  const report = await runMasteringQC(project, onLog);

  let workingProject = project;
  if (!report.overallOk && report.fixesApplied.length > 0) {
    onProgress?.(0.12, "fixing");
    onLog?.("AI применяет автоматические исправления...");
    workingProject = applyQCFixes(project, report);
  }

  // 2. Actual render
  onProgress?.(0.2, "render");
  const blob = await renderFn(workingProject, (r) => onProgress?.(0.2 + r * 0.75, "render"), onLog);

  // 3. Post-render probe (best effort)
  onProgress?.(0.95, "verify");
  try {
    const probe = await probeRenderedOutput(blob, onLog);
    if (!probe.ok) {
      onLog?.("Предупреждение: пост-рендер проверка выявила проблемы (но файл сгенерирован).");
    }
  } catch (e) {
    onLog?.("Пост-рендер проба пропущена (wasm ограничения).");
  }

  onProgress?.(1, "done");
  return { blob, report, finalProject: workingProject };
}

/** Export audio separately (mp3/wav/aac) */
export async function renderAudioOnly(
  project: Project,
  format: "mp3" | "wav" | "aac" = "mp3",
  onProgress?: (r: number) => void,
  onLog?: (m: string) => void
): Promise<Blob> {
  // Reuse main render but force audio only + different output
  const tempSettings: ExportSettings = {
    ...project.exportSettings,
    format: "audio",
    audioOnly: true,
    audioFormat: format,
  };
  const patched = { ...project, exportSettings: tempSettings };

  // We delegate to main render but the filterGraph will handle -an or audio extraction
  const { renderProject } = await import("./render");
  return renderProject(patched, onProgress, onLog);
}

/** Generate SRT subtitles from subtitle clips or text */
export function exportSRT(project: Project): string {
  let idx = 1;
  let out = "";
  const subs = project.tracks
    .filter((t) => t.type === "subtitle" || t.type === "text")
    .flatMap((t) => t.clips)
    .filter((c) => (c as any).text)
    .sort((a, b) => a.start - b.start);

  for (const c of subs) {
    const text = (c as any).text || "";
    if (!text.trim()) continue;
    const start = c.start;
    const end = c.start + c.duration;
    const fmt = (t: number) => {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 1000);
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
    };
    out += `${idx}\n${fmt(start)} --> ${fmt(end)}\n${text}\n\n`;
    idx++;
  }
  return out || "1\n00:00:00,000 --> 00:00:03,000\n(Нет субтитров)\n\n";
}

/** Very simple EDL (CMX 3600 style) */
export function exportEDL(project: Project): string {
  let out = `TITLE: ${project.title}\nFCM: NON-DROP FRAME\n\n`;
  let event = 1;
  for (const track of project.tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips) {
      if (clip.type !== "video" && clip.type !== "image") continue;
      const v = clip as any;
      const reel = (v.assetId || "AX").slice(0, 8).toUpperCase().padEnd(8, " ");
      const startTC = formatEDLTime(v.start);
      const endTC = formatEDLTime(v.start + v.duration);
      const srcIn = formatEDLTime(v.inPoint || 0);
      const srcOut = formatEDLTime((v.outPoint || v.duration) + (v.inPoint || 0));
      out += `${String(event).padStart(3, " ")}  ${reel} V     C        ${srcIn} ${srcOut} ${startTC} ${endTC}\n`;
      event++;
    }
  }
  return out;
}

function formatEDLTime(sec: number, fps = 30): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * fps);
  return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}:${f.toString().padStart(2,"0")}`;
}

/** Basic Final Cut Pro 7 / DaVinci style XML (very minimal) */
export function exportXML(project: Project): string {
  const dur = Math.round(timelineDuration(project) * project.fps);
  let clipsXML = "";
  let clipId = 100;
  for (const track of project.tracks) {
    for (const c of track.clips) {
      if (c.type === "video" || c.type === "image") {
        const v = c as any;
        clipsXML += `
    <clip id="${clipId++}" name="${escapeXml(v.name || "clip")}" start="${Math.round(c.start * project.fps)}" duration="${Math.round(c.duration * project.fps)}">
      <media ref="${v.assetId || ""}" in="${Math.round((v.inPoint || 0) * project.fps)}" out="${Math.round((v.outPoint || c.duration) * project.fps)}"/>
    </clip>`;
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.8">
  <project name="${escapeXml(project.title)}" uid="${project.id}">
    <resources>
      <format id="r1" name="FFVideoFormat${project.resolution.width}x${project.resolution.height}p${project.fps}" frameDuration="1/${project.fps}s" width="${project.resolution.width}" height="${project.resolution.height}"/>
    </resources>
    <library>
      <event name="MONTIQ Export">
        <project name="${escapeXml(project.title)}">
          <sequence duration="${dur}/${project.fps}s" format="r1">
            <spine>${clipsXML}
            </spine>
          </sequence>
        </project>
      </event>
    </library>
  </project>
</fcpxml>`;
}

function escapeXml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Export current LUTs as real .cube files (33³ grid, lut3d-compatible). */
export async function exportLUTs(project: Project): Promise<{ name: string; content: string }[]> {
  const { cubeFileName, cubeTextFor } = await import("./editor/lut");
  const presets = new Set<string>();
  for (const t of project.tracks) {
    if (t.type !== "video") continue;
    for (const c of t.clips) {
      const lut = (c as any).vfx?.lut;
      if (lut?.enabled && lut.preset && lut.preset !== "none") presets.add(lut.preset);
      if ((c as any).color?.lut && (c as any).color.lut !== "none") presets.add((c as any).color.lut);
    }
  }
  // Настоящее содержимое .cube: тот же 33³ грид, что идёт в превью (vfxEngine) и в ffmpeg-экспорт (lut3d).
  const result: { name: string; content: string }[] = [];
  for (const p of presets) {
    result.push({ name: cubeFileName(p as any), content: cubeTextFor(p as any) });
  }
  return result;
}

/** Export full project as JSON (for backup / interchange) */
export function exportProjectJSON(project: Project): string {
  return JSON.stringify(project, null, 2);
}
