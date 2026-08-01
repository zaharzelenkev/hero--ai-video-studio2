"use client";

import type { AudioClip, Clip, Project, VideoClip } from "@/lib/types";
import { renderFrame } from "./compositor";

/** Глубокая копия проекта (для экспорта — чтобы не трогать состояние стора). */
export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}

/**
 * Вырезает участок таймлайна [start; end] в самостоятельный проект:
 * клипы обрезаются по границам и сдвигаются к нулю. Используется для
 * экспорта выделенного диапазона (in/out).
 */
export function sliceProject(project: Project, start: number, end: number): Project {
  const copy = cloneProject(project);
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(from + 0.05, Math.max(start, end));

  copy.tracks = copy.tracks.map((track) => ({
    ...track,
    clips: track.clips
      .filter((clip) => clip.start < to && clip.start + clip.duration > from)
      .map((clip) => {
        const head = Math.max(0, from - clip.start);
        const newStart = Math.max(0, clip.start - from);
        const newEnd = Math.min(clip.start + clip.duration, to) - from;
        const duration = Math.max(0.05, newEnd - newStart);
        if (clip.type === "video" || clip.type === "image" || clip.type === "audio") {
          const media = clip as VideoClip | AudioClip;
          const speed = (media as VideoClip).speed ?? 1;
          const inPoint = media.inPoint + head * speed;
          return { ...media, start: newStart, duration, inPoint, outPoint: inPoint + duration * speed } as Clip;
        }
        return { ...clip, start: newStart, duration } as Clip;
      }),
  }));

  copy.duration = to - from;
  return copy;
}

/** Рендерит текущий кадр в PNG исходного разрешения проекта. */
export async function exportFramePng(project: Project, time: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = project.resolution.width || 1920;
  canvas.height = project.resolution.height || 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  renderFrame(ctx, project, time);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFilename(name: string, extension: string): string {
  const clean = (name || "montiq").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
  return `${clean || "montiq"}.${extension}`;
}
