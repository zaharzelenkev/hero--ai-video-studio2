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
  /** Локация действия — собирается в диалоговом режиме AI Director. */
  location?: string;
  /** Наличие материалов (уже есть съёмка / сниму сам / стоки и т.п.). */
  materials?: string;
}

/**
 * ===== Полноценная Препродакшн-документация (12 этапов) =====
 * Каждый раздел — это объект со структурированными полями, а не просто строка.
 * Это позволяет редактировать, связывать между собой и передавать монтажному движку.
 */

export interface IdeaVariant {
  id: string;
  title: string;
  concept: string;
  audience: string;
  hook: string;
  potential: number; // 1–10
  reasoning: string;
}

export interface IdeaSection {
  refined: string;
  audience: string;
  potential: number;
  pros: string[];
  cons: string[];
  variants: IdeaVariant[];
}

export interface LoglineVariant {
  id: string;
  text: string;
  strengths: string[];
  weaknesses: string[];
}

export interface LoglineSection {
  primary: string;
  variants: LoglineVariant[];
  hero: string;
  goal: string;
  conflict: string;
  stakes: string;
}

export interface TreatmentSection {
  title: string;
  logline: string;
  genre: string;
  tone: string;
  themes: string[];
  synopsisLong: string;
  act1: string;
  act2: string;
  act3: string;
  characters: Array<{ name: string; role: string; description: string }>;
  keyMoments: string[];
  ending: string;
}

export interface ScriptScene {
  id: string;
  number: number;
  heading: string; // INT./EXT. ЛОКАЦИЯ — ВРЕМЯ
  location: string;
  timeOfDay: string;
  action: string;
  dialogue: Array<{ character: string; line: string; direction?: string }>;
  durationSec: number;
  notes?: string;
}

export interface ScriptSection {
  concept: string;
  synopsis: string;
  scenes: ScriptScene[];
  finalText: string;
}

export interface VisionShot {
  goal: string;
  emotion: string;
  composition: string;
  cameraMovement: string;
  duration: string;
  transition: string;
  pacing: string;
  sound: string;
  atmosphere: string;
  lighting: string;
  colorPalette: string[];
  vfx: string;
  dpNotes: string;
}

export interface VisionSection {
  overallStyle: string;
  visualLanguage: string;
  referenceFilms: string[];
  scenes: Array<{ sceneId: string; sceneTitle: string; shot: VisionShot }>;
}

export interface StoryboardFrame {
  id: string;
  number: number;
  sceneId?: string;
  description: string;
  composition: string;
  cameraMovement: string;
  objectPlacement: string;
  lighting: string;
  color: string;
  shotSize: string; // ECU, CU, MS, WS, ELS...
  mood: string;
  imageDataUrl?: string; // локальная SVG-зарисовка или сгенерированное изображение
  imagePrompt?: string;
  notes?: string;
}

export interface StoryboardSection {
  aspectRatio: string;
  style: string;
  frames: StoryboardFrame[];
}

export interface ShotItem {
  number: number;
  description: string;
  shotType: string;
  camera: string;
  lens: string;
  movement: string;
  equipment: string[];
  props: string[];
  duration: string;
  priority: "low" | "medium" | "high" | "critical";
  location: string;
  notes?: string;
}

export interface ShotlistSection {
  totalShots: number;
  estimatedTime: string;
  shots: ShotItem[];
}

export interface ShootingDay {
  day: number;
  date?: string;
  location: string;
  scenes: string[];
  shots: number[];
  callTime: string;
  wrapTime: string;
  notes: string[];
}

export interface Checklist {
  id: string;
  category: string;
  items: Array<{ text: string; done: boolean }>;
}

export interface CastMember {
  id: string;
  role: string;
  name?: string;
  description: string;
  look: string;
  notes?: string;
  photoDataUrl?: string;
  suitability?: number; // AI-оценка 0–100 (локальный анализ)
  analysis?: string;
}

export interface LocationItem {
  id: string;
  name: string;
  description: string;
  mood: string;
  lighting: string;
  pros: string[];
  cons: string[];
  suitable: boolean;
  photoDataUrl?: string;
  analysis?: string;
  score?: number; // 0–100
}

