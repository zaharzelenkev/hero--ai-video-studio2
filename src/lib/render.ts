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
  const ffmpeg = await getFFmpeg(onLog);
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
      const fontResp = await fetch(`/fonts/${fontFile}`);
      if (!fontResp.ok) throw new Error(`Не удалось загрузить шрифт: ${fontFile}`);
      const fontBlob = await fontResp.blob();
      // Use fetchFileFromBlob to avoid ArrayBuffer detachment issues
      const fontBytes = await fetchFileFromBlob(fontBlob);
      await ffmpeg.writeFile(fontFile, fontBytes);
    }

    const assetBytesCache = new Map<string, Uint8Array>();
    async function getAssetBytes(assetId: string): Promise<Uint8Array> {
      const cached = assetBytesCache.get(assetId);
      if (cached) return cached;
      const asset = project.assets.find((a) => a.id === assetId);
      if (!asset) throw new Error(`Asset not found: ${assetId}`);
      const blob = await loadBlob(asset.blobKey);
      if (!blob) throw new Error(`Missing source file for "${asset.name}"`);
      const bytes = await fetchFileFromBlob(blob);
      assetBytesCache.set(assetId, bytes);
      return bytes;
    }

    const allMediaClips: (VideoClip | AudioClip)[] = [];
    for (const track of project.tracks) {
      if (track.type === "video") allMediaClips.push(...(track.clips as VideoClip[]));
      if (track.type === "audio") allMediaClips.push(...(track.clips as AudioClip[]));
    }

    const clipFileNames = new Map<string, string>();
    for (const clip of allMediaClips) {
      const asset = project.assets.find((a) => a.id === clip.assetId);
      if (!asset) continue;
      const bytes = await getAssetBytes(asset.id);
      const fname = `in_${clip.id}.${extFor(asset)}`;
      await ffmpeg.writeFile(fname, bytes);
      clipFileNames.set(clip.id, fname);
    }

    const fileNameFor = (clip: VideoClip | AudioClip) => clipFileNames.get(clip.id) || "";
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
    await ffmpeg.exec(args);
    const data = await ffmpeg.readFile(outName);
    const mime =
      project.exportSettings.format === "webm"
        ? "video/webm"
        : project.exportSettings.format === "gif"
          ? "image/gif"
          : "video/mp4";
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });

    for (const fname of clipFileNames.values()) {
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
    off();
  }
}
