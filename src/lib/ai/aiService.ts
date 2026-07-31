"use client";

import type { DirectorPlan } from "../brain/directorPlan";

export interface AIAnalysisRequest {
  userPrompt: string;
  /**
   * Явно выбранный пользователем шаблон (TemplateId). Если задан — жанровая
   * стратегия режиссёра обязана следовать ему, а не гадать по промпту.
   */
  templateHint?: string;
  /**
   * Бит-сетка музыки в координатах ТАЙМЛАЙНА (после сдвига на musicInPointSec):
   * Director планирует склейки и кульминацию прямо в ритм, а не по секундным
   * константам. Отсутствует → монтаж без beat-awareness.
   */
  beats?: number[];
  /**
   * Точка входа пользовательской музыки (сек, в координатах ФАЙЛА трека).
   * Сегменты audioEnergy музыки даны в координатах файла: чтобы найти дроп
   * на таймлайне, вычитай это значение. Нужен для постановки кульминации
   * ровно на дропе.
   */
  musicInPointSec?: number;
  assets: Array<{
    id: string;
    name: string;
    type: "video" | "image" | "audio";
    duration?: number;
    transcript?: string;
    width?: number;
    height?: number;
    segments?: import("../localAnalyzer").VideoSegmentMetadata[];
    audioEnergy?: import("../media").AudioEnergySegment[];
  }>;
}

export interface AIEditDecision {
  contentType: "podcast" | "youtube" | "shorts" | "reels" | "tiktok" | "ad" | "travel" | "wedding" | "educational" | "music-video" | "interview" | "presentation" | "tutorial" | "vlog" | "review" | "generic";
  targetDuration: number;
  pace: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;

  clips: Array<{
    assetId: string;
    startTime?: number;
    endTime?: number;
    duration: number;
    reason?: string;
    importance: number;
    emotion?: "energetic" | "calm" | "dramatic" | "funny" | "inspiring" | "neutral";
    trackType?: "main" | "b-roll";
    effects?: string[];
    zoom?: boolean;
    speedRamp?: { start: number; end: number; factor: number };
    speed?: number;
    cameraAngle?: "wide" | "medium" | "close";
    presentation?: "fullscreen" | "pip";
    /** Плановое время перебивки на таймлайне (компилируется режиссёром). */
    timeInTimeline?: number;
    /**
     * Переход, выбранный РЕЖИССЁРОМ (до монтажа). Имеет приоритет над
     * шаблонной логикой исполнителя; жёсткие защитные правила исполнителя
     * (jump cut на одном источнике, первый кадр, короткие клипы) неизменны.
     */
    transitionHint?: {
      type: import("../types").TransitionType;
      duration: number;
      reason?: string;
    };
  }>;

  musicSync: boolean;
  transitions: "cut" | "crossfade" | "slideup" | "slidedown" | "zoom" | "blur" | "wipe";

  textOverlays?: Array<{
    text: string;
    time: number;
    duration: number;
    style?: "title" | "subtitle" | "caption" | "callout" | "lower-third";
    animation?: string;
  }>;

  bRollSuggestions?: Array<{
    time: number;
    duration: number;
    description: string;
  }>;

  audioEnhancements?: {
    normalize: boolean;
    denoise: boolean;
    voiceEnhance: boolean;
    removeSilence: boolean;
    ducking: boolean;
    muteOriginalAudio?: boolean;
  };

  colorCorrection?: {
    global?: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      temperature?: number;
    };
    perClip?: Array<{
      clipId: string;
      adjustments: Record<string, number>;
    }>;
  };

  suggestions: string[];
  analysisQuality: "ai" | "rule-based";
}

export interface AnalysisWithPlan {
  decision: AIEditDecision;
  /** Первоклассный режиссёрский план (null — если директор недоступен и сработал фоллбэк). */
  plan: DirectorPlan | null;
}

/**
 * AI DIRECTOR — центральная точка принятия решений.
 *
 * Анализирует все материалы (содержание, эмоции, качество, композицию,
 * движение камеры, ритм, музыку, смены сцен, сильные/слабые моменты),
 * строит режиссёрский план ДО монтажа и возвращает его вместе с решением,
 * которое исполняет монтажный движок.
 */
export async function analyzeAndPlanWithAI(request: AIAnalysisRequest): Promise<AnalysisWithPlan> {
  try {
    const { AIDirector } = await import("../brain/aiDirector");
    const plan = await AIDirector.direct(request);
    const { planToDecision } = await import("../brain/planAdapter");
    return { decision: planToDecision(plan), plan };
  } catch (error) {
    console.error("AI Director failed:", error);
    // Fallback if engine fails completely
    return {
      decision: {
        contentType: "generic",
        targetDuration: 15,
        pace: "medium",
        colorGrade: "none",
        clips: [],
        musicSync: true,
        transitions: "cut",
        suggestions: [],
        analysisQuality: "rule-based",
      } as AIEditDecision,
      plan: null,
    };
  }
}

export async function analyzeWithAI(request: AIAnalysisRequest): Promise<AIEditDecision> {
  return (await analyzeAndPlanWithAI(request)).decision;
}

export async function transcribeAudio(_audioBlob: Blob, _apiKey?: string): Promise<string> {
  return "";
}

export async function analyzeEmotionalTone(_videoBlob: Blob): Promise<{
  overall: "positive" | "negative" | "neutral";
  timeline: Array<{ time: number; emotion: string; confidence: number }>;
}> {
  return {
    overall: "positive",
    timeline: [],
  };
}
