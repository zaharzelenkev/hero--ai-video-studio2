/**
 * AI DIRECTOR — центральная система принятия решений MONTIQ.
 *
 * Не монтажёр. РЕЖИССЁР. Работает строго ДО монтажа:
 *
 *   1. ВОСПРИЯТИЕ (perception.ts): анализирует абсолютно все материалы —
 *      содержание, эмоции, качество кадров, композицию, движение камеры,
 *      ритм, музыку, темп, смены сцен, сильные и слабые моменты.
 *   2. СТРАТЕГИЧЕСКИЙ АНАЛИЗ: цель видео, аудитория, платформа, длительность,
 *      стиль, эмоциональное воздействие, удержание внимания, вирусность.
 *   3. ДРАМАТУРГИЯ: арка (тизер → хук → нарастание → кульминация → выдох),
 *      кривая темпа, кульминация на дропе музыки.
 *   4. СЦЕНАРНЫЙ ПЛАН: отбор планов и окон исходников, скорости, зумы,
 *      переходы с мотивировкой, перебивки (семантика / pattern interrupt /
 *      маскировка слабых кадров), титры.
 *   5. САМОПРОВЕРКА: план проверяется по профессиональным правилам жанра,
 *      ошибки исправляются, уроки сохраняются в базу опыта.
 *
 * КЛЮЧЕВЫЕ ПРИНЦИПЫ РАБОТЫ:
 * - Перед каждым решением: глубокий анализ всех факторов
 * - Мыслить как режиссёр с 20-летним опытом
 * - Использовать профессиональные концепции: Hook, Retention, Payoff,
 *   Story Arc, Pattern Interrupt, Match Cut, L-Cut, J-Cut, B-Roll, etc.
 * - Каждое решение должно иметь ясную причину
 * - Сначала анализировать, потом отвечать
 *
 * На выходе — DirectorPlan (см. directorPlan.ts): сериализуемый,
 * объяснимый, детерминированный (те же материалы → тот же план).
 * Монтажный движок получает план через planAdapter и исполняет его.
 */

import { AI_CONFIG } from "../../config/ai";
import type { AIAnalysisRequest } from "../ai/aiService";
import { getTemplateForContentType, TEMPLATES } from "../templates";
import { BASE_KNOWLEDGE, saveLearnedLesson } from "./knowledge";
import { DirectorBrain } from "./director";
import { FAST_GENRES, SLOW_GENRES, TALKING_GENRES } from "./genres";
import {
  CAMERA_LABELS,
  isUnstableCamera,
  mergeUltraShortPhrases,
  peakEnergyOverlap,
  perceiveAssets,
  type AssetUnderstanding,
  type MusicUnderstanding,
  type PerceptionResult,
  type Shot,
  type SpeechPhrase,
} from "./perception";
import type {
  DirectorPlan,
  DramaturgySection,
  PacingKnot,
  PlanPhase,
  PlannedScene,
  PlannedTransition,
  MusicPlan,
} from "./directorPlan";

export interface DirectOptions {
  /** Разрешить LLM-обогащение оценок (по умолчанию — только в браузере). */
  llm?: boolean;
}

/** «Визуальные» существительные: то, что зритель ожидает УВИДЕТЬ,
 *  когда слышит. Показ вместо рассказа — главный ретеншн-триггер. */
const VISUAL_NOUNS = /(например|посмотри|смотри|представь|город|улиц|люди|человек|деньги|бюджет|работа|офис|проблема|машин|дорог|море|океан|пляж|горы|лес|парк|еда|ресторан|кофе|спорт|трениров|дом|квартир|семь|друз|телефон|компьютер|сайт|экран|бизнес|клиент|продаж|магазин|путешеств|отпуск|самолет|отель|школ|книга|фильм|музык|собак|кошк|кот|природ|закат|ночь|утро)/i;

const PAYOFF_MARKERS = /(главное|самое важное|важн|итог|вывод|секрет|запомни|поэтому|вот почему|представь|внимание|ошибк|никогда|всегда)/i;

// ---------------------------------------------------------------------------
// Детерминированный «рандом» (FNV-1a): одинаковые материалы → одинаковый план.
// Math.random недопустим: превью и экспорт становились бы разными роликами.
// ---------------------------------------------------------------------------

function makeDeterministicRand(request: AIAnalysisRequest): (salt: string) => number {
  let seq = 0;
  const seedStr = request.assets.map((a) => `${a.id}:${Math.round((a.duration ?? 0) * 10)}`).join("|") + (request.userPrompt ?? "");
  let base = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    base ^= seedStr.charCodeAt(i);
    base = Math.imul(base, 16777619);
  }
  return (salt: string): number => {
    let h = base;
    for (let i = 0; i < salt.length; i++) {
      h ^= salt.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h = Math.imul(h ^ (seq++), 2246822519);
    return ((h >>> 0) % 10000) / 10000;
  };
}

interface DirCtx {
  request: AIAnalysisRequest;
  perceived: PerceptionResult;
  genre: string;
  target: number;
  isFast: boolean;
  isSlow: boolean;
  isTalking: boolean;
  rand: (salt: string) => number;
  notes: string[];
  weakRegistry: DirectorPlan["weakMomentsHandled"];
  strongRegistry: DirectorPlan["strongMomentsUsed"];
}

/** Интерфейс для глубокого анализа проекта перед принятием решений */
interface ProjectAnalysis {
  goal: string;
  audience: string;
  platform: string;
  emotionalImpact: string;
  retentionStrategy: string;
  viralityPotential: number;
  dramaStructure: string;
  pacingStrategy: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Точка входа
// ---------------------------------------------------------------------------

export class AIDirector {
  /**
   * Глубокий анализ проекта по всем ключевым аспектам
   */
  private static async analyzeProject(request: AIAnalysisRequest, strategy: { genre: string; targetDuration: number; instructions: string }): Promise<ProjectAnalysis> {
    const notes: string[] = [];
    
    // 1. Определяем цель видео
    const goal = this.determineGoal(request);
    notes.push(`Цель видео: ${goal}`);
    
    // 2. Анализируем аудиторию
    const audience = this.determineAudience(request);
    notes.push(`Аудитория: ${audience}`);
    
    // 3. Определяем платформу
    const platform = this.determinePlatform(request);
    notes.push(`Платформа: ${platform}`);
    
    // 4. Эмоциональное воздействие
    const emotionalImpact = this.determineEmotionalImpact(request, strategy.genre);
    notes.push(`Эмоциональное воздействие: ${emotionalImpact}`);
    
    // 5. Стратегия удержания внимания
    const retentionStrategy = this.determineRetentionStrategy(request, strategy.genre, strategy.targetDuration);
    notes.push(`Стратегия удержания: ${retentionStrategy}`);
    
    // 6. Потенциал вирусности
    const viralityPotential = this.assessViralityPotential(request, strategy.genre);
    notes.push(`Потенциал вирусности: ${viralityPotential}/10`);
    
    // 7. Драматургическая структура
    const dramaStructure = this.determineDramaStructure(request, strategy.genre, strategy.targetDuration);
    notes.push(`Драматургия: ${dramaStructure}`);
    
    // 8. Стратегия темпа
    const pacingStrategy = this.determinePacingStrategy(strategy.genre, strategy.targetDuration);
    notes.push(`Стратегия темпа: ${pacingStrategy}`);
    
    return {
      goal,
      audience,
      platform,
      emotionalImpact,
      retentionStrategy,
      viralityPotential,
      dramaStructure,
      pacingStrategy,
      notes
    };
  }

  /** Определение цели видео */
  private static determineGoal(request: AIAnalysisRequest): string {
    const prompt = (request.userPrompt || "").toLowerCase();
    
    if (prompt.includes("продаж") || prompt.includes("купи") || prompt.includes("продук") || prompt.includes("реклам")) {
      return "Конверсия и продажи";
    }
    if (prompt.includes("обуч") || prompt.includes("туториал") || prompt.includes("курс") || prompt.includes("урок")) {
      return "Обучение и образование";
    }
    if (prompt.includes("развлек") || prompt.includes("весель") || prompt.includes("юмор") || prompt.includes("смешн")) {
      return "Развлечение";
    }
    if (prompt.includes("вдохнов") || prompt.includes("мотивац") || prompt.includes("личност")) {
      return "Вдохновение и мотивация";
    }
    if (prompt.includes("информац") || prompt.includes("новост") || prompt.includes("обзор")) {
      return "Информирование";
    }
    if (prompt.includes("бренд") || prompt.includes("имидж") || prompt.includes("продвиж")) {
      return "Формирование бренда";
    }
    
    return "Удержание внимания и вовлечение";
  }

  /** Определение целевой аудитории */
  private static determineAudience(request: AIAnalysisRequest): string {
    const prompt = (request.userPrompt || "").toLowerCase();
    
    if (prompt.includes("молод") || prompt.includes("подрост") || prompt.includes("gen z") || prompt.includes("тинейдж")) {
      return "Молодежь (13-25)";
    }
    if (prompt.includes("взросл") || prompt.includes("30+") || prompt.includes("40+") || prompt.includes("бизнес")) {
      return "Взрослые (25-45)";
    }
    if (prompt.includes("пожил") || prompt.includes("50+") || prompt.includes("senior")) {
      return "Пожилые (50+)";
    }
    if (prompt.includes("родител") || prompt.includes("семейн") || prompt.includes("мам") || prompt.includes("пап")) {
      return "Родители и семьи";
    }
    if (prompt.includes("профессионал") || prompt.includes("эксперт") || prompt.includes("b2b")) {
      return "Профессионалы и эксперты";
    }
    if (prompt.includes("женск") || prompt.includes("для женщин")) {
      return "Женская аудитория";
    }
    if (prompt.includes("мужск") || prompt.includes("для мужчин")) {
      return "Мужская аудитория";
    }
    
    return "Широкая аудитория";
  }

  /** Определение платформы */
  private static determinePlatform(request: AIAnalysisRequest): string {
    const prompt = (request.userPrompt || "").toLowerCase();
    
    if (prompt.includes("tiktok") || prompt.includes("тик ток") || prompt.includes("reels") || prompt.includes("shorts")) {
      return "TikTok/Reels/Shorts (вертикальный)";
    }
    if (prompt.includes("youtube") || prompt.includes("ютуб") || prompt.includes("видео")) {
      return "YouTube (горизонтальный)";
    }
    if (prompt.includes("instagram") || prompt.includes("инстаграм")) {
      return "Instagram (квадратный/вертикальный)";
    }
    if (prompt.includes("телевизор") || prompt.includes("tv") || prompt.includes("телек")) {
      return "Телевидение";
    }
    if (prompt.includes("презентац") || prompt.includes("конференц") || prompt.includes("бизнес")) {
      return "Презентация/Конференция";
    }
    
    // Автоопределение по соотношению сторон
    const firstAsset = request.assets[0];
    if (firstAsset) {
      if (firstAsset.height && firstAsset.width) {
        const ratio = firstAsset.height / firstAsset.width;
        if (ratio > 1.5) return "Вертикальный (9:16)";
        if (ratio < 0.8) return "Горизонтальный (16:9)";
        return "Квадратный (1:1)";
      }
    }
    
    return "Универсальный";
  }

