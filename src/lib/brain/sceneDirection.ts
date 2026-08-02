/**
 * SCENE DIRECTION — режиссёрская карточка каждой сцены.
 *
 * AI Director больше не заканчивает работу на сценарии: для КАЖДОЙ сцены он
 * формулирует полный постановочный пакет, который монтажный движок исполняет
 * буквально:
 *
 *   цель · эмоция · длительность · темп · тип перехода ·
 *   рекомендуемый B-Roll · музыка · цветовое настроение
 *
 * Здесь живут решения о ЦЕЛИ, ТЕМПЕ, МУЗЫКЕ и ЦВЕТЕ. Переходы проектирует
 * designTransition (aiDirector), B-Roll — brollDirection; вместе они дают
 * полностью описанную сцену.
 *
 * Модуль чистый и детерминированный: те же входы → та же постановка.
 */

import type { PlanEmotion, PlanPhase, ScenePace, SceneColorMood, SceneMusicDirective } from "./directorPlan";

// ---------------------------------------------------------------------------
// ЦЕЛЬ СЦЕНЫ
// ---------------------------------------------------------------------------

/** Драматургическая цель фазы — что эта сцена ОБЯЗАНА сделать со зрителем. */
const PHASE_GOALS: Record<PlanPhase, string> = {
  teaser: "Пообещать зрителю развязку — дать повод досмотреть",
  hook: "Остановить скролл за первую секунду",
  setup: "Дать контекст: зритель понимает, что и зачем смотрит",
  buildup: "Вести историю вперёд и наращивать напряжение",
  preClimax: "Взвести пружину перед главным моментом",
  climax: "Дать главный удар ролика — обещание выполнено",
  resolution: "Договорить историю на спаде напряжения",
  outro: "Отпустить эмоцию и поставить точку",
};

/**
 * Цель сцены с учётом её роли в монтаже.
 * `intent` уточняет фазу: Pattern Interrupt внутри buildup имеет свою задачу.
 */
export function sceneGoal(phase: PlanPhase, intent: string, isNarrative: boolean): string {
  const i = intent.toLowerCase();
  if (i.includes("pattern interrupt")) return "Взломать монотонность и вернуть внимание";
  if (i.includes("double-hit")) return "Продлить пик — удержать зрителя на максимуме";
  if (i.includes("пауза") || i.includes("reaction")) return "Дать зрителю переварить мысль";
  if (i.includes("establishing") || i.includes("context")) return PHASE_GOALS.setup;
  if (i.includes("payoff")) return "Выдать обещанное — главная мысль ролика";
  if (i.includes("cold open")) return PHASE_GOALS.hook;
  if (phase === "buildup" && isNarrative) return "Развить мысль и удержать линию рассуждения";
  return PHASE_GOALS[phase];
}

// ---------------------------------------------------------------------------
// ТЕМП СЦЕНЫ
// ---------------------------------------------------------------------------

/**
 * Темп сцены выводится из её ДЛИТЕЛЬНОСТИ и положения в арке, а не назначается
 * из воздуха: короткая сцена на подходе к кульминации — это frantic, длинный
 * establishing — slow. Так темп в плане всегда согласован с реальным монтажом.
 */
export function scenePace(
  durationSec: number,
  phase: PlanPhase,
  genrePace: "slow" | "medium" | "fast" | "dynamic",
): ScenePace {
  // Базовые пороги подстраиваются под жанр: в кино 3с — быстро, в TikTok — вечность.
  const scale = genrePace === "slow" ? 1.5 : genrePace === "fast" || genrePace === "dynamic" ? 0.7 : 1;
  const d = durationSec / scale;
  if (phase === "teaser") return "frantic";
  if (d <= 1.0) return "frantic";
  if (d <= 2.2) return "fast";
  if (d <= 4.0) return "medium";
  return "slow";
}

export const PACE_LABELS: Record<ScenePace, string> = {
  slow: "медленный",
  medium: "средний",
  fast: "быстрый",
  frantic: "рваный",
};

// ---------------------------------------------------------------------------
// ЦВЕТОВОЕ НАСТРОЕНИЕ
// ---------------------------------------------------------------------------

interface MoodSpec {
  mood: string;
  saturation: number;
  contrast: number;
  temperature: number;
  brightness: number;
  reason: string;
}

