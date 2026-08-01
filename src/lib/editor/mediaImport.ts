"use client";

import { saveBlob } from "@/lib/db";
import { uid } from "@/lib/id";
import { inferKind, readAudioMeta, readImageMeta, readVideoMeta } from "@/lib/media";
import type { MediaAsset } from "@/lib/types";

export interface ImportProgress {
  index: number;
  total: number;
  name: string;
}

interface AudioProbeElement extends HTMLVideoElement {
  mozHasAudio?: boolean;
  webkitAudioDecodedByteCount?: number;
  audioTracks?: { length: number };
}

/** Пытается определить, есть ли в видеофайле звуковая дорожка. */
async function probeHasAudio(file: File): Promise<boolean | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video") as AudioProbeElement;
    const done = (value: boolean | undefined) => {
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(value);
    };
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => {
      if (typeof el.mozHasAudio === "boolean") return done(el.mozHasAudio);
      if (typeof el.webkitAudioDecodedByteCount === "number") return done(el.webkitAudioDecodedByteCount > 0);
      if (el.audioTracks) return done(el.audioTracks.length > 0);
      done(undefined);
    };
    el.onerror = () => done(undefined);
    el.src = url;
    setTimeout(() => done(undefined), 6000);
  });
}

/**
 * Импортирует файлы с устройства: читает метаданные, делает превью-кадр,
 * кладёт бинарь в IndexedDB и возвращает готовые MediaAsset для проекта.
 */
export async function importFilesAsAssets(
  files: File[],
  onProgress?: (p: ImportProgress) => void,
): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];
  let index = 0;
  for (const file of files) {
    index += 1;
    onProgress?.({ index, total: files.length, name: file.name });
    const kind = inferKind(file);
    let meta: { duration: number; width?: number; height?: number; thumbnail?: string };
    try {
      meta =
        kind === "video" ? await readVideoMeta(file) : kind === "image" ? await readImageMeta(file) : await readAudioMeta(file);
    } catch {
      meta = { duration: kind === "image" ? 4 : 0 };
    }
    const blobKey = uid("blob");
    await saveBlob(blobKey, file);
    const asset: MediaAsset = {
      id: uid("asset"),
      name: file.name,
      kind,
      mime: file.type || (kind === "video" ? "video/mp4" : kind === "audio" ? "audio/mpeg" : "image/jpeg"),
      blobKey,
      duration: meta.duration || (kind === "image" ? 4 : 0),
      width: meta.width,
      height: meta.height,
      thumbnail: meta.thumbnail,
      createdAt: Date.now(),
    };
    if (kind === "video") {
      const hasAudio = await probeHasAudio(file);
      if (typeof hasAudio === "boolean") asset.hasAudio = hasAudio;
    }
    if (kind === "audio") asset.hasAudio = true;
    assets.push(asset);
  }
  return assets;
}

export const MEDIA_ACCEPT = "video/*,audio/*,image/*";

/** Открывает системный диалог выбора файлов и возвращает выбранные файлы. */
export function pickFiles(accept = MEDIA_ACCEPT, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => {
      input.remove();
    };
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      cleanup();
      resolve(files);
    };
    input.oncancel = () => {
      cleanup();
      resolve([]);
    };
    input.click();
  });
}
