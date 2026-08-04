"use client";

import type { Project } from "./types";

/**
 * Нормализация видео-входов перед финальной сборкой.
 *
 * Проблема, которую это решает: автомонтаж открывает каждый исходник как
 * отдельный вход ffmpeg, а декодер каждого входа держит в wasm-куче кадры в
 * ПОЛНОМ разрешении (4K с телефона и т.п.). При 8–16 клипах куча исчерпывается
 * посреди рендера, и ffmpeg отдаёт фатальную ошибку
 * «Error while processing the decoded data for stream #N:0» → «Conversion failed!».
 * Флаги `-fflags +discardcorrupt -err_detect ignore_err` лечат повреждённые
 * кадры, но не ограничивают память декодера.
 *
 * Решение: перекодировать каждый РАЗНЫЙ видео-исходник один раз в «рабочий»
 * промежуточный файл, разрешение которого ограничено канвасом экспорта
 * (maxDim = max(W, H)), с гарантированно валидными видео и аудио. Финальная
 * сборка декодирует уже только такие файлы — куча остаётся ограниченной, а
 * битые кадры исходника вычищаются на этом этапе. Исходники при этом не
 * изменяются. Гигантские изображения (панорамы 8-12K), которые иначе держали
 * бы полное разрешение в куче через -loop 1, уменьшаются до maxDim (PNG).
 * Аудио-треки не трогаем.
 */
export interface NormalizeCtx {
  /** Выполнить ffmpeg с массивом аргументов, вернуть exit code. */
  exec: (args: string[]) => Promise<number>;
  onLog?: (msg: string) => void;
}

export interface NormalizeResult {
  /** Имена созданных промежуточных файлов (для очистки). */
  created: string[];
  /** assetId → путь к промежуточному файлу (только успешно нормализованные). */
  replacements: Map<string, string>;
}

export async function normalizeVideoInputs(
  ctx: NormalizeCtx,
  project: Project,
  assetFileNames: Map<string, string>,
  maxDim: number,
  fps: number,
): Promise<NormalizeResult> {
  const result: NormalizeResult = { created: [], replacements: new Map() };

  // Собираем видео- и (большие) изображения-исходники, используемые в таймлайне.
  const usedVideoAssetIds = new Set<string>();
  for (const track of project.tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips) {
      if (clip.type === "video" || clip.type === "image") {
        usedVideoAssetIds.add((clip as { assetId: string }).assetId);
      }
    }
  }

  const dim = Math.max(1, Math.round(maxDim));

  for (const assetId of usedVideoAssetIds) {
    const asset = project.assets.find((a) => a.id === assetId);
    const src = assetFileNames.get(assetId);
    if (!asset || !src) continue;
    if (asset.kind !== "video" && asset.kind !== "image") continue;

    const isImage = asset.kind === "image";
    // Обычные изображения (не больше канваса) не трогаем: они и так дешёвые.
    if (isImage) {
      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      const big = w > dim * 1.25 || h > dim * 1.25 || (w === 0 && h === 0);
      if (!big) continue;
    }

    const out = isImage ? `norm_${asset.id}.png` : `norm_${asset.id}.mp4`;
    // Умещаем в квадрат maxDim с сохранением пропорций, затем округляем стороны
    // до чётных — libx264 (yuv420p) требует чётные размеры кадра.
    const vf = `scale=w='min(iw\\,${dim})':h='min(ih\\,${dim})':force_original_aspect_ratio=decrease,scale='trunc(iw/2)*2':'trunc(ih/2)*2'`;
    const args: string[] = [
      "-fflags", "+discardcorrupt",
      "-err_detect", "ignore_err",
      "-i", src,
      "-map", "0:v:0",
      "-vf", vf,
    ];
    if (isImage) {
      // Один кадр, PNG — сохраняем формат «изображение» (и альфу, если есть):
      // дальше клип идёт через -loop 1, как и раньше.
      args.push("-frames:v", "1", "-y", out);
    } else {
      args.push(
        "-map", "0:a?",
        "-r", String(fps),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ac", "2",
        "-movflags", "+faststart",
        out,
      );
    }

    ctx.onLog?.(`Подготовка материала «${asset.name}»...`);
    let code = -1;
    try {
      code = await ctx.exec(args);
    } catch (e) {
      console.warn("Нормализация упала (fallback на исходник):", e);
      code = -1;
    }

    if (code !== 0) {
      // Не ломаем рендер: если нормализация не удалась, используем исходный файл.
      console.warn(`Нормализация не удалась для «${asset.name}», использую исходник.`);
      continue;
    }

    assetFileNames.set(assetId, out);
    result.created.push(out);
    result.replacements.set(assetId, out);
  }

  return result;
}