  /** Определение эмоционального воздействия */
  private static determineEmotionalImpact(request: AIAnalysisRequest, genre: string): string {
    const prompt = (request.userPrompt || "").toLowerCase();
    
    if (prompt.includes("страх") || prompt.includes("ужас") || prompt.includes("шок")) {
      return "Страх/Ужас";
    }
    if (prompt.includes("смех") || prompt.includes("юмор") || prompt.includes("весель")) {
      return "Радость/Смех";
    }
    if (prompt.includes("грусть") || prompt.includes("печаль") || prompt.includes("тоска")) {
      return "Грусть/Печаль";
    }
    if (prompt.includes("гнев") || prompt.includes("злость") || prompt.includes("возмущ")) {
      return "Гнев/Возмущение";
    }
    if (prompt.includes("удивлен") || prompt.includes("вау") || prompt.includes("шок")) {
      return "Удивление/Шок";
    }
    if (prompt.includes("вдохнов") || prompt.includes("мотивац") || prompt.includes("надежд")) {
      return "Вдохновение/Надежда";
    }
    if (prompt.includes("любовь") || prompt.includes("романтик") || prompt.includes("нежность")) {
      return "Любовь/Нежность";
    }
    if (prompt.includes("напряж") || prompt.includes("саспенс") || prompt.includes("интриг")) {
      return "Напряжение/Интрига";
    }
    
    // По жанру
    if (genre === "wedding") return "Эмоциональный подъем/Счастье";
    if (genre === "fitness") return "Энергия/Мотивация";
    if (genre === "gaming") return "Азарт/Возбуждение";
    if (genre === "ad") return "Желание/Влечение";
    if (genre === "documentary") return "Любопытство/Удивление";
    
    return "Нейтральный/Информативный";
  }

  /** Определение стратегии удержания внимания */
  private static determineRetentionStrategy(request: AIAnalysisRequest, genre: string, targetDuration: number): string {
    const prompt = (request.userPrompt || "").toLowerCase();
    const hasSpeech = request.assets.some(a => (a.transcript || "").length > 20);
    
    const strategies = [];
    
    // Быстрый хук для коротких форматов
    if (targetDuration <= 60) {
      strategies.push("Мгновенный хук (1-2 сек)");
    }
    
    // Pattern Interrupt для динамичных жанров
    if (genre === "tiktok" || genre === "ad" || genre === "gaming") {
      strategies.push("Pattern Interrupt каждые 4-5 кадров");
    }
    
    // B-Roll для речевых форматов
    if (hasSpeech) {
      strategies.push("B-Roll перебивки каждые 8-10 сек");
    }
    
    // Эмоциональные пики
    if (targetDuration > 30) {
      strategies.push("Несколько эмоциональных пиков");
    }
    
    // Open Loop
    if (prompt.includes("таинств") || prompt.includes("секрет") || prompt.includes("открыт")) {
      strategies.push("Open Loop в начале");
    }
    
    // Match Cut для кинематографичных жанров
    if (genre === "travel" || genre === "documentary" || genre === "cinematic") {
      strategies.push("Match Cut по цвету/движению");
    }
    
    return strategies.length > 0 ? strategies.join(", ") : "Классическая структура";
  }

  /** Оценка потенциала вирусности */
  private static assessViralityPotential(request: AIAnalysisRequest, genre: string): number {
    let score = 5; // Базовый уровень
    const prompt = (request.userPrompt || "").toLowerCase();
    
    // Плюсы
    if (prompt.includes("вызов") || prompt.includes("challenge")) score += 2;
    if (prompt.includes("тренд") || prompt.includes("вирусн") || prompt.includes("популярн")) score += 2;
    if (prompt.includes("эмоци") || prompt.includes("неожидан") || prompt.includes("шок")) score += 1;
    if (genre === "tiktok" || genre === "ad") score += 2;
    if (request.assets.some(a => a.type === "video")) score += 1;
    
    // Минусы
    if (prompt.includes("скучн") || prompt.includes("длинн") || prompt.includes("сложн")) score -= 2;
    if (genre === "documentary" || genre === "education") score -= 1;
    
    return Math.min(10, Math.max(1, score));
  }

  /** Определение драматургической структуры */
  private static determineDramaStructure(request: AIAnalysisRequest, genre: string, targetDuration: number): string {
    const prompt = (request.userPrompt || "").toLowerCase();
    
    // Короткие форматы
    if (targetDuration <= 30) {
      if (prompt.includes("проблем") && prompt.includes("решен")) {
        return "Problem → Solution (2-акта)";
      }
      if (prompt.includes("вопрос") && prompt.includes("ответ")) {
        return "Question → Answer (2-акта)";
      }
      return "Hook → Payoff (2-акта)";
    }
    
    // Средние форматы
    if (targetDuration <= 120) {
      if (genre === "ad" || genre === "gaming") {
        return "Setup → Confrontation → Resolution (3-акта)";
      }
      if (prompt.includes("путешеств") || prompt.includes("приключ")) {
        return "Hero's Journey (упрощенная)";
      }
      return "Setup → Development → Climax → Outro (4-акта)";
    }
    
    // Длинные форматы
    if (genre === "documentary" || genre === "film") {
      return "Full Hero's Journey";
    }
    
    return "Setup → Complication → Development → Climax → Resolution (5-акта)";
  }

  /** Определение стратегии темпа */
  private static determinePacingStrategy(genre: string, targetDuration: number): string {
    if (genre === "tiktok" || genre === "ad") {
      return "Быстрый (2-3 сек на кадр, динамичные переходы)";
    }
    if (genre === "fitness" || genre === "gaming") {
      return "Очень быстрый (1-2 сек на кадр, синхронизация с битами)";
    }
    if (genre === "travel" || genre === "wedding") {
      return "Медленный (4-6 сек на кадр, плавные переходы)";
    }
    if (genre === "podcast" || genre === "interview") {
      return "Средний (3-5 сек на кадр, ритмичные перебивки)";
    }
    if (genre === "documentary") {
      return "Варьируемый (от 2 до 8 сек, в зависимости от напряжения)";
    }
    
    if (targetDuration <= 30) {
      return "Быстрый (2-3 сек на кадр)";
    }
    if (targetDuration <= 60) {
      return "Средний (3-4 сек на кадр)";
    }
    
    return "Варьируемый по эмоциональной дуге";
  }

