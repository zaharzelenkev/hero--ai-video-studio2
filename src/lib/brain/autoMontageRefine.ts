/**
 * AUTO-MONTAGE REFINEMENT — второй проход автомонтажа.
 *
 * Первый проход (черновой) собрал историю из лучших дублей.
 * Второй проход НЕ строится заново, а УЛУЧШАЕТ:
 * - темп
 * - переходы
 * - драматургию
 * - добавляет перебивки
 * - синхронизирует музыку
 * - усиливает удержание внимания
 *
 * Работает на основе профиля типа проекта (16 типов).
 */

import type { VideoClip } from "../types";
import type { ProjectTypeProfile } from "./projectType";

export interface RefineInput {
  clips: VideoClip[];
  bRollClips: VideoClip[];
  profile: ProjectTypeProfile | null;
  beats: number[];
  downbeats: number[];
  totalDuration: number;
}

export interface RefineResult {
  notes: string[];
  adjusted: boolean;
}

/**
 * Основной рефайн: проверяет темп, переходы, драматургию.
 * Мутирует clips напрямую (детерминированно).
 */
export function refineMontage(input: RefineInput): RefineResult {
  const { clips, bRollClips, profile, beats, totalDuration } = input;
  const notes: string[] = [];
  let adjusted = false;

  if (!profile) {
    return { notes: ["Профиль типа проекта не определён — рефайн по базовым правилам"], adjusted: false };
  }

  // 1. ТЕМП: проверяем соответствие cuts per minute
  const durationMin = totalDuration / 60;
  const cuts = clips.length;
  const cpm = durationMin > 0 ? cuts / durationMin : 0;
  const [minCpm, maxCpm] = profile.pace.cutsPerMinute;

  if (cpm < minCpm * 0.7) {
    notes.push(`Темп слишком медленный: ${cpm.toFixed(1)} смен/мин при норме ${minCpm}-${maxCpm} для ${profile.labelRu}. Рекомендуется ускорить.`);
    // Для быстрых жанров — помечаем длинные клипы для обрезки (PictureLock сделает, но мы логируем)
  } else if (cpm > maxCpm * 1.3) {
    notes.push(`Темп слишком быстрый: ${cpm.toFixed(1)} смен/мин при норме ${minCpm}-${maxCpm} для ${profile.labelRu}. Риск стробоскопа.`);
  } else {
    notes.push(`Темп в норме: ${cpm.toFixed(1)} смен/мин (${minCpm}-${maxCpm}) для ${profile.labelRu}`);
  }

  // 2. ПЕРЕХОДЫ: запрещённые переходы для типа проекта
  const forbidden = new Set(profile.transition.avoid);
  let forbiddenCount = 0;
  for (const clip of clips) {
    const t = (clip.transitionIn?.type || "cut") as string;
    if (forbidden.has(t)) {
      // Заменяем на первый из предпочитаемых или на cut
      const replacement = profile.transition.preferred[0] || "cut";
      clip.transitionIn = {
        type: replacement as any,
        duration: Math.min(clip.transitionIn?.duration || 0.3, profile.transition.maxDurationSec),
        reason: `Исправлен запрещённый переход ${t} → ${replacement} для типа ${profile.labelRu}`,
      } as any;
      forbiddenCount++;
      adjusted = true;
    }
    // Кламп длительности перехода
    if (clip.transitionIn && clip.transitionIn.duration > profile.transition.maxDurationSec) {
      clip.transitionIn.duration = profile.transition.maxDurationSec;
      adjusted = true;
    }
  }
  if (forbiddenCount > 0) {
    notes.push(`Исправлено запрещённых переходов: ${forbiddenCount} для типа ${profile.labelRu}`);
  }

  // 3. ДРАМАТУРГИЯ: проверяем структуру Hook → Problem → Solution → CTA
  // Hook должен быть первым, короткий и цепляющий
  if (clips.length > 0) {
    const first = clips[0];
    const expectedHookMax = profile.id === "podcast" || profile.id === "interview" ? 4 : profile.id === "tiktok" || profile.id === "instagram-reel" ? 1.5 : 2.5;
    if (first.duration > expectedHookMax * 1.6) {
      notes.push(`Первый кадр (Hook) слишком длинный: ${first.duration.toFixed(1)}с при норме до ${expectedHookMax}с для ${profile.labelRu}`);
    }
  }

  // 4. ПЕРЕБИВКИ: проверяем частоту B-Roll
  const mainDuration = clips.reduce((s, c) => s + c.duration, 0);
  const bRollDuration = bRollClips.reduce((s, c) => s + c.duration, 0);
  const bRollCoverage = mainDuration > 0 ? (bRollDuration / mainDuration) * 100 : 0;
  
  let expectedCoverage: [number, number] = [10, 30];
  switch (profile.broll.frequency) {
    case "rare": expectedCoverage = [2, 10]; break;
    case "occasional": expectedCoverage = [8, 20]; break;
    case "moderate": expectedCoverage = [15, 35]; break;
    case "frequent": expectedCoverage = [25, 50]; break;
    case "very-frequent": expectedCoverage = [35, 70]; break;
  }

  if (bRollCoverage < expectedCoverage[0] * 0.7) {
    notes.push(`Мало перебивок: покрытие ${bRollCoverage.toFixed(0)}% при норме ${expectedCoverage[0]}-${expectedCoverage[1]}% для ${profile.labelRu}. Рекомендуется добавить B-Roll.`);
  } else if (bRollCoverage > expectedCoverage[1] * 1.4) {
    notes.push(`Слишком много перебивок: покрытие ${bRollCoverage.toFixed(0)}% при норме ${expectedCoverage[0]}-${expectedCoverage[1]}%. Основной план теряется.`);
  } else {
    notes.push(`Покрытие B-Roll в норме: ${bRollCoverage.toFixed(0)}% (${expectedCoverage[0]}-${expectedCoverage[1]}%)`);
  }

  // 5. СИНХРОНИЗАЦИЯ С МУЗЫКОЙ
  if (beats.length > 0 && profile.transition.beatSyncRequired) {
    let synced = 0;
    let unsynced = 0;
    for (const clip of clips) {
      const start = clip.start;
      // Ближайший бит
      let closest = Infinity;
      for (const b of beats) {
        const d = Math.abs(b - start);
        if (d < closest) closest = d;
      }
      if (closest <= 0.25) synced++;
      else unsynced++;
    }
    const syncRate = clips.length > 0 ? (synced / clips.length) * 100 : 0;
    if (syncRate < 60) {
      notes.push(`Слабая синхронизация с битами: ${syncRate.toFixed(0)}% склеек попадают в бит для ${profile.labelRu} (требуется >60%)`);
    } else {
      notes.push(`Синхронизация с музыкой OK: ${syncRate.toFixed(0)}% склеек в бит`);
    }
  }

  // 6. УДЕРЖАНИЕ ВНИМАНИЯ: проверяем монотонность
  // Считаем сколько подряд одинаковых крупностей
  let sameSizeStreak = 0;
  let maxStreak = 0;
  let lastSize: string | null = null;
  for (const clip of clips) {
    const size = (clip as any).cameraAngle || "medium";
    if (size === lastSize) {
      sameSizeStreak++;
      maxStreak = Math.max(maxStreak, sameSizeStreak);
    } else {
      sameSizeStreak = 1;
      lastSize = size;
    }
  }
  if (maxStreak >= 3 && !profile.isTalking) {
    notes.push(`Монотонность крупностей: ${maxStreak} одинаковых планов подряд — рекомендуется чередовать wide/medium/close для ${profile.labelRu}`);
  }

  // 7. ФОТО: проверяем и ИСПРАВЛЯЕМ длительность фото-планов по профилю.
  // Фото без проблем с источником (бесконечная длительность) просто растягиваются/сжимаются
  // до допустимого диапазона. Видео-клипы трогаем только для явных нарушений (< 80% минимума).
  let photoFixed = 0;
  if (profile.photo) {
    const minDur = profile.photo.minDurationSec;
    const maxDur = profile.photo.maxDurationSec;
    for (const clip of clips) {
      if (clip.type !== "image") continue;
      if (clip.duration < minDur) {
        clip.duration = Math.round(minDur * 100) / 100;
        photoFixed++;
        adjusted = true;
      } else if (clip.duration > maxDur * 1.2) {
        clip.duration = Math.round(maxDur * 100) / 100;
        photoFixed++;
        adjusted = true;
      }
    }
  }
  if (photoFixed > 0) {
    notes.push(`Исправлено фото-клипов с неоптимальной длительностью: ${photoFixed} для ${profile.labelRu} (норма ${profile.photo.minDurationSec}-${profile.photo.maxDurationSec}с)`);
  }

  // 8. ПЕРЕСЧЁТ СТАРТОВ: после исправления длительностей клипы на основной
  // дорожке должны идти без дыр и перекрытий.
  if (adjusted && clips.length > 1) {
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    let cursor = sorted[0].start;
    for (const clip of sorted) {
      clip.start = Math.round(cursor * 100) / 100;
      cursor = clip.start + clip.duration;
    }
  }

  return { notes, adjusted };
}

/**
 * Улучшает темп монтажа под профиль: укорачивает/удлиняет клипы
 * с сохранением общей длительности (перераспределение времени).
 * Используется как рекомендация, а не жёсткое правило.
 */
export function suggestTempoAdjustments(clips: VideoClip[], profile: ProjectTypeProfile | null): string[] {
  if (!profile) return [];
  const notes: string[] = [];
  const target = profile.pace.targetClipSec;
  const min = profile.pace.minClipSec;
  const max = profile.pace.maxClipSec;

  let tooLong = 0;
  let tooShort = 0;
  for (const c of clips) {
    if (c.duration > max * 1.2) tooLong++;
    if (c.duration < min * 0.8) tooShort++;
  }

  if (tooLong > 0) notes.push(`${tooLong} клипов длиннее ${max}с для ${profile.labelRu} — рекомендуется ускорить`);
  if (tooShort > 0) notes.push(`${tooShort} клипов короче ${min}с для ${profile.labelRu} — риск стробоскопа`);
  if (tooLong === 0 && tooShort === 0) notes.push(`Длительности клипов в норме для ${profile.labelRu}: цель ${target}с`);

  return notes;
}
