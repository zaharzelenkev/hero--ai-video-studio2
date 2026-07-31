/**
 * SPEED RAMP — математика кусочно-постоянных рамп скорости.
 *
 * Единая точка правды для монтажного движка (autoEdit строит ключи рампы)
 * и рендера (filterGraph исполняет их через setpts). Соглашение:
 * ключи заданы в координатах ТАЙМЛАЙНА клипа — [{time: 0, speed: 0.62},
 * {time: 2.1, speed: 1.1}] означает «первые 2.1с вывода идут на 0.62x,
 * дальше — 1.1x». Суммарный расход исходника = Σ (Δt * speed).
 *
 * Рендер строит точное обратное отображение «входное время s → выходное t»:
 * t = kf[i].time + (s − S_i)/speed_i для s ∈ [S_i, S_{i+1}], где S_i —
 * кумулятивный расход исходника к началу сегмента i.
 */

import type { SpeedRamp } from "./types";

export type RampKind = "pre-climax" | "climax";

/**
 * Ключи рампы, СОХРАНЯЮЩИЕ длительность: окно исходника `window` (сек) должно
 * разыграться ровно за `targetDur` (сек) таймлайна. Скорости s1 < base < s2
 * (медленнее и быстрее номинала), доля исходника на медленной скорости
 * находится решением уравнения f·W/s1 + (1−f)·W/s2 = targetDur.
 *
 * Возвращает null, если рампа не влезает в разумные пределы — тогда клип
 * остаётся с постоянной скоростью (это лучше, чем кривой тайминг).
 */
export function buildRampKeyframes(targetDur: number, window: number, kind: RampKind): SpeedRamp | null {
  if (targetDur < 1.4 || window < 0.6) return null;
  const base = window / targetDur;
  // Классика монтажа: pre-climax РАЗГОНЯЕТСЯ в дроп (0.85→1.7 номинала),
  // climax «оседает» из slow-mo в реальный темп (0.62→1.1 номинала).
  const s1 = kind === "climax" ? Math.max(0.5, base * 0.62) : Math.max(0.7, base * 0.85);
  const s2 = kind === "climax" ? Math.max(s1 + 0.15, base * 1.1) : Math.max(base * 1.35, base * 1.7);
  const f = (targetDur - window / s2) / (window / s1 - window / s2);
  if (!(f > 0.1 && f < 0.9) || s1 >= base || s2 <= base || !Number.isFinite(f)) return null;
  const seg1Tl = (f * window) / s1;
  return {
    enabled: true,
    keyframes: [
      { time: 0, speed: +s1.toFixed(3), easing: "linear" },
      { time: +seg1Tl.toFixed(3), speed: +s2.toFixed(3), easing: "linear" },
    ],
  };
}

/**
 * Расход исходника (сек) на ОТРЕЗКАХ МЕЖДУ КЛЮЧАМИ (до последнего ключа).
 * Хвост после последнего ключа добирается из оставшегося окна исходника —
 * полный расход = этот результат + (totalSource − S_last) (см. speedRampTotalTimeline).
 */
export function speedRampTotalSource(kfs: { time: number; speed: number }[]): number {
  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  let total = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    total += Math.max(0, sorted[i + 1].time - sorted[i].time) * sorted[i].speed;
  }
  return total;
}

/** Итоговая длительность на таймлайне (сек) при заданном полном расходе исходника. */
export function speedRampTotalTimeline(kfs: { time: number; speed: number }[], totalSource: number): number {
  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  if (sorted.length < 2) return sorted[0]?.time ?? 0;
  const segEnd = speedRampSegments(sorted)[sorted.length - 2].sEnd;
  const lastSp = Math.max(0.1, Math.min(10, sorted[sorted.length - 1].speed));
  return sorted[sorted.length - 1].time + Math.max(0, totalSource - segEnd) / lastSp;
}

