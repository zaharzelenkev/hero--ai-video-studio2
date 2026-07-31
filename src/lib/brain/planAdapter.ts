/**
 * PLAN ADAPTER — мост между AI Director и монтажным движком.
 *
 * Режиссёр выдаёт DirectorPlan (понимание + драматургия + по-сценовые
 * решения). Монтажное ядро (autoEdit) исторически исполняет AIEditDecision.
 * Адаптер переводит план в решение БЕЗ потери режиссёрских решений:
 * переходы, выбранные режиссёром, передаются подсказками transitionHint и
 * имеют приоритет над шаблонной логикой исполнителя.
 */

import type { AIEditDecision } from "../ai/aiService";
import type { DirectorPlan, PlanPhase, PlannedScene } from "./directorPlan";
import type { DirectorScene, DirectorScript } from "./engine";
import { FAST_GENRES } from "./genres";

const PHASE_TO_SCENE: Record<PlanPhase, DirectorScene["phase"]> = {
  teaser: "hook",
  hook: "hook",
  setup: "buildup",
  buildup: "buildup",
  preClimax: "buildup",
  climax: "climax",
  outro: "outro",
};

/** План → классический DirectorScript (совместимость со старым интерфейсом). */
export function planToScript(plan: DirectorPlan): DirectorScript {
  const scenes: DirectorScene[] = plan.scenes.map((s) => ({
    id: s.id,
    phase: PHASE_TO_SCENE[s.phase],
    intent: s.intent,
    duration: s.duration,
    emotion: s.emotion,
    mainClip: {
      assetId: s.source.assetId,
      sourceStart: s.source.start,
      sourceEnd: s.source.end,
      speed: s.source.speed,
      zoom: s.source.zoom,
      cameraAngle: s.source.cameraAngle,
    },
    bRolls: s.bRolls.map((b) => ({
      assetId: b.assetId,
      sourceStart: b.sourceStart,
      sourceEnd: b.sourceEnd,
      offsetInScene: b.offsetInScene,
      presentation: b.presentation,
    })),
    captions: s.captions.map((c) => ({
      text: c.text,
      offsetInScene: c.offsetInScene,
      duration: c.duration,
      animation: c.animation,
    })),
  }));

  return {
    concept: plan.concept,
    genre: plan.genre,
    targetDuration: plan.targetDuration,
    scenes,
    audioStrategy: {
      musicStyle: plan.music.style,
      duckingEnabled: plan.music.ducking,
      denoiseSpeech: plan.music.narration,
      removeSilence: plan.music.narration,
      muteOriginalAudio: !plan.music.narration,
    },
  };
}

/** План → AIEditDecision для монтажного движка (autoEdit). */
export function planToDecision(plan: DirectorPlan): AIEditDecision {
  const clips: AIEditDecision["clips"] = [];
  const textOverlays: NonNullable<AIEditDecision["textOverlays"]> = [];
  let currentTimelineTime = 0;

  for (const scene of plan.scenes) {
    const speed = scene.source.speed || 1;
    // Плановая длительность — таймлайн-секунды; окно исходника = dur × speed.
    // Исполнитель пересчитает из source-окна сам — значения обязаны совпасть.
    const sceneDuration = (scene.source.end - scene.source.start) / speed;
    const phaseTag = PHASE_TO_SCENE[scene.phase].toUpperCase();

    clips.push({
      assetId: scene.source.assetId,
      trackType: "main",
      duration: sceneDuration,
      startTime: scene.source.start,
      endTime: scene.source.end,
      speed,
      zoom: scene.source.zoom,
      cameraAngle: scene.source.cameraAngle,
      emotion: scene.emotion,
      reason: `[${phaseTag}] ${scene.intent}`,
      importance: scene.phase === "hook" || scene.phase === "climax" ? 0.9 : 0.6,
      transitionHint: scene.transitionIn
        ? { type: scene.transitionIn.type, duration: scene.transitionIn.duration, reason: scene.transitionIn.reason }
        : undefined,
    });

    for (const b of scene.bRolls) {
      // J-CUT для полноэкранных перебивок: перебивка заходит на долю секунды
      // РАНЬШЕ стыка — картинка «опережает» монтажный план, глаз скользит по
      // движению, а не спотыкается о границу. Для PiP оставляем L-cut (перебивка
      // чуть позади речи — не перекрывает спикера в момент мысли).
      const offset =
        b.presentation === "fullscreen" && (b.offsetInScene ?? 0) >= 0
          ? Math.max(-0.4, b.offsetInScene - 0.45)
          : b.offsetInScene;
      clips.push({
        assetId: b.assetId,
        trackType: "b-roll",
        duration: b.sourceEnd - b.sourceStart,
        startTime: b.sourceStart,
        endTime: b.sourceEnd,
        timeInTimeline: Math.max(0, currentTimelineTime + offset),
        presentation: b.presentation,
        reason: `B-Roll overlay · ${b.reason}`,
        importance: 0.5,
      });
    }

    for (const c of scene.captions) {
      textOverlays.push({
        text: c.text,
        time: currentTimelineTime + c.offsetInScene,
        duration: c.duration,
        animation: c.animation,
      });
    }

    currentTimelineTime += sceneDuration;
  }

  return {
    contentType: plan.genre as AIEditDecision["contentType"],
    targetDuration: plan.targetDuration,
    pace: plan.pace,
    colorGrade: plan.colorGrade,
    clips,
    musicSync: true,
    transitions: FAST_GENRES.has(plan.genre) ? "cut" : "crossfade",
    textOverlays,
    audioEnhancements: {
      normalize: true,
      denoise: plan.music.narration,
      voiceEnhance: plan.music.narration,
      removeSilence: plan.music.narration,
      ducking: plan.music.ducking,
      muteOriginalAudio: !plan.music.narration,
    },
    suggestions: [plan.concept, ...plan.directorNotes.slice(0, 3)],
    analysisQuality: "ai",
  };
}

/** Короткая сводка плана для UI/логов. */
export function summarizePlan(plan: DirectorPlan): string {
  const scenes = plan.scenes.length;
  const brolls = plan.scenes.reduce((a: number, s: PlannedScene) => a + s.bRolls.length, 0);
  const phases = plan.dramaturgy.map((d) => d.phase).join("→");
  return `${plan.kind} · ${plan.genre} · сцен ${scenes} · перебивок ${brolls} · арка ${phases} · кульминация ${plan.climaxAt.toFixed(1)}с`;
}
