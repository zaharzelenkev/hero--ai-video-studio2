"use client";

import type { AudioClip, MediaAsset, Project, TextClip, VideoClip } from "./types";
import { fetchFileFromBlob, getFFmpeg, onFFmpegProgress, type LogListener } from "./ffmpeg";
import { loadBlob } from "./db";
import { buildOutputArgs, compileProjectToFfmpeg, type CompileOptions, type LightRaysInput } from "./filterGraph";
import { fontFileFor } from "./presets";
import { collectLightRaysInputs, prepareAiVfxOverrides, writeLutCubes } from "./editor/vfxExport";
import { cubeFileName } from "./editor/lut";
import { renderMgOverlayPng } from "./motionGraphicsCanvas";

/**
 * Измерение текста в пикселях через canvas — для раскладки моушн-графики
 * при экспорте (совпадает с превью).
 */
let measureCanvas: HTMLCanvasElement | null = null;
function measureTextForExport(text: string, px: number, family: string, weight: number): number {
  if (typeof document === "undefined") return text.length * px * 0.6;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * px * 0.6;
  ctx.font = `${weight} ${px.toFixed(1)}px "${family}", "Inter", system-ui, sans-serif`;
  return ctx.measureText(text).width;
}

/** Клипы, которым нужен пре-рендер кадров (AI-эффекты) или PNG лучей. */
function needsVfxPreRender(project: Project): boolean {
  for (const track of project.tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips as VideoClip[]) {
      const vfx = clip.vfx;
      if (!vfx) continue;
      if (vfx.backgroundRemoval?.enabled) return true;
      if (vfx.objectRemoval?.enabled && ((vfx.objectRemoval.strokes?.length ?? 0) > 0 || (vfx.objectRemoval.region?.polygon?.length ?? 0) > 0)) return true;
      if (vfx.lightRays?.enabled) return true;
    }
  }
  return false;
}

function extFor(asset: MediaAsset): string {
  const parts = asset.mime.split("/");
  const sub = parts[1] || "bin";
  if (sub.includes("quicktime")) return "mov";
  if (sub === "jpeg") return "jpg";
  return sub.split(";")[0];
}

