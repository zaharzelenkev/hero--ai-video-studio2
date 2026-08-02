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

/**
 * Фазы драматургической арки.
 *
 * `resolution` — падение действия ПОСЛЕ кульминации: сцены ещё содержательны,
 * но напряжение спадает. Без этой фазы весь хвост фильма после пика попадал
 * в `outro`, и «выдох» раздувался до трети хронометража — ролик выглядел так,
 * будто он закончился на середине и дальше просто доигрывает.
 */
export type PlanPhase =
  | "teaser"
  | "hook"
  | "setup"
  | "buildup"
  | "preClimax"
  | "climax"
  | "resolution"
  | "outro";
export type PlanEmotion = "energetic" | "calm" | "dramatic" | "funny" | "inspiring" | "neutral";

/** Темп сцены: как быстро идёт монтаж внутри этого куска драматургии. */
export type ScenePace = "slow" | "medium" | "fast" | "frantic";

/**
 * Цветовое настроение сцены — режиссёрское решение о грейде,
 * которое монтажный движок исполняет буквально (см. autoEdit → Color Story).
 */
export interface SceneColorMood {
  /** Ярлык настроения для UI и журнала («тёплая кульминация», «холодное напряжение»). */
  mood: string;
  /** Дельты грейда относительно базового LUT ролика (-1..1). */
  saturation: number;
  contrast: number;
  /** Тёплый (+) / холодный (−). */
  temperature: number;
  brightness: number;
  /** Почему именно такой цвет в этой точке истории. */
  reason: string;
}

/**
 * Музыкальная директива сцены: как ведёт себя саундтрек именно здесь.
 * Пофазная работа с музыкой — половина ощущения «профессионального» ролика.
 */
export interface SceneMusicDirective {
  /** Уровень музыки в этой сцене (0..1, относительно базового). */
  level: number;
  /** Роль музыки: ведёт / поддерживает / уходит под речь / молчит. */
  role: "lead" | "support" | "duck" | "silent";
  /** Приглушать ли музыку под речь в этой сцене. */
  ducking: boolean;
  /** Стоит ли ставить акцент (удар/райзер) на входе сцены. */
  accent: boolean;
  reason: string;
}

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

/**
 * РЕКОМЕНДАЦИЯ ПО B-ROLL от режиссёра: что здесь ДОЛЖНО быть на экране,
 * даже если подходящего материала в проекте пока нет. Отличается от
 * PlannedBroll тем, что это ТРЕБОВАНИЕ («покажи город»), а не размещение.
 * Если материал найден — заполнен matchedAssetId и перебивка попадает в bRolls.
 */
