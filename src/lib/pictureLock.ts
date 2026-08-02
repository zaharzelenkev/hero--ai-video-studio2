/**
 * PICTURE LOCK — фиксация монтажа (final assembly).
 *
 * Профессиональный конвейер постпродакшена: после завершения автомонтажа
 * система входит в режим финальной сборки и автоматически проверяет:
 *  1. длительность ролика (соответствие брифу/шаблону);
 *  2. ритм (средний/медианный план, разброс длительностей);
 *  3. слишком длинные кадры (обрезаются/ускоряются/разрезаются);
 *  4. слишком короткие кадры (дотягиваются исходником или убираются);
 *  5. темп (склейки выравниваются по ритмической сетке, битам);
 *  6. визуальную логику (дыры, jump cuts, длинные переходы, перекрытия).
 *
 * После подтверждения (stage === "locked") монтаж фиксируется: редактор
 * разрешает только цвет, звук, титры и эффекты. Все функции модуля чистые
 * и синхронные — работают и в браузере, и в Node (тесты).
 */

import type {
  Clip,
  MediaAsset,
  PictureLock,
  PictureLockFix,
  PictureLockIssue,
  PictureLockReport,
  PictureLockStage,
  Project,
  SubtitleClip,
  Track,
  VideoClip,
} from "./types";
import { uid } from "./id";

/* ------------------------------------------------------------------ */
/* константы                                                           */
/* ------------------------------------------------------------------ */

/** Лимиты плана по темпу шаблона (сек). */
export interface PaceLimits {
  /** Целевая (идеальная) длительность плана. */
  targetShot: number;
  /** План длиннее — «слишком длинный кадр». */
  maxShot: number;
  /** План короче — «слишком короткий кадр» (мигание). */
  minShot: number;
  /** Шаг ритмической сетки для выравнивания темпа. */
  grid: number;
}

export const PACE_LIMITS: Record<Project["style"]["pace"], PaceLimits> = {
  slow: { targetShot: 5.5, maxShot: 10.0, minShot: 1.6, grid: 0.5 },
  medium: { targetShot: 3.6, maxShot: 6.5, minShot: 0.8, grid: 0.5 },
  fast: { targetShot: 2.2, maxShot: 4.0, minShot: 0.45, grid: 0.25 },
  dynamic: { targetShot: 2.8, maxShot: 5.0, minShot: 0.45, grid: 0.25 },
};

/** Минимальная длительность ролика, считающаяся «настоящим видео». */
export const MIN_VIDEO_DURATION = 10;
/** Максимум: ролик длиннее — почти наверняка ошибка сборки. */
export const MAX_SANE_DURATION = 300;

/** Допуск длительности относительно цели. */
function durationTolerance(target: number): number {
  return Math.max(4, target * 0.1);
}

/** Доля склейки в бит, которая считается «ритмом в такт». */
const BEAT_TOLERANCE = 0.35;

/** Максимальное ускорение при «дожимании» длинного кадра. */
const MAX_RETIME_SPEED = 1.6;
/** Минимальное замедление при растягивании короткого кадра. */
const MIN_RETIME_SPEED = 0.7;

const EPS = 0.03;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function timelineDurationOf(project: Project): number {
  let max = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.start + clip.duration);
    }
  }
  return round3(max);
}

export function isPictureLocked(project: Project | null | undefined): boolean {
  return project?.pictureLock?.stage === "locked";
}

export function pictureLockStage(project: Project | null | undefined): PictureLockStage {
  return project?.pictureLock?.stage ?? "none";
}

/**
 * Основная видеодорожка — носитель монтажного ритма. Это первая видеодорожка,
 * которая не является дорожкой наложений (в автомонтаже — «Видео 1»).
 */
export function mainVideoTrack(project: Project): Track | undefined {
  const video = project.tracks.filter((t) => t.type === "video");
  if (video.length === 0) return undefined;
  const named = video.find((t) => !/наложен|overlay|b-roll/i.test(t.name));
  return named ?? video[0];
}

/** Планы основного монтажа (видео/фото на основной дорожке), по времени. */
export function mainShots(project: Project): VideoClip[] {
  const track = mainVideoTrack(project);
  if (!track) return [];
  return [...track.clips]
    .filter((c): c is VideoClip => c.type === "video" || c.type === "image")
    .sort((a, b) => a.start - b.start);
}

function assetOf(project: Project, clip: Clip): MediaAsset | undefined {
  const assetId = (clip as { assetId?: string }).assetId;
  if (!assetId) return undefined;
  return project.assets.find((a) => a.id === assetId);
}