export async function renderProject(
  project: Project,
  onProgress?: (ratio: number) => void,
  onLog?: LogListener,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  let lastLogs: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    lastLogs.push(message);
    if (lastLogs.length > 20) lastLogs.shift();
    onLog?.(message);
  };
  ffmpeg.on("log", logHandler);
  const off = onProgress ? onFFmpegProgress(ffmpeg, onProgress) : () => {};
  const vfxTempFiles = new Set<string>();

  try {
    const usedFontFiles = new Set<string>();
    for (const track of project.tracks) {
      if (track.type !== "text") continue;
      for (const clip of track.clips as TextClip[]) {
        usedFontFiles.add(fontFileFor(clip.fontFamily));
      }
    }
    for (const fontFile of usedFontFiles) {
      let fontUrl = new URL(`/fonts/${fontFile}`, window.location.origin).href;
      
      // If it's a dynamic Google Font injected format: "GFONT_Family_Weight.ttf"
      const isGfont = fontFile.startsWith("GFONT_") || fontFile.startsWith("GFONT:");
      if (isGfont) {
         if (fontFile.startsWith("GFONT:")) {
            const parts = fontFile.split(":");
            const family = parts[1];
            const weight = parts[2] || "700";
            fontUrl = new URL(`/api/font?family=${encodeURIComponent(family)}&weight=${weight}`, window.location.origin).href;
         } else {
         const namePart = fontFile.replace("GFONT_", "").replace(".ttf", "");
         const lastUnderscore = namePart.lastIndexOf("_");
         const family = namePart.substring(0, lastUnderscore).replace(/\+/g, " ");
         const weight = namePart.substring(lastUnderscore + 1) || "700";
         fontUrl = new URL(`/api/font?family=${encodeURIComponent(family)}&weight=${weight}`, window.location.origin).href;
         }
      }

      let fontResp: Response | null = null;
      try {
        fontResp = await fetch(fontUrl);
      } catch (err) {
        throw new Error(`Сетевая ошибка при загрузке шрифта: ${fontFile}`);
      }
      
      // Fallback to local default font if Google Font fails to fetch
      if (!fontResp.ok && isGfont) {
         console.warn(`Failed to fetch Google Font ${fontFile}, falling back to local DejaVuSans`);
         fontUrl = new URL(`/fonts/DejaVuSans.ttf`, window.location.origin).href;
         fontResp = await fetch(fontUrl);
      }
      
      if (!fontResp.ok) throw new Error(`Не удалось загрузить шрифт: ${fontFile} (HTTP ${fontResp.status})`);
      
      const fontBlob = await fontResp.blob();
      const fontBytes = await fetchFileFromBlob(fontBlob);
      await ffmpeg.writeFile(fontFile, fontBytes);
    }

    const assetFileNames = new Map<string, string>();
    const usedAssetIds = new Set<string>();
    
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.type === "video" || clip.type === "audio" || clip.type === "image") {
          usedAssetIds.add((clip as any).assetId);
        }
      }
    }

    for (const assetId of usedAssetIds) {
      const asset = project.assets.find((a) => a.id === assetId);
      if (!asset) continue;
      
      const blob = await loadBlob(asset.blobKey);
      if (!blob) {
         console.warn(`Отсутствует исходный файл для "${asset.name}" в IndexedDB. Пробуем пропустить.`);
         continue;
      }
      const bytes = await fetchFileFromBlob(blob);
      
      const fname = `asset_${asset.id}.${extFor(asset)}`;
      await ffmpeg.writeFile(fname, bytes);
      assetFileNames.set(asset.id, fname);
      
      if (asset.kind === "video" && asset.hasAudio === undefined) {
        let hasAudio = false;
        const probeLog = ({ message }: { message: string }) => {
          if (message.includes("Audio:") || message.match(/Stream #\d+:\d+.*Audio:/)) {
            hasAudio = true;
          }
        };
        ffmpeg.on("log", probeLog);
        // Note: exec with just -i prints the info and returns 1, which might print "Aborted()" in some environments but it's harmless
        try {
           await ffmpeg.exec(["-i", fname]);
        } catch(e) {}
        ffmpeg.off("log", probeLog);
        asset.hasAudio = hasAudio;
      }
    }

    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.type === "video") {
          const asset = project.assets.find(a => a.id === (clip as VideoClip).assetId);
          if (asset && asset.hasAudio === false) {
            (clip as VideoClip).muted = true;
          }
        }
      }
    }

    const fileNameFor = (clip: VideoClip | AudioClip) => assetFileNames.get(clip.assetId) || "";

    const compileOptions: CompileOptions = {};
    if (needsVfxPreRender(project)) {
      onLog?.("Подготовка VFX-материалов (AI-удаление фона/объекта, лучи)...");
      const W = project.exportSettings.width;
      const H = project.exportSettings.height;
      try {
        // PNG световых лучей.
        const lightRays: LightRaysInput[] = await collectLightRaysInputs(project, W, H, ffmpeg);
        if (lightRays.length) compileOptions.lightRays = lightRays;

        // Пре-рендер кадров для AI-эффектов (MediaPipe / FMM-инпейнтинг).
        const ai = await prepareAiVfxOverrides(project, ffmpeg, project.exportSettings.fps, assetFileNames, (done, total) => {
          onLog?.(`AI-пре-рендер: ${done}/${total} клипов`);
        });
        if (ai.error) {
          throw new Error(
            `AI-эффект не может быть экспортирован: ${ai.error} Отключите «Удаление фона»/«Удаление объекта» или проверьте интернет.`,
          );
        }
        if (ai.overrides.size) compileOptions.vfxOverrides = ai.overrides;
        for (const f of ai.createdFiles) vfxTempFiles.add(f);
        for (const lr of lightRays) vfxTempFiles.add(lr.path);
      } catch (err) {
        if (err instanceof Error && err.message.includes("AI-эффект")) throw err;
        throw new Error(`Подготовка VFX не удалась: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Моушн-графика: PNG-панели и измерение текста из превью.
    compileOptions.renderMgOverlay = (clip, W, H, spec) => renderMgOverlayPng(clip, W, H, spec);
    compileOptions.measureText = measureTextForExport;

    const compiled = compileProjectToFfmpeg(project, project.exportSettings, fileNameFor, compileOptions);

    // .cube файлы LUT (тот же грид, что в превью).
    if (compiled.lutFiles.length) {
      await writeLutCubes(ffmpeg, compiled.lutFiles);
    }

    // PNG-панели моушн-графики (lower thirds, CTA, прогресс-бары и т.д.).
    for (const f of compiled.overlayFiles) {
      try {
        await ffmpeg.writeFile(f.path, new Uint8Array(f.png));
        vfxTempFiles.add(f.path);
      } catch (err) {
        console.warn("Не удалось записать PNG-оверлей моушн-графики:", err);
      }
    }

    const args: string[] = [];
    for (const input of compiled.inputs) {
      if (!input.path) {
         console.warn("Empty input path found in filterGraph compilation!");
         continue;
      }
      args.push(...input.pre, "-i", input.path);
    }
    args.push("-filter_complex", compiled.filterComplex);
    if (compiled.videoMapLabel) args.push("-map", `[${compiled.videoMapLabel}]`);
    if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
    else args.push("-an");

    let outExt = (project.exportSettings.format === "audio" || project.exportSettings.audioOnly)
      ? (project.exportSettings.audioFormat || "mp3")
      : (project.exportSettings.format === "mov" ? "mov" : project.exportSettings.format);
    const outName = `output.${outExt}`;
    args.push("-t", String(compiled.totalDuration.toFixed(3)));
    args.push(...buildOutputArgs(project.exportSettings, outName, compiled.totalDuration));

    onLog?.(`Запуск: ffmpeg ${args.join(" ")}`);
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      console.error("FFmpeg Error! Args used:", args);
      console.error("Filter graph:", compiled.filterComplex);
      throw new Error("FFmpeg failed: " + lastLogs.join(" | "));
    }
    
    const data = await ffmpeg.readFile(outName);
    let mime = "video/mp4";
    if (project.exportSettings.format === "webm") mime = "video/webm";
    else if (project.exportSettings.format === "gif") mime = "image/gif";
    else if (project.exportSettings.format === "mov") mime = "video/quicktime";
    else if (project.exportSettings.audioOnly || project.exportSettings.format === "audio") {
      const af = project.exportSettings.audioFormat || "mp3";
      mime = af === "wav" ? "audio/wav" : af === "aac" ? "audio/aac" : "audio/mpeg";
    }
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });

    for (const fname of assetFileNames.values()) {
      try {
        await ffmpeg.deleteFile(fname);
      } catch {
        // ignore cleanup errors
      }
    }
    // Временные файлы VFX (PNG лучей, пре-рендеренные кадры, .cube LUT).
    for (const f of vfxTempFiles) {
      try {
        await ffmpeg.deleteFile(f);
      } catch {
        // ignore
      }
    }
    if (compiled?.lutFiles) {
      for (const preset of compiled.lutFiles) {
        try {
          await ffmpeg.deleteFile(cubeFileName(preset));
        } catch {
          // ignore
        }
      }
    }
    try {
      await ffmpeg.deleteFile(outName);
    } catch {
      // ignore
    }

    return blob;
  } finally {
    ffmpeg.off("log", logHandler);
    off();
  }
}
