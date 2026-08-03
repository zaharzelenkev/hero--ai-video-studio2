/**
 * PROJECT TYPE DETECTION — профессиональное понимание типа проекта
 * до первого разреза материала.
 *
 * Задача: AI должен понять ЧТО именно пользователь хочет смонтировать,
 * а уже потом принимать монтажные решения.
 *
 * Определяем:
 * - тип видео (16 типов)
 * - цель ролика
 * - ожидаемая длительность
 * - требуемый темп
 * - стиль и сценарий
 *
 * От этого зависит АБСОЛЮТНО ВСЯ логика монтажа:
 * - частота смены кадров
 * - сохранение речи / резка пауз
 * - использование B-Roll
 * - длительность фотографий
 * - переходы
 * - структура (Hook -> Problem -> Solution -> CTA)
 */

import type { DirectorBrief, PreProduction, DirectorSections } from "../production";

export type ProjectTypeId =
  | "podcast"
  | "interview"
  | "talking-head"
  | "youtube"
  | "documentary"
  | "tutorial"
  | "vlog"
  | "travel"
  | "commercial"
  | "promo"
  | "short-film"
  | "tiktok"
  | "instagram-reel"
  | "music-video"
  | "cinematic"
  | "educational";

export interface ProjectGoal {
  id: "conversion" | "education" | "entertainment" | "inspiration" | "information" | "brand" | "retention";
  label: string;
  description: string;
}

export interface ProjectPace {
  id: "very-slow" | "slow" | "medium" | "fast" | "very-fast" | "dynamic";
  cutsPerMinute: [number, number]; // min, max cuts per minute
  minClipSec: number;
  maxClipSec: number;
  targetClipSec: number;
}

export interface PhotoHandling {
  minDurationSec: number;
  maxDurationSec: number;
  targetDurationSec: number;
  preferKenBurns: boolean;
  kenBurnsTypes: Array<"zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down">;
  needMotion: boolean;
  semanticMatching: boolean; // must match narrative thought
}

export interface SpeechHandling {
  preserveFullSentences: boolean;
  removeOnlyPauses: boolean;
  removeFillers: boolean;
  cutOnThoughtBoundaries: boolean;
  allowMidSentenceCut: boolean;
  keepBreathingPauses: boolean;
  dramaticPauseRange: [number, number]; // sec
  minThoughtSec: number;
}

export interface BrollHandling {
  frequency: "rare" | "occasional" | "moderate" | "frequent" | "very-frequent";
  maxConsecutiveMainSec: number; // after this, must insert b-roll
  presentation: Array<"fullscreen" | "pip">;
  semanticRequired: boolean; // b-roll must match spoken thought
  coverWeakFootage: boolean;
}

export interface TransitionHandling {
  preferred: Array<string>;
  avoid: Array<string>;
  maxDurationSec: number;
  beatSyncRequired: boolean;
}

export interface ProjectTypeProfile {
  id: ProjectTypeId;
  label: string;
  labelRu: string;
  description: string;
  aliases: string[];
  pace: ProjectPace;
  photo: PhotoHandling;
  speech: SpeechHandling;
  broll: BrollHandling;
  transition: TransitionHandling;
  structure: Array<"hook" | "problem" | "solution" | "proof" | "cta" | "setup" | "buildup" | "climax" | "outro" | "teaser" | "setup-context">;
  retentionStrategy: string;
  // Жанровая принадлежность для совместимости со старой системой
  genreFamily: "podcast" | "interview" | "vlog" | "travel" | "tiktok" | "ad" | "cinematic" | "educational" | "music" | "documentary" | "youtube" | "generic";
  // Темп монтажа: медленный/быстрый
  isFast: boolean;
  isSlow: boolean;
  isTalking: boolean;
  // Требуется ли сильная динамика / сохранение речи
  preserveSpeech: boolean;
  allowRandomCuts: boolean;
}

// ---------------------------------------------------------------------------
// Конкретные профили для каждого типа
// ---------------------------------------------------------------------------

