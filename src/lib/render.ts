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
      const fontUrl = new URL(`/fonts/${fontFile}`, window.location.origin).href;
      let fontResp: Response | null = null;
      try {
        fontResp = await fetch(fontUrl);
      } catch (err) {
        throw new Error(`Сетевая ошибка при загрузке шрифта: ${fontFile}`);
      }
      if (!fontResp.ok) throw new Error(`Не удалось загрузить шрифт: ${fontFile} (HTTP ${fontResp.status})`);
      const fontBlob = await fontResp.blob();
      // Use fetchFileFromBlob to avoid ArrayBuffer detachment issues
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
      if (!blob) throw new Error(`Отсутствует исходный файл для "${asset.name}"`);
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
        await ffmpeg.exec(["-i", fname]);
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
      args.push(...input.pre, "-i", input.path);
    }
    args.push("-filter_complex", compiled.filterComplex);
    if (compiled.videoMapLabel) args.push("-map", `[${compiled.videoMapLabel}]`);
    if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
    else args.push("-an");

    const outName = `output.${project.exportSettings.format}`;
    args.push(...buildOutputArgs(project.exportSettings, outName));

    onLog?.(`Запуск: ffmpeg ${args.join(" ")}`);
        const code = await ffmpeg.exec(args);
    if (code !== 0) {
      console.error("FFmpeg Error! Args used:", args);
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
