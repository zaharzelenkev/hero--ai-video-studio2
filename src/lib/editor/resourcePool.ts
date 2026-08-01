"use client";

import { loadBlob } from "@/lib/db";
import { computeWaveformPeaks } from "@/lib/media";
import type { MediaAsset } from "@/lib/types";

/**
 * Единое хранилище тяжёлых медиаресурсов редактора: object-URL исходников,
 * <video> элементы (по одному на клип — у каждого свой currentTime),
 * изображения, аудиобуферы для микшера, пики для волновых форм и
 * «киноплёнка» (несколько кадров) для превью клипа на таймлайне.
 *
 * Всё загружается лениво и кешируется: рисующий цикл (requestAnimationFrame)
 * может дёргать синхронные геттеры каждый кадр без затрат.
 */
class MediaResourcePool {
  private urls = new Map<string, string>();
  private urlLoading = new Map<string, Promise<string | null>>();
  private images = new Map<string, HTMLImageElement>();
  private videos = new Map<string, HTMLVideoElement>();
  private videoOwners = new Map<string, string>();
  private buffers = new Map<string, AudioBuffer>();
  private bufferLoading = new Map<string, Promise<AudioBuffer | null>>();
  private peaksCache = new Map<string, number[]>();
  private peaksLoading = new Set<string>();
  private strips = new Map<string, string[]>();
  private stripsLoading = new Set<string>();
  private listeners = new Set<() => void>();

  /** Подписка на «появились новые ресурсы» — чтобы перерисовать UI. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  urlFor(asset: MediaAsset): string | null {
    const cached = this.urls.get(asset.id);
    if (cached) return cached;
    if (!this.urlLoading.has(asset.id)) {
      const promise = (async () => {
        const blob = await loadBlob(asset.blobKey);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        this.urls.set(asset.id, url);
        this.notify();
        return url;
      })().catch(() => null);
      this.urlLoading.set(asset.id, promise);
    }
    return null;
  }

  async urlForAsync(asset: MediaAsset): Promise<string | null> {
    const cached = this.urls.get(asset.id);
    if (cached) return cached;
    this.urlFor(asset);
    return (await this.urlLoading.get(asset.id)) ?? null;
  }

  imageFor(asset: MediaAsset): HTMLImageElement | null {
    const cached = this.images.get(asset.id);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
    const url = this.urlFor(asset);
    if (!url) return null;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => this.notify();
    img.src = url;
    this.images.set(asset.id, img);
    return null;
  }

  /** Отдельный <video> на клип: каждому клипу нужен свой currentTime. */
  videoFor(clipId: string, asset: MediaAsset): HTMLVideoElement | null {
    const existing = this.videos.get(clipId);
    if (existing) return existing;
    const url = this.urlFor(asset);
    if (!url) return null;
    const el = document.createElement("video");
    el.src = url;
    el.preload = "auto";
    el.playsInline = true;
    el.muted = true;
    el.crossOrigin = "anonymous";
    el.load();
    this.videos.set(clipId, el);
    this.videoOwners.set(clipId, asset.id);
    el.addEventListener("loadeddata", () => this.notify(), { once: true });
    return el;
  }

  /** Ставит на паузу все видео, кроме активных в текущем кадре. */
  pauseVideosExcept(activeClipIds: Set<string>) {
    for (const [clipId, el] of this.videos) {
      if (activeClipIds.has(clipId)) continue;
      if (!el.paused) el.pause();
    }
  }

  /** Освобождает <video> элементы для клипов, которых больше нет в проекте. */
  retainClips(activeClipIds: Set<string>) {
    for (const [clipId, el] of this.videos) {
      if (activeClipIds.has(clipId)) continue;
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
      this.videos.delete(clipId);
      this.videoOwners.delete(clipId);
    }
  }

  peaksFor(asset: MediaAsset): number[] | null {
    const cached = this.peaksCache.get(asset.id);
    if (cached) return cached;
    if (this.peaksLoading.has(asset.id)) return null;
    this.peaksLoading.add(asset.id);
    void (async () => {
      try {
        const blob = await loadBlob(asset.blobKey);
        if (!blob) return;
        const peaks = await computeWaveformPeaks(blob, 900);
        this.peaksCache.set(asset.id, peaks);
        this.notify();
      } catch {
        this.peaksCache.set(asset.id, []);
      } finally {
        this.peaksLoading.delete(asset.id);
      }
    })();
    return null;
  }