export interface PlanningSection {
  schedule: ShootingDay[];
  sceneOrder: string[];
  checklists: Checklist[];
  props: string[];
  equipment: string[];
  cast: CastMember[];
  locations: LocationItem[];
  directorNotes: string[];
  teamTasks: Array<{ assignee: string; task: string; dueBy: string; done: boolean }>;
}

export interface RiskItem {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "сценарий" | "съёмка" | "кастинг" | "локация" | "техника" | "время" | "бюджет" | "другое";
  description: string;
  mitigation: string;
  relatedSection?: string;
}

export interface RisksSection {
  readiness: number; // 0–100
  missingItems: string[];
  weakScenes: Array<{ sceneId: string; reason: string }>;
  risks: RiskItem[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "director";
  text: string;
  at: number;
}

/** Legacy flat string sections — kept for backward compatibility with the editor */
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

/**
 * Новый расширенный формат — всё препродакшн-ядро.
 * Содержит как структурированные 12 блоков, так и плоские строки
 * для обратной совместимости с монтажным движком.
 */
export interface PreProduction {
  version: 2;
  updatedAt: number;
  activeStage: PreprodStage;
  idea: IdeaSection;
  logline: LoglineSection;
  treatment: TreatmentSection;
  script: ScriptSection;
  vision: VisionSection;
  storyboard: StoryboardSection;
  shotlist: ShotlistSection;
  planning: PlanningSection;
  casting: CastMember[];
  locations: LocationItem[];
  risks: RisksSection;
  chat: ChatMessage[];
}

export type PreprodStage =
  | "idea"
  | "logline"
  | "treatment"
  | "script"
  | "vision"
  | "storyboard"
  | "shotlist"
  | "planning"
  | "casting"
  | "locations"
  | "risks"
  | "chat";

export const PREPROD_STAGES: Array<{ id: PreprodStage; label: string; icon: string; short: string }> = [
  { id: "idea",       label: "Idea",                  icon: "💡", short: "Замысел" },
  { id: "logline",    label: "Logline",               icon: "🎯", short: "Логлайн" },
  { id: "treatment",  label: "Treatment",             icon: "📖", short: "Тритмент" },
  { id: "script",     label: "Script",                icon: "📜", short: "Сценарий" },
  { id: "vision",     label: "Director's Vision",     icon: "🎬", short: "Видение" },
  { id: "storyboard", label: "Storyboard",            icon: "🖼",  short: "Раскадровка" },
  { id: "shotlist",   label: "Shot List",             icon: "📋", short: "Шот-лист" },
  { id: "planning",   label: "Production Planning",   icon: "🗓",  short: "План съёмок" },
  { id: "casting",    label: "Casting",               icon: "🎭", short: "Кастинг" },
  { id: "locations",  label: "Locations",             icon: "📍", short: "Локации" },
  { id: "risks",      label: "Production Risks",      icon: "⚠️", short: "Риски" },
  { id: "chat",       label: "AI Director Chat",      icon: "💬", short: "Режиссёр" },
];

/** Persisted result of the AI Director session on a Project. */
export interface DirectorOutput {
  version: 2;
  generatedAt: number;
  updatedAt: number;
  status: "draft" | "approved";
  brief: DirectorBrief;
  sections: DirectorSections; // legacy flat strings
  preprod?: PreProduction;     // new structured pre-prod
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const clip = (value: string, length: number) => (clean(value).length > length ? `${clean(value).slice(0, length - 1).trim()}…` : clean(value));

function detectPlatform(text: string, templateId?: string): ProductionPlatform {
  const value = `${text} ${templateId ?? ""}`.toLowerCase();
  if (/short|reel|tiktok|тик.?ток|вертик|сторис|shorts/.test(value)) return "short-form";
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
  const prompt = clean(idea) || "Новое видео";
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

/**
 * Создаёт пустую структуру PreProduction для заполнения по стадиям.
 */
export function emptyPreProduction(): PreProduction {
  return {
    version: 2,
    updatedAt: Date.now(),
    activeStage: "idea",
    idea: {
      refined: "",
      audience: "",
      potential: 5,
      pros: [],
      cons: [],
      variants: [],
    },
    logline: {
      primary: "",
      variants: [],
      hero: "",
      goal: "",
      conflict: "",
      stakes: "",
    },
    treatment: {
      title: "",
      logline: "",
      genre: "",
      tone: "",
      themes: [],
      synopsisLong: "",
      act1: "",
      act2: "",
      act3: "",
      characters: [],
      keyMoments: [],
      ending: "",
    },
    script: {
      concept: "",
      synopsis: "",
      scenes: [],
      finalText: "",
    },
    vision: {
      overallStyle: "",
      visualLanguage: "",
      referenceFilms: [],
      scenes: [],
    },
    storyboard: {
      aspectRatio: "16:9",
      style: "",
      frames: [],
    },
    shotlist: {
      totalShots: 0,
      estimatedTime: "",
      shots: [],
    },
    planning: {
      schedule: [],
      sceneOrder: [],
      checklists: [],
      props: [],
      equipment: [],
      cast: [],
      locations: [],
      directorNotes: [],
      teamTasks: [],
    },
    casting: [],
    locations: [],
    risks: {
      readiness: 0,
      missingItems: [],
      weakScenes: [],
      risks: [],
    },
    chat: [],
  };
}

/**
 * Разворачивает структурированную PreProduction в плоский DirectorSections,
 * который ожидает существующий монтажный движок и редактор.
 */
export function flattenSections(p: PreProduction, brief: DirectorBrief): DirectorSections {
  const scriptText = p.script.finalText || p.script.scenes.map((s) => {
    const dialogues = s.dialogue.map((d) => `${d.character.toUpperCase()}: ${d.line}`).join("\n");
    return `${s.number}. ${s.heading}\n${s.action}${dialogues ? "\n" + dialogues : ""}`;
  }).join("\n\n");

  const storyboardText = p.storyboard.frames.map((f) =>
    `Кадр ${f.number} [${f.shotSize}] — ${f.description}\nКомпозиция: ${f.composition}\nКамера: ${f.cameraMovement}\nСвет: ${f.lighting}\nЦвет: ${f.color}\nНастроение: ${f.mood}`
  ).join("\n\n");

  const shotlistText = p.shotlist.shots.map((s) =>
    `#${s.number} | ${s.shotType} | ${s.camera} (${s.lens}) | ${s.movement} | ${s.duration}\n${s.description}\nОборудование: ${s.equipment.join(", ") || "—"}\nРеквизит: ${s.props.join(", ") || "—"}\nПриоритет: ${s.priority}`
  ).join("\n\n");

  return {
    logline: p.logline.primary,
    hook: p.script.scenes[0]?.action || brief.idea,
    script: scriptText,
    concept: p.vision.overallStyle + (p.treatment.tone ? "\nТон: " + p.treatment.tone : ""),
    structure: p.planning.schedule.map((d) => `День ${d.day} · ${d.location}: ${d.scenes.join(", ")}`).join("\n") ||
               p.script.scenes.map((s) => `Сцена ${s.number} · ${s.heading} — ~${s.durationSec} сек`).join("\n"),
    drama: p.treatment.synopsisLong,
    storyboard: storyboardText,
    shotlist: shotlistText,
    shooting: p.vision.scenes.map((v) => `${v.sceneTitle}: ${v.shot.dpNotes}`).join("\n\n"),
    music: p.vision.scenes.map((v) => `${v.sceneTitle}: ${v.shot.sound}`).join("\n\n"),
    color: p.vision.scenes.map((v) => `${v.sceneTitle}: ${v.shot.colorPalette.join(", ")}; свет: ${v.shot.lighting}`).join("\n\n"),
    edit: p.vision.scenes.map((v) => `${v.sceneTitle}: темп ${v.shot.pacing}; переход ${v.shot.transition}`).join("\n\n"),
    titles: "Ключевые мысли в 1/3 сверху в safe area; CTA в финальном кадре.",
    transitions: p.vision.scenes.map((v) => `${v.sceneTitle}: ${v.shot.transition}`).join("\n"),
  };
}
