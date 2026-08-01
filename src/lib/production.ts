import type { MediaAsset } from "./types";

/**
 * First-class pre-production document. It intentionally stays independent from
 * timeline clips: a creative decision can exist before there is any footage.
 */
export type ProductionPlatform = "short-form" | "youtube" | "brand" | "presentation" | "film";

export interface ProductionScene {
  id: string;
  phase: "hook" | "problem" | "solution" | "proof" | "cta";
  title: string;
  purpose: string;
  durationSec: number;
  narration: string;
  visualDirection: string;
  shots: string[];
  soundDirection: string;
  editNote: string;
}

export interface ProductionPlan {
  version: 1;
  createdAt: number;
  updatedAt: number;
  status: "draft" | "approved";
  idea: string;
  workingTitle: string;
  objective: string;
  audience: string;
  platform: ProductionPlatform;
  aspectRatio: "9:16" | "16:9" | "1:1";
  targetDurationSec: number;
  tone: string;
  keyMessage: string;
  callToAction: string;
  deliverables: string[];
  scenes: ProductionScene[];
  productionNotes: string[];
  sourceSummary: { video: number; image: number; audio: number; totalDurationSec: number };
}

export interface ProductionPlanInput {
  idea: string;
  templateId?: string;
  assets?: Pick<MediaAsset, "kind" | "duration">[];
}

/**
 * Production brief — what a client tells a real director before shooting starts.
 * The AI Director workspace collects exactly these fields from the user.
 */
export interface DirectorBrief {
  idea: string;
  goal: string;
  audience: string;
  platform: string;
  duration: string;
  style: string;
  mood: string;
  tempo: string;
  references: string;
  keyMessage: string;
  callToAction: string;
}

/** Every section a director produces for a fully prepped project. */
export interface DirectorSections {
  logline?: string;
  script?: string;
  concept?: string;
  structure?: string;
  hook?: string;
  drama?: string;
  storyboard?: string;
  shotlist?: string;
  shooting?: string;
  music?: string;
  color?: string;
  edit?: string;
  titles?: string;
  transitions?: string;
}