export interface BrollRecommendation {
  /** Что нужно показать: ключевое слово/образ. */
  subject: string;
  /** Зачем: показать сказанное, взломать ритм, прикрыть слабый кадр. */
  purpose: "illustrate" | "pattern-interrupt" | "cover-weak" | "breathe";
  /** Желаемая длительность на экране (сек). */
  duration: number;
  /** Найденный в проекте материал (null — рекомендация без покрытия). */
  matchedAssetId: string | null;
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

/**
 * СЦЕНА РЕЖИССЁРСКОГО ПЛАНА.
 *
 * Полная режиссёрская карточка сцены, которую монтажный движок исполняет
 * буквально. Обязательный минимум (требование продукта): цель, эмоция,
 * длительность, темп, тип перехода, рекомендуемый B-Roll, музыка,
 * цветовое настроение.
 */
export interface PlannedScene {
  id: string;
  phase: PlanPhase;
  /** Драматургическая ЦЕЛЬ сцены одной фразой («зацепить», «доказать»). */
  goal: string;
  intent: string;
  emotion: PlanEmotion;
  /** Целевая эмоциональная интенсивность точки арки (0..1). */
  targetIntensity: number;
  /** ТЕМП сцены: скорость монтажа внутри неё. */
  pace: ScenePace;
  /** Длительность НА ТАЙМЛАЙНЕ (сек, уже с учётом speed). */
  duration: number;
  source: PlannedSource;
  /** ТИП ПЕРЕХОДА на входе сцены (решение режиссёра, с мотивировкой). */
  transitionIn?: PlannedTransition;
  bRolls: PlannedBroll[];
  /** РЕКОМЕНДУЕМЫЙ B-ROLL: что должно быть на экране в этой сцене. */
  brollRecommendations: BrollRecommendation[];
  captions: PlannedCaption[];
  /** МУЗЫКА в этой сцене: уровень, роль, дакинг, акцент. */
  music: SceneMusicDirective;
  /** ЦВЕТОВОЕ НАСТРОЕНИЕ сцены. */
  colorMood: SceneColorMood;
  /** Оценка выбранного дубля 0..1 (умный выбор дублей), если применялся. */
  takeScore?: number;
  /** Сколько альтернативных дублей проиграло этому кадру. */
  takeAlternatives?: number;
  /** Режиссёрское обоснование сцены — почему этот кадр и зачем. */
  why: string;
}

/**
 * Черновик сцены на этапе построения плана: постановочные поля (цель, темп,
 * музыка, цвет, рекомендации по B-Roll) проставляются единым режиссёрским
 * проходом в самом конце — чтобы они гарантированно согласовывались с
 * ИТОГОВОЙ длительностью и положением сцены в арке (после всех правок QA).
 */
export type SceneDraft = Omit<
  PlannedScene,
  "goal" | "pace" | "music" | "colorMood" | "brollRecommendations"
> &
  Partial<Pick<PlannedScene, "goal" | "pace" | "music" | "colorMood" | "brollRecommendations">>;

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

// ---------------------------------------------------------------------------
// OFFLINE EDIT: отчёты чернового монтажа
// ---------------------------------------------------------------------------

/** Итог умного выбора дублей: какая группа, кто победил и почему. */
export interface TakeSelectionReport {
  /** Сколько групп похожих дублей нашлось. */
  groups: number;
  /** Сколько дублей отбраковано. */
  rejected: number;
  /** Сколько секунд материала отсеяно. */
  rejectedSec: number;
  /** Подробности по каждой группе (для UI и объяснимости). */
  decisions: Array<{
    /** Победивший материал. */
    assetId: string;
    assetName: string;
    start: number;
    /** Оценка победителя 0..1. */
    score: number;
    /** Сильные стороны победителя. */
    strengths: string[];
    /** Проигравшие с причинами. */
    losers: Array<{ assetId: string; assetName: string; start: number; score: number; reason: string }>;
  }>;
}

/** Итог автоматической синхронизации раздельного звука. */
export interface AudioSyncReport {
  /** Пары «внешний звук → видео» с найденным сдвигом. */
  pairs: Array<{
    audioAssetId: string;
    audioName: string;
    videoAssetId: string;
    videoName: string;
    offsetSec: number;
    confidence: number;
    applied: boolean;
    reason: string;
  }>;
}

/** Итог чистки речевой дорожки. */
export interface SpeechCleanupReport {
  assetId: string;
  removedSec: number;
  keptSec: number;
  pauses: number;
  fillers: number;
  coughs: number;
  breaths: number;
  retakes: number;
  /** Примеры вырезанного (первые несколько) — для объяснимости в UI. */
  examples: Array<{ start: number; end: number; kind: string; text: string; reason: string }>;
}

/**
 * OFFLINE EDIT — сводный отчёт чернового монтажа.
 * Всё, что автоматика сделала ДО того, как пользователь открыл таймлайн.
 */
export interface OfflineEditReport {
  takes?: TakeSelectionReport;
  audioSync?: AudioSyncReport;
  speechCleanup?: SpeechCleanupReport[];
  /** Сколько всего секунд исходников отсеяно на всех этапах. */
  totalTrimmedSec: number;
  /** Человекочитаемая сводка для UI. */
  summary: string[];
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
  /** OFFLINE EDIT: отчёт чернового монтажа (дубли, синхронизация, чистка речи). */
  offlineEdit?: OfflineEditReport;
}