/** Речевые интервалы из дорожки субтитров (глобальное время, сек). */
export function speechIntervals(project: Project): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const track of project.tracks) {
    if (track.type !== "subtitle") continue;
    for (const clip of track.clips as SubtitleClip[]) {
      out.push({ start: clip.start, end: clip.start + clip.duration });
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** Последняя граница речи внутри окна [from, to], либо null, если речи нет. */
function lastSpeechBoundaryInside(speech: Array<{ start: number; end: number }>, from: number, to: number): number | null {
  let boundary: number | null = null;
  for (const s of speech) {
    if (s.end <= from) continue;
    if (s.start >= to) break;
    boundary = Math.max(boundary ?? from, Math.min(to, s.end));
  }
  return boundary;
}

/** true, если в окне [from, to] есть речь, выходящая за пределы from. */
function hasSpeechInside(speech: Array<{ start: number; end: number }>, from: number, to: number): boolean {
  return speech.some((s) => s.end > from + 0.1 && s.start < to - 0.1);
}

function beatMarkers(project: Project): number[] {
  return project.markers.filter((m) => m.id.startsWith("beat_") || /beat|бит/i.test(m.label)).map((m) => m.time);
}

/** Целевая длительность ролика: из брифа, из плана режиссёра, иначе undefined. */
export function resolveTargetDuration(project: Project): number | undefined {
  const fromStyle = project.style?.targetDuration;
  if (fromStyle && fromStyle > 0) return fromStyle;
  const fromPlan = (project.directorPlan as { targetDuration?: number } | undefined)?.targetDuration;
  if (fromPlan && fromPlan > 0) return fromPlan;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* структурная подпись клипа (для блокировки монтажа)                  */
/* ------------------------------------------------------------------ */

/**
 * «Монтажная» подпись клипа: всё, что определяет СКЛЕЙКУ (тайминг, выбор
 * исходника, скорость, переходы). Цвет, звук, титры и эффекты в подпись
 * не входят — их можно менять и после Picture Lock.
 */
export function structuralSignature(clip: Clip): string {
  const base: Record<string, unknown> = {
    id: clip.id,
    trackId: clip.trackId,
    type: clip.type,
    start: round3(clip.start),
    duration: round3(clip.duration),
  };
  if (clip.type === "video" || clip.type === "audio") {
    const media = clip as VideoClip;
    base.assetId = media.assetId;
    base.inPoint = round3(media.inPoint);
    base.outPoint = round3(media.outPoint);
    base.speed = round3(media.speed ?? 1);
    if (clip.type === "video") {
      base.reversed = media.reversed ?? false;
      base.speedRamp = media.speedRamp ? JSON.stringify(media.speedRamp) : null;
      base.tIn = media.transitionIn ? `${media.transitionIn.type}:${round3(media.transitionIn.duration)}` : null;
      base.tOut = media.transitionOut ? `${media.transitionOut.type}:${round3(media.transitionOut.duration)}` : null;
    } else {
      base.loop = (clip as { loop?: boolean }).loop ?? false;
    }
  }
  return JSON.stringify(base);
}

/** true, если изменение клипа трогает монтаж (тайминг/склейку). */
export function clipIsStructuralEdit(before: Clip, after: Clip): boolean {
  return structuralSignature(before) !== structuralSignature(after);
}

/**
 * Монтажная подпись всего проекта: порядок дорожек не важен, важен состав
 * клипов. Пустые дорожки в подпись не входят — их можно создавать/удалять
 * и после Picture Lock (например, пустая аудиодорожка под новые титры-звук).
 */
export function projectStructuralSignature(project: Project): string {
  const tracks = project.tracks
    .filter((t) => t.clips.length > 0)
    .map((t) => `${t.id}:${t.type}:${t.clips.map(structuralSignature).sort().join("|")}`)
    .sort()
    .join("~");
  return tracks;
}

/* ------------------------------------------------------------------ */
/* проверки                                                            */
/* ------------------------------------------------------------------ */

interface ShotStats {
  shots: VideoClip[];
  count: number;
  averageShot: number;
  medianShot: number;
  minShot: number;
  maxShot: number;
  /** Коэффициент вариации (std/mean): 0 — идеально ровный темп. */
  tempoVariation: number;
}

function shotStats(project: Project): ShotStats {
  const shots = mainShots(project);
  if (shots.length === 0) {
    return { shots, count: 0, averageShot: 0, medianShot: 0, minShot: 0, maxShot: 0, tempoVariation: 1 };
  }
  const durations = shots.map((s) => s.duration).sort((a, b) => a - b);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((a, b) => a + (b - mean) ** 2, 0) / durations.length;
  const median = durations.length % 2 === 1 ? durations[Math.floor(durations.length / 2)] : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2;
  return {
    shots,
    count: shots.length,
    averageShot: round3(mean),
    medianShot: round3(median),
    minShot: round3(durations[0]),
    maxShot: round3(durations[durations.length - 1]),
    tempoVariation: round3(mean > 0 ? Math.sqrt(variance) / mean : 1),
  };
}

function analyzeDuration(project: Project): { ok: boolean; issues: PictureLockIssue[] } {
  const issues: PictureLockIssue[] = [];
  const actual = timelineDurationOf(project);
  const target = resolveTargetDuration(project);

  if (target !== undefined) {
    const tolerance = durationTolerance(target);
    if (actual < target - tolerance) {
      issues.push({
        kind: "duration",
        severity: "fail",
        message: `Ролик короче цели: ${actual.toFixed(1)} с вместо ${target.toFixed(0)} с (допуск ${tolerance.toFixed(1)} с).`,
      });
    } else if (actual > target + tolerance) {
      issues.push({
        kind: "duration",
        severity: "fail",
        message: `Ролик длиннее цели: ${actual.toFixed(1)} с вместо ${target.toFixed(0)} с (допуск ${tolerance.toFixed(1)} с).`,
      });
    } else {
      issues.push({ kind: "duration", severity: "ok", message: `Длительность ${actual.toFixed(1)} с соответствует цели ${target.toFixed(0)} с.` });
    }
  } else if (actual < MIN_VIDEO_DURATION) {
    issues.push({
      kind: "duration",
      severity: "fail",
      message: `Ролик слишком короткий: ${actual.toFixed(1)} с (минимум ${MIN_VIDEO_DURATION} с).`,
    });
  } else if (actual > MAX_SANE_DURATION) {
    issues.push({ kind: "duration", severity: "warn", message: `Подозрительно длинный ролик: ${actual.toFixed(1)} с.` });
  } else {
    issues.push({ kind: "duration", severity: "ok", message: `Длительность ${actual.toFixed(1)} с — в допустимом диапазоне.` });
  }

  return { ok: issues.every((i) => i.severity === "ok"), issues };
}

function analyzeRhythm(project: Project): { ok: boolean; issues: PictureLockIssue[]; stats: ShotStats; beatAlignment?: number } {
  const issues: PictureLockIssue[] = [];
  const stats = shotStats(project);
  const limits = PACE_LIMITS[project.style?.pace ?? "medium"];
  let beatAlignment: number | undefined;

  if (stats.count === 0) {
    issues.push({ kind: "rhythm", severity: "fail", message: "На основной видеодорожке нет ни одного плана." });
    return { ok: false, issues, stats };
  }

  issues.push({
    kind: "rhythm",
    severity: "ok",
    message: `Планов: ${stats.count} · средний ${stats.averageShot.toFixed(2)} с · медиана ${stats.medianShot.toFixed(2)} с · диапазон ${stats.minShot.toFixed(2)}–${stats.maxShot.toFixed(2)} с.`,
  });

  if (stats.averageShot > limits.targetShot * 1.6) {
    issues.push({
      kind: "rhythm",
      severity: "warn",
      message: `Средний план ${stats.averageShot.toFixed(2)} с заметно длиннее целевого ${limits.targetShot.toFixed(1)} с для темпа «${project.style?.pace}» — монтаж «вялый».`,
    });
  } else if (stats.averageShot < limits.targetShot * 0.55) {
    issues.push({
      kind: "rhythm",
      severity: "warn",
      message: `Средний план ${stats.averageShot.toFixed(2)} с заметно короче целевого ${limits.targetShot.toFixed(1)} с — монтаж «дёрганый».`,
    });
  }

  // Выравнивание темпа: разброс длительностей.
  if (stats.tempoVariation > 0.55) {
    issues.push({
      kind: "tempo",
      severity: "warn",
      message: `Темп неровный: коэффициент вариации планов ${(stats.tempoVariation * 100).toFixed(0)}% (норма — до 55%). Требуется выравнивание.`,
    });
  } else {
    issues.push({ kind: "tempo", severity: "ok", message: `Темп ровный: вариация ${(stats.tempoVariation * 100).toFixed(0)}%.` });
  }

  // Попадание склеек в бит-сетку (если биты размечены на таймлайне).
  const beats = beatMarkers(project);
  if (beats.length > 0) {
    let onBeat = 0;
    let cuts = 0;
    for (const shot of stats.shots) {
      if (shot.start < EPS) continue;
      cuts++;
      const nearest = beats.reduce((best, b) => (Math.abs(b - shot.start) < Math.abs(best - shot.start) ? b : best), beats[0]);
      if (Math.abs(nearest - shot.start) <= BEAT_TOLERANCE) onBeat++;
    }
    const alignment = cuts > 0 ? onBeat / cuts : 1;
    beatAlignment = Math.round(alignment * 100) / 100;
    if (cuts > 0 && alignment < 0.5) {
      issues.push({
        kind: "tempo",
        severity: "warn",
        message: `Склейки не ложатся в бит: только ${(alignment * 100).toFixed(0)}% стыков в такт (бит-сетка: ${beats.length} маркеров).`,
      });
    } else {
      issues.push({ kind: "tempo", severity: "ok", message: `Склейки в такт: ${(alignment * 100).toFixed(0)}% стыков.` });
    }
  }

  return { ok: issues.every((i) => i.severity === "ok"), issues, stats, beatAlignment };
}

function analyzeShots(project: Project): { longShots: number; shortShots: number; issues: PictureLockIssue[] } {
  const issues: PictureLockIssue[] = [];
  const limits = PACE_LIMITS[project.style?.pace ?? "medium"];
  const shots = mainShots(project);
  const speech = speechIntervals(project);
  let long = 0;
  let short = 0;

  for (const shot of shots) {
    if (shot.duration > limits.maxShot + EPS) {
      long++;
      const speechBound = lastSpeechBoundaryInside(speech, shot.start, shot.start + shot.duration);
      const speechFills = speechBound !== null && speechBound + 0.35 >= shot.start + shot.duration - 0.05;
      issues.push({
        kind: "long-shots",
        severity: speechFills ? "warn" : "fail",
        time: shot.start,
        clipId: shot.id,
        message: speechFills
          ? `Кадр ${shot.name} длится ${shot.duration.toFixed(2)} с (лимит ${limits.maxShot.toFixed(1)} с), но целиком покрыт речью — обрезка невозможна без потери реплик.`
          : `Кадр ${shot.name} длится ${shot.duration.toFixed(2)} с — дольше лимита ${limits.maxShot.toFixed(1)} с для темпа «${project.style?.pace}».`,
      });
    }
    if (shot.duration < limits.minShot - EPS) {
      short++;
      issues.push({
        kind: "short-shots",
        severity: "fail",
        time: shot.start,
        clipId: shot.id,
        message: `Кадр ${shot.name} длится ${shot.duration.toFixed(2)} с — короче минимума ${limits.minShot.toFixed(2)} с (визуальное мигание).`,
      });
    }
  }

  if (long === 0) {
    issues.push({ kind: "long-shots", severity: "ok", message: `Слишком длинных кадров нет (лимит ${limits.maxShot.toFixed(1)} с).` });
  }
  if (short === 0) {
    issues.push({ kind: "short-shots", severity: "ok", message: `Слишком коротких кадров нет (минимум ${limits.minShot.toFixed(2)} с).` });
  }

  return { longShots: long, shortShots: short, issues };
}

function analyzeVisualLogic(project: Project): { ok: boolean; issues: PictureLockIssue[] } {
  const issues: PictureLockIssue[] = [];
  const track = mainVideoTrack(project);
  const duration = timelineDurationOf(project);
  const speech = speechIntervals(project);

  if (!track) {
    issues.push({ kind: "visual-logic", severity: "fail", message: "Нет видеодорожки." });
    return { ok: false, issues };
  }

  // Дыры (провалы в чёрное) на основной дорожке.
  const shots = [...track.clips]
    .filter((c): c is VideoClip => c.type === "video" || c.type === "image")
    .sort((a, b) => a.start - b.start);
  if (shots.length === 0) {
    issues.push({ kind: "visual-logic", severity: "fail", message: "Основная видеодорожка пуста." });
    return { ok: false, issues };
  }
  if (shots[0].start > EPS) {
    issues.push({ kind: "visual-logic", severity: "warn", time: 0, message: `Ролик начинается с пустоты: первый план появляется на ${shots[0].start.toFixed(2)} с.` });
  }
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const cur = shots[i];
    const overlap = prev.start + prev.duration - cur.start;
    const allowedOverlap = (cur as VideoClip).transitionIn?.duration ?? 0;
    if (overlap < -EPS) {
      issues.push({
        kind: "visual-logic",
        severity: "fail",
        time: cur.start,
        clipId: cur.id,
        message: `Дыра в монтаже: между планами ${(-overlap).toFixed(2)} с пустоты (${prev.name} → ${cur.name}).`,
      });
    } else if (overlap > allowedOverlap + 0.05) {
      issues.push({
        kind: "visual-logic",
        severity: "warn",
        time: cur.start,
        clipId: cur.id,
        message: `Перекрытие планов ${overlap.toFixed(2)} с больше переходa ${allowedOverlap.toFixed(2)} с (${prev.name} → ${cur.name}).`,
      });
    }
  }

  // Jump cut: два соседних плана одного исходника почти с того же места.
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const cur = shots[i];
    if (prev.assetId === cur.assetId && Math.abs(prev.inPoint - cur.inPoint) < 0.75) {
      issues.push({
        kind: "visual-logic",
        severity: "warn",
        time: cur.start,
        clipId: cur.id,
        message: `Потенциальный jump cut: два плана ${cur.name} подряд с одного места исходника (${prev.inPoint.toFixed(2)} с → ${cur.inPoint.toFixed(2)} с).`,
      });
    }
  }

  // Переходы не должны съедать половину плана.
  for (const shot of shots) {
    for (const [label, tr] of [
      ["вход", shot.transitionIn],
      ["выход", shot.transitionOut],
    ] as const) {
      if (tr && tr.duration > 0 && tr.duration > shot.duration * 0.5) {
        issues.push({
          kind: "visual-logic",
          severity: "warn",
          time: shot.start,
          clipId: shot.id,
          message: `Переход «${label}» ${tr.duration.toFixed(2)} с длиннее половины плана (${shot.duration.toFixed(2)} с) — «плывущая» склейка.`,
        });
      }
    }
  }

  // Титры/субтитры, вылезающие за конец ролика.
  for (const t of project.tracks) {
    if (t.type !== "text" && t.type !== "subtitle") continue;
    for (const clip of t.clips) {
      if (clip.start + clip.duration > duration + 0.08) {
        issues.push({
          kind: "visual-logic",
          severity: "warn",
          time: clip.start,
          clipId: clip.id,
          message: `Титры «${clip.name}» выходят за конец ролика на ${(clip.start + clip.duration - duration).toFixed(2)} с.`,
        });
      }
    }
  }

  // Речь не должна обрезаться склейкой: план, покрывающий речь, длиннее речи.
  for (const shot of shots) {
    if (shot.type !== "video") continue;
    const end = shot.start + shot.duration;
    const speechHere = speech.filter((s) => s.start < end - 0.1 && s.end > shot.start + 0.1);
    for (const s of speechHere) {
      if (s.end > end + 0.05) {
        issues.push({
          kind: "visual-logic",
          severity: "warn",
          time: shot.start,
          clipId: shot.id,
          message: `Склейка на ${end.toFixed(2)} с обрезает речь (реплика длится до ${s.end.toFixed(2)} с) — план короче диалога.`,
        });
        break;
      }
    }
  }

  if (issues.length === 0) {
    issues.push({ kind: "visual-logic", severity: "ok", message: "Визуальная логика в порядке: нет дыр, jump cut'ов и обрезанной речи." });
  }
  return { ok: issues.every((i) => i.severity === "ok"), issues };
}

/** Полная проверка Picture Lock. */
export function analyzePictureLock(project: Project): PictureLockReport {
  const durationCheck = analyzeDuration(project);
  const rhythmCheck = analyzeRhythm(project);
  const shotsCheck = analyzeShots(project);
  const visualCheck = analyzeVisualLogic(project);

  const issues = [...durationCheck.issues, ...rhythmCheck.issues, ...shotsCheck.issues, ...visualCheck.issues];

  const allOk =
    durationCheck.ok &&
    rhythmCheck.ok &&
    shotsCheck.longShots === 0 &&
    shotsCheck.shortShots === 0 &&
    visualCheck.ok;

  return {
    checkedAt: Date.now(),
    duration: timelineDurationOf(project),
    targetDuration: resolveTargetDuration(project),
    durationOk: durationCheck.ok,
    averageShot: rhythmCheck.stats.averageShot,
    medianShot: rhythmCheck.stats.medianShot,
    minShot: rhythmCheck.stats.minShot,
    maxShot: rhythmCheck.stats.maxShot,
    tempoVariation: rhythmCheck.stats.tempoVariation,
    beatAlignment: rhythmCheck.beatAlignment,
    rhythmOk: rhythmCheck.ok,
    longShots: shotsCheck.longShots,
    shortShots: shotsCheck.shortShots,
    fixedShots: 0,
    visualLogicOk: visualCheck.ok,
    issues,
    fixes: [],
    allOk,
  };
}

/* ------------------------------------------------------------------ */
/* исправления                                                         */
/* ------------------------------------------------------------------ */

function patchTrack(project: Project, trackId: string, fn: (clips: Clip[]) => Clip[]): Project {
  const tracks = project.tracks.map((t) => (t.id === trackId ? { ...t, clips: fn(t.clips) } : t));
  const next: Project = { ...project, tracks, updatedAt: Date.now() };
  next.duration = timelineDurationOf(next);
  return next;
}

function updateShot(project: Project, shot: VideoClip, next: VideoClip, fixes: PictureLockFix[], message: string): Project {
  // Ничего не изменилось (например, речь не позволила резать) — не плодим правки.
  const durationChanged = Math.abs(next.duration - shot.duration) > 0.02;
  const inOutChanged = Math.abs((next.inPoint ?? 0) - (shot.inPoint ?? 0)) > 0.001 || Math.abs((next.outPoint ?? 0) - (shot.outPoint ?? 0)) > 0.001;
  const speedChanged = Math.abs((next.speed ?? 1) - (shot.speed ?? 1)) > 0.001;
  if (!durationChanged && !inOutChanged && !speedChanged) return project;

  const fixed = { ...next } as Clip;
  fixes.push({ kind: shot.duration > next.duration ? "long-shots" : "short-shots", clipId: shot.id, time: next.start, message });
  return patchTrack(project, shot.trackId, (clips) => clips.map((c) => (c.id === shot.id ? fixed : c)));
}

/**
 * Исправление слишком длинных кадров:
 * 1) обрезать хвост, если исходник позволяет;
 * 2) иначе ускорить (до 1.6×);
 * 3) иначе разрезать на два плана в энергетическом/речевом разрыве.
 * Кадр, покрывающий речь целиком, не режется — это фиксируется в отчёте.
 */
export function fixLongShots(project: Project): { project: Project; fixes: PictureLockFix[] } {
  const fixes: PictureLockFix[] = [];
  const limits = PACE_LIMITS[project.style?.pace ?? "medium"];
  const speech = speechIntervals(project);
  let next = project;
  const shots = mainShots(next);

  for (const shot of shots) {
    if (shot.duration <= limits.maxShot + EPS) continue;
    const asset = assetOf(next, shot);

    // Речь в кадре: не режем раньше конца реплики. Без речи кадр ужимается
    // до лимита темпа (maxShot), с речью — до конца последней реплики + пауза
    // (такой кадр может остаться длиннее лимита — это осознанно).
    const speechBound = lastSpeechBoundaryInside(speech, shot.start, shot.start + shot.duration);
    let targetDur = limits.maxShot;
    if (speechBound !== null) {
      const cutAt = speechBound + 0.35;
      if (cutAt >= shot.start + shot.duration) {
        const message = `Кадр ${shot.name} длинный (${shot.duration.toFixed(2)} с), но покрывает речь — оставлен без обрезки.`;
        if (!fixes.some((f) => f.clipId === shot.id && f.message === message)) {
          fixes.push({ kind: "long-shots", clipId: shot.id, time: shot.start, message });
        }
        continue;
      }
      targetDur = Math.max(limits.minShot, cutAt - shot.start);
    }

    if (shot.type === "image" || !asset || !asset.duration) {
      // Фото/бесконечный источник — просто укорачиваем.
      next = updateShot(next, shot, { ...shot, duration: round3(targetDur) }, fixes, `Кадр ${shot.name} укорочен с ${shot.duration.toFixed(2)} с до ${targetDur.toFixed(2)} с (слишком длинный).`);
      continue;
    }

    const speed = shot.speed ?? 1;
    const span = shot.outPoint - shot.inPoint;
    const newSpan = targetDur * speed;
    const headroom = asset.duration - shot.outPoint;
    // Speed-ramp рендерится по своим ключам, а не по полю speed: ретайм
    // через speed на таких кадрах не работает — только обрезка окна.
    const hasRamp = !!shot.speedRamp?.keyframes && shot.speedRamp.keyframes.length >= 2;

    if (newSpan <= span - 0.05 || headroom >= newSpan - span + 0.05) {
      // Есть куда обрезать хвост (или просто ужимаем окно).
      const outPoint = Math.min(asset.duration, Math.max(shot.inPoint + 0.5, shot.inPoint + newSpan));
      const duration = (outPoint - shot.inPoint) / speed;
      next = updateShot(next, shot, { ...shot, outPoint: round3(outPoint), duration: round3(duration) }, fixes, `Кадр ${shot.name} обрезан с ${shot.duration.toFixed(2)} с до ${duration.toFixed(2)} с (слишком длинный).`);
      continue;
    }

    const retimed = span / targetDur;
    if (!hasRamp && retimed >= 0.5 && retimed <= MAX_RETIME_SPEED) {
      next = updateShot(next, shot, { ...shot, speed: round3(retimed), duration: round3(targetDur) }, fixes, `Кадр ${shot.name} ускорен ${speed.toFixed(2)}× → ${retimed.toFixed(2)}× (длительность ${targetDur.toFixed(2)} с).`);
      continue;
    }

    // Последний приём: разрезать на два плана в разрыве энергии/речи.
    const cutLen = Math.max(limits.minShot, targetDur * 0.55);
    const cutSource = shot.inPoint + cutLen * speed;
    if (cutSource < shot.outPoint - 0.2) {
      const secondId = uid("clip");
      const second: VideoClip = {
        ...JSON.parse(JSON.stringify(shot)),
        id: secondId,
        start: round3(shot.start + cutLen),
        duration: round3(shot.duration - cutLen),
        inPoint: round3(cutSource),
        transitionIn: { type: "crossfade", duration: 0.25 },
      };
      const first: VideoClip = { ...shot, duration: round3(cutLen), transitionOut: second.transitionIn };
      const trackId = shot.trackId;
      next = patchTrack(next, trackId, (clips) =>
        clips
          .map((c) => (c.id === shot.id ? (first as Clip) : c))
          .concat([second as Clip])
          .sort((a, b) => a.start - b.start),
      );
      fixes.push({
        kind: "long-shots",
        clipId: shot.id,
        time: shot.start,
        message: `Кадр ${shot.name} разрезан на два плана (${cutLen.toFixed(2)} с + ${(shot.duration - cutLen).toFixed(2)} с) — слишком длинный.`,
      });
    }
  }

  return { project: next, fixes };
}

/**
 * Исправление слишком коротких кадров: дотягиваем исходником (хвост/голова),
 * при недоступности — ретайм, в крайнем случае кадр убирается (рипл).
 */
export function fixShortShots(project: Project): { project: Project; fixes: PictureLockFix[] } {
  const fixes: PictureLockFix[] = [];
  const limits = PACE_LIMITS[project.style?.pace ?? "medium"];
  let next = project;
  const shots = mainShots(next);

  for (const shot of shots) {
    if (shot.duration >= limits.minShot - EPS) continue;
    const asset = assetOf(next, shot);
    const targetDur = limits.minShot;

    if (shot.type === "image" || !asset || !asset.duration) {
      next = updateShot(next, shot, { ...shot, duration: round3(targetDur) }, fixes, `Кадр ${shot.name} растянут с ${shot.duration.toFixed(2)} с до ${targetDur.toFixed(2)} с (слишком короткий).`);
      continue;
    }

    const speed = shot.speed ?? 1;
    const span = shot.outPoint - shot.inPoint;
    const headroomTail = asset.duration - shot.outPoint;
    const needExtra = (targetDur - shot.duration) * speed;
    const headroomHead = shot.inPoint;

    if (headroomTail >= needExtra - 0.05) {
      const outPoint = shot.outPoint + needExtra;
      next = updateShot(next, shot, { ...shot, outPoint: round3(outPoint), duration: round3(targetDur) }, fixes, `Кадр ${shot.name} дотянут хвостом до ${targetDur.toFixed(2)} с (слишком короткий).`);
      continue;
    }
    if (headroomHead >= needExtra - 0.05) {
      const inPoint = shot.inPoint - needExtra;
      next = updateShot(next, shot, { ...shot, inPoint: round3(inPoint), duration: round3(targetDur) }, fixes, `Кадр ${shot.name} дотянут головой до ${targetDur.toFixed(2)} с (слишком короткий).`);
      continue;
    }
    const both = headroomHead + headroomTail;
    if (both >= needExtra - 0.05) {
      const takeHead = Math.min(headroomHead, needExtra * 0.5);
      const takeTail = needExtra - takeHead;
      next = updateShot(
        next,
        shot,
        { ...shot, inPoint: round3(shot.inPoint - takeHead), outPoint: round3(shot.outPoint + takeTail), duration: round3(targetDur) },
        fixes,
        `Кадр ${shot.name} дотянут с двух сторон до ${targetDur.toFixed(2)} с (слишком короткий).`,
      );
      continue;
    }
    const retimed = span / targetDur;
    const hasRamp = !!shot.speedRamp?.keyframes && shot.speedRamp.keyframes.length >= 2;
    if (!hasRamp && retimed >= MIN_RETIME_SPEED && retimed <= 1.5) {
      next = updateShot(next, shot, { ...shot, speed: round3(retimed), duration: round3(targetDur) }, fixes, `Кадр ${shot.name} замедлен до ${retimed.toFixed(2)}× (длительность ${targetDur.toFixed(2)} с).`);
      continue;
    }

    // Исходник исчерпан — кадр-мигание убираем с риплом.
    const trackId = shot.trackId;
    const removedAt = shot.start;
    next = patchTrack(next, trackId, (clips) => {
      const sorted = [...clips].sort((a, b) => a.start - b.start);
      const without = sorted.filter((c) => c.id !== shot.id);
      let cursor = 0;
      return without.map((c) => {
        const shifted = { ...c, start: round3(cursor) };
        cursor = round3(cursor + c.duration);
        return shifted;
      });
    });
    fixes.push({
      kind: "short-shots",
      clipId: shot.id,
      time: removedAt,
      message: `Кадр-мигание ${shot.name} (${shot.duration.toFixed(2)} с) удалён: исходник исчерпан.`,
    });
  }

  return { project: next, fixes };
}

/**
 * Выравнивание темпа: длительности планов подтягиваются к ритмической сетке
 * (кратно grid), последующие планы основной дорожки сдвигаются риплом.
 * Сдвиг каждого плана ограничен (≤0.35 с или ≤15%), суммарный дрейф ≤2 с.
 */
export function alignTempo(project: Project): { project: Project; fixes: PictureLockFix[] } {
  const fixes: PictureLockFix[] = [];
  const limits = PACE_LIMITS[project.style?.pace ?? "medium"];
  const speech = speechIntervals(project);
  let next = project;
  const track = mainVideoTrack(next);
  if (!track) return { project: next, fixes };

  const shots = [...track.clips]
    .filter((c): c is VideoClip => c.type === "video" || c.type === "image")
    .sort((a, b) => a.start - b.start);
  if (shots.length < 2) return { project: next, fixes };

  // Пропускаем выравнивание, если темп уже ровный.
  const stats = shotStats(next);
  if (stats.tempoVariation <= 0.4) return { project: next, fixes };

  let cumDelta = 0;

  const patches = new Map<string, Clip[]>();
  for (const shot of shots) {
    const candidate = Math.min(limits.maxShot, Math.max(limits.minShot, Math.round(shot.duration / limits.grid) * limits.grid));
    const delta = candidate - shot.duration;
    const maxDelta = Math.max(0.35, shot.duration * 0.15);
    if (Math.abs(delta) <= 0.02 || Math.abs(delta) > maxDelta) {
      cumDelta += 0;
      continue;
    }
    if (Math.abs(cumDelta + delta) > 2) break;
    if (hasSpeechInside(speech, shot.start, shot.start + shot.duration) && delta < -0.02) {
      // Ужимать речевой план нельзя — обрежем речь.
      continue;
    }

    const newStart = round3(shot.start + cumDelta);
    let nextShot: VideoClip | null = null;
    const asset = assetOf(next, shot);

    if (shot.type === "image" || !asset || !asset.duration) {
      nextShot = { ...shot, start: newStart, duration: round3(candidate) };
    } else {
      const speed = shot.speed ?? 1;
      const span = shot.outPoint - shot.inPoint;
      const newSpan = candidate * speed;
      const headroomTail = asset.duration - shot.outPoint;
      if (delta < 0 || headroomTail >= newSpan - span - 0.05) {
        const outPoint = Math.min(asset.duration, Math.max(shot.inPoint + 0.4, shot.inPoint + newSpan));
        nextShot = { ...shot, start: newStart, outPoint: round3(outPoint), duration: round3((outPoint - shot.inPoint) / speed) };
      } else {
        const hasRamp = !!shot.speedRamp?.keyframes && shot.speedRamp.keyframes.length >= 2;
        const retimed = span / candidate;
        if (!hasRamp && retimed >= MIN_RETIME_SPEED && retimed <= MAX_RETIME_SPEED) {
          nextShot = { ...shot, start: newStart, speed: round3(retimed), duration: round3(candidate) };
        }
      }
    }

    if (!nextShot) {
      continue;
    }
    cumDelta = round3(cumDelta + (nextShot.duration - shot.duration));
    patches.set(shot.trackId, [...(patches.get(shot.trackId) ?? []), nextShot as Clip]);
    fixes.push({
      kind: "tempo",
      clipId: shot.id,
      time: newStart,
      message: `План ${shot.name} выровнен по сетке ${limits.grid.toFixed(2)} с: ${shot.duration.toFixed(2)} с → ${nextShot.duration.toFixed(2)} с.`,
    });
  }

  if (patches.size === 0) return { project: next, fixes };
  for (const [trackId, updated] of patches) {
    next = patchTrack(next, trackId, (clips) => {
      const map = new Map(updated.map((c) => [c.id, c]));
      // Сдвигаем риплом и остальные планы после последнего изменённого.
      const sorted = [...clips].sort((a, b) => a.start - b.start);
      let lastEnd = 0;
      let drifting = false;
      const out: Clip[] = [];
      for (const c of sorted) {
        const patched = map.get(c.id);
        if (patched) {
          drifting = true;
          lastEnd = patched.start + patched.duration;
          out.push(patched);
          continue;
        }
        if (drifting && (c.type === "video" || c.type === "image")) {
          // Сдвигаем риплом, сохраняя перекрытие перехода следующего плана.
          const overlap = (c as VideoClip).transitionIn?.duration ?? 0;
          if (c.start >= lastEnd - overlap - EPS) {
            const shifted = { ...c, start: round3(lastEnd - overlap) };
            lastEnd = round3(shifted.start + c.duration);
            out.push(shifted as Clip);
            continue;
          }
        }
        lastEnd = Math.max(lastEnd, c.start + c.duration);
        out.push(c);
      }
      return out;
    });
  }

  return { project: next, fixes };
}

/** Выравнивание общей длительности ролика под цель брифа (ограниченно ±25%). */
export function alignDuration(project: Project): { project: Project; fixes: PictureLockFix[] } {
  const fixes: PictureLockFix[] = [];
  const target = resolveTargetDuration(project);
  if (target === undefined) return { project, fixes };

  const actual = timelineDurationOf(project);
  const tolerance = durationTolerance(target);
  if (Math.abs(actual - target) <= tolerance) return { project, fixes };

  let factor = target / Math.max(0.1, actual);
  factor = Math.min(1.25, Math.max(0.75, factor));
  if (Math.abs(factor - 1) < 0.005) {
    fixes.push({ kind: "duration", message: `Целевая длительность ${target.toFixed(0)} с недостижима без потери качества (фактор за пределами ±25%).` });
    return { project, fixes };
  }

  const next = scaleTimeline(project, factor);
  fixes.push({
    kind: "duration",
    message: `Длительность выровнена: ${actual.toFixed(1)} с → ${timelineDurationOf(next).toFixed(1)} с (цель ${target.toFixed(0)} с, фактор ${factor.toFixed(3)}).`,
  });
  return { project: next, fixes };
}

/** Масштабирование таймлайна (старты, длительности, ключи, переходы) + ретайм исходников. */
function scaleTimeline(project: Project, factor: number): Project {
  const scaleParam = (p: { keyframes: Array<{ time: number }> } | undefined): void => {
    if (!p) return;
    for (const kf of p.keyframes) kf.time = round3(kf.time * factor);
  };
  const scaleClip = (clip: Clip): Clip => {
    const out = { ...clip, start: round3(clip.start * factor), duration: round3(clip.duration * factor) } as Clip;
    if (out.type === "video" || out.type === "image") {
      const v = out as VideoClip;
      scaleParam(v.opacity); scaleParam(v.x); scaleParam(v.y); scaleParam(v.scale);
      scaleParam(v.scaleX); scaleParam(v.scaleY); scaleParam(v.rotation); scaleParam(v.rotationX); scaleParam(v.rotationY);
      scaleParam(v.focusX); scaleParam(v.focusY);
      scaleParam(v.cropLeft); scaleParam(v.cropRight); scaleParam(v.cropTop); scaleParam(v.cropBottom);
      scaleParam(v.volume);
      for (const c of [v.color?.brightness, v.color?.contrast, v.color?.saturation, v.color?.vibrance, v.color?.hue, v.color?.exposure, v.color?.highlights, v.color?.shadows, v.color?.whites, v.color?.blacks, v.color?.temperature, v.color?.tint, v.color?.gamma]) scaleParam(c);
      for (const m of [v.mask?.x, v.mask?.y, v.mask?.width, v.mask?.height]) scaleParam(m);
      if (v.speedRamp?.keyframes) for (const k of v.speedRamp.keyframes) k.time = round3(k.time * factor);
      if (v.transitionIn) v.transitionIn.duration = round3(v.transitionIn.duration * factor);
      if (v.transitionOut) v.transitionOut.duration = round3(v.transitionOut.duration * factor);
    } else if (out.type === "audio") {
      const a = out as { volume?: { keyframes: Array<{ time: number }> }; pan?: { keyframes: Array<{ time: number }> } };
      scaleParam(a.volume); scaleParam(a.pan);
    } else {
      const t = out as { x?: { keyframes: Array<{ time: number }> }; y?: { keyframes: Array<{ time: number }> }; scale?: { keyframes: Array<{ time: number }> }; rotation?: { keyframes: Array<{ time: number }> }; opacity?: { keyframes: Array<{ time: number }> } };
      scaleParam(t.x); scaleParam(t.y); scaleParam(t.scale); scaleParam(t.rotation); scaleParam(t.opacity);
    }
    return out;
  };

  const tracks = project.tracks.map((t) => ({ ...t, clips: t.clips.map(scaleClip) }));
  const next: Project = { ...project, tracks, updatedAt: Date.now() };
  for (const m of next.markers) m.time = round3(m.time * factor);

  // Исходников должно хватать: расширяем окна и/или ретаймим.
  for (const track of next.tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips) {
      if (clip.type !== "video") continue;
      const v = clip as VideoClip;
      const asset = next.assets.find((a) => a.id === v.assetId);
      const srcDur = asset?.duration ?? 0;
      if (srcDur <= 0) continue;
      const needed = v.duration * (v.speed ?? 1);
      const available = srcDur - (v.inPoint ?? 0);
      if (available < needed - 0.01) {
        v.outPoint = srcDur;
        // Для speed-ramp кадров скорость задают ключи рампы, а не поле speed —
        // компенсация через speed на них не работает (и не нужна: рендер
        // возьмёт столько исходника, сколько реально доступно).
        const hasRamp = !!v.speedRamp?.keyframes && v.speedRamp.keyframes.length >= 2;
        const avail = v.outPoint - (v.inPoint ?? 0);
        if (!hasRamp && avail > 0.2) v.speed = round3(avail / v.duration);
      }
    }
  }
  next.duration = timelineDurationOf(next);
  return next;
}