/** Persisted result of the AI Director session on a Project. */
export interface DirectorOutput {
  version: 1;
  generatedAt: number;
  status: "draft" | "approved";
  brief: DirectorBrief;
  sections: DirectorSections;
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const clip = (value: string, length: number) => (clean(value).length > length ? `${clean(value).slice(0, length - 1).trim()}…` : clean(value));

function detectPlatform(text: string, templateId?: string): ProductionPlatform {
  const value = `${text} ${templateId ?? ""}`.toLowerCase();
  if (/short|reel|tiktok|тик.?ток|вертик|сторис/.test(value)) return "short-form";
  if (/youtube|ютуб|vlog|влог|podcast|подкаст/.test(value)) return "youtube";
  if (/presentation|презентац|обучени|tutorial|курс/.test(value)) return "presentation";
  if (/film|cinematic|кино|документ/.test(value)) return "film";
  return "brand";
}

function platformSettings(platform: ProductionPlatform) {
  switch (platform) {
    case "short-form": return { aspectRatio: "9:16" as const, duration: 30, deliverables: ["Master 9:16 · 1080×1920", "Cover frame", "SRT captions"] };
    case "youtube": return { aspectRatio: "16:9" as const, duration: 90, deliverables: ["Master 16:9 · 1920×1080", "Thumbnail frame", "SRT captions"] };
    case "presentation": return { aspectRatio: "16:9" as const, duration: 60, deliverables: ["Master 16:9 · 1920×1080", "Presenter-safe version", "SRT captions"] };
    case "film": return { aspectRatio: "16:9" as const, duration: 90, deliverables: ["Master 16:9 · 1920×1080", "Clean master", "Mix reference"] };
    default: return { aspectRatio: "16:9" as const, duration: 45, deliverables: ["Master 16:9 · 1920×1080", "Social cutdown", "Caption file"] };
  }
}

/** Deterministic, offline-first creative brief so planning works without an API key. */
export function createProductionPlan({ idea, templateId, assets = [] }: ProductionPlanInput): ProductionPlan {
  const prompt = clean(idea) || "Новая история, которую нужно превратить в ясное и выразительное видео";
  const platform = detectPlatform(prompt, templateId);
  const settings = platformSettings(platform);
  const hasAudio = assets.some((asset) => asset.kind === "audio");
  const totalDurationSec = Math.round(assets.reduce((sum, asset) => sum + (asset.duration || 0), 0));
  const title = clip(prompt.replace(/[.!?].*$/, ""), 58) || "Новый production-проект";
  const sceneDurations = platform === "short-form" ? [4, 7, 10, 5, 4] : [8, 14, 22, 18, 8];
  const scenes: ProductionScene[] = [
    { id: "hook", phase: "hook", title: "Hook", purpose: "Остановить внимание и сразу обозначить ставку.", durationSec: sceneDurations[0], narration: `Начните с самого сильного обещания: «${clip(prompt, 90)}».`, visualDirection: "Самый выразительный крупный или динамичный кадр; читаемый заголовок в первые 1–2 секунды.", shots: ["Hero close-up / action", "Кинетический титр с ключевым словом"], soundDirection: "Акцент или музыкальный downbeat в первом кадре.", editNote: "Жёсткий вход, без вступительной паузы." },
    { id: "problem", phase: "problem", title: "Контекст", purpose: "Дать зрителю причину продолжить просмотр.", durationSec: sceneDurations[1], narration: "Коротко покажите ситуацию, конфликт или вопрос, который решает история.", visualDirection: "Чередование говорящей головы и контекстного B-roll.", shots: ["Establishing shot", "Деталь, подтверждающая контекст"], soundDirection: "Сохраняйте разборчивость речи; музыка ниже голоса.", editNote: "Меняйте план по смыслу, а не механически." },
    { id: "solution", phase: "solution", title: "Развитие", purpose: "Раскрыть процесс, решение или трансформацию.", durationSec: sceneDurations[2], narration: "Проведите зрителя через ключевые шаги и покажите, что меняется.", visualDirection: "Демонстрация процесса, screen inserts или B-roll с движением.", shots: ["Medium action shot", "Insert / UI / предметная деталь", "Реакция или результат"], soundDirection: "Наращивайте музыкальную энергию к финалу блока.", editNote: "Используйте J/L-cuts и подписи только для опорных мыслей." },
    { id: "proof", phase: "proof", title: "Доказательство", purpose: "Сделать обещание конкретным и заслуживающим доверия.", durationSec: sceneDurations[3], narration: "Добавьте результат, цифру, отзыв или наглядное сравнение до/после.", visualDirection: "Чистый кадр результата; графика поддерживает, а не заменяет доказательство.", shots: ["Result hero", "Detail / proof insert"], soundDirection: "Короткий подъём и акцент на факте.", editNote: "Оставьте зрителю время прочитать ключевую цифру." },
    { id: "cta", phase: "cta", title: "Финал и CTA", purpose: "Закрыть историю одним понятным следующим действием.", durationSec: sceneDurations[4], narration: "Сформулируйте одно действие: подписаться, узнать больше, оставить заявку или сохранить ролик.", visualDirection: "Брендовый финальный кадр или уверенный портрет; CTA в safe area.", shots: ["End card", "Логотип / адрес / QR при необходимости"], soundDirection: "Музыкальная точка или мягкий tail.", editNote: "Не перегружайте финал несколькими призывами." },
  ];
  return {
    version: 1, createdAt: Date.now(), updatedAt: Date.now(), status: "draft", idea: prompt, workingTitle: title,
    objective: "Создать понятный, эмоционально собранный ролик с одним главным сообщением.",
    audience: "Зритель, которому важны быстрый контекст, ясная польза и визуальное доказательство.", platform, aspectRatio: settings.aspectRatio, targetDurationSec: settings.duration,
    tone: platform === "film" ? "кинематографичный и наблюдательный" : platform === "short-form" ? "энергичный и прямой" : "уверенный, человеческий и современный",
    keyMessage: clip(prompt, 140), callToAction: platform === "short-form" ? "Сохраните ролик и перейдите к следующему шагу." : "Узнайте больше и сделайте следующий шаг.",
    deliverables: settings.deliverables, scenes,
    productionNotes: ["План создан локально и может быть отредактирован до монтажа.", hasAudio ? "В исходниках есть аудио: запланируйте чистку речи и ducking музыки." : "Добавьте музыку или voice-over на этапе звукового дизайна.", totalDurationSec ? `Доступно примерно ${totalDurationSec} сек. исходных материалов.` : "Исходники ещё не добавлены — shot list служит съёмочным ориентиром."],
    sourceSummary: { video: assets.filter((a) => a.kind === "video").length, image: assets.filter((a) => a.kind === "image").length, audio: assets.filter((a) => a.kind === "audio").length, totalDurationSec },
  };
}

/** Build an enriched, downstream-ready ProductionPlan from a full DirectorBrief. */
export function planFromDirector(brief: DirectorBrief, assets: Pick<MediaAsset, "kind" | "duration">[] = []): ProductionPlan {
  const base = createProductionPlan({ idea: brief.idea, assets });
  const durationNum = parseInt(brief.duration, 10) || base.targetDurationSec;
  const platform: ProductionPlatform = /tik.?tok|reel|short|vertical|вертик|сторис|shorts/i.test(brief.platform)
    ? "short-form"
    : /youtube|ютуб|video/i.test(brief.platform)
      ? "youtube"
      : /film|кино|документ/i.test(brief.platform)
        ? "film"
        : /present|презент|обуч|курс|training/i.test(brief.platform)
          ? "presentation"
          : base.platform;
  const settings = platformSettings(platform);
  return {
    ...base,
    status: "approved",
    workingTitle: brief.idea ? clip(brief.idea.replace(/[.!?].*$/, ""), 58) || "Новый production-проект" : base.workingTitle,
    objective: brief.goal || base.objective,
    audience: brief.audience || base.audience,
    platform,
    aspectRatio: settings.aspectRatio,
    targetDurationSec: durationNum,
    tone: [brief.mood, brief.style].filter(Boolean).join(", ") || base.tone,
    keyMessage: brief.keyMessage || base.keyMessage,
    callToAction: brief.callToAction || base.callToAction,
    deliverables: settings.deliverables,
    productionNotes: [
      "План утверждён в AI Director и передан монтажному движку.",
      ...(brief.references ? [`Референсы: ${brief.references}`] : []),
    ],
  };
}