/**
 * Цветовая драматургия: ролик «дышит» цветом вместе с историей.
 * Хук — сочный и контрастный (взгляд цепляется), нарастание уходит в холод
 * (напряжение), кульминация — тёплая и плотная (эмоциональный пик), выдох —
 * мягкий и обесцвеченный (успокоение). Это классическая схема цветового
 * сценария (color script) из анимационной индустрии.
 */
const PHASE_MOOD: Record<PlanPhase, MoodSpec> = {
  teaser: {
    mood: "ударный",
    saturation: 0.08,
    contrast: 0.05,
    temperature: 0.05,
    brightness: 0,
    reason: "тизер должен бить по глазам — насыщенность и контраст выше нормы",
  },
  hook: {
    mood: "сочный",
    saturation: 0.05,
    contrast: 0.04,
    temperature: 0.02,
    brightness: 0,
    reason: "первый кадр самый заметный — цвет работает на остановку скролла",
  },
  setup: {
    mood: "нейтральный",
    saturation: -0.02,
    contrast: -0.02,
    temperature: -0.05,
    brightness: 0,
    reason: "контекст подаётся спокойно — цвет не спорит с информацией",
  },
  buildup: {
    mood: "холодное напряжение",
    saturation: 0.01,
    contrast: 0.03,
    temperature: -0.07,
    brightness: 0,
    reason: "холодный сдвиг создаёт подспудное напряжение перед пиком",
  },
  preClimax: {
    mood: "сжатие",
    saturation: 0.04,
    contrast: 0.06,
    temperature: -0.04,
    brightness: -0.01,
    reason: "картинка уплотняется — зритель физически чувствует приближение удара",
  },
  climax: {
    mood: "тёплый пик",
    saturation: 0.11,
    contrast: 0.09,
    temperature: 0.13,
    brightness: 0.01,
    reason: "кульминация — самый тёплый и плотный кадр ролика, эмоциональный максимум",
  },
  resolution: {
    mood: "остывание",
    saturation: 0.02,
    contrast: 0.01,
    temperature: 0.02,
    brightness: 0.005,
    reason: "после пика картинка постепенно остывает — напряжение спадает, но история ещё идёт",
  },
  outro: {
    mood: "выдох",
    saturation: -0.07,
    contrast: -0.03,
    temperature: -0.07,
    brightness: 0.02,
    reason: "мягкая обесцвеченная финальная нота — эмоция отпускается",
  },
};

/** Эмоция сцены дополнительно подкрашивает кадр поверх фазового грейда. */
const EMOTION_TINT: Partial<Record<PlanEmotion, { saturation: number; contrast: number; temperature: number; label: string }>> = {
  dramatic: { saturation: -0.02, contrast: 0.05, temperature: -0.02, label: "драматичный" },
  energetic: { saturation: 0.04, contrast: 0.03, temperature: 0.02, label: "энергичный" },
  calm: { saturation: -0.03, contrast: -0.02, temperature: 0.01, label: "спокойный" },
  inspiring: { saturation: 0.03, contrast: 0.02, temperature: 0.05, label: "вдохновляющий" },
  funny: { saturation: 0.05, contrast: 0.02, temperature: 0.03, label: "лёгкий" },
};

export function sceneColorMood(
  phase: PlanPhase,
  emotion: PlanEmotion,
  genrePace: "slow" | "medium" | "fast" | "dynamic",
): SceneColorMood {
  const base = PHASE_MOOD[phase];
  const tint = EMOTION_TINT[emotion];
  // Быстрые жанры терпят более агрессивный грейд, кино — сдержанный.
  const strength = genrePace === "fast" || genrePace === "dynamic" ? 1.1 : genrePace === "slow" ? 0.85 : 1;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    mood: tint ? `${base.mood} · ${tint.label}` : base.mood,
    saturation: r3((base.saturation + (tint?.saturation ?? 0)) * strength),
    contrast: r3((base.contrast + (tint?.contrast ?? 0)) * strength),
    temperature: r3((base.temperature + (tint?.temperature ?? 0)) * strength),
    brightness: r3(base.brightness * strength),
    reason: base.reason,
  };
}

// ---------------------------------------------------------------------------
// МУЗЫКА В СЦЕНЕ
// ---------------------------------------------------------------------------

