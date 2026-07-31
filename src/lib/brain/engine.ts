/**
 * COMPAT FACADE — прежний интерфейс DirectorEngine.
 *
 * Раньше здесь жил «режиссёр»: эвристики нарратива/визуала, LLM-промпты,
 * самокритика. Архитектура переписана: центром принятия решений стал
 * AIDirector (brain/aiDirector.ts) — анализ всех материалов, первоклассный
 * режиссёрский план (DirectorPlan), объяснимые решения ДО монтажа.
 *
 * Этот модуль сохраняет внешний контракт (типы сцен/скрипта и класс
 * DirectorEngine) для существующих потребителей и утилит, а внутри
 * делегирует в новое ядро через planAdapter.
 */

import type { AIAnalysisRequest, AIEditDecision } from "../ai/aiService";
import { AIDirector, type DirectOptions } from "./aiDirector";
import { planToDecision, planToScript } from "./planAdapter";

export { FAST_GENRES, SLOW_GENRES, TALKING_GENRES } from "./genres";
export { filterSpeechPhrases } from "./perception";

export interface DirectorScene {
  id: string;
  phase: "hook" | "buildup" | "climax" | "outro";
  intent: string;
  duration: number;
  emotion: "energetic" | "calm" | "dramatic" | "funny" | "inspiring" | "neutral";

  mainClip: {
    assetId: string;
    sourceStart: number;
    sourceEnd: number;
    speed: number;
    zoom: boolean;
    cameraAngle?: "wide" | "medium" | "close";
  };

  bRolls: Array<{
    assetId: string;
    sourceStart: number;
    sourceEnd: number;
    offsetInScene: number;
    presentation?: "fullscreen" | "pip";
  }>;

  captions: Array<{
    text: string;
    offsetInScene: number;
    duration: number;
    animation: string;
  }>;
}

export interface DirectorScript {
  concept: string;
  genre: string;
  targetDuration: number;
  scenes: DirectorScene[];
  audioStrategy: {
    musicStyle: string;
    duckingEnabled: boolean;
    denoiseSpeech: boolean;
    removeSilence: boolean;
    muteOriginalAudio: boolean;
  };
}

export class DirectorEngine {
  /**
   * Совместимая обёртка: AI Director строит режиссёрский план, адаптер
   * переводит его в классический DirectorScript.
   */
  static async formulateScript(request: AIAnalysisRequest, opts: DirectOptions = {}): Promise<DirectorScript> {
    const plan = await AIDirector.direct(request, opts);
    return planToScript(plan);
  }

  /**
   * @deprecated Прямая компиляция скрипта в решение сохранена ради контракта.
   * Рабочий путь: `planToDecision(plan)` через planAdapter — так режиссёрские
   * переходы достаются монтажному движку как transitionHint.
   */
  static compileToDecision(script: DirectorScript): AIEditDecision {
    const clips: AIEditDecision["clips"] = [];
    let currentTimelineTime = 0;

    for (const scene of script.scenes) {
      const sceneDuration = scene.duration / (scene.mainClip.speed || 1);

      clips.push({
        assetId: scene.mainClip.assetId,
        trackType: "main",
        duration: sceneDuration,
        startTime: scene.mainClip.sourceStart,
        endTime: scene.mainClip.sourceEnd,
        speed: scene.mainClip.speed,
        zoom: scene.mainClip.zoom,
        cameraAngle: scene.mainClip.cameraAngle,
        emotion: scene.emotion,
        reason: `[${scene.phase.toUpperCase()}] ${scene.intent}`,
        importance: scene.phase === "hook" || scene.phase === "climax" ? 0.9 : 0.6,
      });

      for (const broll of scene.bRolls) {
        clips.push({
          assetId: broll.assetId,
          trackType: "b-roll",
          duration: broll.sourceEnd - broll.sourceStart,
          startTime: broll.sourceStart,
          endTime: broll.sourceEnd,
          timeInTimeline: Math.max(0, currentTimelineTime + broll.offsetInScene),
          presentation: broll.presentation,
          reason: "B-Roll overlay",
          importance: 0.5,
        });
      }

      currentTimelineTime += sceneDuration;
    }

    const textOverlays: NonNullable<AIEditDecision["textOverlays"]> = [];
    currentTimelineTime = 0;
    for (const scene of script.scenes) {
      const sceneDuration = scene.duration / (scene.mainClip.speed || 1);
      for (const caption of scene.captions) {
        textOverlays.push({
          text: caption.text,
          time: currentTimelineTime + caption.offsetInScene,
          duration: caption.duration,
          animation: caption.animation,
        });
      }
      currentTimelineTime += sceneDuration;
    }

    return {
      contentType: script.genre as AIEditDecision["contentType"],
      targetDuration: script.targetDuration,
      pace: "medium",
      colorGrade: "cinematic",
      clips,
      musicSync: true,
      transitions: "cut",
      textOverlays,
      audioEnhancements: {
        normalize: true,
        denoise: script.audioStrategy.denoiseSpeech,
        voiceEnhance: script.audioStrategy.denoiseSpeech,
        removeSilence: script.audioStrategy.removeSilence,
        ducking: script.audioStrategy.duckingEnabled,
        muteOriginalAudio: script.audioStrategy.muteOriginalAudio,
      },
      suggestions: [script.concept],
      analysisQuality: "ai",
    };
  }
}

// Умолчание для внешних потребителей: полный цикл «материалы → решение».
export async function decideWithDirector(request: AIAnalysisRequest, opts: DirectOptions = {}): Promise<AIEditDecision> {
  const plan = await AIDirector.direct(request, opts);
  return planToDecision(plan);
}
