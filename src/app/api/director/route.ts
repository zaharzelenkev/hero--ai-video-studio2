import { NextRequest, NextResponse } from "next/server";
import { flattenSections, PREPROD_STAGES } from "@/lib/production";
import type {
  DirectorBrief,
  DirectorSections,
  PreProduction,
} from "@/lib/production";
import {
  DIRECTOR_SYSTEM_PROMPT,
  DIRECTOR_VOICE_PROMPT,
  DIRECTOR_CHUNK_SYSTEM_PROMPT,
} from "@/lib/brain/directorSystemPrompt";
import { buildOfflinePreprod } from "@/lib/brain/offlinePreprod";
import { localDirectorReply } from "@/lib/brain/localDirector";
import { buildDirectorContext } from "@/lib/brain/directorContext";
import { callLLM } from "@/lib/ai/llmClient";
import { hasAIKey } from "@/config/ai";

export const runtime = "nodejs";
// Полная сборка всех 12 разделов может занимать несколько минут (с учётом
// ретраев и лимитов free-тира). 300с — максимум, который поддерживают все
// планы Vercel (Hobby и Pro); маршрут сам следит за этим бюджетом
// (FULL_RUN_DEADLINE_MS) и при его исходе ВОЗВРАЩАЕТ УЖЕ СОБРАННОЕ, а не
// падает с ошибкой: неудавшиеся разделы добираются из локального пакета,
// запуск помечается partial, пользователь всегда получает ответ
// (см. generateChunk + цикл ниже).
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Chunked full generation
//
// Полный пакет из 12 разделов НЕ помещается в один ответ LLM: он упирается в
// max_tokens (finish_reason="length"), JSON обрезается на середине, парсинг
// падает, и весь запуск возвращал 502 «не получил полный ответ». Один
// гигантский вызов также легко упирается в поминутные/дневные лимиты
// бесплатных моделей — и ретраи не помогают, пока не подождать окно
// Retry-After.
//
// Поэтому полная сборка разбита на 7 ПОСЛЕДОВАТЕЛЬНЫХ вызовов, каждый из
// которых:
//   • маленький (3500–9000 токенов) — не обрезается даже моделями с потолком
//     вывода 4096–8192 токенов (типично для free-моделей OpenRouter);
//   • возвращает валидный JSON своей группы разделов (json_object);
//   • проверяется отдельно (валидатор блока);
//   • ретраится сам по себе при обрезании/невалидности/сбое сети.
// Последующие блоки получают в контексте уже сгенерированные, поэтому пакет
// остаётся связным (сценарий → vision → шот-лист → риски).
//
// Правила, которые гарантируют, что запуск ВСЕГДА заканчивается ответом:
//   1. НИКАКИХ клиентских таймаутов у вызовов LLM (timeoutMs: 0) — модель
//      получает столько времени, сколько нужно (потолок — maxDuration).
//   2. Если блок всё-таки не получился (закончился общий бюджет времени,
//      провайдер молчит, лимиты не отпускают) — блок НЕ роняет весь запуск:
//      он добирается из локального базового пакета, а в ответе появляется
//      partial + warnings. Пользователь получает полный препродакшен, а не 502.
//   3. Повторный запуск после неудачи (resume=true) переиспользует блоки,
//      которые LLM УЖЕ сгенерировала в прошлый раз, и догоняет только
//      недостающие — так «Повторите запуск» занимает секунды, а не минуты.
// ---------------------------------------------------------------------------

// Общий бюджет времени на полный запуск. 265с = 300с (maxDuration на Vercel
// Hobby/Pro) минус запас ~35с на накладные расходы платформы и финализацию.
// Когда бюджет исчерпан, маршрут перестаёт дёргать LLM и собирает ответ из
// уже готового + локальных заготовок (никогда не 502).
// Управление: DIRECTOR_DEADLINE_MS (мс) или DIRECTOR_NO_DEADLINE=1 для
// self-hosted без потолка времени.
const DEFAULT_FULL_RUN_DEADLINE_MS = 265_000;
const ATTEMPT_FLOOR_MS = 25_000; // не начинаем попытку, если на неё не хватит времени

function fullRunDeadlineMs(): number {
  if (process.env.DIRECTOR_NO_DEADLINE === "1" || process.env.DIRECTOR_NO_DEADLINE === "true") {
    return Number.POSITIVE_INFINITY;
  }
  const configured = Number(process.env.DIRECTOR_DEADLINE_MS || 0);
  if (Number.isFinite(configured) && configured >= 60_000) return configured;
  return DEFAULT_FULL_RUN_DEADLINE_MS;
}

interface ChunkSpec {
  key: "core" | "script" | "vision" | "storyboard" | "shotlist" | "planning" | "wrap";
  label: string;
  /** top-level keys the chunk must produce */
  fields: string[];
  /** Russian schema of the chunk's fields, appended to the user message */
  schema: string;
  maxTokens: number;
  /** shape validation — chunk is accepted only if it returns true */
  validate: (d: any) => boolean;
}

/**
 * 7 блоков полной сборки. Каждый блок достаточно МАЛ, чтобы его целиком
 * выдала даже модель с потолком вывода ~4096 токенов (типичный лимит
 * free-моделей OpenRouter), и достаточно ВЕЛИК, чтобы не раздувать число
 * вызовов (дневной лимит free-тира ~50 запросов).
 */