/**
 * Пофазная работа с музыкой.
 *
 * В нарративе музыка обязана уступать голосу (duck), но на хуке и кульминации
 * она поднимается — иначе эмоциональный пик звучит плоско. В визуальном ролике
 * музыка ведёт: она и есть драматургия, поэтому уровень выше, а на кульминации
 * ставится акцент (удар/райзер).
 */
export function sceneMusic(
  phase: PlanPhase,
  isNarrative: boolean,
  baseLevel: number,
  opts: { isPause?: boolean; isClimax?: boolean } = {},
): SceneMusicDirective {
  const clamp = (v: number) => Math.max(0, Math.min(1, Math.round(v * 100) / 100));

  if (opts.isPause) {
    // Драматическая пауза: музыка выходит вперёд и держит воздух — тишина
    // без музыки читается как технический обрыв.
    return {
      level: clamp(baseLevel * 1.6),
      role: "support",
      ducking: false,
      accent: false,
      reason: "пауза в речи: музыка выходит вперёд и держит момент, чтобы тишина не звучала обрывом",
    };
  }

  if (isNarrative) {
    switch (phase) {
      case "teaser":
      case "hook":
        return {
          level: clamp(baseLevel * 1.5),
          role: "support",
          ducking: true,
          accent: true,
          reason: "хук: музыка чуть громче обычного — задаёт энергию с первой секунды",
        };
      case "climax":
        return {
          level: clamp(baseLevel * 1.35),
          role: "support",
          ducking: true,
          accent: true,
          reason: "кульминация: музыка приподнята под главной мыслью и подпёрта акцентом",
        };
      case "outro":
        return {
          level: clamp(baseLevel * 1.25),
          role: "lead",
          ducking: false,
          accent: false,
          reason: "финал: музыка забирает эфир и уводит ролик в точку",
        };
      default:
        return {
          level: clamp(baseLevel),
          role: "duck",
          ducking: true,
          accent: false,
          reason: "речь ведёт — музыка уходит под голос (ducking)",
        };
    }
  }

  // Визуальный ролик: музыка — полноправный саундтрек.
  switch (phase) {
    case "teaser":
    case "hook":
      return {
        level: clamp(baseLevel * 1.05),
        role: "lead",
        ducking: false,
        accent: true,
        reason: "визуальный хук: музыка вступает на полную, вход синхронен с кадром",
      };
    case "setup":
      return {
        level: clamp(baseLevel * 0.85),
        role: "support",
        ducking: false,
        accent: false,
        reason: "контекст: музыка чуть отступает, чтобы кадр читался",
      };
    case "climax":
      return {
        level: clamp(baseLevel * 1.15),
        role: "lead",
        ducking: false,
        accent: true,
        reason: "кульминация на дропе: музыка на максимуме, удар совпадает с кадром",
      };
    case "outro":
      return {
        level: clamp(baseLevel * 0.9),
        role: "lead",
        ducking: false,
        accent: false,
        reason: "выдох: саундтрек мягко уходит вниз вместе с картинкой",
      };
    default:
      return {
        level: clamp(baseLevel),
        role: "lead",
        ducking: false,
        accent: opts.isClimax === true,
        reason: "нарастание: музыка держит темп монтажа",
      };
  }
}

// ---------------------------------------------------------------------------
// Человекочитаемая карточка сцены (журнал / UI)
// ---------------------------------------------------------------------------

export function describeScene(scene: {
  goal: string;
  emotion: PlanEmotion;
  duration: number;
  pace: ScenePace;
  transitionIn?: { type: string };
  colorMood: SceneColorMood;
  music: SceneMusicDirective;
  brollRecommendations: Array<{ subject: string }>;
}): string {
  const broll = scene.brollRecommendations.length
    ? scene.brollRecommendations.map((b) => b.subject).join(", ")
    : "не требуется";
  return (
    `цель: ${scene.goal} · эмоция: ${scene.emotion} · ${scene.duration.toFixed(1)}с · ` +
    `темп: ${PACE_LABELS[scene.pace]} · переход: ${scene.transitionIn?.type ?? "cut"} · ` +
    `B-Roll: ${broll} · музыка: ${scene.music.role} ${(scene.music.level * 100).toFixed(0)}% · ` +
    `цвет: ${scene.colorMood.mood}`
  );
}
