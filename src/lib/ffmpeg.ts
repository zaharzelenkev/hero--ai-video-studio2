"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// The engine is normally served from our own domain (copied into public/ffmpeg
// at build time by scripts/copy-ffmpeg-core.mjs - see package.json "postinstall").
// That avoids depending on an external CDN being reachable from the visitor's
// network. If, for some reason, the local files are missing (e.g. a deploy that
// skipped `npm install`), we fall back to loading from a public CDN instead.
const LOCAL_CORE_BASE = "/ffmpeg";
const CDN_CORE_BASE = "https://unpkg.com/@ffmpeg/[email protected]/dist/umd";

let instance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

export type ProgressListener = (ratio: number) => void;
export type LogListener = (message: string) => void;

async function loadCoreFrom(ffmpeg: FFmpeg, base: string): Promise<void> {
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });
}

export async function getFFmpeg(onLog?: LogListener): Promise<FFmpeg> {
  if (instance) return instance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) {
      ffmpeg.on("log", ({ message }) => onLog(message));
    }
    try {
      await loadCoreFrom(ffmpeg, LOCAL_CORE_BASE);
    } catch {
      await loadCoreFrom(ffmpeg, CDN_CORE_BASE);
    }
    instance = ffmpeg;
    return ffmpeg;
  })().catch((err) => {
    loadingPromise = null;
    throw err;
  });

  return loadingPromise;
}

export function onFFmpegProgress(ffmpeg: FFmpeg, cb: ProgressListener) {
  const handler = ({ progress }: { progress: number }) => cb(Math.min(1, Math.max(0, progress)));
  ffmpeg.on("progress", handler);
  return () => ffmpeg.off("progress", handler);
}

export async function fetchFileFromBlob(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  // Create a copy to avoid detached ArrayBuffer issues when FFmpeg transfers ownership
  const copy = new Uint8Array(buf.byteLength);
  copy.set(new Uint8Array(buf));
  return copy;
}