  /**
   * Главный метод: принимает ВСЕ собранные данные анализа и возвращает
   * режиссёрский план. Монтаж при этом ещё не начат — решения приняты заранее.
   */
  static async direct(request: AIAnalysisRequest, opts: DirectOptions = {}): Promise<DirectorPlan> {
    const llmAllowed = opts.llm ?? typeof window !== "undefined";

    // --- 1. СТРАТЕГИЧЕСКИЙ АНАЛИЗ: полное понимание проекта ---
    const strategy = await DirectorBrain.defineStrategy(request);
    const genre = strategy.genre;
    const target = strategy.targetDuration;
    
    // Анализируем все ключевые аспекты перед принятием решений
    const projectAnalysis = await this.analyzeProject(request, strategy);

    // --- 2. ВОСПРИЯТИЕ всех материалов ---
    const perceived = perceiveAssets(request);

    const ctx: DirCtx = {
      request,
      perceived,
      genre,
      target,
      isFast: FAST_GENRES.has(genre),
      isSlow: SLOW_GENRES.has(genre),
      isTalking: TALKING_GENRES.has(genre),
      rand: makeDeterministicRand(request),
      notes: [...projectAnalysis.notes],
      weakRegistry: [],
      strongRegistry: [],
    };

    const musicNote = perceived.music.present
      ? `музыка: трек «${assetName(request, perceived.music.assetId)}»${perceived.music.bpm ? `, ${perceived.music.bpm} BPM` : ""}${perceived.music.dropsTimeline.length ? `, дропов на сетке: ${perceived.music.dropsTimeline.length}` : ", без выраженных дропов"}`
      : perceived.music.beatsTimeline.length
        ? `музыка: процедурный саундтрек${perceived.music.bpm ? ` (${perceived.music.bpm} BPM)` : ""} — бит-сетка известна заранее`
        : "музыки нет — ритм строится на внутренней динамике кадров";
    ctx.notes.push(
      `Восприятие: материалов ${perceived.assets.length} (покадрово проанализировано ${perceived.visualAnalyzedCount}, с речью ${perceived.speechAssets.length}). ` +
      `Монтажных планов: ${perceived.shotsTotal} · сильных: ${perceived.strongTotal} · слабых/брака: ${perceived.weakTotal + perceived.rejectTotal}. ` +
      `${perceived.hasFacesAnywhere ? "В кадре есть люди." : "Людей в кадре не найдено."} ${musicNote}.`,
    );
    ctx.notes.push(`Стратегия: жанр «${genre}», целевой хронометраж ≈${Math.round(target)}с.`);

    // --- 3. ДРАМАТУРГИЯ + 4. СЦЕНАРНЫЙ ПЛАН ---
    const speechMain = pickSpeechMain(perceived);
    let kind: DirectorPlan["kind"];
    let scenes: PlannedScene[];
    let concept: string;

    if (speechMain) {
      kind = "narrative";
      const r = await buildNarrativePlan(ctx, speechMain, llmAllowed && !!AI_CONFIG.groqApiKey);
      scenes = r.scenes;
      concept = r.concept;
    } else {
      kind = "visual";
      const r = buildVisualPlan(ctx);
      scenes = r.scenes;
      concept = r.concept;
    }

    // --- 5. САМОПРОВЕРКА по профессиональным правилам ---
    const qa = await reviewPlan(scenes, ctx, target);

    // Итоговая точка кульминации на таймлайне (после всех правок и тизера).
    let acc = 0;
    let climaxAt = 0;
    for (const s of scenes) {
      if (s.phase === "climax") {
        climaxAt = acc;
        break;
      }
      acc += s.duration;
    }
    const totalDur = scenes.reduce((a, s) => a + s.duration, 0);
    const climaxAlignedToDrop =
      perceived.music.dropsTimeline.length > 0 &&
      perceived.music.dropsTimeline.some((d) => Math.abs(d - climaxAt) <= Math.max(1, (perceived.music.beatDur ?? 0.5) * 2));
    if (climaxAlignedToDrop) {
      ctx.notes.push(`Кульминация (≈${climaxAt.toFixed(1)}с) совпала с дропом музыки — удар попадает в долю.`);
    }

    const predictedTplId =
      request.templateHint && request.templateHint !== "auto"
        ? request.templateHint
        : getTemplateForContentType(genre).id;
    const music = buildMusicPlan(perceived.music, genre, kind === "narrative", climaxAlignedToDrop, predictedTplId);

    const dramaturgy = buildDramaturgy(scenes);
    const pacingCurve = buildPacingCurve(scenes, totalDur, climaxAt);

    // Из реестра «вырезано» убираем окна, которые всё же вошли в план
    // (крайний фоллбэк, когда лучших кадров нет совсем). «Прикрыто» (covered)
    // по определению пересекается со сценами — такие записи остаются.
    const weakRegistry = ctx.weakRegistry.filter(
      (w) =>
        w.action !== "cut" ||
        !scenes.some((s) => s.source.assetId === w.assetId && s.source.start < w.end - 0.05 && s.source.end > w.start + 0.05),
    );

    return {
      version: 1,
      createdAt: Date.now(),
      kind,
      concept,
      genre,
      pace: ctx.isFast ? "fast" : ctx.isSlow ? "slow" : "medium",
      colorGrade: (BASE_KNOWLEDGE.find((k) => k.genreId === genre)?.colorGrade ?? "cinematic") as string,
      targetDuration: target,
      climaxAt,
      dramaturgy,
      pacingCurve,
      music,
      scenes,
      weakMomentsHandled: weakRegistry,
      strongMomentsUsed: ctx.strongRegistry,
      directorNotes: ctx.notes,
      qa,
      analysisCoverage: {
        assets: request.assets.length,
        analyzed: perceived.visualAnalyzedCount,
        withSpeech: perceived.speechAssets.length,
      },
      // Добавляем стратегический анализ для transparency
      strategicAnalysis: {
        goal: projectAnalysis.goal,
        audience: projectAnalysis.audience,
        platform: projectAnalysis.platform,
        emotionalImpact: projectAnalysis.emotionalImpact,
        retentionStrategy: projectAnalysis.retentionStrategy,
        viralityPotential: projectAnalysis.viralityPotential,
        dramaStructure: projectAnalysis.dramaStructure,
        pacingStrategy: projectAnalysis.pacingStrategy,
      },
    };
  }
}

function assetName(request: AIAnalysisRequest, id?: string): string {
  if (!id) return "?";
  return request.assets.find((a) => a.id === id)?.name ?? id;
}

function pickSpeechMain(perceived: PerceptionResult): AssetUnderstanding | null {
  let best: AssetUnderstanding | null = null;
  let bestTime = 0;
  for (const a of perceived.assets) {
    if (!a.speech || a.speech.phrasesWithPauses.length === 0) continue;
    const t = a.speech.phrasesWithPauses.reduce((acc, p) => acc + (p.end - p.start), 0);
    if (t > bestTime) {
      bestTime = t;
      best = a;
    }
  }
  return best && bestTime > 2 ? best : null;
}

// ---------------------------------------------------------------------------
// ВИЗУАЛЬНЫЙ ПЛАН (без речи: тревел, клипы, слайдшоу, экшн-нарезки)
// ---------------------------------------------------------------------------

function buildVisualPlan(ctx: DirCtx): { scenes: PlannedScene[]; concept: string } {
  const { perceived, genre, target, isFast, isSlow, notes } = ctx;

  const allShots = perceived.assets.flatMap((a) => a.shots);
  let pool = allShots.filter((s) => s.tier === "strong" || s.tier === "usable");
  let relaxed = false;
  if (pool.length === 0) {
    pool = allShots.filter((s) => s.tier !== "reject");
    relaxed = true;
  }
  if (pool.length === 0) pool = allShots; // крайний случай: монтируем что есть

  // Реестр слабых моментов: всё, что ниже планки, — «вырезано» (если не вошло
  // в план крайним фоллбэком — эти случаи отфильтруются при сборке плана).
  for (const a of perceived.assets) {
    for (const w of a.weakSpans) {
      ctx.weakRegistry.push({ assetId: a.assetId, start: w.start, end: w.end, action: "cut", reason: `вырезано: ${w.reason}` });
    }
  }
  if (relaxed) {
    notes.push("Запас сильных кадров исчерпан: план собран из слабых окон (грейд и темп вытянут материал).");
  }

  if (pool.length === 0) return { scenes: [], concept: "Нет визуальных материалов" };

  // --- Музыкальная сетка ---
  const musicGrid = perceived.music.beatsTimeline.filter((b) => b >= 0 && b <= target + 5);
  const beatDur = perceived.music.beatDur ?? 0;
  const qBeats = (seconds: number, minBeats: number, maxBeats: number): number => {
    if (!beatDur) return seconds;
    const k = Math.round(seconds / beatDur);
    return +(Math.max(minBeats, Math.min(maxBeats, k)) * beatDur).toFixed(3);
  };

  // --- Кульминация: на дропе музыки (или энергетическом пике), иначе на 75% ---
  let wantClimaxAt = target * 0.75;
  let dropAligned = false;
  // Дропы + «high»-секции: если формального дропа в рабочем окне нет, удар
  // ставится на ближайший выраженный энергетический подъём — кульминация
  // не должна «провисать» на тихой части трека.
  const peaksTimeline = [...perceived.music.dropsTimeline, ...perceived.music.highsTimeline].sort((a, b) => a - b);
  if (peaksTimeline.length > 0) {
    const inWindow = peaksTimeline.filter((t) => t >= target * 0.45 && t <= target * 0.85);
    if (inWindow.length > 0) {
      wantClimaxAt = inWindow[0];
      dropAligned = perceived.music.dropsTimeline.some((d) => Math.abs(d - wantClimaxAt) < 0.4);
    }
  }
  if (musicGrid.length > 0) {
    let best = wantClimaxAt;
    let bestDist = Infinity;
    for (const b of musicGrid) {
      const d = Math.abs(b - wantClimaxAt);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    if (bestDist <= 0.7) wantClimaxAt = best;
  }
  wantClimaxAt = Math.max(target * 0.4, Math.min(target * 0.9, wantClimaxAt));
  notes.push(
    dropAligned
      ? `Кульминация ставится на дроп музыки (${wantClimaxAt.toFixed(1)}с таймлайна) — главный кадр ролика совпадёт с ударом.`
      : `Дропов в рабочем окне нет — кульминация ставится по классике на ~75% хронометража (${wantClimaxAt.toFixed(1)}с).`,
  );

  // --- Хук: кадр, останавливающий скролл ---
  const hookRank = (s: Shot): number =>
    s.score +
    (s.hasFaces ? 30 : 0) +
    (s.hasAction ? 30 : 0) +
    (s.tier === "strong" ? 15 : 0) -
    (s.cameraMotion === "handheld" ? 12 : 0) -
    (s.isAnalyzed ? 0 : 20) +
    (s.cutOut - s.cutIn >= 1.2 ? 6 : 0);
  const hookShot = [...pool].sort((a, b) => hookRank(b) - hookRank(a))[0];

  const hookMax = isFast ? 1.7 : isSlow ? 2.4 : 2.0;
  const hookWindow = hookShot.cutOut - hookShot.cutIn;
  const hookDur = Math.max(0.6, Math.min(hookWindow, beatDur ? qBeats(hookMax, 2, 6) : hookMax));
  notes.push(`Хук: «${hookShot.assetName}» @${hookShot.cutIn.toFixed(1)}с (${hookShot.reasons.slice(0, 3).join(", ") || "лучшая суммарная оценка"}) — ${hookDur.toFixed(1)}с, дальше зритель решает, смотреть ли.`);

  const scenes: PlannedScene[] = [];
  const pushScene = (scene: PlannedScene, brightness: number | undefined, hue?: number): void => {
    noteSceneBrightness(scene, brightness);
    noteSceneHue(scene, hue);
    scenes.push(scene);
  };

  pushScene(
    {
      id: "scene_0_hook",
      phase: "hook",
      intent: "Cold Open",
      emotion: "energetic",
      targetIntensity: 0.95,
      duration: hookDur,
      source: {
        assetId: hookShot.assetId,
        start: hookShot.cutIn,
        end: hookShot.cutIn + hookDur,
        speed: 1,
        zoom: !(hookShot.faceSize !== undefined && hookShot.faceSize >= 0.08),
        cameraAngle: hookShot.size,
        shotSize: hookShot.size,
        cameraMotion: CAMERA_LABELS[hookShot.cameraMotion],
        cameraMotionKind: hookShot.cameraMotion,
      },
      transitionIn: { type: "cut", duration: 0, reason: "вход резкой склейкой — без раскачки" },
      bRolls: [],
      captions: [],
      why: `Хук из «${hookShot.assetName}»: ${hookShot.reasons.slice(0, 3).join(", ") || "максимальная суммарная оценка"}.`,
    },
    hookShot.brightness,
    hookShot.hue,
  );
  ctx.strongRegistry.push({ assetId: hookShot.assetId, start: hookShot.cutIn, phase: "hook" });

  // --- Резерв кульминации: самый эпичный план бережём для дропа ---
  const epicRank = (s: Shot): number =>
    s.score + s.momentum * 60 + (s.tier === "strong" ? 40 : 0) - (isUnstableCamera(s.cameraMotion) ? 30 : 0);
  const epicSorted = [...pool].sort((a, b) => epicRank(b) - epicRank(a));
  let climaxReserve: Shot | null = null;
  // Исходный план резерва: исключается из пула серединки, даже когда резерв —
  // «продолжение»-копия того же кадра (иначе эпик протечёт в нарастание).
  let climaxReserveBase: Shot | null = null;
  {
    const epic = epicSorted[0] ?? null;
    if (epic) {
      if (epic.id === hookShot.id && epic.cutOut - (hookShot.cutIn + hookDur) >= 1.8) {
        // Тизер→пейофф: кульминация берёт ПРОДОЛЖЕНИЕ того же окна.
        climaxReserve = { ...epic, cutIn: hookShot.cutIn + hookDur };
        climaxReserveBase = epic;
        notes.push(`Кульминация — продолжение кадра-хука («${epic.assetName}»): зритель получит развязку момента, которым его зацепили.`);
      } else if (epic.id !== hookShot.id) {
        climaxReserve = epic;
        climaxReserveBase = epic;
        notes.push(`Кульминация зарезервирована: «${epic.assetName}» @${epic.cutIn.toFixed(1)}с (${epic.reasons.slice(0, 3).join(", ") || "максимум эпичности"}) — в середину не отдаём.`);
      } else {
        const alt = epicSorted.find((s) => s.id !== hookShot.id) ?? null;
        if (alt) {
          climaxReserve = alt;
          climaxReserveBase = alt;
        }
      }
    }
  }

  // --- Основной цикл отбора планов ---
  const usageCount = new Map<string, number>();
  for (const a of perceived.assets) usageCount.set(a.assetId, 0);
  usageCount.set(hookShot.assetId, 1);
  const shotUseCount = new Map<Shot, number>();
  shotUseCount.set(hookShot, 1);
  const coveredTo = new Map<Shot, number>();
  coveredTo.set(hookShot, hookShot.cutIn + hookDur);
  const recentShots: Shot[] = [hookShot];

  let lastAssetId = hookShot.assetId;
  let lastShot: Shot = hookShot;
  let lastSize = hookShot.size;
  let reserveUsed = false;
  let waveIdx = 0;
  let currentTime = hookDur;
  let climaxPlaced = false;

  // --- SETUP (контекст): после хука зритель должен понять, ЧТО смотрит.
  // Establishing-план (общий, спокойный) сразу после хук-кадра — классическая
  // структура «крючок → контекст → история». В быстрых жанрах контекст
  // сжигает первые секунды удержания — ставим его только в slow/medium.
  if (!ctx.isFast && pool.length > 1) {
    const setupCandidates = pool.filter(
      (s) =>
        s.size === "wide" &&
        s.id !== hookShot.id &&
        s.tier !== "reject" &&
        !(climaxReserveBase && s === climaxReserveBase),
    );
    // Не берём тот же ассет, что и хук (сразу два куска одного исходника вяжут ряд).
    const setupShot =
      setupCandidates.find((s) => s.assetId !== hookShot.assetId && s.assetId !== lastAssetId) ??
      setupCandidates.find((s) => s.assetId !== hookShot.assetId) ??
      setupCandidates[0];
    if (setupShot) {
      let setupDur = isSlow ? 3.8 : 2.9;
      if (beatDur) setupDur = qBeats(setupDur, isSlow ? 5 : 3, 10);
      setupDur = Math.min(setupDur, setupShot.cutOut - setupShot.cutIn, target - currentTime);
      if (setupDur >= 1.6) {
        pushScene(
          {
            id: `scene_${scenes.length}_setup`,
            phase: "setup",
            intent: "Context (Establishing)",
            emotion: "calm",
            targetIntensity: 0.45,
            duration: setupDur,
            source: {
              assetId: setupShot.assetId,
              start: setupShot.cutIn,
              end: setupShot.cutIn + setupDur,
              speed: 1,
              zoom: true,
              cameraAngle: setupShot.size,
              shotSize: setupShot.size,
              cameraMotion: CAMERA_LABELS[setupShot.cameraMotion],
              cameraMotionKind: setupShot.cameraMotion,
            },
            transitionIn: undefined,
            bRolls: [],
            captions: [],
            why: `Контекст: общий план «${setupShot.assetName}» — зритель понял, где происходит история.`,
          },
          setupShot.brightness,
          setupShot.hue,
        );
        usageCount.set(setupShot.assetId, (usageCount.get(setupShot.assetId) || 0) + 1);
        shotUseCount.set(setupShot, (shotUseCount.get(setupShot) || 0) + 1);
        coveredTo.set(setupShot, setupShot.cutIn + setupDur);
        recentShots.push(setupShot);
        lastAssetId = setupShot.assetId;
        lastShot = setupShot;
        lastSize = setupShot.size;
        currentTime += setupDur;
      }
    }
  }

  const RHYTHM_WAVE = [3.6, 3.0, 1.1, 0.9, 1.2, 2.6];
  let guard = 0;

  while (currentTime < target - 0.3 && guard++ < 400) {
    const progress = currentTime / target;
    const phase: PlanPhase = reserveUsed ? "outro" : !climaxReserve && progress > 0.88 ? "outro" : "buildup";

    let shot: Shot | null = null;
    let sceneIsClimax = false;

    // Резерв встаёт максимально близко к дропу. Триггер — не только «почти
    // точно на якоре», но и «дальше обычная сцена его перепрыгнет»: волновая
    // сетка длительностей иначе уносит кульминацию за дроп на секунды.
    const anchorClose = currentTime >= wantClimaxAt - 0.15;
    const wouldOvershoot = climaxReserve && wantClimaxAt - currentTime < 1.2;
    if (climaxReserve && !reserveUsed && (anchorClose || wouldOvershoot || currentTime >= target - 1.6)) {
      shot = climaxReserve;
      reserveUsed = true;
      sceneIsClimax = true;
    } else {
      let bestScore = Infinity;
      for (const s of pool) {
        if (s === lastShot || recentShots.includes(s)) continue;
        if (climaxReserveBase && s === climaxReserveBase && !reserveUsed) continue;
        if (s.assetId === lastAssetId && pool.length > 1) continue;
        const su = shotUseCount.get(s) || 0;
        const au = usageCount.get(s.assetId) || 0;
        let rank = su * 1000 + au * 60 - s.score;
        if (phase === "outro" && s.hasAction) rank += 150; // аутро — выдох, не экшн
        if (phase === "outro" && s.momentum > 0.6) rank += 60;
        // КРУПНОСТЬ ПЛАНОВ: два одинаковых масштаба подряд ложатся плоско.
        if (s.size === lastSize) rank += isSlow ? 130 : 45;
        // Кинематографичные жанры не терпят тряску; быстрые любят динамику.
        if (isSlow && isUnstableCamera(s.cameraMotion)) rank += 90;
        if (isFast) rank -= s.momentum * 25;
        if (rank < bestScore) {
          bestScore = rank;
          shot = s;
        }
      }
      if (!shot) {
        // Память исключила всё — ослабляем её ступенями: сначала повтор
        // последнего плана (свежий хвост окна), потом уже и резерв кульминации.
        // Голодный пул не должен обрывать фильм раньше кульминации.
        const relax = (exclBase: boolean, exclLast: boolean): Shot | null => {
          let fb: Shot | null = null;
          let fbRank = Infinity;
          for (const s of pool) {
            if (exclLast && s === lastShot) continue;
            if (exclBase && climaxReserveBase && s === climaxReserveBase && !reserveUsed) continue;
            const su = shotUseCount.get(s) || 0;
            const rank = su * 1000 + (usageCount.get(s.assetId) || 0) * 60 - s.score;
            if (rank < fbRank) {
              fbRank = rank;
              fb = s;
            }
          }
          return fb;
        };
        shot = relax(true, false) ?? relax(false, true) ?? relax(false, false);
      }
      if (!shot) break;
    }

    // PATTERN INTERRUPT (взлом ритма): в быстрых жанрах каждый ~4-й план —
    // контрастный кадр (другой ассет + другая крупность + другой цветовой тон).
    // Ровный поток похожих планов приедается — глаз «спотыкается» о контраст
    // и внимание возвращается. Классический приём удержания (MrBeast/TikTok).
    let interrupt = false;
    if (phase === "buildup" && !sceneIsClimax && !ctx.isSlow && !ctx.isTalking
        && scenes.length >= 3 && scenes.length % 4 === 3 && pool.length > 1) {
      const contrast = pool.find((s) => {
        if (s.assetId === lastAssetId || s.id === shot!.id) return false;
        if (s.size === lastSize) return false;
        if (s.tier !== "strong" && s.score < 75) return false;
        if (s.cutOut - s.cutIn < 1.0) return false;
        const sh = shot!.hue;
        if (sh !== undefined && sh >= 0 && s.hue !== undefined && s.hue >= 0 && hueDiff(sh, s.hue) <= 60) return false;
        return true;
      }) ?? pool.find((s) => s.assetId !== lastAssetId && s.size !== lastSize && s.cutOut - s.cutIn >= 1.0);
      if (contrast) {
        shot = contrast;
        interrupt = true;
      }
    }

    lastAssetId = shot.assetId;
    lastShot = shot;
    lastSize = shot.size;
    usageCount.set(shot.assetId, (usageCount.get(shot.assetId) || 0) + 1);
    shotUseCount.set(shot, (shotUseCount.get(shot) || 0) + 1);
    recentShots.push(shot);
    if (recentShots.length > 2) recentShots.shift();

    // Длительность: номинал по жанру/фазе, затем квантование в бит-сетку.
    let dur: number;
    if (phase === "buildup" && !sceneIsClimax && isFast) {
      dur = RHYTHM_WAVE[waveIdx++ % RHYTHM_WAVE.length];
    } else if (sceneIsClimax) {
      dur = 1.6;
    } else if (phase === "buildup") {
      // НАРАСТАНИЕ ТЕМПА: по мере приближения к кульминации планы укорачиваются
      // (до −22%) — монтаж «сжимается», напряжение растёт, зритель чувствует
      // приближение пика физически, а не только по смыслу.
      const approach = 1 - 0.22 * Math.min(1, Math.max(0, (progress - 0.15) / 0.6));
      dur = (isSlow ? 4.4 : 3.8) * approach;
    } else {
      dur = isFast ? 2.4 : 3.2;
    }
    if (beatDur) {
      dur = qBeats(dur, isSlow && phase === "buildup" ? 5 : 2, phase === "outro" ? 8 : 12);
    }

    const windowMax = shot.cutOut - shot.cutIn;
    dur = Math.min(dur, windowMax, target - currentTime);
    // Обрезка по окну сбила бы фазу сетки для ВСЕХ дальнейших склеек —
    // опускаемся до влезающего целого числа битов.
    if (beatDur) {
      const k = Math.floor(dur / beatDur + 1e-6);
      if (k >= 2) dur = +(k * beatDur).toFixed(3);
    }
    if (dur < 0.5) break;

    // Подход к кульминации: подтягиваем стык предшествующего плана ровно
    // на дроп (дохват/сжатие вместо случайного зазора).
    if (!sceneIsClimax && climaxReserve && !reserveUsed) {
      const gap = wantClimaxAt - currentTime;
      const diff = gap - dur;
      if (diff > 0.6 && diff <= 2.2 && windowMax >= gap) {
        dur = gap;
      } else if (diff < -0.6 && diff >= -1.8 && gap >= 1.4) {
        dur = gap;
      }
    }

    // Speed ramp: скучные фрагменты в нарастании ускоряем.
    let speed = 1;
    if (shot.score < 40 && !shot.hasFaces && phase === "buildup" && !sceneIsClimax) {
      speed = 2.0;
      dur = Math.min(dur * 2, windowMax, (target - currentTime) * 2);
    }

    // Повтор окна: берём СВЕЖИЙ хвост — зритель не видит один кусок дважды.
    let srcStart = shot.cutIn;
    {
      const covered = coveredTo.get(shot);
      if (covered !== undefined && covered > shot.cutIn + 0.2 && shot.cutOut - covered >= dur) {
        srcStart = covered;
      }
      coveredTo.set(shot, Math.max(covered ?? 0, srcStart + dur));
    }

    const tlDur = dur / speed;
    pushScene(
      {
        id: `scene_${scenes.length}_${shot.id}`,
        phase: sceneIsClimax ? "climax" : phase,
        intent: sceneIsClimax ? "Climax on Drop" : interrupt ? "Pattern Interrupt" : "Flow",
        emotion: sceneIsClimax ? "dramatic" : shot.emotion === "energetic" ? "energetic" : "calm",
        targetIntensity: sceneIsClimax ? 1 : phase === "outro" ? 0.4 : 0.6,
        duration: tlDur,
        source: {
          assetId: shot.assetId,
          start: srcStart,
          end: srcStart + dur,
          speed,
          zoom: !shot.hasAction && !(shot.faceSize !== undefined && shot.faceSize >= 0.08),
          cameraAngle: shot.size,
          shotSize: shot.size,
          cameraMotion: CAMERA_LABELS[shot.cameraMotion],
          cameraMotionKind: shot.cameraMotion,
        },
        bRolls: [],
        captions: [],
        why: sceneIsClimax
          ? `Кульминация на дропе: «${shot.assetName}» — ${shot.reasons.slice(0, 3).join(", ") || "самый эпичный кадр"}.`
          : interrupt
            ? `Pattern Interrupt: контрастный план «${shot.assetName}» (${sizeLabel(shot.size)}, тон ${shot.hue !== undefined && shot.hue >= 0 ? `${shot.hue}°` : "ахроматичный"}) — взлом монотонности.`
            : phase === "outro"
              ? `Выдох: спокойный ${sizeLabel(shot.size)} план «${shot.assetName}» — эмоцию отпускаем.`
              : `Нарастание: «${shot.assetName}» @${srcStart.toFixed(1)}с — ${shot.reasons.slice(0, 2).join(", ") || sizeLabel(shot.size)}.`,
      },
      shot.brightness,
      shot.hue,
    );
    if (sceneIsClimax) {
      climaxPlaced = true;
      ctx.strongRegistry.push({ assetId: shot.assetId, start: srcStart, phase: "climax" });

      // DROP DOUBLE-HIT: второй удар по дропу — свежий сильный план сразу после
      // кульминационного. Энергия пика держится два кадра (удар + эхо), а не
      // гаснет на первом же кадре — удержание на пике длиннее.
      if (ctx.isFast && currentTime + tlDur < target - 1.6) {
        const echoPool = pool.filter(
          (s) =>
            s.assetId !== shot!.assetId &&
            !(climaxReserveBase && s === climaxReserveBase) &&
            s.tier === "strong" &&
            s.score >= 80 &&
            s.cutOut - s.cutIn >= 1.2 &&
            !recentShots.includes(s),
        );
        const echoShot = echoPool.sort((a, b) => b.score - a.score)[0];
        if (echoShot) {
          let echoDur = 1.2;
          if (beatDur) echoDur = Math.max(0.9, qBeats(echoDur, 2, 4));
          echoDur = Math.min(echoDur, echoShot.cutOut - echoShot.cutIn, target - (currentTime + tlDur));
          if (echoDur >= 0.9) {
            pushScene(
              {
                id: `scene_${scenes.length}_echo_${echoShot.id}`,
                phase: "buildup",
                intent: "Drop Double-Hit",
                emotion: "energetic",
                targetIntensity: 0.85,
                duration: echoDur,
                source: {
                  assetId: echoShot.assetId,
                  start: echoShot.cutIn,
                  end: echoShot.cutIn + echoDur,
                  speed: 1,
                  zoom: true,
                  cameraAngle: echoShot.size,
                  shotSize: echoShot.size,
                  cameraMotion: CAMERA_LABELS[echoShot.cameraMotion],
                  cameraMotionKind: echoShot.cameraMotion,
                },
                transitionIn: { type: "fadewhite", duration: 0.2, reason: "второй удар дропа — вспышка" },
                bRolls: [],
                captions: [],
                why: `Второй удар дропа: «${echoShot.assetName}» — пик держится два кадра.`,
              },
              echoShot.brightness,
              echoShot.hue,
            );
            usageCount.set(echoShot.assetId, (usageCount.get(echoShot.assetId) || 0) + 1);
            shotUseCount.set(echoShot, (shotUseCount.get(echoShot) || 0) + 1);
            coveredTo.set(echoShot, echoShot.cutIn + echoDur);
            recentShots.push(echoShot);
            if (recentShots.length > 2) recentShots.shift();
            // Следующий отбор не должен повторять ассет эха подряд.
            lastAssetId = echoShot.assetId;
            lastShot = echoShot;
            lastSize = echoShot.size;
            currentTime += echoDur;
            notes.push("Double-hit: после кульминации поставлен второй сильный план — пик держится дольше.");
          }
        }
      }
    }
    currentTime += tlDur;
  }

  // Финальный обрубок <1.3с выглядит техническим сбоем — убираем.
  while (scenes.length >= 2) {
    const last = scenes[scenes.length - 1];
    if (last.duration >= 1.3 || last.phase === "climax") break;
    scenes.pop();
  }

  if ((!climaxPlaced || !scenes.some((s) => s.phase === "climax")) && scenes.length > 2) {
    // Не нашлось отдельного эпика — кульминацией становится сильнейший план арки.
    const cand = scenes.filter((s) => s.phase === "buildup").sort((a, b) => b.duration - a.duration)[0];
    if (cand) {
      cand.phase = "climax";
      cand.emotion = "dramatic";
      cand.targetIntensity = 1;
      notes.push("Отдельного эпичного кадра не нашлось — кульминацией назначен сильнейший план середины арки.");
    }
  }

  // --- ПЕРЕХОДЫ: режиссёр решает стыки ДО монтажа, с мотивировкой ---
  for (let i = 1; i < scenes.length; i++) {
    // «Второй удар дропа» — осознанная вспышка, её не переопределяем эвристикой.
    if (scenes[i].intent === "Drop Double-Hit") continue;
    scenes[i].transitionIn = designTransition(scenes[i - 1], scenes[i], ctx);
  }

  // --- Flash-forward тизер («смотри до конца») для быстрых жанров ---
  const climaxScene = scenes.find((s) => s.phase === "climax");
  const hookScene = scenes.find((s) => s.phase === "hook");
  if ((ctx.isFast || ctx.isTalking) && climaxScene && hookScene && scenes.length > 3) {
    const sameWindow =
      climaxScene.source.assetId === hookScene.source.assetId &&
      Math.abs(climaxScene.source.start - hookScene.source.start) < 1.5;
    if (!sameWindow) {
      const teaserDur = Math.min(1.0, climaxScene.duration);
      const midSrc = climaxScene.source.start + (climaxScene.source.end - climaxScene.source.start) / 2;
      pushSceneTeaser(scenes, climaxScene, teaserDur, "Flash-forward: 1 секунда будущей кульминации в самом начале — обещание, ради которого досматривают.", midSrc);
      notes.push("Тизер: первая секунда ролика показывает будущую кульминацию (обещание → пейофф).");
    }
  }

  return {
    scenes,
    concept: `Визуальная нарезка (${genre}): ${scenes.length} сцен, кульминация на ${wantClimaxAt.toFixed(1)}с${dropAligned ? " — на дропе" : ""}.`,
  };
}

function pushSceneTeaser(scenes: PlannedScene[], climaxScene: PlannedScene, teaserDur: number, why: string, midSrc: number): void {
  scenes.unshift({
    id: "scene_teaser",
    phase: "teaser",
    intent: "Flash-forward Teaser",
    emotion: "dramatic",
    targetIntensity: 0.85,
    duration: teaserDur,
    source: {
      assetId: climaxScene.source.assetId,
      start: Math.max(0, midSrc - teaserDur / 2),
      end: midSrc + teaserDur / 2,
      speed: 1,
      zoom: climaxScene.source.zoom,
      cameraAngle: climaxScene.source.cameraAngle,
      shotSize: climaxScene.source.shotSize,
      cameraMotion: climaxScene.source.cameraMotion,
    },
    transitionIn: { type: "cut", duration: 0, reason: "тизер начинается мгновенно" },
    bRolls: [],
    captions: [{ text: "СМОТРИ ДО КОНЦА...", offsetInScene: 0, duration: teaserDur, animation: "glitch" }],
    why,
  });
}

function sizeLabel(size: Shot["size"]): string {
  return size === "close" ? "крупный" : size === "medium" ? "средний" : "общий";
}

/** Направление горизонтального движения камеры (для whip pan / match cut). */
function horizontalMotion(kind: string | undefined): "left" | "right" | null {
  if (kind === "pan-left" || kind === "pan-right") return kind === "pan-left" ? "left" : "right";
  if (kind === "dynamic" || kind === "drift") return null;
  return null;
}

/** Круговое расстояние между цветовыми тонами (0..180). */
function hueDiff(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Решение о стыке ДВУХ планов. Смотрим на тональный разрыв, динамику обеих
 * сторон и жанр. Возвращает undefined там, где осмысленного выбора нет —
 * монтажный движок применит шаблонный переход.
 */
function designTransition(prev: PlannedScene, cur: PlannedScene, ctx: DirCtx): PlannedTransition | undefined {
  // Jump cut на одном исходнике: наплыв между соседними фразами одного кадра
  // превращается в морфинг-артефакт — только резкая склейка.
  if (prev.source.assetId === cur.source.assetId) {
    return { type: "cut", duration: 0, reason: "один источник — резкая склейка (jump cut)" };
  }
  const prevB = brightnessOf(prev);
  const curB = brightnessOf(cur);
  if (prevB !== undefined && curB !== undefined && Math.abs(prevB - curB) > 70 && !ctx.isFast) {
    return { type: "fadeblack", duration: 0.3, reason: "тональный разрыв кадров — проход через чёрный" };
  }

  // WHIP PAN (match cut по движению): оба плана панорамируют в ОДНУ сторону —
  // хлыст скрывает склейку, движение «перетекает» из кадра в кадр.
  const prevDir = horizontalMotion(prev.source.cameraMotionKind);
  const curDir = horizontalMotion(cur.source.cameraMotionKind);
  if (prevDir && prevDir === curDir) {
    return { type: "hblur", duration: 0.28, reason: `Whip pan: оба плана панорамируют ${prevDir === "left" ? "влево" : "вправо"} — движение перетекает через склейку` };
  }

  // MATCH CUT ПО ЦВЕТУ: доминирующий тон соседних планов совпадает —
  // «родственные» кадры склеиваются растворением, взгляд не спотыкается.
  const prevHue = hueOf(prev);
  const curHue = hueOf(cur);
  if (prevHue !== undefined && curHue !== undefined && prevHue >= 0 && curHue >= 0) {
    let diff = Math.abs(prevHue - curHue);
    if (diff > 180) diff = 360 - diff;
    if (diff <= 28) {
      const dur = ctx.isSlow ? 0.5 : ctx.isFast ? 0.25 : 0.4;
      return { type: "crossfade", duration: dur, reason: `Match cut по цвету: общий тон ≈${curHue}° — кадры родственные, растворение естественно` };
    }
  }

  if (cur.phase === "climax") {
    return ctx.isSlow
      ? { type: "crossfade", duration: 0.5, reason: "кинематографичный вход в кульминацию" }
      : { type: "fadewhite", duration: 0.35, reason: "удар кульминации через вспышку" };
  }
  if (cur.phase === "outro" && prev.phase === "climax") {
    return { type: "crossfade", duration: 0.5, reason: "выдох после кульминации — растворение" };
  }
  if (ctx.isFast) {
    const r = ctx.rand(cur.id + "/tr");
    if (r < 0.7) return { type: "cut", duration: 0, reason: "быстрый жанр — резкий монтаж" };
    const flashy: PlannedTransition["type"][] = ["hblur", "zoom", "fadewhite", "pixelize"];
    return { type: flashy[Math.floor(ctx.rand(cur.id + "/tr2") * flashy.length)], duration: 0.3, reason: "ритмический акцент" };
  }
  if (ctx.isSlow) {
    return { type: "crossfade", duration: 0.45, reason: "кинематографичное растворение" };
  }
  return undefined;
}

/** Яркость исходного окна сцены сохраняется постановщиком сцен (shot-данные
 *  не входят в сериализуемый план, а для решения о стыке она нужна). */
const sceneBrightnessCache = new WeakMap<PlannedScene, number | undefined>();
function brightnessOf(scene: PlannedScene): number | undefined {
  return sceneBrightnessCache.get(scene);
}
function noteSceneBrightness(scene: PlannedScene, brightness: number | undefined): void {
  sceneBrightnessCache.set(scene, brightness);
}

/** Доминирующий тон исходного окна сцены (для match cut по цвету). */
const sceneHueCache = new WeakMap<PlannedScene, number | undefined>();
function hueOf(scene: PlannedScene): number | undefined {
  return sceneHueCache.get(scene);
}
function noteSceneHue(scene: PlannedScene, hue: number | undefined): void {
  sceneHueCache.set(scene, hue);
}

// ---------------------------------------------------------------------------
// НАРРАТИВНЫЙ ПЛАН (речь: подкасты, интервью, влоги, обучение)
// ---------------------------------------------------------------------------

interface PhraseRating {
  p: SpeechPhrase;
  rating: number;
  srcIdx: number;
}

async function buildNarrativePlan(
  ctx: DirCtx,
  main: AssetUnderstanding,
  allowLlm: boolean,
): Promise<{ scenes: PlannedScene[]; concept: string }> {
  const { perceived, target, rand, notes, isTalking } = ctx;
  const phrases = mergeUltraShortPhrases(main.speech!.phrasesWithPauses);
  if (phrases.length === 0) {
    const v = buildVisualPlan(ctx);
    return { scenes: v.scenes, concept: v.concept };
  }

  const mainAudio = ctx.request.assets.find((a) => a.id === main.assetId)?.audioEnergy;

  // --- Оценка фраз 1..10: эвристика + (опционально) LLM-консультант ---
  const ratePhrase = (p: SpeechPhrase): number => {
    if (p.isPause) return 6;
    let r = 5;
    if (PAYOFF_MARKERS.test(p.text)) r += 2.2;
    if (/\d/.test(p.text)) r += 0.8; // цифры = фактура
    if (/[!?]\s*$/.test(p.text.trim())) r += 1.2;
    const len = p.end - p.start;
    if (len >= 1.2 && len <= 3.5) r += 1;
    if (len < 0.6) r -= 2;
    const ap = peakEnergyOverlap(mainAudio, p.start, p.end);
    r += ap >= 0.98 ? 1.5 : ap >= 0.7 ? 1.0 : ap >= 0.4 ? 0.3 : -0.3;
    return Math.max(1, Math.min(10, r));
  };

  const ratings: number[] = phrases.map(ratePhrase);
  let llmHookId: number | null = null;
  let llmClimaxId: number | null = null;
  let llmBrollWords: Record<number, string> = {};

  if (allowLlm) {
    const llm = await consultLlmDirector(phrases, ctx).catch(() => null);
    if (llm) {
      for (const [k, v] of Object.entries(llm.ratings ?? {})) {
        const i = Number(k);
        if (Number.isFinite(i) && i >= 0 && i < ratings.length && typeof v === "number" && v >= 1 && v <= 10) {
          ratings[i] = v;
        }
      }
      if (typeof llm.bestHookId === "number" && llm.bestHookId >= 0 && llm.bestHookId < phrases.length && !phrases[llm.bestHookId].isPause) {
        llmHookId = llm.bestHookId;
      }
      if (typeof llm.climaxId === "number" && llm.climaxId >= 0 && llm.climaxId < phrases.length && !phrases[llm.climaxId].isPause) {
        llmClimaxId = llm.climaxId;
      }
      for (const [k, v] of Object.entries(llm.broll ?? {})) {
        const i = Number(k);
        if (Number.isFinite(i) && i >= 0 && i < phrases.length && typeof v === "string" && v.length > 2) {
          llmBrollWords[i] = v.toLowerCase();
        }
      }
      notes.push("LLM-консультант учтён: рейтинги фраз, хук и ключи перебивок приняты в план.");
    }
  }

  // --- Хук: cold open из самой интригующей фразы ---
  let hookIdx = llmHookId ?? -1;
  if (hookIdx < 0) {
    // Кандидаты в хук — из первой половины фильма: поздний payoff бережём
    // для кульминации и (при желании) показываем тизером, а не сжигаем в хуке.
    const accAll = phrases.reduce((a, p) => a + (p.end - p.start), 0);
    const hookWindow = Math.max(4, Math.min(target, accAll)) * 0.55;
    let accH = 0;
    let bestScore = -Infinity;
    let fallbackIdx = -1;
    let fallbackScore = -Infinity;
    for (let i = 0; i < phrases.length; i++) {
      const p = phrases[i];
      const len = p.end - p.start;
      const mid = accH + len / 2;
      accH += len;
      if (p.isPause) continue;
      let s = ratings[i];
      // Хуку нужна ИНТРИГА (вопрос/обещание/провокация), а не вывод: payoff-
      // маркеры тут не бустим — кульминация не должна «сгорать» в хуке.
      if (/[?]/.test(p.text)) s += 1;
      if (/(внимание|секрет|главное|почему|как |смотри|важно|ошибка|хочешь|представь)/i.test(p.text)) s += 1.5;
      if (s > fallbackScore) {
        fallbackScore = s;
        fallbackIdx = i;
      }
      if (mid > hookWindow) continue;
      if (s > bestScore) {
        bestScore = s;
        hookIdx = i;
      }
    }
    if (hookIdx < 0) hookIdx = fallbackIdx;
  }
  if (hookIdx < 0) hookIdx = 0;
  const hookPhrase = phrases[hookIdx];
  notes.push(`Хук (cold open): фраза «${truncate(hookPhrase.text, 60)}» @${hookPhrase.start.toFixed(1)}с — рейтинг ${ratings[hookIdx].toFixed(1)}/10.`);

  // --- Отбор хронологии с безжалостным удалением воды ---
  const picked: PhraseRating[] = [];
  let dropped = 0;
  let acc = 0;
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    const len = p.end - p.start;
    if (acc >= target * 1.02) break;
    const overShoot = acc + len > target * 1.12;
    if (overShoot && ratings[i] < 7 && !p.isPause) {
      dropped++;
      continue;
    }
    if (overShoot && picked.length > 0 && ratings[i] < 8.5 && !p.isPause) {
      dropped++;
      break;
    }
    picked.push({ p, rating: ratings[i], srcIdx: i });
    acc += len;
  }
  if (picked.length === 0) picked.push({ p: phrases[0], rating: ratings[0], srcIdx: 0 });
  // Пауза-висяк имеет смысл только как reaction beat МЕЖДУ двумя живыми
  // мыслями: если перед ней нет оставленного контента (например, она шла за
  // вырезанным приветствием-мусором) или после неё ничего не вошло в план —
  // зритель увидит лишь висящую тишину, такую паузу не берём.
  const pickedFinal: PhraseRating[] = [];
  for (let i = 0; i < picked.length; i++) {
    const r = picked[i];
    if (r.p.isPause) {
      const hasPrevContent = pickedFinal.some((x) => !x.p.isPause);
      const hasNext = i + 1 < picked.length;
      if (hasPrevContent && hasNext) pickedFinal.push(r);
    } else {
      pickedFinal.push(r);
    }
  }
  if (dropped > 0) notes.push(`Вода вырезана: ${dropped} фраз с рейтингом ниже планки не попали в монтаж.`);

  // --- Кульминация: самая сильная фраза окна 30–80% (payoff) ---
  let climaxSrcIdx = llmClimaxId !== null && pickedFinal.some((r) => r.srcIdx === llmClimaxId) ? llmClimaxId : null;
  if (climaxSrcIdx === null) {
    // Окно поиска — относительно РЕАЛЬНОЙ длины фильма: если контента меньше
    // цели, считать 30–80% target нельзя, payoff окажется «слишком рано».
    const accTotal = pickedFinal.reduce((a, r) => a + (r.p.end - r.p.start), 0);
    const windowBase = Math.max(4, Math.min(target, accTotal));
    let acc2 = 0;
    let bestR = -Infinity;
    for (const r of pickedFinal) {
      const len = r.p.end - r.p.start;
      const mid = acc2 + len / 2;
      acc2 += len;
      if (r.p.isPause) continue;
      if (r.srcIdx === hookIdx && hookIdx <= 1) continue;
      if (mid < windowBase * 0.3 || mid > windowBase * 0.8) continue;
      if (r.rating > bestR) {
        bestR = r.rating;
        climaxSrcIdx = r.srcIdx;
      }
    }
    if (climaxSrcIdx === null) {
      const anyP = pickedFinal.filter((r) => !r.p.isPause);
      if (anyP.length) climaxSrcIdx = anyP.sort((a, b) => b.rating - a.rating)[0].srcIdx;
    }
  }

  // --- Слабые кадры говорящей головы: прикрыть перебивкой или честно оставить ---
  const mainWeak = main.weakSpans;

  // --- Сборка сцен ---
  const scenes: PlannedScene[] = [];

  const hookSrc = phraseSource(hookPhrase);
  scenes.push({
    id: "scene_0_hook",
    phase: "hook",
    intent: "Cold Open",
    emotion: "energetic",
    targetIntensity: 0.95,
    duration: hookSrc.end - hookSrc.start,
    source: { ...hookSrc, assetId: main.assetId, zoom: true, cameraAngle: "close", shotSize: "close" },
    transitionIn: { type: "cut", duration: 0, reason: "холодный старт — сразу суть" },
    bRolls: [],
    captions: [],
    why: `Хук-фраза «${truncate(hookPhrase.text, 55)}» (рейтинг ${ratings[hookIdx].toFixed(1)}/10).`,
  });
  ctx.strongRegistry.push({ assetId: main.assetId, start: hookSrc.start, phase: "hook" });

  const otherAssets = perceived.assets.filter((a) => a.assetId !== main.assetId);
  let isZoomed = false;
  let brollIdx = 0;
  let prevBrollAsset: string | null = null;

  for (let bi = 0; bi < pickedFinal.length; bi++) {
    const { p, rating, srcIdx } = pickedFinal[bi];
    // Дубль хука из самого начала истории зрителя разочаровывает — пропускаем;
    // хук из середины осознанно повторяется как payoff.
    if (srcIdx === hookIdx && hookIdx <= 1) continue;

    isZoomed = !isZoomed;
    const isClimax = srcIdx === climaxSrcIdx;
    const isLast = bi === pickedFinal.length - 1;
    const phase: PlanPhase = isClimax ? "climax" : isLast ? "outro" : "buildup";
    const src = phraseSource(p);

    const scene: PlannedScene = {
      id: `scene_${scenes.length}_${srcIdx}`,
      phase,
      intent: p.isPause ? "Reaction Beat (пауза)" : isClimax ? "Payoff" : "Dialogue Cut",
      emotion: isClimax ? "dramatic" : "neutral",
      targetIntensity: isClimax ? 1 : phase === "outro" ? 0.4 : 0.6,
      duration: src.end - src.start,
      source: {
        ...src,
        assetId: main.assetId,
        zoom: p.isPause ? false : isZoomed,
        cameraAngle: isZoomed ? "close" : "medium",
        shotSize: isZoomed ? "close" : "medium",
      },
      transitionIn: { type: "cut", duration: 0, reason: "один источник — jump cut (+ punch zoom)" },
      bRolls: [],
      captions: [],
      why: p.isPause
        ? "Драматическая пауза (reaction beat): зритель переваривает мысль."
        : `Фраза рейтинга ${rating.toFixed(1)}/10${PAYOFF_MARKERS.test(p.text) ? " — payoff-маркеры" : ""}${isClimax ? " — КУЛЬМИНАЦИЯ" : ""}.`,
    };
    if (isClimax) {
      scene.source.cameraAngle = "close";
      scene.source.zoom = true;
      ctx.strongRegistry.push({ assetId: main.assetId, start: src.start, phase: "climax" });
    }

    // --- Перебивки: семантика, ритм, маскировка слабых кадров ---
    if (!p.isPause && otherAssets.length > 0) {
      const kwMatch = p.text.match(VISUAL_NOUNS);
      const llmKw = llmBrollWords[srcIdx];
      const phraseWeak = mainWeak.filter((w) => w.start < src.end && w.end > src.start);
      const isLong = p.end - p.start > 2.5;
      const isNth = bi % 4 === 0 && bi !== 0;

      if (isLong || kwMatch || llmKw || isNth || phraseWeak.length > 0) {
        const keywords = [llmKw, kwMatch?.[0]?.toLowerCase()].filter(Boolean) as string[];
        const choice = chooseBrollAsset(otherAssets, keywords, prevBrollAsset, rand, `${srcIdx}/${brollIdx}`);
        if (choice) {
          brollIdx++;
          prevBrollAsset = choice.assetId;
          const need = Math.min(src.end - src.start, 6);
          const win = pickBrollWindow(choice, need);
          const reason = phraseWeak.length > 0
            ? "прикрываем слабый кадр говорящей головы"
            : keywords.length > 0
              ? `показываем сказанное: «${keywords[0]}»`
              : "Pattern Interrupt — взлом ритма удержания";
          const presentation: "pip" | "fullscreen" =
            (isTalking || ctx.isFast) && rand(`pip/${srcIdx}`) > 0.5 ? "pip" : "fullscreen";
          scene.bRolls.push({
            assetId: choice.assetId,
            sourceStart: win.start,
            sourceEnd: win.end,
            offsetInScene: 0.1, // лёгкий L-cut: перебивка чуть запаздывает за смысл
            presentation,
            reason,
          });
          if (phraseWeak.length > 0) {
            for (const w of phraseWeak) {
              ctx.weakRegistry.push({ assetId: main.assetId, start: w.start, end: w.end, action: "covered", reason: `прикрыто перебивкой: ${w.reason}` });
            }
            scene.intent = "Pattern Interrupt";
          } else if (isNth && !kwMatch && !llmKw) {
            scene.intent = "Pattern Interrupt";
          }
        }
      }
    }

    scenes.push(scene);
  }

  // Слабые кадры основного материала, не вошедшие в план, — вырезаны по факту отбора.
  for (const w of mainWeak) {
    const wasCovered = ctx.weakRegistry.some((r) => r.assetId === main.assetId && r.start === w.start && r.action === "covered");
    if (!wasCovered) {
      const wasUsed = scenes.some((s) => s.source.assetId === main.assetId && s.source.start < w.end && s.source.end > w.start);
      ctx.weakRegistry.push({
        assetId: main.assetId,
        start: w.start,
        end: w.end,
        action: wasUsed ? "kept" : "cut",
        reason: wasUsed ? "слабый кадр в речи оставлен: непрерывность говорящей головы важнее" : `вырезано: ${w.reason}`,
      });
    }
  }

  // Титр из пожелания пользователя (хук-кадр — самое видимое место).
  const customText = extractCustomText(ctx.request.userPrompt ?? "");
  if (customText && scenes.length > 0) {
    const hook = scenes[0];
    hook.captions.push({
      text: customText,
      offsetInScene: 0.1,
      duration: Math.max(1, hook.duration - 0.2),
      animation: "elastic",
    });
    notes.push(`Титр по запросу пользователя: «${customText}» — на хуке.`);
  }

  // Flash-forward тизер — для разговорных жанров тоже («смотри до конца»).
  const climaxScene = scenes.find((s) => s.phase === "climax");
  const hookScene = scenes.find((s) => s.phase === "hook");
  if ((ctx.isFast || isTalking) && climaxScene && hookScene && scenes.length > 3) {
    const sameWindow =
      climaxScene.source.assetId === hookScene.source.assetId &&
      Math.abs(climaxScene.source.start - hookScene.source.start) < 1.5;
    if (!sameWindow) {
      const teaserDur = Math.min(1.0, climaxScene.duration);
      const midSrc = climaxScene.source.start + (climaxScene.source.end - climaxScene.source.start) / 2;
      pushSceneTeaser(scenes, climaxScene, teaserDur, "Flash-forward: будущая кульминация (payoff-фраза) анонсируется первой секундой.", midSrc);
      notes.push("Тизер: payoff-фраза показана первой секундой — обещание → пейофф в финале.");
    }
  }

  return {
    scenes,
    concept: `Нарратив (${ctx.genre}): хук «${truncate(hookPhrase.text, 42)}», ${scenes.length} сцен, воды вырезано: ${dropped} фраз.`,
  };
}

/** «Воздух» вокруг фразы: 50мс до и 90мс после — иначе Whisper-таймкоды
 *  обгладывают первый/последний звук слова, речь звучит обрубленной. */
function phraseSource(p: SpeechPhrase): { assetId: string; start: number; end: number; speed: number; zoom: boolean } {
  return {
    assetId: p.assetId,
    start: p.isPause ? p.start : Math.max(0, p.start - 0.05),
    end: p.isPause ? p.end : p.end + 0.09,
    speed: 1,
    zoom: false,
  };
}

function chooseBrollAsset(
  pool: AssetUnderstanding[],
  keywords: string[],
  prevAssetId: string | null,
  rand: (salt: string) => number,
  salt: string,
): AssetUnderstanding | null {
  if (pool.length === 0) return null;
  let best: AssetUnderstanding | null = null;
  let bestScore = -1;
  for (const a of pool) {
    let score = 0;
    const name = a.name.toLowerCase();
    for (const kw of keywords) {
      if (kw.length >= 3 && name.includes(kw)) score += 60;
      const stem = kw.replace(/[а-яё]{0,3}$/i, "");
      if (stem.length >= 3 && name.includes(stem)) score += 25;
    }
    score += a.meanAesthetic * 2 + a.meanQuality;
    if (a.assetId === prevAssetId) score -= 80;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  // Детерминированный выбор при паритете (не Math.random!).
  const usable = pool.filter((a) => a.assetId !== prevAssetId);
  const base = usable.length > 0 ? usable : pool;
  const seeded = base[Math.floor(rand(salt) * base.length) % base.length];
  return bestScore > 8 && best ? best : seeded;
}

function pickBrollWindow(asset: AssetUnderstanding, need: number): { start: number; end: number } {
  const candidates = asset.shots
    .filter((s) => s.tier === "strong" || s.tier === "usable")
    .sort((a, b) => b.score - a.score);
  for (const s of candidates) {
    const win = s.cutOut - s.cutIn;
    if (win >= Math.min(need, 1.2)) {
      return { start: s.cutIn, end: s.cutIn + Math.min(need, win) };
    }
  }
  const any = asset.shots[0];
  if (any) return { start: any.cutIn, end: any.cutIn + Math.min(need, any.cutOut - any.cutIn) };
  return { start: 0, end: Math.min(need, asset.duration || need) };
}

/** Консультация LLM: единый запрос — рейтинги фраз, хук, кульминация, ключи перебивок. */
async function consultLlmDirector(
  phrases: SpeechPhrase[],
  ctx: DirCtx,
): Promise<{ ratings?: Record<string, number>; bestHookId?: number; climaxId?: number; broll?: Record<string, string> } | null> {
  const list = phrases
    .slice(0, 60)
    .map((p, i) => `[${i}] ${p.isPause ? "(пауза)" : p.text} (${p.start.toFixed(1)}s)`)
    .join("\n");
  const sys = `Ты — элитный режиссёр монтажа (уровень MrBeast / Kurzgesagt). Оцени фразы спикера для вирусного ролика "${ctx.request.userPrompt || ""}".
Критерии оценки (1..10): сила мысли, интрига, эмоциональный заряд, конкретика (цифры/факты).
bestHookId — фраза, которая остановит скролл в первую секунду (вопрос/обещание/провокация).
climaxId — фраза-payoff (главная мысль, вывод, секрет).
broll — для фраз, где спикер называет предмет/место/действие, английские ключевые слова для перебивки.
Верни строго JSON: {"ratings": {"0": 8}, "bestHookId": 0, "climaxId": 0, "broll": {"0": "keyword"}}. Оценивай ВСЕ фразы.`;
  const resp = await fetch(AI_CONFIG.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_CONFIG.groqApiKey}` },
    body: JSON.stringify({
      model: AI_CONFIG.model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Фразы:\n${list}\n\nЖанр: ${ctx.genre}, хронометраж ≈${Math.round(ctx.target)}с.` },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  return parsed && typeof parsed === "object" ? parsed : null;
}

function extractCustomText(prompt: string): string | null {
  if (!prompt) return null;
  const quoteMatch = prompt.match(/(?:текст|заголовок|надпись|напиши).*?["'«]([^"'»]+)["'»]/i);
  if (quoteMatch?.[1]) return quoteMatch[1];
  const keywordMatch = prompt.match(/(?:напиши|добавь текст|заголовок)[:\s]+(.+)/i);
  if (keywordMatch?.[1]) return keywordMatch[1].trim();
  return null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
}

// ---------------------------------------------------------------------------
// Музыкальный план
// ---------------------------------------------------------------------------

function buildMusicPlan(
  music: MusicUnderstanding,
  genre: string,
  narration: boolean,
  climaxAlignedToDrop: boolean,
  templateId: string,
): MusicPlan {
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? getTemplateForContentType(genre);
  let strategy: string;
  let style: string;
  if (music.present) {
    style = "user";
    strategy =
      `Пользовательский трек: вход с энергетического пика (inPoint ${music.inPoint.toFixed(1)}с)` +
      (music.bpm ? `, склейки по сетке ${music.bpm} BPM` : "") +
      (music.dropsTimeline.length ? `, дропов на таймлайне: ${music.dropsTimeline.length}` : "");
  } else {
    style = "procedural";
    strategy = `Процедурный саундтрек под шаблон «${tpl.name}»${music.bpm ? ` (${music.bpm} BPM)` : ""}: склейки квантуются в бит-сетку, кульминация — на акценте.`;
  }
  return {
    strategy,
    style,
    inPoint: music.inPoint,
    bpm: music.bpm,
    bpmKnown: music.beatDur !== undefined,
    climaxAlignedToDrop,
    ducking: narration,
    // В «речевых» жанрах музыка — фон под голосом, в визуальных — полноправный саундтрек.
    volume: narration ? 0.15 : 0.6,
    narration,
  };
}

// ---------------------------------------------------------------------------
// Драматургия и кривая темпа
// ---------------------------------------------------------------------------

const SECTION_NOTES: Record<PlanPhase, string> = {
  teaser: "Обещание: 1 секунда будущего пика — крючок досмотра.",
  hook: "Остановить скролл: самый сильный кадр/фраза без раскачки.",
  setup: "Контекст: зритель понимает, что и зачем смотрит.",
  buildup: "Нарастание: история разгоняется волнообразным ритмом.",
  preClimax: "Взвод: максимальное напряжение перед ударом.",
  climax: "Кульминация: главный момент ролика на акценте музыки.",
  outro: "Выдох: спокойная точка и завершённость.",
};

function sectionKey(phase: PlanPhase): PlanPhase {
  return phase === "setup" || phase === "preClimax" ? "buildup" : phase;
}

function buildDramaturgy(scenes: PlannedScene[]): DramaturgySection[] {
  const sections: DramaturgySection[] = [];
  let cursor = 0;
  for (const s of scenes) {
    const dur = s.duration;
    const last = sections[sections.length - 1];
    const key = sectionKey(s.phase);
    if (last && last.phase === key) {
      last.end = cursor + dur;
      last.intensity = Math.max(last.intensity, s.targetIntensity);
    } else {
      sections.push({ phase: key, start: cursor, end: cursor + dur, intensity: s.targetIntensity, note: SECTION_NOTES[key] });
    }
    cursor += dur;
  }
  return sections;
}

function buildPacingCurve(scenes: PlannedScene[], total: number, climaxAt: number): PacingKnot[] {
  if (total <= 0 || scenes.length === 0) return [{ t: 0, intensity: 0.5 }, { t: 1, intensity: 0.4 }];
  const r = (t: number) => Math.min(1, Math.max(0, t / total));
  const cr = Math.min(0.98, Math.max(0.05, r(climaxAt)));
  const raw: PacingKnot[] = [
    { t: 0, intensity: 0.92 },
    { t: r(scenes[0].duration) + 0.01, intensity: 0.55 },
    { t: cr * 0.55, intensity: 0.68 },
    { t: Math.max(0.06, cr - 0.05), intensity: 0.82 },
    { t: cr, intensity: 1 },
    { t: Math.min(0.98, cr + 0.12), intensity: 0.55 },
    { t: 1, intensity: 0.38 },
  ];
  // Монотонность по t для читаемого графика.
  const knots: PacingKnot[] = [];
  let lastT = -0.001;
  for (const k of raw) {
    const t = Math.min(1, Math.max(lastT + 0.001, k.t));
    if (t > 1) break;
    knots.push({ t: Math.round(t * 1000) / 1000, intensity: k.intensity });
    lastT = t;
  }
  return knots;
}

// ---------------------------------------------------------------------------
// Самопроверка плана (RAG-critique): фикс + уроки в базу опыта
// ---------------------------------------------------------------------------

async function reviewPlan(
  scenes: PlannedScene[],
  ctx: DirCtx,
  target: number,
): Promise<{ passed: string[]; fixed: string[] }> {
  const passed: string[] = [];
  const fixed: string[] = [];

  // 1. Темп быстрых жанров: ничего длиннее 3.5с вне аутро/кульминации/тизера.
  if (ctx.isFast) {
    for (const s of scenes) {
      if (s.duration > 3.5 && s.phase !== "outro" && s.phase !== "climax" && s.phase !== "teaser") {
        s.source.end = s.source.start + 3.0 * (s.source.speed || 1);
        s.duration = 3.0;
        fixed.push(`Сцена «${s.id}» (${ctx.genre}) обрезана до 3с: внимание зрителя падает после третьей секунды.`);
      }
    }
  }

  // 2. Единственная кульминация: конвейер «пиков» обесценивает каждый.
  const climaxes = scenes.filter((s) => s.phase === "climax");
  if (climaxes.length > 1) {
    for (const extra of climaxes.slice(1)) {
      extra.phase = "buildup";
      extra.targetIntensity = 0.75;
      fixed.push("Лишняя кульминация понижена до нарастания: пик в ролике один.");
    }
  } else if (climaxes.length === 1) {
    passed.push("Драматургическая арка: ровно одна кульминация.");
  }

  // 3. Финал: последней сценой должен быть выдох (или сама кульминация).
  if (scenes.length > 1) {
    const last = scenes[scenes.length - 1];
    if (last.phase !== "outro" && last.phase !== "climax") {
      last.phase = "outro";
      last.targetIntensity = 0.4;
      fixed.push("Последняя сцена переведена в аутро: ролик должен закончиться выдохом, а не обрывом.");
    }
  }

  // 4. Стыки: первый кадр — резкий; соседи на одном источнике — только cut.
  if (scenes.length > 0 && scenes[0].transitionIn && scenes[0].transitionIn.type !== "cut") {
    scenes[0].transitionIn = { type: "cut", duration: 0, reason: "первый кадр всегда резкий" };
    fixed.push("Переход первой сцены заменён на резкую склейку.");
  }
  for (let i = 1; i < scenes.length; i++) {
    const cur = scenes[i];
    if (cur && cur.source.assetId === scenes[i - 1].source.assetId && cur.transitionIn && cur.transitionIn.type !== "cut") {
      cur.transitionIn = { type: "cut", duration: 0, reason: "один источник — jump cut" };
      fixed.push("Наплыв между планами одного источника заменён на jump cut (морфинг-артефакт).");
    }
  }

  // 5. Перебивки: только валидные окна.
  for (const s of scenes) {
    const before = s.bRolls.length;
    s.bRolls = s.bRolls.filter((b) => b.sourceEnd - b.sourceStart >= 0.6);
    if (s.bRolls.length !== before) fixed.push("Невалидная перебивка (<0.6с окна) удалена из плана.");
  }

  // 6. Уроки (мягкие): сохраняем в базу опыта.
  const lessons: string[] = [];
  if (ctx.isSlow) {
    const fastCuts = scenes.filter((s) => s.duration < 1.5).length;
    if (fastCuts > scenes.length * 0.4) {
      lessons.push(`ОШИБКА РИТМА: для кинематографичного жанра ${ctx.genre} слишком много склеек <1.5с. Давай кадру «подышать» 4-6 секунд.`);
    }
  }
  if (ctx.isTalking && ctx.perceived.speechAssets.length > 0) {
    const totalBR = scenes.reduce((a, s) => a + s.bRolls.length, 0);
    if (totalBR === 0 && target > 10) {
      lessons.push("ОШИБКА УДЕРЖАНИЯ: нарратив без перебивок. Говорящая голова наскучит — перекрывай лицо B-Roll каждые несколько секунд.");
    }
  }
  for (const lesson of lessons) {
    try {
      await saveLearnedLesson(ctx.genre, lesson);
    } catch {
      /* база опыта недоступна (Node/тест) — план не зависит от неё */
    }
  }

  if (fixed.length === 0) passed.push("План прошёл самопроверку без правок.");
  for (const f of fixed) ctx.notes.push(`Самопроверка: ${f}`);
  return { passed, fixed };
}
