/**
 * Экспортные помощники VFX: генерация PNG световых лучей (тот же математический
 * аппарат, что в превью) и пре-рендер кадров для AI-эффектов (удаление фона
 * MediaPipe, удаление объекта FMM-инпейнтингом).
 *
 * Пре-рендер работает только в браузере (нужны canvas + MediaPipe) и вызывается
 * из render.ts ТОЛЬКО если в проекте включены соответствующие эффекты.
 */

import type { MediaAsset, VideoClip } from "../types";
import { applySegmentation, applyObjectRemoval, lightRays as engineLightRays, newBuffer, toImageData, type FrameBuffer } from "./vfxEngine";
import { bgRemovalService } from "./mediaPipeVfx";
import { cubeFileName, cubeTextFor } from "./lut";
import type { VfxRenderOverride, LightRaysInput } from "../filterGraph";

/* ------------------------------------------------------------------ */
/* LUT .cube файлы                                                     */
/* ------------------------------------------------------------------ */

export { cubeFileName, cubeTextFor };

/** Все пресеты, для которых рендеру нужно записать .cube файлы. */
export async function writeLutCubes(
  ffmpeg: { writeFile(path: string, data: Uint8Array): Promise<unknown> },
  presets: string[],
): Promise<void> {
  for (const preset of presets) {
    const text = cubeTextFor(preset);
    await ffmpeg.writeFile(cubeFileName(preset), new TextEncoder().encode(text));
  }
}

/* ------------------------------------------------------------------ */
/* Световые лучи                                                       */
/* ------------------------------------------------------------------ */

/** Размер кадра клипа ПОСЛЕ цепочки fit/scale в экспортном графе.
 *  Именно с таким размером блендится PNG лучей (иначе blend-фильтр падает). */
export function clipDrawSize(
  clip: VideoClip,
  asset: MediaAsset | undefined,
  W: number,
  H: number,
): { width: number; height: number } {
  const sw = asset?.width || W;
  const sh = asset?.height || H;
  const cover = clip.blurPad ? false : (clip.fitMode ?? "cover") === "cover";
  if (cover) return { width: W, height: H };
  // native/contain: scale=trunc(iw*baseScale/2)*2 (как в buildVideoClipChain).
  const baseScale = clip.scale?.keyframes?.length ? clip.scale.keyframes[0].value : (clip.scale?.value ?? 1);
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return { width: even(sw * baseScale), height: even(sh * baseScale) };
}