const PODCAST: ProjectTypeProfile = {
  id: "podcast",
  label: "Podcast",
  labelRu: "Подкаст",
  description: "Длинный разговорный формат, несколько участников, подкаст-студия",
  aliases: ["подкаст", "podcast", "разговорный", "студия"],
  pace: { id: "slow", cutsPerMinute: [4, 10], minClipSec: 6, maxClipSec: 45, targetClipSec: 18 },
  photo: { minDurationSec: 3.5, maxDurationSec: 10, targetDurationSec: 6, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out"], needMotion: false, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: true, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.7, 2.5], minThoughtSec: 1.2 },
  broll: { frequency: "occasional", maxConsecutiveMainSec: 22, presentation: ["fullscreen"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "crossfade"], avoid: ["zoom", "pixelize", "glitch", "hlslice", "fadewhite"], maxDurationSec: 0.4, beatSyncRequired: false },
  structure: ["hook", "setup", "buildup", "climax", "outro"],
  retentionStrategy: "Держим говорящую голову, перебивки только для усиления точки. Никакой рваной нарезки.",
  genreFamily: "podcast",
  isFast: false,
  isSlow: true,
  isTalking: true,
  preserveSpeech: true,
  allowRandomCuts: false,
};

const INTERVIEW: ProjectTypeProfile = {
  id: "interview",
  label: "Interview",
  labelRu: "Интервью",
  description: "Интервью: вопрос-ответ, один ведущий и гость",
  aliases: ["интервью", "interview", "беседа", "разговор"],
  pace: { id: "slow", cutsPerMinute: [5, 12], minClipSec: 5, maxClipSec: 35, targetClipSec: 14 },
  photo: { minDurationSec: 3, maxDurationSec: 9, targetDurationSec: 5, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out"], needMotion: false, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.7, 2.0], minThoughtSec: 1.0 },
  broll: { frequency: "moderate", maxConsecutiveMainSec: 15, presentation: ["fullscreen", "pip"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "crossfade", "fadeblack"], avoid: ["pixelize", "glitch"], maxDurationSec: 0.5, beatSyncRequired: false },
  structure: ["hook", "setup-context", "problem", "solution", "proof", "cta"],
  retentionStrategy: "Чередуем крупности, реакция второго человека, нижние титры с именем.",
  genreFamily: "interview",
  isFast: false,
  isSlow: false,
  isTalking: true,
  preserveSpeech: true,
  allowRandomCuts: false,
};

const TALKING_HEAD: ProjectTypeProfile = {
  id: "talking-head",
  label: "Talking Head",
  labelRu: "Говорящая голова",
  description: "Человек говорит в камеру, экспертный контент",
  aliases: ["говорящая голова", "talking head", "эксперт", "спикер", "говорящая", "говорю в камеру", "говорю", "в камеру", "объясняю", "рассказываю", "говорящий"],
  pace: { id: "medium", cutsPerMinute: [8, 18], minClipSec: 3, maxClipSec: 20, targetClipSec: 9 },
  photo: { minDurationSec: 2.5, maxDurationSec: 8, targetDurationSec: 4.5, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out", "pan-left", "pan-right"], needMotion: false, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.6, 2.0], minThoughtSec: 0.8 },
  broll: { frequency: "moderate", maxConsecutiveMainSec: 12, presentation: ["fullscreen", "pip"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "hblur"], avoid: ["pixelize", "glitch"], maxDurationSec: 0.35, beatSyncRequired: false },
  structure: ["hook", "problem", "solution", "proof", "cta"],
  retentionStrategy: "Анализируем речь, ищем окончания мыслей, режем только там. B-Roll иллюстрирует мысль.",
  genreFamily: "youtube",
  isFast: false,
  isSlow: false,
  isTalking: true,
  preserveSpeech: true,
  allowRandomCuts: false,
};

const YOUTUBE: ProjectTypeProfile = {
  id: "youtube",
  label: "YouTube",
  labelRu: "YouTube",
  description: "Классический YouTube-ролик 5-15 минут, удержание и сторителлинг",
  aliases: ["youtube", "ютуб", "ютюб"],
  pace: { id: "medium", cutsPerMinute: [10, 22], minClipSec: 2, maxClipSec: 15, targetClipSec: 5 },
  photo: { minDurationSec: 2, maxDurationSec: 7, targetDurationSec: 4, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out", "pan-left", "pan-right"], needMotion: true, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.5, 1.8], minThoughtSec: 0.7 },
  broll: { frequency: "frequent", maxConsecutiveMainSec: 10, presentation: ["fullscreen", "pip"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "crossfade", "hblur", "zoom"], avoid: ["pixelize"], maxDurationSec: 0.45, beatSyncRequired: false },
  structure: ["hook", "setup", "problem", "solution", "proof", "climax", "outro"],
  retentionStrategy: "Hook в 2 секунды, pattern interrupt каждые 5-7 сек, B-Roll для иллюстрации.",
  genreFamily: "youtube",
  isFast: false,
  isSlow: false,
  isTalking: true,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const DOCUMENTARY: ProjectTypeProfile = {
  id: "documentary",
  label: "Documentary",
  labelRu: "Документальный",
  description: "Документальный фильм, наблюдение, интервью",
  aliases: ["документал", "documentary", "док-фильм", "док фильм"],
  pace: { id: "slow", cutsPerMinute: [6, 14], minClipSec: 4, maxClipSec: 20, targetClipSec: 8 },
  photo: { minDurationSec: 4, maxDurationSec: 12, targetDurationSec: 7, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"], needMotion: true, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.8, 2.8], minThoughtSec: 1.0 },
  broll: { frequency: "moderate", maxConsecutiveMainSec: 18, presentation: ["fullscreen"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["crossfade", "fadeblack", "cut"], avoid: ["zoom", "pixelize", "glitch"], maxDurationSec: 0.8, beatSyncRequired: false },
  structure: ["hook", "setup", "buildup", "climax", "outro"],
  retentionStrategy: "Правило Шести Мёрча: эмоция > история > ритм. Длинные планы, дыхание.",
  genreFamily: "documentary",
  isFast: false,
  isSlow: true,
  isTalking: false,
  preserveSpeech: true,
  allowRandomCuts: false,
};

const TUTORIAL: ProjectTypeProfile = {
  id: "tutorial",
  label: "Tutorial",
  labelRu: "Обучение",
  description: "Туториал, инструкция, пошаговое объяснение",
  aliases: ["туториал", "tutorial", "обучение", "урок", "инструкция", "гайд", "how to", "как сделать", "как работает", "объяснение", "инструктаж"],
  pace: { id: "medium", cutsPerMinute: [8, 16], minClipSec: 3, maxClipSec: 18, targetClipSec: 8 },
  photo: { minDurationSec: 3, maxDurationSec: 9, targetDurationSec: 5, preferKenBurns: false, kenBurnsTypes: ["zoom-in"], needMotion: false, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: false, dramaticPauseRange: [0.5, 1.5], minThoughtSec: 0.8 },
  broll: { frequency: "moderate", maxConsecutiveMainSec: 14, presentation: ["fullscreen", "pip"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "crossfade"], avoid: ["pixelize", "glitch", "fadewhite"], maxDurationSec: 0.4, beatSyncRequired: false },
  structure: ["hook", "setup", "problem", "solution", "proof", "cta"],
  retentionStrategy: "Структура: обещание результата → шаги → итог. Титры-заголовки на каждом шаге.",
  genreFamily: "educational",
  isFast: false,
  isSlow: false,
  isTalking: true,
  preserveSpeech: true,
  allowRandomCuts: false,
};

const VLOG: ProjectTypeProfile = {
  id: "vlog",
  label: "Vlog",
  labelRu: "Влог",
  description: "Влог, повседневная жизнь, личный опыт",
  aliases: ["влог", "vlog", "блог", "daily", "повседнев", "жизнь"],
  pace: { id: "dynamic", cutsPerMinute: [12, 26], minClipSec: 1.5, maxClipSec: 12, targetClipSec: 4 },
  photo: { minDurationSec: 1.8, maxDurationSec: 6, targetDurationSec: 3, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out", "pan-left", "pan-right"], needMotion: true, semanticMatching: false },
  speech: { preserveFullSentences: false, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: false, dramaticPauseRange: [0.4, 1.2], minThoughtSec: 0.5 },
  broll: { frequency: "frequent", maxConsecutiveMainSec: 8, presentation: ["fullscreen"], semanticRequired: false, coverWeakFootage: true },
  transition: { preferred: ["cut", "hblur", "zoom"], avoid: [], maxDurationSec: 0.4, beatSyncRequired: false },
  structure: ["hook", "setup", "buildup", "climax", "outro"],
  retentionStrategy: "Джамп-каты, смена локации каждые 15-20 сек, самый яркий момент в cold open.",
  genreFamily: "vlog",
  isFast: true,
  isSlow: false,
  isTalking: true,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const TRAVEL: ProjectTypeProfile = {
  id: "travel",
  label: "Travel",
  labelRu: "Тревел",
  description: "Путешествия, пейзажи, атмосфера",
  aliases: ["тревел", "travel", "путешеств", "trip", "отпуск", "путевка"],
  pace: { id: "slow", cutsPerMinute: [6, 12], minClipSec: 4, maxClipSec: 18, targetClipSec: 7 },
  photo: { minDurationSec: 4, maxDurationSec: 14, targetDurationSec: 8, preferKenBurns: true, kenBurnsTypes: ["zoom-out", "pan-left", "pan-right", "pan-up", "pan-down", "zoom-in"], needMotion: true, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: false, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.8, 2.5], minThoughtSec: 1.0 },
  broll: { frequency: "rare", maxConsecutiveMainSec: 20, presentation: ["fullscreen"], semanticRequired: false, coverWeakFootage: false },
  transition: { preferred: ["crossfade", "fadeblack", "cut"], avoid: ["pixelize", "glitch", "zoom", "fadewhite"], maxDurationSec: 0.9, beatSyncRequired: false },
  structure: ["hook", "setup", "buildup", "climax", "outro"],
  retentionStrategy: "J-Cuts, L-Cuts, чередование крупностей, дай кадру подышать 4-6 сек, Ken Burns, speed ramp.",
  genreFamily: "travel",
  isFast: false,
  isSlow: true,
  isTalking: false,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const COMMERCIAL: ProjectTypeProfile = {
  id: "commercial",
  label: "Commercial",
  labelRu: "Реклама",
  description: "Рекламный ролик, коммерческая съемка",
  aliases: ["реклама", "commercial", "рекламный", "коммерч", "advert", "ad"],
  pace: { id: "fast", cutsPerMinute: [14, 28], minClipSec: 1, maxClipSec: 8, targetClipSec: 2.5 },
  photo: { minDurationSec: 1.5, maxDurationSec: 5, targetDurationSec: 2.5, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "pan-left", "pan-right"], needMotion: true, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: false, dramaticPauseRange: [0.3, 1.0], minThoughtSec: 0.5 },
  broll: { frequency: "very-frequent", maxConsecutiveMainSec: 6, presentation: ["fullscreen"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "zoom", "hblur", "fadewhite"], avoid: ["fadeblack"], maxDurationSec: 0.5, beatSyncRequired: true },
  structure: ["hook", "problem", "solution", "proof", "cta"],
  retentionStrategy: "Продукт в первые 3 сек, match cuts в бит, сильный CTA в последние 3-5 сек.",
  genreFamily: "ad",
  isFast: true,
  isSlow: false,
  isTalking: false,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const PROMO: ProjectTypeProfile = {
  id: "promo",
  label: "Promo",
  labelRu: "Промо",
  description: "Промо-ролик, презентация продукта/услуги",
  aliases: ["промо", "promo", "презентац", "presentation", "продукт"],
  pace: { id: "fast", cutsPerMinute: [12, 24], minClipSec: 1.2, maxClipSec: 9, targetClipSec: 3 },
  photo: { minDurationSec: 1.8, maxDurationSec: 6, targetDurationSec: 3, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out"], needMotion: true, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: false, dramaticPauseRange: [0.4, 1.2], minThoughtSec: 0.6 },
  broll: { frequency: "frequent", maxConsecutiveMainSec: 7, presentation: ["fullscreen"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "zoom", "hblur", "slideup"], avoid: [], maxDurationSec: 0.5, beatSyncRequired: true },
  structure: ["hook", "problem", "solution", "proof", "cta"],
  retentionStrategy: "Фокус на продукте, текст с анимацией, CTA в safe area.",
  genreFamily: "ad",
  isFast: true,
  isSlow: false,
  isTalking: false,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const SHORT_FILM: ProjectTypeProfile = {
  id: "short-film",
  label: "Short Film",
  labelRu: "Короткий метр",
  description: "Короткометражный фильм, история, персонажи",
  aliases: ["короткий метр", "short film", "короткометражка", "кино", "фильм", "короткий фильм"],
  pace: { id: "slow", cutsPerMinute: [5, 12], minClipSec: 4, maxClipSec: 20, targetClipSec: 9 },
  photo: { minDurationSec: 4, maxDurationSec: 14, targetDurationSec: 8, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out", "pan-left", "pan-right"], needMotion: true, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: false, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.8, 3.0], minThoughtSec: 1.2 },
  broll: { frequency: "occasional", maxConsecutiveMainSec: 18, presentation: ["fullscreen"], semanticRequired: true, coverWeakFootage: false },
  transition: { preferred: ["cut", "crossfade", "fadeblack"], avoid: ["pixelize", "glitch", "hlslice"], maxDurationSec: 0.8, beatSyncRequired: false },
  structure: ["teaser", "setup", "problem", "buildup", "climax", "outro"],
  retentionStrategy: "Актовая структура, эмоциональная дуга, кульминация на 75%.",
  genreFamily: "cinematic",
  isFast: false,
  isSlow: true,
  isTalking: false,
  preserveSpeech: true,
  allowRandomCuts: false,
};

const TIKTOK: ProjectTypeProfile = {
  id: "tiktok",
  label: "TikTok",
  labelRu: "TikTok",
  description: "Вертикальный короткий ролик, TikTok/Reels/Shorts",
  aliases: ["tiktok", "тикток", "shorts", "шортс", "клип", "вертикаль", "9:16", "reels", "рилс", "short"],
  pace: { id: "very-fast", cutsPerMinute: [20, 40], minClipSec: 0.8, maxClipSec: 4, targetClipSec: 1.8 },
  photo: { minDurationSec: 1.2, maxDurationSec: 4, targetDurationSec: 2, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out", "pan-left", "pan-right"], needMotion: true, semanticMatching: false },
  speech: { preserveFullSentences: false, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: false, allowMidSentenceCut: false, keepBreathingPauses: false, dramaticPauseRange: [0.3, 0.9], minThoughtSec: 0.3 },
  broll: { frequency: "very-frequent", maxConsecutiveMainSec: 4, presentation: ["fullscreen"], semanticRequired: false, coverWeakFootage: true },
  transition: { preferred: ["cut", "zoom", "hblur", "pixelize", "fadewhite"], avoid: ["fadeblack", "crossfade"], maxDurationSec: 0.35, beatSyncRequired: true },
  structure: ["hook", "setup", "buildup", "climax", "cta"],
  retentionStrategy: "Hook в первую секунду, Pattern Interrupt каждые 3-4 сек, punch zoom на акцентных словах, текст по центру.",
  genreFamily: "tiktok",
  isFast: true,
  isSlow: false,
  isTalking: false,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const INSTAGRAM_REEL: ProjectTypeProfile = {
  id: "instagram-reel",
  label: "Instagram Reel",
  labelRu: "Instagram Reel",
  description: "Вертикальный ролик для Instagram, Reels",
  aliases: ["instagram", "инстаграм", "reel", "рилс", "ig"],
  pace: { id: "fast", cutsPerMinute: [16, 32], minClipSec: 1, maxClipSec: 5, targetClipSec: 2.2 },
  photo: { minDurationSec: 1.5, maxDurationSec: 5, targetDurationSec: 2.5, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out"], needMotion: true, semanticMatching: false },
  speech: { preserveFullSentences: false, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: false, allowMidSentenceCut: false, keepBreathingPauses: false, dramaticPauseRange: [0.3, 1.0], minThoughtSec: 0.4 },
  broll: { frequency: "frequent", maxConsecutiveMainSec: 5, presentation: ["fullscreen"], semanticRequired: false, coverWeakFootage: true },
  transition: { preferred: ["cut", "zoom", "hblur"], avoid: ["fadeblack"], maxDurationSec: 0.4, beatSyncRequired: true },
  structure: ["hook", "buildup", "climax", "cta"],
  retentionStrategy: "Крупные планы, динамика, текст в safe area.",
  genreFamily: "tiktok",
  isFast: true,
  isSlow: false,
  isTalking: false,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const MUSIC_VIDEO: ProjectTypeProfile = {
  id: "music-video",
  label: "Music Video",
  labelRu: "Клип",
  description: "Музыкальный клип",
  aliases: ["music video", "клип", "мьюзик", "песня", "музыкальн", "mv"],
  pace: { id: "very-fast", cutsPerMinute: [18, 36], minClipSec: 0.8, maxClipSec: 6, targetClipSec: 2 },
  photo: { minDurationSec: 1, maxDurationSec: 5, targetDurationSec: 2, preferKenBurns: true, kenBurnsTypes: ["zoom-in", "zoom-out", "pan-left", "pan-right"], needMotion: true, semanticMatching: false },
  speech: { preserveFullSentences: false, removeOnlyPauses: false, removeFillers: false, cutOnThoughtBoundaries: false, allowMidSentenceCut: true, keepBreathingPauses: false, dramaticPauseRange: [0.2, 0.8], minThoughtSec: 0.3 },
  broll: { frequency: "very-frequent", maxConsecutiveMainSec: 5, presentation: ["fullscreen"], semanticRequired: false, coverWeakFootage: true },
  transition: { preferred: ["cut", "zoom", "hblur", "fadewhite"], avoid: [], maxDurationSec: 0.4, beatSyncRequired: true },
  structure: ["hook", "buildup", "climax", "buildup", "climax", "outro"],
  retentionStrategy: "Каждая склейка в бит, чередование длинных и коротких, дроп = самый эффектный кадр.",
  genreFamily: "music",
  isFast: true,
  isSlow: false,
  isTalking: false,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const CINEMATIC: ProjectTypeProfile = {
  id: "cinematic",
  label: "Cinematic",
  labelRu: "Синематик",
  description: "Кинематографичный ролик, красивые кадры, атмосфера",
  aliases: ["cinematic", "кинематограф", "синемат", "киношный", "арт", "эстетик"],
  pace: { id: "slow", cutsPerMinute: [5, 10], minClipSec: 5, maxClipSec: 22, targetClipSec: 9 },
  photo: { minDurationSec: 5, maxDurationSec: 16, targetDurationSec: 9, preferKenBurns: true, kenBurnsTypes: ["zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"], needMotion: true, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: false, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [1.0, 3.0], minThoughtSec: 1.5 },
  broll: { frequency: "rare", maxConsecutiveMainSec: 25, presentation: ["fullscreen"], semanticRequired: false, coverWeakFootage: false },
  transition: { preferred: ["crossfade", "fadeblack", "cut"], avoid: ["pixelize", "glitch", "hlslice", "zoom"], maxDurationSec: 1.0, beatSyncRequired: false },
  structure: ["hook", "setup", "buildup", "climax", "outro"],
  retentionStrategy: "Дать кадру подышать, J/L-cuts, движение мотивировано.",
  genreFamily: "cinematic",
  isFast: false,
  isSlow: true,
  isTalking: false,
  preserveSpeech: false,
  allowRandomCuts: false,
};

const EDUCATIONAL: ProjectTypeProfile = {
  id: "educational",
  label: "Educational",
  labelRu: "Обучающий",
  description: "Образовательное видео, лекция, курс",
  aliases: ["образоват", "educational", "обучающ", "лекция", "курс", "урок", "образование"],
  pace: { id: "medium", cutsPerMinute: [8, 16], minClipSec: 3, maxClipSec: 18, targetClipSec: 7 },
  photo: { minDurationSec: 3, maxDurationSec: 10, targetDurationSec: 5.5, preferKenBurns: false, kenBurnsTypes: ["zoom-in"], needMotion: false, semanticMatching: true },
  speech: { preserveFullSentences: true, removeOnlyPauses: false, removeFillers: true, cutOnThoughtBoundaries: true, allowMidSentenceCut: false, keepBreathingPauses: true, dramaticPauseRange: [0.6, 1.8], minThoughtSec: 0.9 },
  broll: { frequency: "moderate", maxConsecutiveMainSec: 16, presentation: ["fullscreen", "pip"], semanticRequired: true, coverWeakFootage: true },
  transition: { preferred: ["cut", "crossfade", "slideup"], avoid: ["pixelize", "glitch"], maxDurationSec: 0.5, beatSyncRequired: false },
  structure: ["hook", "setup", "problem", "solution", "proof", "cta"],
  retentionStrategy: "Обещание результата → шаги → итог, титры-заголовки.",
  genreFamily: "educational",
  isFast: false,
  isSlow: false,
  isTalking: true,
  preserveSpeech: true,
  allowRandomCuts: false,
};

export const PROJECT_TYPE_PROFILES: Record<ProjectTypeId, ProjectTypeProfile> = {
  podcast: PODCAST,
  interview: INTERVIEW,
  "talking-head": TALKING_HEAD,
  youtube: YOUTUBE,
  documentary: DOCUMENTARY,
  tutorial: TUTORIAL,
  vlog: VLOG,
  travel: TRAVEL,
  commercial: COMMERCIAL,
  promo: PROMO,
  "short-film": SHORT_FILM,
  tiktok: TIKTOK,
  "instagram-reel": INSTAGRAM_REEL,
  "music-video": MUSIC_VIDEO,
  cinematic: CINEMATIC,
  educational: EDUCATIONAL,
};

export const ALL_PROJECT_TYPES = Object.values(PROJECT_TYPE_PROFILES);

// ---------------------------------------------------------------------------
// DETECTION
// ---------------------------------------------------------------------------

export interface AssetMetaForDetection {
  kind: "video" | "image" | "audio";
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  hasTranscript?: boolean;
  transcriptLength?: number;
  name: string;
}

export interface DetectionInput {
  brief: DirectorBrief;
  preprod?: PreProduction | null;
  sections?: DirectorSections | null;
  rawPrompt?: string;
  assets?: AssetMetaForDetection[];
  platformHint?: string;
  styleHint?: string;
  durationHint?: string;
}

export interface DetectionResult {
  type: ProjectTypeId;
  profile: ProjectTypeProfile;
  confidence: number; // 0..1
  goal: ProjectGoal;
  expectedDurationSec: number;
  platform: string;
  tempo: string;
  style: string;
  scenarioStructure: string[]; // e.g. ["hook","problem","solution","cta"]
  reasoning: string[];
  isVertical: boolean;
  hasSpeech: boolean;
  speechHeavy: boolean;
}

function normalizeText(s: string): string {
  return (s || "").toLowerCase().replace(/ё/g, "е");
}

function detectGoal(text: string): ProjectGoal {
  const t = normalizeText(text);
  if (/продаж|купи|продукт|реклам|конверси|cta|закажи|купить/.test(t)) {
    return { id: "conversion", label: "Конверсия и продажи", description: "Добиться действия: покупка, заявка, подписка" };
  }
  if (/обуч|туториал|курс|урок|научи|образоват|инструкц|гайд/.test(t)) {
    return { id: "education", label: "Обучение", description: "Передать знания и навыки" };
  }
  if (/развлек|весель|юмор|смешн|прикол|мем/.test(t)) {
    return { id: "entertainment", label: "Развлечение", description: "Развлечь и поднять настроение" };
  }
  if (/вдохнов|мотивац|личност|рост|трансформац/.test(t)) {
    return { id: "inspiration", label: "Вдохновение", description: "Вдохновить на изменения" };
  }
  if (/информ|новост|обзор|аналит|факт/.test(t)) {
    return { id: "information", label: "Информирование", description: "Информировать и объяснить" };
  }
  if (/бренд|имидж|продвиж|узнаваем/.test(t)) {
    return { id: "brand", label: "Бренд", description: "Формировать имидж и узнаваемость" };
  }
  return { id: "retention", label: "Удержание", description: "Удержать внимание и вовлечь" };
}

function extractKeywordsForScoring(input: DetectionInput): string {
  const parts: string[] = [];
  if (input.brief) {
    parts.push(input.brief.idea, input.brief.goal, input.brief.style, input.brief.mood, input.brief.platform, input.brief.keyMessage, input.brief.callToAction, input.brief.references || "", input.brief.audience || "", input.brief.tempo || "");
  }
  if (input.rawPrompt) parts.push(input.rawPrompt);
  if (input.sections) {
    parts.push(input.sections.concept || "", input.sections.script || "", input.sections.hook || "", input.sections.structure || "");
  }
  if (input.preprod) {
    parts.push(input.preprod.treatment.genre, input.preprod.treatment.tone, input.preprod.idea.refined, input.preprod.treatment.synopsisLong);
    if (input.preprod.script.scenes) {
      parts.push(input.preprod.script.scenes.map(s => s.action + " " + s.dialogue.map(d => d.line).join(" ")).join(" "));
    }
  }
  if (input.platformHint) parts.push(input.platformHint);
  if (input.styleHint) parts.push(input.styleHint);
  return normalizeText(parts.filter(Boolean).join(" "));
}

function scoreType(type: ProjectTypeProfile, keywords: string, assets: AssetMetaForDetection[]): number {
  let score = 0;

  // 1. Прямые совпадения по алиасам
  for (const alias of type.aliases) {
    const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(keywords)) score += 12;
  }

  // Специальные бонусы для точного совпадения типа в разных формах
  if (keywords.includes(type.id)) score += 18;
  if (keywords.includes(type.labelRu.toLowerCase())) score += 18;
  if (keywords.includes(type.label.toLowerCase())) score += 14;

  // 2. Контекстные подсказки по активам
  const hasVideo = assets.some(a => a.kind === "video");
  const hasImagesOnly = assets.length > 0 && assets.every(a => a.kind === "image");
  const hasLongSpeech = assets.some(a => (a.transcriptLength || 0) > 200 || (a.duration || 0) > 120 && a.hasTranscript);
  const hasShortVertical = assets.some(a => (a.height || 0) > (a.width || 0));
  const avgDuration = assets.filter(a => a.duration).reduce((s, a) => s + (a.duration || 0), 0) / Math.max(1, assets.filter(a => a.duration).length);
  const totalVideoDur = assets.filter(a => a.kind === "video").reduce((s, a) => s + (a.duration || 0), 0);
  const portraitCount = assets.filter(a => (a.height || 0) > (a.width || 0)).length;

  // Podcast / Interview / Talking Head — длинная речь
  if ((type.id === "podcast" || type.id === "interview" || type.id === "talking-head" || type.id === "educational") && hasLongSpeech) {
    score += 15;
  }
  if ((type.id === "podcast" || type.id === "interview") && totalVideoDur > 300) {
    score += 10;
  }

  // Vertical formats
  if ((type.id === "tiktok" || type.id === "instagram-reel") && hasShortVertical) {
    score += 12;
    if (portraitCount > assets.length / 2) score += 8;
  }

  // Cinematic / Travel — красивые кадры без речи, много видео, фото
  if ((type.id === "cinematic" || type.id === "travel" || type.id === "short-film") && !hasLongSpeech && hasVideo) {
    score += 8;
  }

  // Фото-слайдшоу → travel / cinematic
  if (hasImagesOnly && (type.id === "travel" || type.id === "cinematic" || type.id === "short-film")) {
    score += 10;
  }

  // Vlog — смешанный контент, короткие клипы, много видео
  if (type.id === "vlog" && hasVideo && assets.length >= 3) {
    const shortClips = assets.filter(a => (a.duration || 0) > 0 && (a.duration || 0) < 30).length;
    if (shortClips >= 2) score += 8;
  }

  // Music video — есть аудио-дорожка + короткие клипы
  if (type.id === "music-video" && assets.some(a => a.kind === "audio") && hasVideo) {
    score += 10;
  }

  // Commercial / Promo — короткие, динамичные
  if ((type.id === "commercial" || type.id === "promo") && avgDuration > 0 && avgDuration < 60) {
    if (/реклам|commercial|promo|продукт|бренд/.test(keywords)) score += 10;
  }

  // YouTube — средняя длительность, есть речь
  if (type.id === "youtube" && avgDuration >= 60 && avgDuration <= 900 && hasLongSpeech) {
    score += 8;
  }

  // Tutorial — наличие слов обучение/урок уже дало очки, добавим за структуру
  if (type.id === "tutorial" && /шаг|step|инструкц|туториал|урок/.test(keywords)) {
    score += 10;
  }

  return score;
}

export function detectProjectType(input: DetectionInput): DetectionResult {
  const keywords = extractKeywordsForScoring(input);
  const assets = input.assets || [];
  const brief = input.brief;

  // ---- Scoring ----
  const scored = ALL_PROJECT_TYPES.map(profile => ({
    profile,
    score: scoreType(profile, keywords, assets),
  })).sort((a, b) => b.score - a.score);

  // Если ничего не найдено (score 0), делаем интеллектуальный фоллбек по активам
  let best = scored[0];
  const reasoning: string[] = [];

  if (!best || best.score < 2) {
    // Фоллбек по активам
    const hasSpeech = assets.some(a => a.hasTranscript || (a.transcriptLength || 0) > 20);
    const isPortrait = assets.length > 0 && assets.filter(a => (a.height || 0) > (a.width || 0)).length > assets.length / 2;
    const totalDur = assets.reduce((s, a) => s + (a.duration || 0), 0);
    const avgDur = totalDur / Math.max(1, assets.filter(a => a.duration).length);

    let fallbackId: ProjectTypeId = "youtube";
    if (hasSpeech && isPortrait && avgDur <= 90) fallbackId = "tiktok";
    else if (hasSpeech && totalDur > 600) fallbackId = "podcast";
    else if (hasSpeech && totalDur > 180) fallbackId = "interview";
    else if (hasSpeech) fallbackId = "talking-head";
    else if (isPortrait) fallbackId = "instagram-reel";
    else if (assets.every(a => a.kind === "image")) fallbackId = "travel";
    else fallbackId = "cinematic";

    best = { profile: PROJECT_TYPE_PROFILES[fallbackId], score: 5 };
    reasoning.push(`Автоопределение по материалам: fallback → ${fallbackId} (речь: ${hasSpeech}, вертикаль: ${isPortrait}, длительность: ${Math.round(totalDur)}с)`);
  } else {
    reasoning.push(`Лучший тип «${best.profile.labelRu}» с оценкой ${best.score}: совпали ключи ${best.profile.aliases.filter(a => keywords.includes(a)).join(", ") || "по контексту"}`);
    if (scored.length > 1 && scored[1].score > 0) {
      reasoning.push(`Альтернативы: ${scored.slice(1, 4).map(s => `${s.profile.labelRu} (${s.score})`).join(", ")}`);
    }
  }

  // Confidence: нормализуем по max score
  const maxScore = Math.max(1, best.score);
  const secondScore = scored[1]?.score || 0;
  const confidence = Math.min(0.95, Math.max(0.35, (maxScore / (maxScore + secondScore + 6)) + 0.35));

  const hasSpeech = assets.some(a => a.hasTranscript) || /речь|говорит|диалог|интервью|подкаст|рассказ/.test(keywords);
  const speechHeavy = assets.filter(a => a.hasTranscript).length >= 1 || (assets.reduce((s, a) => s + (a.transcriptLength || 0), 0) > 300);

  // Duration
  let expectedDuration = 45;
  const durNum = parseInt(brief.duration || input.durationHint || "", 10);
  if (Number.isFinite(durNum) && durNum > 0) {
    expectedDuration = durNum;
  } else if (assets.length > 0) {
    const total = assets.filter(a => a.kind === "video" || a.kind === "image").reduce((s, a) => s + (a.duration || (a.kind === "image" ? 5 : 0)), 0);
    // Для подкастов берём 80% исходников, для TikTok — минимум
    // Без ограничений: подкаст может быть 2 часа, минимум 10 сек
    if (best.profile.id === "podcast" || best.profile.id === "interview") {
      expectedDuration = Math.max(10, Math.min(total * 0.95, 7200));
    } else if (best.profile.id === "tiktok" || best.profile.id === "instagram-reel") {
      expectedDuration = Math.max(10, Math.min(total * 0.8, 600));
    } else {
      expectedDuration = Math.max(10, Math.min(total * 0.9, 7200));
    }
  } else {
    expectedDuration = best.profile.id === "podcast" ? 600 : best.profile.id === "tiktok" ? 30 : 60;
  }

  // Platform
  const platform = brief.platform || input.platformHint || (best.profile.isFast && hasSpeech ? "TikTok/Reels" : hasSpeech ? "YouTube" : "Cinematic");

  // Tempo
  const tempo = brief.tempo || best.profile.pace.id;

  // Style
  const style = brief.style || best.profile.label;

  // Goal
  const goal = detectGoal(keywords + " " + (brief.goal || ""));

  // Scenario structure based on brief / preprod
  let scenarioStructure: string[] = [...best.profile.structure];

  // Если есть готовый сценарий от AI Director — используем его
  const scriptStructureFromPreprod = extractStructureFromPreprod(input.preprod);
  if (scriptStructureFromPreprod.length >= 2) {
    scenarioStructure = scriptStructureFromPreprod;
    reasoning.push(`Сценарий из AI Director: структура ${scenarioStructure.join(" → ")}`);
  } else if (brief.keyMessage || brief.callToAction) {
    // Классическая маркетинговая структура
    scenarioStructure = ["hook", "problem", "solution", "proof", "cta"];
    reasoning.push("Используем классическую структуру Hook → Problem → Solution → Proof → CTA на основе брифа");
  }

  const isVertical = (() => {
    if (/tiktok|reels|shorts|вертикал|9:16|инстаграм|vk клип/i.test(platform + " " + keywords)) return true;
    if (assets.length > 0) {
      return assets.filter(a => (a.height || 0) > (a.width || 0)).length > assets.length / 2;
    }
    return best.profile.id === "tiktok" || best.profile.id === "instagram-reel";
  })();

  reasoning.push(`Цель: ${goal.label}, Платформа: ${platform}, Длительность: ~${Math.round(expectedDuration)}с, Темп: ${tempo}, Вертикаль: ${isVertical}`);

  return {
    type: best.profile.id,
    profile: best.profile,
    confidence,
    goal,
    expectedDurationSec: expectedDuration,
    platform,
    tempo,
    style,
    scenarioStructure,
    reasoning,
    isVertical,
    hasSpeech,
    speechHeavy,
  };
}

function extractStructureFromPreprod(preprod?: PreProduction | null): string[] {
  if (!preprod) return [];
  const struct: string[] = [];

  // Пробуем из treatment актов
  if (preprod.treatment.act1 || preprod.treatment.act2 || preprod.treatment.act3) {
    struct.push("hook", "buildup", "climax", "outro");
    return struct;
  }

  // Пробуем из script scenes — мапим phase
  if (preprod.script.scenes.length > 0) {
    const phases = preprod.script.scenes.map(s => {
      const action = (s.action || "").toLowerCase();
      if (/хук|hook|открыва/.test(action) || s.number === 1) return "hook";
      if (/проблем|конфликт|problem|conflict/.test(action)) return "problem";
      if (/решен|решение|solution|процесс/.test(action)) return "solution";
      if (/доказат|результат|proof|result/.test(action)) return "proof";
      if (/финал|cta|призыв|концовка/.test(action) || s.number === preprod.script.scenes.length) return "cta";
      return "buildup";
    });
    // Убираем дубликаты подряд, но оставляем логику
    const deduped: string[] = [];
    for (const p of phases) {
      if (deduped[deduped.length - 1] !== p) deduped.push(p);
    }
    return deduped;
  }

  return struct;
}

// ---------------------------------------------------------------------------
// Mappings для совместимости с существующей системой жанров
// ---------------------------------------------------------------------------

export function projectTypeToGenreFamily(type: ProjectTypeId): string {
  return PROJECT_TYPE_PROFILES[type].genreFamily;
}

export function projectTypeToContentType(type: ProjectTypeId): string {
  const map: Record<ProjectTypeId, string> = {
    podcast: "podcast",
    interview: "interview",
    "talking-head": "youtube",
    youtube: "youtube",
    documentary: "documentary",
    tutorial: "tutorial",
    vlog: "vlog",
    travel: "travel",
    commercial: "ad",
    promo: "ad",
    "short-film": "documentary",
    tiktok: "tiktok",
    "instagram-reel": "reels",
    "music-video": "music-video",
    cinematic: "travel",
    educational: "educational",
  };
  return map[type] || "generic";
}

export function projectTypeToTemplateId(type: ProjectTypeId): string {
  const map: Record<ProjectTypeId, string> = {
    podcast: "podcast",
    interview: "interview",
    "talking-head": "education",
    youtube: "youtube",
    documentary: "documentary",
    tutorial: "education",
    vlog: "vlog",
    travel: "travel",
    commercial: "ad",
    promo: "ad",
    "short-film": "cinematic",
    tiktok: "tiktok",
    "instagram-reel": "tiktok",
    "music-video": "musicvideo",
    cinematic: "cinematic",
    educational: "education",
  };
  return map[type] || "auto";
}

// ---------------------------------------------------------------------------
// Утилиты для монтажа
// ---------------------------------------------------------------------------

/**
 * Проверяет, можно ли резать в данной точке для конкретного типа проекта.
 * Для подкастов/интервью — только на границах мыслей.
 */
export function canCutHere(profile: ProjectTypeProfile, opts: {
  isOnThoughtBoundary: boolean;
  isMidSentence: boolean;
  timeSinceLastCut: number;
}): boolean {
  if (profile.speech.allowMidSentenceCut) return true;
  if (opts.isMidSentence) return false;
  if (profile.speech.cutOnThoughtBoundaries && !opts.isOnThoughtBoundary) {
    // В подкастах не режем чаще min интервала, если не на границе мысли
    if (opts.timeSinceLastCut < profile.pace.minClipSec * 0.8) return false;
  }
  return opts.timeSinceLastCut >= profile.pace.minClipSec * 0.5;
}

/**
 * Длительность фотографии с учетом типа проекта и её семантики.
 */
export function photoDurationFor(profile: ProjectTypeProfile, semanticScore: number): number {
  // semanticScore 0..1: насколько фото подходит к мысли
  const base = profile.photo.targetDurationSec;
  const boost = semanticScore > 0.7 ? 1.2 : semanticScore < 0.3 ? 0.8 : 1.0;
  const dur = base * boost;
  return Math.max(profile.photo.minDurationSec, Math.min(profile.photo.maxDurationSec, Math.round(dur * 10) / 10));
}

/**
 * Частота B-Roll для типа проекта.
 */
export function shouldInsertBroll(profile: ProjectTypeProfile, timeSinceLastBroll: number, mainDuration: number): boolean {
  if (profile.broll.frequency === "rare") {
    return timeSinceLastBroll > 25 && mainDuration > 18;
  }
  if (profile.broll.frequency === "occasional") {
    return timeSinceLastBroll > profile.broll.maxConsecutiveMainSec;
  }
  if (profile.broll.frequency === "moderate") {
    return timeSinceLastBroll > profile.broll.maxConsecutiveMainSec * 0.8;
  }
  if (profile.broll.frequency === "frequent") {
    return timeSinceLastBroll > profile.broll.maxConsecutiveMainSec * 0.6;
  }
  // very-frequent
  return timeSinceLastBroll > profile.broll.maxConsecutiveMainSec * 0.4;
}
