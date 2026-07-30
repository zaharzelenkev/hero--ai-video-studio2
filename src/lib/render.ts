"use client";

import type { AudioClip, MediaAsset, Project, TextClip, VideoClip } from "./types";
import { fetchFileFromBlob, getFFmpeg, onFFmpegProgress, type LogListener } from "./ffmpeg";
import { loadBlob } from "./db";
import { buildOutputArgs, compileProjectToFfmpeg } from "./filterGraph";
import { fontFileFor } from "./presets";

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
    const compiled = compileProjectToFfmpeg(project, project.exportSettings, fileNameFor);

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

    const outName = `output.${project.exportSettings.format}`;
    args.push("-t", String(compiled.totalDuration.toFixed(3)));
    args.push(...buildOutputArgs(project.exportSettings, outName));

    onLog?.(`Запуск: ffmpeg ${args.join(" ")}`);
        const code = await ffmpeg.exec(args);
    if (code !== 0) {
      console.error("FFmpeg Error! Args used:", args);
      console.error("Filter graph:", compiled.filterComplex);
      throw new Error("FFmpeg failed: " + lastLogs.join(" | "));
    }
    
    const data = await ffmpeg.readFile(outName);
    const mime =
      project.exportSettings.format === "webm"
        ? "video/webm"
        : project.exportSettings.format === "gif"
          ? "image/gif"
          : "video/mp4";
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });

    for (const fname of assetFileNames.values()) {
      try {
        await ffmpeg.deleteFile(fname);
      } catch {
        // ignore cleanup errors
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
