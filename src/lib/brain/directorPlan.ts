/**
 * DIRECTOR PLAN — первоклассный режиссёрский план.
 *
 * Артефакт, который AI Director строит ДО монтажа: понимание материалов,
 * драматургическая арка, по-сценовые решения (отбор, окна, скорость,
 * переходы, перебивки, титры), музыкальная стратегия и журнал объяснений.
 *
 * Монтажный движок (autoEdit) получает план и ИСПОЛНЯЕТ его. План —
 * чистый JSON: сохраняется в проект (IndexedDB) и показывается в UI.
 */

import type { TransitionType } from "../types";

export type PlanPhase = "teaser" | "hook" | "setup" | "buildup" | "preClimax" | "climax" | "outro";
export type PlanEmotion = "energetic" | "calm" | "dramatic" | "funny" | "inspiring" | "neutral";

/** Переход, выбранный режиссёром (не монтажным движком), с объяснением. */
export interface PlannedTransition {
  type: TransitionType;
  duration: number;
  reason?: string;
}

export interface PlannedBroll {
  assetId: string;
  sourceStart: number;
  sourceEnd: number;
  /** Смещение внутри сцены (отрицательное = J-cut: перебивка заходит раньше стыка). */
  offsetInScene: number;
  presentation: "fullscreen" | "pip";
  /** Почему перебивка здесь: семантика, pattern interrupt, маскировка брака. */
  reason: string;
}

export interface PlannedCaption {
  text: string;
  offsetInScene: number;
  duration: number;
  animation: string;
}

export interface PlannedSource {
  assetId: string;
  /** Окно в исходнике (сек). (end - start) / speed ≈ duration. */
  start: number;
  end: number;
  speed: number;
  zoom: boolean;
  cameraAngle?: "wide" | "medium" | "close";
  /** Крупность плана по композиции исходного кадра (понимание режиссёра). */
  shotSize?: "wide" | "medium" | "close";
  /** Что делает камера в исходнике (для стыков и объяснений). */
  cameraMotion?: string;
  /** Машинный тип движения камеры (pan-left/pan-right/dolly-in…) — для
   *  кинематографических стыков (whip pan по направлению движения). */
  cameraMotionKind?: string;
}

export interface PlannedScene {
  id: string;
  phase: PlanPhase;
  intent: string;
  emotion: PlanEmotion;
  /** Целевая эмоциональная интенсивность точки арки (0..1). */
  targetIntensity: number;
  /** Длительность НА ТАЙМЛАЙНЕ (сек, уже с учётом speed). */
  duration: number;
  source: PlannedSource;
  transitionIn?: PlannedTransition;
  bRolls: PlannedBroll[];
  captions: PlannedCaption[];
  /** Режиссёрское обоснование сцены — почему этот кадр и зачем. */
  why: string;
}

export interface DramaturgySection {
  phase: PlanPhase;
  start: number;
  end: number;
  intensity: number;
  note: string;
}

export interface PacingKnot {
  /** Прогресс ролика 0..1. */
  t: number;
  /** Целевая интенсивность 0..1. */
  intensity: number;
}

export interface MusicPlan {
  strategy: string;
  /** Стиль: id пользовательского трека или процедурного саундтрека. */
  style: string;
  inPoint: number;
  bpm?: number;
  bpmKnown: boolean;
  climaxAlignedToDrop: boolean;
  ducking: boolean;
  volume: number;
  narration: boolean;
}

export interface WeakMomentAction {
  assetId: string;
  start: number;
  end: number;
  /** cut — исключён из монтажа; covered — прикрыт перебивкой; kept — оставлен осознанно. */
  action: "cut" | "covered" | "kept";
  reason: string;
}

export interface StrongMomentUse {
  assetId: string;
  start: number;
  phase: PlanPhase;
}

export interface StrategicAnalysis {
  goal: string;
  audience: string;
  platform: string;
  emotionalImpact: string;
  retentionStrategy: string;
  viralityPotential: number;
  dramaStructure: string;
  pacingStrategy: string;
}

export interface DirectorPlan {
  version: 1;
  createdAt: number;
  kind: "narrative" | "visual";
  /** Замысел ролика одной строкой. */
  concept: string;
  genre: string;
  pace: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;
  targetDuration: number;
  /** Время кульминации на итоговом таймлайне (сек). */
  climaxAt: number;
  dramaturgy: DramaturgySection[];
  pacingCurve: PacingKnot[];
  music: MusicPlan;
  scenes: PlannedScene[];
  weakMomentsHandled: WeakMomentAction[];
  strongMomentsUsed: StrongMomentUse[];
  /** Журнал решений: каждое крупное решение объяснено по-человечески. */
  directorNotes: string[];
  /** Самопроверка: что прошло и что режиссёр исправил сам. */
  qa: { passed: string[]; fixed: string[] };
  analysisCoverage: { assets: number; analyzed: number; withSpeech: number };
  /** Стратегический анализ проекта: цель, аудитория, платформа, эмоции, удержание, вирусность */
  strategicAnalysis?: StrategicAnalysis;
}