/** Исправление визуальной логики: дыры, jump cuts, длинные переходы, титры за краем. */
export function fixVisualLogic(project: Project): { project: Project; fixes: PictureLockFix[] } {
  const fixes: PictureLockFix[] = [];
  let next = project;
  const track = mainVideoTrack(next);
  const duration = timelineDurationOf(next);
  if (!track) return { project: next, fixes };

  // 1) Закрываем дыры на основной дорожке (рипл).
  const shots = [...track.clips].filter((c) => c.type === "video" || c.type === "image").sort((a, b) => a.start - b.start);
  let cursor = 0;
  let moved = false;
  const patched = shots.map((c) => {
    const shifted = Math.abs(c.start - cursor) > 0.02 ? { ...c, start: round3(cursor) } : c;
    if (shifted !== c) moved = true;
    cursor = round3(cursor + c.duration);
    return shifted;
  });
  if (moved) {
    const map = new Map(patched.map((c) => [c.id, c]));
    next = patchTrack(next, track.id, (clips) => clips.map((c) => map.get(c.id) ?? c));
    fixes.push({ kind: "visual-logic", message: "Дыры на основной видеодорожке закрыты (рипл)." });
  }

  // 2) Jump cut: сдвигаем окно второго плана вперёд по исходнику.
  const shots2 = mainShots(next);
  for (let i = 1; i < shots2.length; i++) {
    const prev = shots2[i - 1];
    const cur = shots2[i];
    if (prev.assetId !== cur.assetId || cur.type !== "video") continue;
    if (Math.abs(prev.inPoint - cur.inPoint) >= 0.75) continue;
    const asset = assetOf(next, cur);
    if (!asset?.duration) continue;
    const speed = cur.speed ?? 1;
    const need = cur.duration * speed;
    const skip = 0.9;
    if (cur.inPoint + skip + need <= asset.duration + 0.05) {
      const shifted: VideoClip = { ...cur, inPoint: round3(cur.inPoint + skip), outPoint: round3(cur.outPoint + skip) };
      next = patchTrack(next, cur.trackId, (clips) => clips.map((c) => (c.id === cur.id ? (shifted as Clip) : c)));
      fixes.push({ kind: "visual-logic", clipId: cur.id, time: cur.start, message: `Jump cut исправлен: окно плана ${cur.name} сдвинуто на ${skip.toFixed(1)} с вперёд по исходнику.` });
    } else {
      fixes.push({ kind: "visual-logic", clipId: cur.id, time: cur.start, message: `Jump cut (${cur.name}) не исправлен: исходник исчерпан.` });
    }
  }

  // 3) Переходы не длиннее половины плана.
  for (const shot of mainShots(next)) {
    const cap = Math.max(0.1, shot.duration * 0.4);
    let changed = false;
    const tIn = shot.transitionIn && shot.transitionIn.duration > cap ? { ...shot.transitionIn, duration: round3(cap) } : shot.transitionIn;
    const tOut = shot.transitionOut && shot.transitionOut.duration > cap ? { ...shot.transitionOut, duration: round3(cap) } : shot.transitionOut;
    if (tIn !== shot.transitionIn || tOut !== shot.transitionOut) changed = true;
    if (changed) {
      const fixed: VideoClip = { ...shot, transitionIn: tIn, transitionOut: tOut };
      next = patchTrack(next, shot.trackId, (clips) => clips.map((c) => (c.id === shot.id ? (fixed as Clip) : c)));
      fixes.push({ kind: "visual-logic", clipId: shot.id, time: shot.start, message: `Переход плана ${shot.name} укорочен до ${cap.toFixed(2)} с (не длиннее половины плана).` });
    }
  }

  // 4) Титры/субтитры за краем ролика.
  for (const t of next.tracks) {
    if (t.type !== "text" && t.type !== "subtitle") continue;
    for (const clip of t.clips) {
      if (clip.start + clip.duration <= duration + 0.08) continue;
      const trimmed = { ...clip, duration: round3(Math.max(0.2, duration - clip.start)) } as Clip;
      next = patchTrack(next, t.id, (clips) => clips.map((c) => (c.id === clip.id ? trimmed : c)));
      fixes.push({ kind: "visual-logic", clipId: clip.id, time: clip.start, message: `Титры «${clip.name}» обрезаны по конец ролика.` });
    }
  }

  return { project: next, fixes };
}