/** Кумулятивные сегменты (расход исходника по сегментам). */
export function speedRampSegments(kfs: { time: number; speed: number }[]): { sStart: number; sEnd: number; speed: number; tStart: number }[] {
  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  const segs: { sStart: number; sEnd: number; speed: number; tStart: number }[] = [];
  let sCursor = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const tDur = Math.max(0.001, sorted[i + 1].time - sorted[i].time);
    const sp = Math.max(0.1, Math.min(10, sorted[i].speed));
    segs.push({ sStart: sCursor, sEnd: sCursor + tDur * sp, speed: sp, tStart: sorted[i].time });
    sCursor += tDur * sp;
  }
  return segs;
}

/**
 * setpts-выражение для FFmpeg: выходное время t = f(входное время s).
 * Вложенные if(lt(T, S_i+1), …) — точное кусочно-линейное отображение.
 */
export function speedRampToSetptsExpr(keyframes: { time: number; speed: number }[]): string {
  const kfs = [...keyframes].sort((a, b) => a.time - b.time);
  if (kfs.length < 2) return "PTS";
  const segs = speedRampSegments(kfs);
  // Хвост после последнего ключа: kf[last].time + (PTS − S_last)/speed_last
  const lastSp = Math.max(0.1, Math.min(10, kfs[kfs.length - 1].speed));
  let expr = `${kfs[kfs.length - 1].time.toFixed(4)}+(PTS-${segs[segs.length - 1].sEnd.toFixed(4)})/${lastSp}`;
  // ВСЕ межключевые сегменты: сегмент i покрывает расход исходника
  // [S_i, S_{i+1}] и охраняется условием PTS < S_{i+1}.
  // (Используем PTS, а не T: в этом билде ffmpeg.wasm T/N в setpts не работают.)
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    expr = `if(lt(PTS\\,${s.sEnd.toFixed(4)})\\,${s.tStart.toFixed(4)}+(PTS-${s.sStart.toFixed(4)})/${s.speed}\\,${expr})`;
  }
  return `if(lt(PTS\\,0)\\,0\\,${expr})`;
}

/** Вычислить выходное время по входному времени исходника (для тестов). */
export function speedRampEval(keyframes: { time: number; speed: number }[], sourceSec: number): number {
  const kfs = [...keyframes].sort((a, b) => a.time - b.time);
  if (kfs.length < 2 || sourceSec <= 0) return sourceSec < 0 ? 0 : sourceSec;
  const segs = speedRampSegments(kfs);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (sourceSec <= s.sEnd) {
      return s.tStart + (sourceSec - s.sStart) / s.speed;
    }
  }
  const lastSp = Math.max(0.1, Math.min(10, kfs[kfs.length - 1].speed));
  return kfs[kfs.length - 1].time + (sourceSec - segs[segs.length - 1].sEnd) / lastSp;
}

/**
 * Обратное отображение: время ИСХОДНИКА по времени ТАЙМЛАЙНА (для превью —
 * видеоплеер ищет кадр исходника по позиции на таймлайне). Обратная функция
 * к speedRampEval: source = S_i + (t − kf[i].time)·speed_i.
 */
export function speedRampInverse(keyframes: { time: number; speed: number }[], timelineSec: number): number {
  const kfs = [...keyframes].sort((a, b) => a.time - b.time);
  if (kfs.length < 2) return timelineSec;
  if (timelineSec <= kfs[0].time) return 0;
  const segs = speedRampSegments(kfs);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const nextT = i + 1 < segs.length ? segs[i + 1].tStart : kfs[kfs.length - 1].time;
    if (timelineSec <= nextT) {
      return s.sStart + (timelineSec - s.tStart) * s.speed;
    }
  }
  const lastSp = Math.max(0.1, Math.min(10, kfs[kfs.length - 1].speed));
  const lastSeg = segs[segs.length - 1];
  return lastSeg.sEnd + (timelineSec - kfs[kfs.length - 1].time) * lastSp;
}