  async audioBufferFor(asset: MediaAsset, ctx: AudioContext): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(asset.id);
    if (cached) return cached;
    const inflight = this.bufferLoading.get(asset.id);
    if (inflight) return inflight;
    const promise = (async () => {
      try {
        const blob = await loadBlob(asset.blobKey);
        if (!blob) return null;
        const raw = await blob.arrayBuffer();
        const buffer = await ctx.decodeAudioData(raw.slice(0));
        this.buffers.set(asset.id, buffer);
        return buffer;
      } catch {
        return null;
      } finally {
        this.bufferLoading.delete(asset.id);
      }
    })();
    this.bufferLoading.set(asset.id, promise);
    return promise;
  }

  /**
   * «Киноплёнка»: равномерные кадры исходника для отрисовки клипа на
   * таймлайне (как в профессиональных NLE).
   */
  filmstripFor(asset: MediaAsset, samples = 12): string[] | null {
    if (asset.kind === "image") {
      return asset.thumbnail ? [asset.thumbnail] : null;
    }
    if (asset.kind !== "video") return null;
    const cached = this.strips.get(asset.id);
    if (cached) return cached;
    if (this.stripsLoading.has(asset.id)) return asset.thumbnail ? [asset.thumbnail] : null;
    this.stripsLoading.add(asset.id);
    void (async () => {
      try {
        const url = await this.urlForAsync(asset);
        if (!url) return;
        const frames = await extractFrames(url, asset.duration || 0, samples);
        if (frames.length) {
          this.strips.set(asset.id, frames);
          this.notify();
        }
      } catch {
        /* ignore */
      } finally {
        this.stripsLoading.delete(asset.id);
      }
    })();
    return asset.thumbnail ? [asset.thumbnail] : null;
  }

  /** Готовое к рисованию изображение кадра из «киноплёнки». */
  private stripImages = new Map<string, HTMLImageElement>();

  stripImage(assetId: string, index: number, dataUrl: string): HTMLImageElement | null {
    const key = `${assetId}:${index}`;
    const cached = this.stripImages.get(key);
    if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
    const img = new Image();
    img.onload = () => this.notify();
    img.src = dataUrl;
    this.stripImages.set(key, img);
    return null;
  }

  dispose() {
    for (const el of this.videos.values()) {
      try {
        el.pause();
        el.removeAttribute("src");
      } catch {
        /* ignore */
      }
    }
    this.videos.clear();
    this.videoOwners.clear();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.urlLoading.clear();
    this.images.clear();
    this.buffers.clear();
    this.bufferLoading.clear();
    this.peaksCache.clear();
    this.peaksLoading.clear();
    this.strips.clear();
    this.stripImages.clear();
    this.stripsLoading.clear();
  }
}

async function extractFrames(url: string, duration: number, samples: number): Promise<string[]> {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    video.onloadeddata = done;
    video.onerror = done;
    setTimeout(done, 8000);
  });

  if (!video.videoWidth) return [];
  const total = duration || video.duration || 0;
  const count = Math.max(1, Math.min(samples, total > 0 ? samples : 1));
  const width = 160;
  const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = total > 0 ? (total * (i + 0.5)) / count : 0;
    const ok = await seekTo(video, Math.min(t, Math.max(0, total - 0.05)));
    if (!ok) break;
    ctx.drawImage(video, 0, 0, width, height);
    frames.push(canvas.toDataURL("image/jpeg", 0.5));
  }
  video.removeAttribute("src");
  video.load();
  return frames;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      video.onseeked = null;
      video.onerror = null;
      resolve(ok);
    };
    video.onseeked = () => finish(true);
    video.onerror = () => finish(false);
    try {
      video.currentTime = time;
    } catch {
      finish(false);
    }
    setTimeout(() => finish(false), 4000);
  });
}

export const mediaPool = new MediaResourcePool();