/**
 * Полный проход исправлений Picture Lock. Повторяется до сходимости
 * (каждый проход пересчитывает состояние; правки ограничены).
 */
export function fixPictureLock(project: Project): { project: Project; fixes: PictureLockFix[] } {
  const fixes: PictureLockFix[] = [];
  let next = project;
  for (let i = 0; i < 5; i++) {
    // Порядок важен: сначала длительность (глобальный темп) и визуальная
    // логика, затем длинные/короткие кадры, затем ритмическая сетка.
    // Иначе «ужать длинный кадр» и «растянуть до цели» бесконечно спорят.
    const a = fixVisualLogic(next);
    const b = alignDuration(a.project);
    const c = fixLongShots(b.project);
    const d = fixShortShots(c.project);
    const e = alignTempo(d.project);
    next = e.project;
    const count = a.fixes.length + b.fixes.length + c.fixes.length + d.fixes.length + e.fixes.length;
    fixes.push(...a.fixes, ...b.fixes, ...c.fixes, ...d.fixes, ...e.fixes);
    if (count === 0) break;
  }
  return { project: next, fixes };
}

/* ------------------------------------------------------------------ */
/* жизненный цикл                                                      */
/* ------------------------------------------------------------------ */

/** Проверка + автоисправления + переход в режим финальной сборки (review). */
export function finalizePictureLock(project: Project): Project {
  // Уже подтверждённый монтаж не трогаем.
  if (project.pictureLock?.stage === "locked") return project;

  // Повторная финализация того же таймлайна ничего не меняет.
  if (project.pictureLock?.report && Math.abs(project.pictureLock.report.duration - timelineDurationOf(project)) < 0.01 && project.pictureLock.report.fixes.length === 0) {
    return { ...project, pictureLock: { ...project.pictureLock, stage: "review" } };
  }

  const { project: fixed, fixes } = fixPictureLock(project);
  const report = analyzePictureLock(fixed);
  report.fixes = fixes;
  report.fixedShots = fixes.filter((f) => f.kind === "long-shots" || f.kind === "short-shots").length;

  const lock: PictureLock = { stage: "review", report };
  return { ...fixed, pictureLock: lock };
}

/** Подтверждение Picture Lock: монтаж фиксируется. */
export function lockPicture(project: Project): Project {
  return {
    ...project,
    pictureLock: { ...(project.pictureLock ?? { stage: "review" }), stage: "locked", lockedAt: Date.now() },
  };
}

/** Снятие блокировки (возврат к монтажу). Отчёт сохраняется. */
export function unlockPicture(project: Project): Project {
  const lock = project.pictureLock ?? { stage: "none" as PictureLockStage };
  return { ...project, pictureLock: { ...lock, stage: lock.report ? ("review" as PictureLockStage) : ("none" as PictureLockStage) } };
}