const FULL_CHUNKS: ChunkSpec[] = [
  {
    key: "core",
    label: "идея / логлайн / тритмент",
    fields: ["idea", "logline", "treatment"],
    schema: `"idea": {
  "refined": "1-2 абзаца — уточнённая идея с драматургической дугой под ТЕМУ проекта",
  "audience": "портрет ЦА (возраст, боли, желания, триггеры)",
  "potential": 0-10 число (честная оценка потенциала идеи как есть),
  "pros": ["3-6 сильных сторон"],
  "cons": ["3-6 слабых мест, за которые режиссёр будет бороться"],
  "variants": [ровно 3 объекта: { "title": "", "concept": "", "audience": "", "hook": "", "potential": 0-10, "reasoning": "" }]
},
"logline": {
  "primary": "ГЕРОЙ + ЖЕЛАНИЕ + ПРЕПЯТСТВИЕ + СТАВКИ (одно предложение)",
  "variants": [ровно 3 объекта: { "text": "", "strengths": ["", ""], "weaknesses": [""] }],
  "hero": "", "goal": "", "conflict": "", "stakes": ""
},
"treatment": {
  "title": "рабочее название",
  "logline": "уточнённый логлайн",
  "genre": "жанр/формат",
  "tone": "тон",
  "themes": ["3-5 сквозных тем"],
  "synopsisLong": "2-4 абзаца, полная история от хука до финала",
  "act1": "экспозиция + хук (1-2 абзаца)",
  "act2": "развитие, конфликт, трансформация (1-3 абзаца)",
  "act3": "кульминация + развязка + CTA (1-2 абзаца)",
  "characters": [{ "name": "", "role": "", "description": "" }],
  "keyMoments": ["4-6 ключевых сцен/битов"],
  "ending": "послевкусие и что должен сделать зритель"
}`,
    maxTokens: 4500,
    validate: (d) =>
      Boolean(
        d?.idea && typeof d.idea === "object" && (d.idea.refined || d.idea.audience) &&
        d?.logline && typeof d.logline === "object" && (d.logline.primary || Array.isArray(d.logline.variants)) &&
        d?.treatment && typeof d.treatment === "object" && (d.treatment.synopsisLong || d.treatment.title)
      ),
  },
  {
    key: "script",
    label: "сценарий",
    fields: ["script"],
    schema: `"script": {
  "concept": "1 абзац сверх-идеи",
  "synopsis": "3-5 предложений",
  "scenes": [
    {
      "number": 1,
      "heading": "INT./EXT. ЛОКАЦИЯ — ВРЕМЯ",
      "location": "",
      "timeOfDay": "утро/день/вечер/ночь",
      "action": "2-6 предложений, конкретно под тему",
      "dialogue": [{ "character": "", "line": "", "direction": "" }],
      "durationSec": 5,
      "notes": ""
    }
  ],
  "finalText": "ОПЦИОНАЛЬНО: полный текст сценария в классической разметке для актёра. Если не помещается — пропусти поле, мы соберём его сами из scenes."
}
ВАЖНО: количество сцен и длительности — сумма всех durationSec должна РОВНО
совпадать с длительностью из брифа: 15-30с → 4-5 сцен; 60с → 5-7; 90-180с → 6-10;
300-900с → 12-25 полноценных сцен с завязкой/развитием/развязкой.
Сценарий — конкретная сюжетная линия под ТЕМУ проекта (герои, локации, диалоги
из темы), а не универсальный шаблон. Учитывай логлайн и treatment из контекста.
Пиши СЖАТО: action — 1-3 предложения, dialogue — только ключевые реплики.`,
    maxTokens: 9000,
    validate: (d) =>
      Boolean(d?.script && typeof d.script === "object") &&
      Array.isArray(d.script.scenes) &&
      d.script.scenes.length > 0,
  },
  {
    key: "vision",
    label: "визуальный язык",
    fields: ["vision"],
    schema: `"vision": {
  "overallStyle": "1-2 абзаца про общий визуальный язык",
  "visualLanguage": "камера/оптика/движение/мотивировка",
  "referenceFilms": ["3 референса с пояснением, что именно берём"],
  "scenes": [
    // ОДНА запись на КАЖДУЮ сцену из script (номера сцен — из контекста)
    {
      "sceneNumber": 1,
      "sceneTitle": "заголовок сцены",
      "shot": {
        "goal": "", "emotion": "", "composition": "", "cameraMovement": "",
        "duration": "", "transition": "cut/match cut/J-cut/L-cut/crossfade/...",
        "pacing": "", "sound": "", "atmosphere": "", "lighting": "",
        "colorPalette": ["", "", "", "", ""], "vfx": "", "dpNotes": ""
      }
    }
  ]
}`,
    maxTokens: 3500,
    validate: (d) =>
      Array.isArray(d?.vision?.scenes) && d.vision.scenes.length > 0,
  },
  {
    key: "storyboard",
    label: "раскадровка",
    fields: ["storyboard"],
    schema: `"storyboard": {
  "aspectRatio": "9:16 | 16:9 | 1:1 — по платформе из брифа",
  "style": "визуальный стиль раскадровки",
  "frames": [
    // 6-10 кадров на весь ролик
    {
      "number": 1, "sceneNumber": 1, "description": "", "composition": "",
      "cameraMovement": "", "objectPlacement": "", "lighting": "", "color": "",
      "shotSize": "ELS/WS/MS/MCU/CU/ECU/INSERT/POV/OTS", "mood": "",
      "imagePrompt": "8-12 англ. слов, cinematic storyboard sketch, black and white with one accent color",
      "notes": ""
    }
  ]
}`,
    maxTokens: 3500,
    validate: (d) =>
      Array.isArray(d?.storyboard?.frames) && d.storyboard.frames.length > 0,
  },
  {
    key: "shotlist",
    label: "шот-лист",
    fields: ["shotlist"],
    schema: `"shotlist": {
  "totalShots": число,
  "estimatedTime": "оценка времени съёмки (напр. '1 съёмочный день, 8 часов')",
  "shots": [
    // 10-25 позиций
    {
      "number": 1, "description": "", "shotType": "", "camera": "", "lens": "",
      "movement": "", "equipment": [""], "props": [""], "duration": "",
      "priority": "critical|high|medium|low", "location": ""
    }
  ]
}`,
    maxTokens: 4500,
    validate: (d) =>
      Array.isArray(d?.shotlist?.shots) && d.shotlist.shots.length > 0,
  },
  {
    key: "planning",
    label: "план съёмок",
    fields: ["planning"],
    schema: `"planning": {
  "schedule": [
    {
      "day": 1, "location": "", "scenes": [""], "shots": [1],
      "callTime": "09:00", "wrapTime": "19:00", "notes": [""]
    }
  ],
  "sceneOrder": [""],
  "checklists": [
    { "category": "Оборудование", "items": [{ "text": "", "done": false }] },
    { "category": "До выхода", "items": [{ "text": "", "done": false }] },
    { "category": "Звук", "items": [{ "text": "", "done": false }] },
    { "category": "Свет", "items": [{ "text": "", "done": false }] }
  ],
  "props": [""], "equipment": [""], "cast": [], "locations": [],
  "directorNotes": ["2-5 заметок съёмочной группе"],
  "teamTasks": [
    { "assignee": "Режиссёр", "task": "", "dueBy": "", "done": false },
    { "assignee": "Оператор", "task": "", "dueBy": "", "done": false },
    { "assignee": "Продюсер", "task": "", "dueBy": "", "done": false }
  ]
}
ВАЖНО: план опирается на сценарий, vision, storyboard и шот-лист из контекста
(те же номера сцен, локации, персонажи, CTA, хронометраж).`,
    maxTokens: 3500,
    validate: (d) =>
      Array.isArray(d?.planning?.schedule) && d.planning.schedule.length > 0,
  },
  {
    key: "wrap",
    label: "кастинг / локации / риски",
    fields: ["casting", "locations", "risks"],
    schema: `"casting": [
  // по числу персонажей из treatment и сценария
  { "role": "", "name": "имя (если есть)", "description": "", "look": "", "notes": "" }
],
"locations": [
  // по числу локаций из сценария
  { "name": "", "description": "", "mood": "", "lighting": "", "pros": [""], "cons": [""], "suitable": true }
],
"risks": {
  "readiness": 0-100,
  "missingItems": ["3-7 пунктов, чего не хватает для запуска"],
  "weakScenes": [{ "sceneId": "номер или id сцены", "reason": "" }],
  "risks": [
    // 5-10 рисков
    {
      "severity": "low|medium|high|critical",
      "category": "сценарий|съёмка|кастинг|локация|техника|время|бюджет|другое",
      "description": "", "mitigation": ""
    }
  ]
}
ВАЖНО: персонажи и локации — те же, что в treatment и сценарии из контекста.`,
    maxTokens: 3500,
    validate: (d) =>
      Array.isArray(d?.casting) && d.casting.length > 0 &&
      Array.isArray(d?.locations) && d.locations.length > 0 &&
      Array.isArray(d?.risks?.risks) && d.risks.risks.length > 0,
  },
];

