"use client";

import { loadBlob } from "@/lib/db";
import type { MediaAsset } from "@/lib/types";

const urlCache = new Map<string, string>();
const videoCache = new Map<string, HTMLVideoElement>();
const imageCache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<string>>();

export async function getAssetUrl(asset: MediaAsset): Promise<string> {
  const cached = urlCache.get(asset.id);
  if (cached) return cached;
  const inflight = loading.get(asset.id);
  if (inflight) return inflight;
  const promise = (async () => {
    const blob = await loadBlob(asset.blobKey);
    if (!blob) throw new Error("missing blob");
    const url = URL.createObjectURL(blob);
    urlCache.set(asset.id, url);
    return url;
  })();
  loading.set(asset.id, promise);
  return promise;
}

export function getVideoElement(assetId: string, url: string): HTMLVideoElement {
  let el = videoCache.get(assetId);
  if (!el) {
    el = document.createElement("video");
    el.src = url;
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    videoCache.set(assetId, el);
  }
  return el;
}

export function getImageElement(assetId: string, url: string): HTMLImageElement {
  let el = imageCache.get(assetId);
  if (!el) {
    el = new Image();
    el.src = url;
    imageCache.set(assetId, el);
  }
  return el;
}