/** Имя файла PNG лучей в виртуальной ФС ffmpeg. */
export function raysFileName(clipId: string): string {
  return `rays_${clipId.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
}

/**
 * Генерирует PNG-текстуру световых лучей в размере (w × h).
 * Возвращает Blob (PNG). Математика поля лучей — как в vfxEngine.lightRays.
 */
export async function generateRaysPng(params: {
  centerX: number;
  centerY: number;
  length: number;
  rayCount: number;
  seed: number;
  width: number;
  height: number;
}): Promise<Blob> {
  const { width: w, height: h } = params;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Нет 2D-контекста для генерации лучей");
  const buf: FrameBuffer = newBuffer(w, h);
  // Белый кадр с альфой, чтобы поле лучей было видимым при screen-бленде.
  for (let i = 0; i < buf.data.length; i += 4) {
    buf.data[i] = 255;
    buf.data[i + 1] = 255;
    buf.data[i + 2] = 255;
    buf.data[i + 3] = 0;
  }
  const rays = engineLightRays(buf, {
    centerX: params.centerX,
    centerY: params.centerY,
    length: params.length,
    strength: 1.2,
    rayCount: params.rayCount,
    seed: params.seed,
  });
  // Вырезаем только сами лучи (разница с белым), иначе screen-бленд всё засветит.
  const out = new Uint8ClampedArray(rays.data.length);
  for (let i = 0; i < rays.data.length; i += 4) {
    const add = Math.max(0, rays.data[i] - 255);
    out[i] = add;
    out[i + 1] = add;
    out[i + 2] = add;
    out[i + 3] = add; // альфа = яркость лучей — screen-бленд по RGBA
  }
  ctx.putImageData(toImageData({ data: out, width: w, height: h }), 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob вернул null"))), "image/png");
  });
}

/** Собирает опции световых лучей для компилятора графа. */
export async function collectLightRaysInputs(
  project: ProjectLike,
  W: number,
  H: number,
  ffmpeg: { writeFile(path: string, data: Uint8Array): Promise<unknown> },
): Promise<LightRaysInput[]> {
  const out: LightRaysInput[] = [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  for (const track of project.tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips as VideoClip[]) {
      const vfx = clip.vfx;
      if (!vfx?.lightRays?.enabled) continue;
      const size = clipDrawSize(clip, assets.get(clip.assetId), W, H);
      const blob = await generateRaysPng({
        centerX: vfx.lightRays.centerX,
        centerY: vfx.lightRays.centerY,
        length: vfx.lightRays.length,
        rayCount: vfx.lightRays.rayCount,
        seed: (clip.id.length * 31 + 7) % 100000,
        width: Math.max(2, size.width),
        height: Math.max(2, size.height),
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const path = raysFileName(clip.id);
      await ffmpeg.writeFile(path, bytes);
      out.push({ clipId: clip.id, path, strength: clamp01(vfx.lightRays.strength) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Пре-рендер AI-эффектов (удаление фона / удаление объекта)           */
/* ------------------------------------------------------------------ */

interface ProjectLike {
  assets: MediaAsset[];
  tracks: { type: string; clips: unknown[] }[];
}

export interface AiVfxJob {
  clip: VideoClip;
  asset: MediaAsset;
  /** Время внутри исходника, с которого рендерим (inPoint). */
  inPoint: number;
  outPoint: number;
  needsBackground: boolean;
  needsObject: boolean;
}

const CHUNK_FRAMES = 60;
const MAX_WIDTH = 960;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

type FfmpegLike = {
  exec(args: string[]): Promise<number>;
  writeFile(path: string, data: Uint8Array): Promise<unknown>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<unknown>;
};

/** Находит клипы с AI-эффектами. */
export function findAiVfxClips(project: ProjectLike): AiVfxJob[] {
  const jobs: AiVfxJob[] = [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  for (const track of project.tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips as VideoClip[]) {
      const vfx = clip.vfx;
      if (!vfx) continue;
      const needsBackground = !!vfx.backgroundRemoval?.enabled;
      const needsObject =
        !!vfx.objectRemoval?.enabled && ((vfx.objectRemoval.strokes?.length ?? 0) > 0 || (vfx.objectRemoval.region?.polygon?.length ?? 0) > 0);
      if (!needsBackground && !needsObject) continue;
      const asset = assets.get(clip.assetId);
      if (!asset) continue;
      jobs.push({
        clip,
        asset,
        inPoint: clip.inPoint,
        outPoint: clip.outPoint,
        needsBackground,
        needsObject,
      });
    }
  }
  return jobs;
}

/**
 * Пре-рендерит кадры клипов с AI-эффектами в PNG-последовательности и
 * возвращает overrides для компилятора графа. Бросает ошибку с понятным
 * сообщением, если MediaPipe недоступен.
 */
export async function prepareAiVfxOverrides(
  project: ProjectLike,
  ffmpeg: FfmpegLike,
  fps: number,
  assetFileNames: Map<string, string>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ overrides: Map<string, VfxRenderOverride>; error?: string; createdFiles: string[] }> {
  const jobs = findAiVfxClips(project);
  const overrides = new Map<string, VfxRenderOverride>();
  const createdFiles: string[] = [];
  if (!jobs.length) return { overrides, createdFiles };

  // Проверяем доступность модели ЗАРАНЕЕ, чтобы не тратить время на извлечение кадров.
  const needModel = jobs.some((j) => j.needsBackground);
  if (needModel) {
    const ok = await bgRemovalService.ensureLoaded();
    if (!ok) {
      return {
        overrides,
        error:
          bgRemovalService.error ??
          "Не удалось загрузить модель MediaPipe Selfie (нужен интернет для первого скачивания модели).",
        createdFiles,
      };
    }
  }

  let done = 0;
  const total = jobs.length;
  const report = () => {
    done += 1;
    onProgress?.(done, total);
  };

  for (const job of jobs) {
    const clip = job.clip;
    const tag = clip.id.replace(/[^a-zA-Z0-9]/g, "_");
    const srcFile = assetFileNames.get(job.asset.id);
    if (!srcFile) continue;

    const rawDur = Math.max(0.05, job.outPoint - job.inPoint);
    const wantFrames = Math.ceil(rawDur * fps);

    if (job.asset.kind === "image" || clip.type === "image") {
      // --- Одиночный кадр: извлекаем, обрабатываем, сохраняем один PNG.
      const rawName = `airaw_${tag}.png`;
      const procName = `aiproc_${tag}.png`;
      let code = await ffmpeg.exec(["-i", srcFile, "-frames:v", "1", rawName]);
      if (code !== 0) {
        code = await ffmpeg.exec(["-ss", String(job.inPoint), "-i", srcFile, "-frames:v", "1", rawName]);
      }
      if (code !== 0) continue;
      const processed = await processPngFrame(ffmpeg, rawName, job);
      await ffmpeg.writeFile(procName, processed);
      createdFiles.push(procName);
      try {
        ffmpeg.deleteFile(rawName);
      } catch {
        /* ignore */
      }
      overrides.set(clip.id, {
        path: procName,
        pre: ["-loop", "1", "-t", String(Math.max(0.1, clip.duration)), "-framerate", String(fps)],
        duration: clip.duration,
        isImage: true,
      });
      report();
      continue;
    }

    // --- Видео: чанками по CHUNK_FRAMES кадров.
    const seqOut = `aiproc_${tag}_%05d.png`;
    const chunkFrames = Math.min(CHUNK_FRAMES, wantFrames);
    let processedCount = 0;
    let frameStart = 0;
    while (frameStart < wantFrames) {
      const chunkStart = job.inPoint + frameStart / fps;
      const chunkFramesNow = Math.min(chunkFrames, wantFrames - frameStart);
      const chunkDur = chunkFramesNow / fps;
      const rawPattern = `airaw_${tag}_${frameStart.toString().padStart(5, "0")}_%05d.png`;
      const code = await ffmpeg.exec([
        "-ss", String(chunkStart),
        "-i", srcFile,
        "-t", String(chunkDur),
        "-vf", `fps=${fps},scale=${MAX_WIDTH}:-2`,
        "-frames:v", String(chunkFramesNow),
        "-start_number", "1",
        rawPattern,
      ]);
      if (code !== 0) {
        return {
          overrides,
          error: `Не удалось извлечь кадры клипа "${clip.name}" для AI-эффекта (код ${code}).`,
          createdFiles,
        };
      }
      for (let i = 1; i <= chunkFramesNow; i++) {
        const rawName = rawPattern.replace("%05d", String(i).padStart(5, "0"));
        const procName = `aiproc_${tag}_${(processedCount + 1).toString().padStart(5, "0")}.png`;
        const processed = await processPngFrame(ffmpeg, rawName, job);
        await ffmpeg.writeFile(procName, processed);
        createdFiles.push(procName);
        try {
          ffmpeg.deleteFile(rawName);
        } catch {
          /* ignore */
        }
        processedCount += 1;
      }
      frameStart += chunkFramesNow;
    }

    const finalDuration = processedCount / fps;
    overrides.set(clip.id, {
      path: seqOut,
      pre: ["-framerate", String(fps)],
      duration: finalDuration,
      isImage: false,
    });
    report();
  }

  return { overrides, createdFiles };
}

/** Извлекает PNG из ФС ffmpeg, обрабатывает эффектами и возвращает PNG-байты. */
async function processPngFrame(ffmpeg: FfmpegLike, rawName: string, job: AiVfxJob): Promise<Uint8Array> {
  const read = await ffmpeg.readFile(rawName);
  const raw = typeof read === "string" ? new TextEncoder().encode(read) : new Uint8Array(read);
  const blob = new Blob([raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Нет 2D-контекста");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let buf: FrameBuffer = { data: img.data, width: canvas.width, height: canvas.height };

  if (job.needsBackground) {
    const key = `${job.clip.id}:${job.asset.id}:frame:${job.inPoint}`;
    const mask = await bgRemovalService.computeMaskAsync(canvas, key);
    const vfx = job.clip.vfx!;
    buf = applySegmentation(buf, {
      mask,
      smooth: vfx.backgroundRemoval.edgeSmooth,
      foregroundOpacity: vfx.backgroundRemoval.foregroundOpacity,
      threshold: vfx.backgroundRemoval.threshold,
      fill: vfx.backgroundRemoval.fill,
      color: hexToRgb(vfx.backgroundRemoval.color),
      blurAmount: vfx.backgroundRemoval.blurAmount,
    });
  }

  if (job.needsObject) {
    const vfx = job.clip.vfx!;
    buf = applyObjectRemoval(buf, vfx.objectRemoval.strokes ?? [], vfx.objectRemoval.region, 12);
  }

  ctx.putImageData(toImageData(buf), 0, 0);
  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob вернул null"))), "image/png");
  });
  return new Uint8Array(await outBlob.arrayBuffer());
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full || "000000", 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