/**
 * Стартовый «скелет» препродакшена для контекста следующих блоков: начинаем с
 * уже имеющегося материала (existing preprod или offline-заготовка), чтобы
 * каждый следующий вызов видел всё, что уже сгенерировано ранее.
 */
function partialPreprodFrom(base: PreProduction): PreProduction {
  return {
    version: 2 as const,
    updatedAt: base.updatedAt,
    activeStage: base.activeStage,
    idea: base.idea,
    logline: base.logline,
    treatment: base.treatment,
    script: base.script,
    vision: base.vision,
    storyboard: base.storyboard,
    shotlist: base.shotlist,
    planning: base.planning,
    casting: base.casting,
    locations: base.locations,
    risks: base.risks,
    chat: base.chat,
  };
}

/** Вливает успешно сгенерированный блок в частичный препродакшен (для контекста). */
function mergeChunkInto(partial: PreProduction, chunk: ChunkSpec, data: Record<string, any>): void {
  switch (chunk.key) {
    case "core":
      if (data.idea) partial.idea = data.idea;
      if (data.logline) partial.logline = data.logline;
      if (data.treatment) partial.treatment = data.treatment;
      break;
    case "script":
      if (data.script) partial.script = data.script;
      break;
    case "vision":
      if (data.vision) partial.vision = data.vision;
      break;
    case "storyboard":
      if (data.storyboard) partial.storyboard = data.storyboard;
      break;
    case "shotlist":
      if (data.shotlist) partial.shotlist = data.shotlist;
      break;
    case "planning":
      if (data.planning) partial.planning = data.planning;
      break;
    case "wrap":
      if (Array.isArray(data.casting)) partial.casting = data.casting;
      if (Array.isArray(data.locations)) partial.locations = data.locations;
      if (data.risks) partial.risks = data.risks;
      break;
  }
}

function chunkPrompt(
  chunk: ChunkSpec,
  brief: DirectorBrief,
  projectTitle: string,
  partial: PreProduction,
  attempt: number
): string {
  const ctx = buildDirectorContext({
    brief,
    preprod: partial,
    projectTitle,
    focus: "full",
  });
  const retryHint =
    attempt > 0
      ? `\n\nВНИМАНИЕ: предыдущий ответ на это же задание был неполным или невалидным. ` +
        `Сгенерируй раздел(ы) ЗАНОВО и ПОЛНОСТЬЮ — верни валидный JSON со ВСЕМИ полями из задания.`
      : "";
  return (
    ctx +
    `\n\n=== ЗАДАНИЕ ===\n` +
    `Сгенерируй ТОЛЬКО разделы: ${chunk.fields.map((f) => `"${f}"`).join(", ")}.\n` +
    `Верни JSON-объект ровно с этими полями — без обёрток и без markdown.\n\n` +
    `### Схема блока «${chunk.label}»:\n${chunk.schema}` +
    retryHint
  );
}

/**
 * Генерирует один блок с ретраями. Возвращает распарсенный JSON блока или null.
 * Каждый вызов callLLM сам ретраит сетевые сбои/5xx/429 (с учётом Retry-After)
 * и перебирает запасные бесплатные модели; здесь дополнительно ретраим
 * обрезанные (finish_reason=length) и невалидные ответы — это и есть главная
 * причина старой ошибки «не получил полный ответ».
 *
 * ВАЖНО: никаких собственных таймаутов (timeoutMs: 0) — модель думает сколько
 * нужно; единственный предохранитель — общий бюджет запуска `deadline`,
 * после которого блок честно возвращает null, и цикл сборки добирает его из
 * локального пакета (запуск не падает).
 */
async function generateChunk(
  chunk: ChunkSpec,
  brief: DirectorBrief,
  projectTitle: string,
  partial: PreProduction,
  deadline: number
): Promise<Record<string, any> | null> {
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() + ATTEMPT_FLOOR_MS > deadline) {
      console.warn(
        `[director] chunk "${chunk.key}" — общий бюджет времени исчерпан (attempt ${attempt + 1}/${MAX_ATTEMPTS}), блок будет собран локально`
      );
      return null;
    }
    // На обрезанном ответе (finish_reason=length) увеличиваем бюджет токенов:
    // повтор с тем же (слишком маленьким) лимитом снова упрётся в max_tokens.
    // С каждым ретраем даём модели больше места дописать валидный JSON.
    const maxTokens = Math.min(chunk.maxTokens + attempt * 4000, 32768);
    const llm = await callLLM({
      messages: [
        { role: "system", content: DIRECTOR_CHUNK_SYSTEM_PROMPT },
        { role: "user", content: chunkPrompt(chunk, brief, projectTitle, partial, attempt) },
      ],
      temperature: 0.55,
      maxTokens,
      timeoutMs: 0, // без лимита времени: модель отвечает столько, сколько нужно
      maxRetries: 4,
      responseFormat: { type: "json_object" },
    });

    if (!llm.ok) {
      console.warn(
        `[director] chunk "${chunk.key}" — LLM call failed (attempt ${attempt + 1}/${MAX_ATTEMPTS})`
      );
      continue;
    }
    if (llm.truncated) {
      console.warn(
        `[director] chunk "${chunk.key}" — response truncated at max_tokens=${maxTokens} (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying with a larger budget`
      );
      continue;
    }

    let data: any = null;
    try {
      data = JSON.parse(extractJson(llm.text));
    } catch {
      data = null;
    }
    if (data && chunk.validate(data)) {
      return data as Record<string, any>;
    }
    console.warn(
      `[director] chunk "${chunk.key}" — response parsed but incomplete/invalid (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying`
    );
  }
  console.warn(`[director] chunk "${chunk.key}" — failed after ${MAX_ATTEMPTS} attempts`);
  return null;
}

// ---------------------------------------------------------------------------
// Resume: переиспользование блоков, уже сгенерированных LLM, при повторном
// запуске после неудачи («Повторите запуск — бриф сохранён»). Повторный запуск
// не начинает с нуля: блоки, которые LLM успела собрать, берутся из
// сохранённого препродакшена, а не пересоздаются заново.
// ---------------------------------------------------------------------------

/** Ключи, которыми локальный шаблон и результат LLM отличаются всегда (id и т.п.). */
const VOLATILE_KEYS = new Set([
  "version", "updatedAt", "activeStage", "photoDataUrl", "date", "chat",
]);

function stripVolatile(v: any): any {
  if (Array.isArray(v)) return v.map(stripVolatile);
  if (v && typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      // id, sceneId, castId… и undefined-значения (при передаче по HTTP они
      // теряются, поэтому при сравнении их не должно быть ни на одной стороне)
      if (VOLATILE_KEYS.has(k) || /Id$/i.test(k) || val === undefined) continue;
      out[k] = stripVolatile(val);
    }
    return out;
  }
  return v;
}

/**
 * Канонический JSON для сравнения: сортирует ключи и нормализует undefined,
 * поэтому «одинаковое содержимое» сравнивается надёжно (NaN/undefined-поля
 * не ломают сравнение, как в наивной рекурсии).
 */
function canonicalJson(v: any): string {
  if (v === undefined) return '"__undef__"';
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (v && typeof v === "object") {
    const keys = Object.keys(v).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

/** Достаёт из препродакшена данные блока (в формате, который ждёт валидатор). */
function chunkDataFromPreprod(
  chunk: ChunkSpec,
  p: PreProduction
): Record<string, any> | null {
  switch (chunk.key) {
    case "core":
      return p.idea && p.logline && p.treatment
        ? { idea: p.idea, logline: p.logline, treatment: p.treatment }
        : null;
    case "script":
      return p.script ? { script: p.script } : null;
    case "vision":
      return p.vision ? { vision: p.vision } : null;
    case "storyboard":
      return p.storyboard ? { storyboard: p.storyboard } : null;
    case "shotlist":
      return p.shotlist ? { shotlist: p.shotlist } : null;
    case "planning":
      return p.planning ? { planning: p.planning } : null;
    case "wrap":
      return Array.isArray(p.casting) && p.casting.length > 0 &&
        Array.isArray(p.locations) && p.locations.length > 0 && p.risks
        ? { casting: p.casting, locations: p.locations, risks: p.risks }
        : null;
    default:
      return null;
  }
}

/**
 * Блок можно переиспользовать при resume, только если его содержимое ОТЛИЧАЕТСЯ
 * от локального шаблона (то есть его реально собрала LLM, а не normalizePreprod
 * добил пропуски шаблоном в прошлый раз).
 */
function chunkIsReusable(
  chunk: ChunkSpec,
  existing: PreProduction,
  template: PreProduction
): boolean {
  const data = chunkDataFromPreprod(chunk, existing);
  if (!data || !chunk.validate(data)) return false;
  const tpl = chunkDataFromPreprod(chunk, template);
  if (!tpl) return false;
  return (
    canonicalJson(stripVolatile(data)) !== canonicalJson(stripVolatile(tpl))
  );
}

function stageRegenerationPrompt(
  stage: string,
  brief: DirectorBrief,
  projectTitle: string,
  existing: PreProduction,
  userPatch?: string
): string {
  const ctx = buildDirectorContext({
    brief,
    preprod: existing,
    projectTitle,
    focus: "stage",
    stage,
    userMessage: userPatch,
  });
  return (
    ctx +
    `\n\nСгенерируй раздел "${stage}"${userPatch ? ` с учётом комментария пользователя: «${userPatch}»` : ""} ПОЛНОСТЬЮ и ЗАКОНЧЕННО.\n` +
    `Учти все изменения в других разделах (логлайн согласуется с идеей, сценарий с логлайном, storyboard со сценарием и т.д.). ` +
    `Сохрани лучшие детали от предыдущей версии, если они не противоречат обновлениям.\n` +
    `Верни ТОЛЬКО JSON фрагмент этого раздела (по той же схеме, что и в полном ответе) — без обёртки в дополнительный ключ, без markdown.` +
    `\nНе обрезай ответ: если JSON не помещается в лимит — лучше сократи текст внутри полей, но ВЕРНИ ВСЕ поля и заверши валидный JSON.`
  );
}

function chatPrompt(
  brief: DirectorBrief,
  projectTitle: string,
  preprod: PreProduction,
  userMessage: string
): string {
  const ctx = buildDirectorContext({
    brief,
    preprod,
    projectTitle,
    focus: "chat",
    userMessage,
    chatHistory: preprod.chat,
  });
  return (
    ctx +
    `\n\nОтвечай ЖИВЫМ текстом от лица режиссёра — в стиле системного промпта. ` +
    `НЕ добавляй JSON. НЕ используй вежливые клише. Давай конкретные режиссёрские решения с таймингами и крупностями, привязанные к этому проекту.`
  );
}

// ---------------------------------------------------------------------------
// Пошаговая генерация ОДНОГО раздела (mode: "stage")
//
// Один раздел = один вызов LLM с ретраями. Ответ принимается только если модель
// выдала ПОЛНЫЙ раздел (STAGE_VALIDATORS); обрезанные (finish_reason="length")
// и невалидные ответы повторяются с увеличенным бюджетом токенов — модель
// получает больше места «дописать» раздел. Если после всех попыток раздел всё
// равно не собрался — возвращаем ошибку, а НЕ локальный шаблон: пользователь
// видит «не получилось» и повторяет шаг, а не получает молча недописанный
// раздел. Именно так устраняется «AI где-то что-то не дописала».
// ---------------------------------------------------------------------------

/** Лимит токенов ответа на раздел (пошаговая сборка / пересоздание). */
const STAGE_MAX_TOKENS: Record<string, number> = {
  idea: 3000,
  logline: 2500,
  treatment: 4500,
  script: 9000,
  vision: 3500,
  storyboard: 3500,
  shotlist: 4500,
  planning: 3500,
  casting: 2500,
  locations: 2500,
  risks: 3500,
};

/**
 * Проверка «раздел сгенерирован ПОЛНОСТЬЮ». Если ядро раздела пустое —
 * значит модель «не дописала», ответ не принимается и повторяется.
 */
const STAGE_VALIDATORS: Record<string, (d: any) => boolean> = {
  idea: (d) =>
    Boolean(d && typeof d === "object") &&
    (safeStr(d?.refined).length > 0 || safeStr(d?.audience).length > 0),
  logline: (d) =>
    Boolean(d && typeof d === "object") && safeStr(d?.primary).length > 0,
  treatment: (d) =>
    Boolean(d && typeof d === "object") &&
    (safeStr(d?.synopsisLong).length > 0 || safeStr(d?.title).length > 0),
  script: (d) => Array.isArray(d?.scenes) && d.scenes.length > 0,
  vision: (d) => Array.isArray(d?.scenes) && d.scenes.length > 0,
  storyboard: (d) => Array.isArray(d?.frames) && d.frames.length > 0,
  shotlist: (d) => Array.isArray(d?.shots) && d.shots.length > 0,
  planning: (d) => Array.isArray(d?.schedule) && d.schedule.length > 0,
  casting: (d) => Array.isArray(d) && d.length > 0,
  locations: (d) => Array.isArray(d) && d.length > 0,
  risks: (d) => Array.isArray(d?.risks) && d.risks.length > 0,
};

function stageDisplayName(stage: string): string {
  return PREPROD_STAGES.find((s) => s.id === stage)?.short || stage;
}

/**
 * Генерирует ОДИН раздел с ретраями. callLLM сам ретраит сетевые сбои/429 и
 * перебирает запасные бесплатные модели; здесь дополнительно ретраим
 * обрезанные и невалидные ответы (главная причина «не дописала»). Бюджет
 * токенов растёт с каждой попыткой, чтобы модель могла дописать ответ целиком.
 *
 * Возвращает { data } при успехе или { error } после исчерпания попыток.
 */
async function generateStageSection(
  stage: string,
  brief: DirectorBrief,
  projectTitle: string,
  preprod: PreProduction,
  userPatch?: string
): Promise<{ data: Record<string, any> } | { error: string }> {
  const MAX_ATTEMPTS = 6;
  const baseTokens = STAGE_MAX_TOKENS[stage] ?? 4000;
  const label = stageDisplayName(stage);
  // Общий бюджет времени на один раздел (тот же, что у полной сборки):
  // если провайдер «замолчал», честно возвращаем ошибку, а не превышаем
  // maxDuration платформы.
  const deadline = Date.now() + fullRunDeadlineMs();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() + ATTEMPT_FLOOR_MS > deadline) {
      console.warn(
        `[director] stage "${stage}" — общий бюджет времени исчерпан (attempt ${attempt + 1}/${MAX_ATTEMPTS})`
      );
      break;
    }
    // На обрезанном ответе (finish_reason=length) увеличиваем бюджет токенов:
    // повтор с тем же лимитом снова упрётся в max_tokens.
    const maxTokens = Math.min(baseTokens + attempt * 4000, 32768);
    const llm = await callLLM({
      messages: [
        { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
        { role: "user", content: stageRegenerationPrompt(stage, brief, projectTitle, preprod, userPatch) },
      ],
      temperature: 0.75,
      maxTokens,
      timeoutMs: 0, // без лимита времени: модель отвечает столько, сколько нужно
      maxRetries: 4,
      responseFormat: { type: "json_object" },
    });

    if (!llm.ok) {
      console.warn(
        `[director] stage "${stage}" — LLM call failed (attempt ${attempt + 1}/${MAX_ATTEMPTS})`
      );
      continue;
    }
    if (llm.truncated) {
      console.warn(
        `[director] stage "${stage}" — response truncated at max_tokens=${maxTokens} (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying with a larger budget`
      );
      continue;
    }

    let data: any = null;
    try {
      data = JSON.parse(extractJson(llm.text));
    } catch {
      data = null;
    }
    const valid = STAGE_VALIDATORS[stage] ? STAGE_VALIDATORS[stage](data) : Boolean(data);
    if (data && valid) {
      return { data };
    }
    console.warn(
      `[director] stage "${stage}" — response parsed but incomplete/invalid (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying`
    );
  }
  console.warn(`[director] stage "${stage}" — failed after ${MAX_ATTEMPTS} attempts`);
  return {
    error: `AI не ответила для раздела «${label}» полностью. Нажмите «Повторить», чтобы сгенерировать раздел заново.`,
  };
}

/**
 * Приводит ответ LLM для одного раздела к ПОЛНОЙ схеме раздела: любые
 * пропущенные поля добираются из локального базового пакета, а не остаются
 * пустыми — UI каждого раздела (StageIdea, StageLogline и т.д.) ожидает
 * целостную структуру (variants, scenes, frames, shots, schedule…).
 */
function normalizeStageData(
  stage: string,
  data: any,
  brief: DirectorBrief,
  base: PreProduction
): any {
  if (data == null || typeof data !== "object") return null;
  const raw: Record<string, any> = { [stage]: data };
  const normalized = normalizePreprod(raw, brief, base);
  return (normalized as any)[stage] ?? null;
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

function safeArr<T>(v: T[] | undefined | null, d: T[] = []): T[] {
  return Array.isArray(v) ? v.filter((x) => x != null) : d;
}
function safeStr(v: unknown, d = ""): string {
  return typeof v === "string" && v.trim().length > 0 ? v : d;
}
function safeNum(v: unknown, d: number, min = 0, max = 100): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : d;
  if (Number.isNaN(n)) return d;
  return Math.max(min, Math.min(max, n));
}

/**
 * Раньше здесь был жёсткий валидатор полноты пакета: если хотя бы один раздел
 * не пришёл от LLM, весь запуск падал в 502 «не получил полный ответ».
 * Теперь политика обратная: normalizePreprod гарантированно добирает любые
 * пропуски из локального базового пакета, а факт частичной сборки честно
 * сообщается пользователю через `partial` + `warnings`. Запуск ВСЕГДА
 * заканчивается полным препродакшеном, а не ошибкой.
 */

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    brief: rawBrief,
    projectTitle,
    mode = "full",
    stage,
    preprod: existingPreprod,
    userMessage,
  } = body;

  const brief = normalizeBrief(rawBrief);
  const projectName = String(projectTitle || brief.idea || "Новый проект");
  const basePreprod: PreProduction =
    existingPreprod && Object.keys(existingPreprod).length > 0
      ? (existingPreprod as PreProduction)
      : buildOfflinePreprod(brief);

  // Полная профессиональная сборка не должна незаметно превращаться в шаблон,
  // когда ключ не подхватился после запуска сервера.
  if (mode !== "chat" && !hasAIKey()) {
    return NextResponse.json(
      {
        error:
          "API-ключ не найден. Добавьте OPENROUTER_API_KEY (или GROQ_API_KEY) в .env.local и перезапустите сервер.",
      },
      { status: 503 },
    );
  }

  // Накопленный результат полной сборки объявляем вне try, чтобы catch мог
  // отдать даже частично собранный пакет (всегда отвечаем, никогда не 502).
  const raw: Record<string, any> = {};

  try {
    if (mode === "chat") {
      const userText = String(userMessage || "").trim();
      const sys = DIRECTOR_VOICE_PROMPT;
      const usr = chatPrompt(brief, projectName, basePreprod, userText);

      const llm = await callLLM({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        temperature: 0.9,
        maxTokens: 1600,
        timeoutMs: 0, // без лимита времени — модель отвечает столько, сколько нужно
        maxRetries: 3,
      });

      const reply = llm.ok
        ? llm.text.trim()
        : localDirectorReply(userText, brief, basePreprod);

      return NextResponse.json({ reply });
    }

    if (mode === "stage" && stage) {
      const stg = String(stage);
      const patch = userMessage ? String(userMessage) : undefined;
      // Один раздел — один запрос с ретраями (см. generateStageSection):
      // раздел принимается только ПОЛНЫМ; при неудаче возвращаем ошибку,
      // а не подменяем ответ локальным шаблоном.
      const result = await generateStageSection(stg, brief, projectName, basePreprod, patch);
      if ("error" in result) {
        return NextResponse.json({ ok: false, stage: stg, error: result.error });
      }
      const data = normalizeStageData(stg, result.data, brief, basePreprod);
      if (!data) {
        return NextResponse.json({
          ok: false,
          stage: stg,
          error: `Не удалось собрать раздел «${stageDisplayName(stg)}» — попробуйте ещё раз.`,
        });
      }
      return NextResponse.json({ ok: true, stage: stg, data });
    }

    // Полная сборка — самый «дорогой» заказ: все 12 разделов, включая полный
    // сценарий. Раньше это был ОДИН вызов на 24 000 токенов: ответ упирался в
    // max_tokens, JSON обрезался, парсинг падал, и пользователь получал 502
    // «не получил полный ответ». Теперь пакет собирается семью
    // последовательными вызовами (см. FULL_CHUNKS), каждый из которых
    // валидируется и ретраится отдельно — обрезание одного блока не убивает
    // весь запуск. У вызовов LLM НЕТ лимитов времени (timeoutMs: 0); общий
    // бюджет запуска ограничен только платформой (maxDuration), и если он
    // истекает, блоки добираются из локального пакета — пользователь всегда
    // получает полный ответ, а не ошибку.
    const resume = body.resume === true;
    const templatePreprod = buildOfflinePreprod(brief);
    const deadline = Date.now() + fullRunDeadlineMs();
    const partial: PreProduction = partialPreprodFrom(basePreprod);
    const warnings: string[] = [];
    let reusedChunks = 0;

    for (const chunk of FULL_CHUNKS) {
      let data: Record<string, any> | null = null;

      // Повторный запуск после неудачи: блок, который LLM уже собрала в
      // прошлый раз (отличается от локального шаблона), переиспользуем и не
      // тратим на него время.
      if (resume && chunkIsReusable(chunk, basePreprod, templatePreprod)) {
        data = chunkDataFromPreprod(chunk, basePreprod);
        reusedChunks++;
        console.warn(
          `[director] chunk "${chunk.key}" — переиспользован из сохранённого препродакшена (resume)`
        );
      }

      if (!data) {
        data = await generateChunk(chunk, brief, projectName, partial, deadline);
      }

      if (!data) {
        // НЕ роняем запуск: раздел будет добит normalizePreprod из локального
        // базового пакета, а пользователь увидит предупреждение. Гарантия:
        // запуск всегда заканчивается полным препродакшеном.
        warnings.push(
          `AI не ответила для раздела «${chunk.label}» — он собран по локальному шаблону. Нажмите «Перегенерировать», чтобы повторить.`
        );
        continue;
      }
      Object.assign(raw, data);
      mergeChunkInto(partial, chunk, data);
    }

    const preprod = normalizePreprod(raw, brief, basePreprod);
    const sections = flattenToLegacy(preprod, brief);
    const anyRemote = reusedChunks > 0 || Object.keys(raw).length > 0;
    return NextResponse.json({
      sections,
      preprod,
      brief,
      partial: warnings.length > 0 || !anyRemote,
      warnings,
      reused: reusedChunks,
    });
  } catch (e: any) {
    console.warn("[director] error", e?.message);
    // Total failure — still return a working preprod so the UI keeps working.
    if (mode === "chat") {
      return NextResponse.json({
        reply: localDirectorReply(
          String(userMessage || ""),
          brief,
          basePreprod
        ),
      });
    }
    if (mode === "stage" && stage) {
      return NextResponse.json({
        ok: false,
        stage: String(stage),
        error: `Не удалось получить ответ AI для раздела «${stageDisplayName(String(stage))}» — попробуйте ещё раз.`,
      });
    }
    // Полная сборка: даже при непредвиденной ошибке отдаём полный пакет
    // (что успело собраться + локальный шаблон), а не 502.
    const fallback = normalizePreprod(raw, brief, basePreprod);
    return NextResponse.json({
      sections: flattenToLegacy(fallback, brief),
      preprod: fallback,
      brief,
      partial: true,
      warnings: [
        "Не удалось получить ответ AI — план собран по локальному шаблону. Нажмите «Перегенерировать», чтобы повторить.",
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Normalization (brief + preprod)
// ---------------------------------------------------------------------------

function normalizeBrief(raw: unknown): DirectorBrief {
  if (raw && typeof raw === "object") {
    const b = raw as Partial<DirectorBrief>;
    return {
      idea: String(b.idea || ""),
      goal: String(b.goal || ""),
      audience: String(b.audience || ""),
      platform: String(b.platform || ""),
      duration: String(b.duration || ""),
      style: String(b.style || ""),
      mood: String(b.mood || ""),
      tempo: String(b.tempo || ""),
      references: String(b.references || ""),
      keyMessage: String(b.keyMessage || ""),
      callToAction: String(b.callToAction || ""),
      location: b.location ? String(b.location) : undefined,
      materials: b.materials ? String(b.materials) : undefined,
    };
  }
  const t = String(raw || "");
  return {
    idea: t, goal: "", audience: "", platform: "", duration: "", style: "", mood: "",
    tempo: "", references: "", keyMessage: "", callToAction: "",
    location: undefined, materials: undefined,
  };
}

function normalizePreprod(
  raw: any,
  brief: DirectorBrief,
  existingPreprod: PreProduction
): PreProduction {
  const base = buildOfflinePreprod(brief);
  const prevChat = existingPreprod?.chat || [];

  const idea = raw?.idea && typeof raw.idea === "object" ? raw.idea : {};
  const logline = raw?.logline && typeof raw.logline === "object" ? raw.logline : {};
  const treatment = raw?.treatment && typeof raw.treatment === "object" ? raw.treatment : {};
  const script = raw?.script && typeof raw.script === "object" ? raw.script : {};
  const vision = raw?.vision && typeof raw.vision === "object" ? raw.vision : {};
  const storyboard = raw?.storyboard && typeof raw.storyboard === "object" ? raw.storyboard : {};
  const shotlist = raw?.shotlist && typeof raw.shotlist === "object" ? raw.shotlist : {};
  const planning = raw?.planning && typeof raw.planning === "object" ? raw.planning : {};
  const risks = raw?.risks && typeof raw.risks === "object" ? raw.risks : {};

  const normalizedVariants = safeArr(idea.variants, []).map((v: any, i: number) => ({
    id: `iv-${Date.now()}-${i}`,
    title: safeStr(v?.title, `Вариант ${i + 1}`),
    concept: safeStr(v?.concept, ""),
    audience: safeStr(v?.audience, ""),
    hook: safeStr(v?.hook, ""),
    potential: safeNum(v?.potential, 6, 1, 10),
    reasoning: safeStr(v?.reasoning, ""),
  }));

  const normalizedLoglineVariants = safeArr(logline.variants, []).map((v: any, i: number) => ({
    id: `lv-${Date.now()}-${i}`,
    text: safeStr(v?.text, ""),
    strengths: safeArr(v?.strengths, []).map((x: any) => String(x)),
    weaknesses: safeArr(v?.weaknesses, []).map((x: any) => String(x)),
  }));

  const normalizedCharacters = safeArr(treatment.characters, []).map((c: any, i: number) => ({
    name: safeStr(c?.name, `Персонаж ${i + 1}`),
    role: safeStr(c?.role, ""),
    description: safeStr(c?.description, ""),
  }));

  const normalizedScenes = safeArr(script.scenes, []).map((s: any, i: number) => ({
    id: `sc-${Date.now()}-${i}`,
    number: typeof s?.number === "number" ? s.number : i + 1,
    heading: safeStr(s?.heading, `СЦЕНА ${i + 1}`),
    location: safeStr(s?.location, ""),
    timeOfDay: safeStr(s?.timeOfDay, "день"),
    action: safeStr(s?.action, ""),
    dialogue: safeArr(s?.dialogue, []).map((d: any) => ({
      character: safeStr(d?.character, "ГЕРОЙ"),
      line: safeStr(d?.line, ""),
      direction: d?.direction ? String(d.direction) : undefined,
    })),
    durationSec: safeNum(s?.durationSec, 5, 1, 60),
    notes: s?.notes ? String(s.notes) : undefined,
  }));

  const finalText =
    safeStr(script.finalText, "") ||
    normalizedScenes
      .map((s) => {
        const d = s.dialogue.map((x) => `${x.character}: ${x.line}`).join("\n");
        return `${s.heading}\n${s.action}${d ? "\n" + d : ""}`;
      })
      .join("\n\n");

  const normalizedVisionScenes = safeArr(vision.scenes, []).map((v: any, i: number) => {
    const shot = v?.shot && typeof v.shot === "object" ? v.shot : {};
    const scene = normalizedScenes[i] || normalizedScenes[0] || base.script.scenes[i];
    return {
      sceneId: scene?.id || `sc-${i}`,
      sceneTitle: safeStr(v?.sceneTitle || scene?.heading, `Сцена ${i + 1}`),
      shot: {
        goal: safeStr(shot?.goal, ""),
        emotion: safeStr(shot?.emotion, ""),
        composition: safeStr(shot?.composition, ""),
        cameraMovement: safeStr(shot?.cameraMovement, ""),
        duration: safeStr(shot?.duration, ""),
        transition: safeStr(shot?.transition, "cut"),
        pacing: safeStr(shot?.pacing, ""),
        sound: safeStr(shot?.sound, ""),
        atmosphere: safeStr(shot?.atmosphere, ""),
        lighting: safeStr(shot?.lighting, ""),
        colorPalette: safeArr(shot?.colorPalette, []).map((x: any) => String(x)).slice(0, 6),
        vfx: safeStr(shot?.vfx, "без эффектов"),
        dpNotes: safeStr(shot?.dpNotes, ""),
      },
    };
  });

  const normalizedFrames = safeArr(storyboard.frames, []).map((f: any, i: number) => ({
    id: `fr-${Date.now()}-${i}`,
    number: typeof f?.number === "number" ? f.number : i + 1,
    sceneId: f?.sceneNumber ? `sc-idx-${f.sceneNumber}` : normalizedScenes[0]?.id || "",
    description: safeStr(f?.description, ""),
    composition: safeStr(f?.composition, ""),
    cameraMovement: safeStr(f?.cameraMovement, ""),
    objectPlacement: safeStr(f?.objectPlacement, ""),
    lighting: safeStr(f?.lighting, ""),
    color: safeStr(f?.color, ""),
    shotSize: safeStr(f?.shotSize, "MS"),
    mood: safeStr(f?.mood, ""),
    imagePrompt: f?.imagePrompt ? String(f.imagePrompt) : undefined,
    notes: f?.notes ? String(f.notes) : undefined,
  }));

  const normalizedShots = safeArr(shotlist.shots, []).map((s: any, i: number) => ({
    number: typeof s?.number === "number" ? s.number : i + 1,
    description: safeStr(s?.description, ""),
    shotType: safeStr(s?.shotType, "MS"),
    camera: safeStr(s?.camera, "Камера"),
    lens: safeStr(s?.lens, "35mm"),
    movement: safeStr(s?.movement, "static"),
    equipment: safeArr(s?.equipment, []).map((x: any) => String(x)),
    props: safeArr(s?.props, []).map((x: any) => String(x)),
    duration: safeStr(s?.duration, "3 сек"),
    priority: (["low", "medium", "high", "critical"].includes(s?.priority)
      ? s.priority
      : "medium") as "low" | "medium" | "high" | "critical",
    location: safeStr(s?.location, ""),
    notes: s?.notes ? String(s.notes) : undefined,
  }));

  const normalizedChecklists = safeArr(planning.checklists, []).map((c: any, gi: number) => ({
    id: `chk-${Date.now()}-${gi}`,
    category: safeStr(c?.category, `Чек-лист ${gi + 1}`),
    items: safeArr(c?.items, []).map((it: any) => ({
      text: safeStr(it?.text || it, ""),
      done: !!(it && typeof it === "object" && it.done),
    })),
  }));

  const normalizedSchedule = safeArr(planning.schedule, []).map((d: any, i: number) => ({
    day: typeof d?.day === "number" ? d.day : i + 1,
    date: d?.date ? String(d.date) : undefined,
    location: safeStr(d?.location, ""),
    scenes: safeArr(d?.scenes, []).map((x: any) => String(x)),
    shots: safeArr(d?.shots, []).map((x: any) => Number(x) || 0).filter((n: number) => n > 0),
    callTime: safeStr(d?.callTime, "09:00"),
    wrapTime: safeStr(d?.wrapTime, "19:00"),
    notes: safeArr(d?.notes, []).map((x: any) => String(x)),
  }));

  const normalizedTeamTasks = safeArr(planning.teamTasks, []).map((t: any) => ({
    assignee: safeStr(t?.assignee, "Команда"),
    task: safeStr(t?.task, ""),
    dueBy: safeStr(t?.dueBy, "До съёмок"),
    done: !!(t && t.done),
  }));

  const normalizedCasting = safeArr(raw?.casting, []).map((c: any, i: number) => ({
    id: `cast-${Date.now()}-${i}`,
    role: safeStr(c?.role, `Роль ${i + 1}`),
    name: c?.name ? String(c.name) : undefined,
    description: safeStr(c?.description, ""),
    look: safeStr(c?.look, ""),
    photoDataUrl: undefined as string | undefined,
    notes: c?.notes ? String(c.notes) : undefined,
  }));

  const normalizedLocations = safeArr(raw?.locations, []).map((l: any, i: number) => ({
    id: `loc-${Date.now()}-${i}`,
    name: safeStr(l?.name, `Локация ${i + 1}`),
    description: safeStr(l?.description, ""),
    mood: safeStr(l?.mood, ""),
    lighting: safeStr(l?.lighting, ""),
    pros: safeArr(l?.pros, []).map((x: any) => String(x)),
    cons: safeArr(l?.cons, []).map((x: any) => String(x)),
    suitable: l?.suitable !== false,
    photoDataUrl: undefined as string | undefined,
    analysis: l?.analysis ? String(l.analysis) : undefined,
  }));

  const normalizedRisks = safeArr(risks?.risks, []).map((rk: any, i: number) => ({
    id: `risk-${Date.now()}-${i}`,
    severity: (["low", "medium", "high", "critical"].includes(rk?.severity) ? rk.severity : "medium") as
      | "low" | "medium" | "high" | "critical",
    category: ([
      "сценарий", "съёмка", "кастинг", "локация", "техника",
      "время", "бюджет", "другое",
    ].includes(rk?.category) ? rk.category : "другое") as any,
    description: safeStr(rk?.description, ""),
    mitigation: safeStr(rk?.mitigation, ""),
    relatedSection: rk?.relatedSection ? String(rk.relatedSection) : undefined,
  }));

  return {
    version: 2 as const,
    updatedAt: Date.now(),
    activeStage: existingPreprod?.activeStage || "idea",
    idea: {
      refined: safeStr(idea.refined, base.idea.refined),
      audience: safeStr(idea.audience, brief.audience || base.idea.audience),
      potential: safeNum(idea.potential, base.idea.potential, 1, 10),
      pros: safeArr(idea.pros, []).map((x: any) => String(x)).length
        ? safeArr(idea.pros, []).map((x: any) => String(x)) : base.idea.pros,
      cons: safeArr(idea.cons, []).map((x: any) => String(x)).length
        ? safeArr(idea.cons, []).map((x: any) => String(x)) : base.idea.cons,
      variants: normalizedVariants.length ? normalizedVariants : base.idea.variants,
    },
    logline: {
      primary: safeStr(logline.primary, base.logline.primary),
      variants: normalizedLoglineVariants.length ? normalizedLoglineVariants : base.logline.variants,
      hero: safeStr(logline.hero, base.logline.hero),
      goal: safeStr(logline.goal, base.logline.goal),
      conflict: safeStr(logline.conflict, base.logline.conflict),
      stakes: safeStr(logline.stakes, base.logline.stakes),
    },
    treatment: {
      title: safeStr(treatment.title, base.treatment.title),
      logline: safeStr(treatment.logline, base.treatment.logline),
      genre: safeStr(treatment.genre, base.treatment.genre),
      tone: safeStr(treatment.tone, [brief.mood, brief.style].filter(Boolean).join(", ") || base.treatment.tone),
      themes: safeArr(treatment.themes, []).map((x: any) => String(x)).length
        ? safeArr(treatment.themes, []).map((x: any) => String(x)) : base.treatment.themes,
      synopsisLong: safeStr(treatment.synopsisLong, base.treatment.synopsisLong),
      act1: safeStr(treatment.act1, base.treatment.act1),
      act2: safeStr(treatment.act2, base.treatment.act2),
      act3: safeStr(treatment.act3, base.treatment.act3),
      characters: normalizedCharacters.length ? normalizedCharacters : base.treatment.characters,
      keyMoments: safeArr(treatment.keyMoments, []).map((x: any) => String(x)).length
        ? safeArr(treatment.keyMoments, []).map((x: any) => String(x)) : base.treatment.keyMoments,
      ending: safeStr(treatment.ending, base.treatment.ending),
    },
    script: {
      concept: safeStr(script.concept, base.script.concept),
      synopsis: safeStr(script.synopsis, base.script.synopsis),
      scenes: normalizedScenes.length ? normalizedScenes : base.script.scenes,
      finalText,
    },
    vision: {
      overallStyle: safeStr(vision.overallStyle, base.vision.overallStyle),
      visualLanguage: safeStr(vision.visualLanguage, base.vision.visualLanguage),
      referenceFilms: safeArr(vision.referenceFilms, []).map((x: any) => String(x)).length
        ? safeArr(vision.referenceFilms, []).map((x: any) => String(x)) : base.vision.referenceFilms,
      scenes: normalizedVisionScenes.length
        ? normalizedVisionScenes
        : base.vision.scenes,
    },
    storyboard: {
      aspectRatio: /9:16|vert|тик|reel|shorts/i.test(brief.platform) ? "9:16" : "16:9",
      style: safeStr(storyboard.style, base.storyboard.style),
      frames: normalizedFrames.length ? normalizedFrames : base.storyboard.frames,
    },
    shotlist: {
      totalShots: normalizedShots.length || base.shotlist.totalShots,
      estimatedTime: safeStr(shotlist.estimatedTime, base.shotlist.estimatedTime),
      shots: normalizedShots.length ? normalizedShots : base.shotlist.shots,
    },
    planning: {
      schedule: normalizedSchedule.length ? normalizedSchedule : base.planning.schedule,
      sceneOrder: safeArr(planning.sceneOrder, []).map((x: any) => String(x)).length
        ? safeArr(planning.sceneOrder, []).map((x: any) => String(x)) : base.planning.sceneOrder,
      checklists: normalizedChecklists.length ? normalizedChecklists : base.planning.checklists,
      props: safeArr(planning.props, []).map((x: any) => String(x)).length
        ? safeArr(planning.props, []).map((x: any) => String(x)) : base.planning.props,
      equipment: safeArr(planning.equipment, []).map((x: any) => String(x)).length
        ? safeArr(planning.equipment, []).map((x: any) => String(x)) : base.planning.equipment,
      cast: normalizedCasting,
      locations: normalizedLocations,
      directorNotes: safeArr(planning.directorNotes, []).map((x: any) => String(x)).length
        ? safeArr(planning.directorNotes, []).map((x: any) => String(x)) : base.planning.directorNotes,
      teamTasks: normalizedTeamTasks.length ? normalizedTeamTasks : base.planning.teamTasks,
    },
    casting: normalizedCasting.length ? normalizedCasting : base.casting,
    locations: normalizedLocations.length ? normalizedLocations : base.locations,
    risks: {
      readiness: safeNum(risks.readiness, base.risks.readiness, 0, 100),
      missingItems: safeArr(risks.missingItems, []).map((x: any) => String(x)).length
        ? safeArr(risks.missingItems, []).map((x: any) => String(x)) : base.risks.missingItems,
      weakScenes: safeArr(risks.weakScenes, []).map((w: any) => ({
        sceneId: safeStr(w?.sceneId || w?.sceneNumber, ""),
        reason: safeStr(w?.reason, ""),
      })).length
        ? safeArr(risks.weakScenes, []).map((w: any) => ({
            sceneId: safeStr(w?.sceneId || w?.sceneNumber, ""),
            reason: safeStr(w?.reason, ""),
          }))
        : base.risks.weakScenes,
      risks: normalizedRisks.length ? normalizedRisks : base.risks.risks,
    },
    chat: prevChat,
  };
}

function flattenToLegacy(p: PreProduction, brief: DirectorBrief): DirectorSections {
  return flattenSections(p, brief);
}
