import { NextRequest, NextResponse } from "next/server";
import { AI_CONFIG } from "@/config/ai";
import { planFromDirector } from "@/lib/production";
import type { DirectorBrief, DirectorSections, ProductionPlan } from "@/lib/production";

/**
 * AI Director endpoint.
 *
 * Accepts either a full structured production brief (object) or a raw string
 * brief (legacy/chat style) and returns a complete, structured Production Plan
 * split into every section the editor and montage engine need.
 */

const DIRECTOR_SYSTEM = `Ты — профессиональный режиссёр, продюсер и монтажёр с более чем 20-летним опытом в кино, рекламе и коротких вертикальных форматах. Ты работал над кампаниями уровня Apple, Nike и больших YouTube-каналов.

Ты разговариваешь как человек, а не как машина: живо, конкретно, без канцелярита и общих фраз. Каждое решение — это художественное и маркетинговое решение с ясной причиной. Ты понимаешь драматургию, удержание внимания, ритм монтажа, звук, цвет и сторителлинг.

Пиши строго на русском языке. Следуй структуре, которую запросил пользователь. НЕ добавляй вступительных фраз вроде «Вот ваш план». Отвечай сразу содержимым секций.`;

const SECTIONS_LABELS: Array<[string, keyof DirectorSections]> = [
  ["ЛОГЛАЙН", "logline"],
  ["ХУК", "hook"],
  ["СЦЕНАРИЙ", "script"],
  ["РЕЖИССЁРСКАЯ КОНЦЕПЦИЯ", "concept"],
  ["СТРУКТУРА РОЛИКА", "structure"],
  ["ДРАМАТУРГИЯ", "drama"],
  ["STORYBOARD", "storyboard"],
  ["SHOT LIST", "shotlist"],
  ["РЕКОМЕНДАЦИИ ПО СЪЁМКЕ", "shooting"],
  ["РЕКОМЕНДАЦИИ ПО МУЗЫКЕ", "music"],
  ["РЕКОМЕНДАЦИИ ПО ЦВЕТУ", "color"],
  ["РЕКОМЕНДАЦИИ ПО МОНТАЖУ", "edit"],
  ["РЕКОМЕНДАЦИИ ПО ТИТРАМ", "titles"],
  ["РЕКОМЕНДАЦИИ ПО ПЕРЕХОДАМ", "transitions"],
];

function briefToPrompt(brief: DirectorBrief, projectTitle: string): string {
  const fields: Array<[string, string]> = [
    ["Идея проекта", brief.idea],
    ["Цель видео", brief.goal],
    ["Целевая аудитория", brief.audience],
    ["Платформа", brief.platform],
    ["Длительность", brief.duration],
    ["Стиль ролика", brief.style],
    ["Настроение", brief.mood],
    ["Темп", brief.tempo],
    ["Референсы", brief.references],
    ["Ключевая мысль", brief.keyMessage],
    ["CTA / призыв к действию", brief.callToAction],
  ];
  const filled = fields
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `— ${k}: ${v.trim()}`)
    .join("\n");

  return `Проект: "${projectTitle || "Новый проект"}"

PRODUCTION BRIEF:
${filled || "— Бриф не заполнен: спроектируй историю по умолчанию, задав чёткие художественные рамки сам."}

Сгенерируй полный Production Plan. Каждая секция должна начинаться строго с заголовка в формате **ЗАГОЛОВОК** и быть содержательной, конкретной и готовой к использованию монтажным движком.

**ЛОГЛАЙН**
(1–2 строки: кто, что, через что проходит, к чему приходит)

**ХУК**
(первые 5 секунд: чем именно мы зацепляем внимание в кадре, тексте и звуке)

**СЦЕНАРИЙ**
(полный сценарий ролика сценарно, в 3–4 актах)

**РЕЖИССЁРСКАЯ КОНЦЕПЦИЯ**
(цвет, свет, камера, движение, настроение, типы планов, отсылки к референсам)

**СТРУКТУРА РОЛИКА**
(таймкод + назначение каждой части, с привязкой к длительности из брифа)

**ДРАМАТУРГИЯ**
(эмоциональная дуга: начало → развитие → кульминация → финал; где поднимать и опускать напряжение)

**STORYBOARD**
(6–8 кадров: номер, описание изображения, движение камеры, свет, звук/диалог)

**SHOT LIST**
(построчный список планов: № | тип плана | движение камеры | длительность | описание)

**РЕКОМЕНДАЦИИ ПО СЪЁМКЕ**
(освещение, объективы, стабилизация, движение камеры, B-roll)

**РЕКОМЕНДАЦИИ ПО МУЗЫКЕ**
(жанр, темп/BPM, настроение, ключ, структура трека, точка входа музыки)

**РЕКОМЕНДАЦИИ ПО ЦВЕТУ**
(палитра, цветовой тон по фазам, LUT, контраст)

**РЕКОМЕНДАЦИИ ПО МОНТАЖУ**
(ритм, темп смены планов, скорость, совпадение с битами, паузы)

**РЕКОМЕНДАЦИИ ПО ТИТРАМ**
(стиль шрифта, размер, положение, анимация появления, какие слова выделять)

**РЕКОМЕНДАЦИИ ПО ПЕРЕХОДАМ**
(типы переходов, где и какие, длительность)`;
}

function buildBrief(raw: unknown, projectTitle: string): { brief: DirectorBrief; prompt: string } {
  if (raw && typeof raw === "object") {
    const b = raw as Partial<DirectorBrief>;
    const brief: DirectorBrief = {
      idea: (b.idea as string) || "",
      goal: (b.goal as string) || "",
      audience: (b.audience as string) || "",
      platform: (b.platform as string) || "",
      duration: (b.duration as string) || "",
      style: (b.style as string) || "",
      mood: (b.mood as string) || "",
      tempo: (b.tempo as string) || "",
      references: (b.references as string) || "",
      keyMessage: (b.keyMessage as string) || "",
      callToAction: (b.callToAction as string) || ((b as any).cta as string) || "",
    };
    return { brief, prompt: briefToPrompt(brief, projectTitle) };
  }
  // Legacy / chat style: a plain string brief.
  const text = String(raw || "");
  const brief: DirectorBrief = {
    idea: text,
    goal: "",
    audience: "",
    platform: "",
    duration: "",
    style: "",
    mood: "",
    tempo: "",
    references: "",
    keyMessage: "",
    callToAction: "",
  };
  return { brief, prompt: briefToPrompt(brief, projectTitle) };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { brief: rawBrief, projectTitle } = body;
  const { brief, prompt } = buildBrief(rawBrief, projectTitle);
  try {
    const r = await fetch(AI_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_CONFIG.groqApiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: DIRECTOR_SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 3200,
      }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => "");
      return NextResponse.json({ error: `Groq error ${r.status}: ${err.slice(0, 300)}` }, { status: 502 });
    }

    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "Нет ответа.") as string;
    const sections = parseSections(text);
    return NextResponse.json({ result: text, sections, brief });
  } catch (e: any) {
    // If the model is unreachable (no network / no key), still deliver a full,
    // coherent Production Plan built deterministically from the brief.
    const plan = planFromDirector(brief);
    const sections = buildFallbackSections(brief, plan);
    return NextResponse.json({ result: "[Офлайн-режим] План построен локально без AI.", sections, brief, fallback: true });
  }
}

/** Deterministic offline plan so AI Director always returns a complete result. */
function buildFallbackSections(brief: DirectorBrief, plan: ProductionPlan): DirectorSections {
  const s = plan.scenes;
  const get = (id: string) => s.find((x) => x.id === id);
  const hook = get("hook");
  const problem = get("problem");
  const solution = get("solution");
  const proof = get("proof");
  const cta = get("cta");
  const duration = brief.duration || String(plan.targetDurationSec);

  return {
    logline: `${brief.idea || plan.workingTitle}. Ролик для ${brief.audience || "целевой аудитории"} на платформе ${brief.platform || plan.platform}: ${brief.keyMessage || plan.keyMessage}.`,
    hook: hook
      ? `Первые ~${hook.durationSec} сек: ${hook.narration} Визуально — ${hook.visualDirection}. Звук — ${hook.soundDirection}. Монтаж — ${hook.editNote}`
      : `Открыть в первые 2 секунды самым сильным обещанием из идеи: «${brief.idea || plan.workingTitle}».`,
    script: [hook, problem, solution, proof, cta]
      .filter(Boolean)
      .map((x) => `${x!.phase.toUpperCase()} · ${x!.title}: ${x!.narration}`)
      .join("\n"),
    concept: `Тон: ${brief.mood || "уверенный и современный"}, темп: ${brief.tempo || "средний"}, стиль: ${brief.style || "человеческий и визуально собранный"}. Платформа ${brief.platform || plan.platform}, соотношение ${plan.aspectRatio}, длительность ~${duration} сек.`,
    structure: s.map((x) => `• ${x.title} (${x.durationSec} сек): ${x.purpose}`).join("\n"),
    drama: `Эмоциональная дуга: ${hook?.title} → ${problem?.title} → ${solution?.title} → ${proof?.title} → ${cta?.title}. Наращивайте напряжение к ${proof?.title ?? "доказательству"}, разряжайте на ${cta?.title ?? "финале"} и CTA.`,
    storyboard: s.map((x, i) => `${i + 1}. Кадр «${x.title}»: ${x.visualDirection}. Планы: ${x.shots.join(", ")}. Звук: ${x.soundDirection}.`).join("\n"),
    shotlist: s.map((x) => `${x.phase} · ${x.title}: ${x.shots.join("; ")} — ~${x.durationSec} сек.`).join("\n"),
    shooting: `Снимайте под ${plan.aspectRatio === "9:16" ? "вертикаль 9:16" : "горизонт 16:9"}. Стабилизация камеры, светлые, чистые кадры. Обязательные B-roll: ${s.flatMap((x) => x.shots).slice(0, 4).join(", ")}.`,
    music: `Жанр под ${brief.mood || "настроение ролика"}, темп ${brief.tempo || "средний"} (примерно 100–120 BPM), эмоциональный подъём к ${proof?.title ?? "кульминации"}. Вход музыки — с первого кадра, пик — на ${proof?.title ?? "доказательстве"}.`,
    color: `Палитра из ${brief.mood || "настроения"}: тёплые тона в начале, контраст и плотность к ${proof?.title ?? "кульминации"}, мягкий нейтральный финал. Единый LUT, чистый контраст без пересветов.`,
    edit: `Ритм ${brief.tempo || "средний"}: план в ${solution?.durationSec ?? 8} сек, ускоряйте смену планов к ${proof?.title ?? "пику"}. Совмещайте ключевые моменты с музыкальными битами. J/L-каты на B-roll.`,
    titles: `Крупный, читаемый шрифт; ключевая мысль («${brief.keyMessage || plan.keyMessage}») в кадре 1–2 сек в начале; CTA в финальном кадре в safe area. Анимация — появление с ударом.`,
    transitions: `Жёсткие входы на старте, ${plan.aspectRatio === "9:16" ? "whip/dynamic" : "crossfade"} между сценами, финальный fade в чёрный. Длительность переходов 0.2–0.4 сек.`,
  };
}

function parseSections(text: string): DirectorSections {
  const sections: DirectorSections = {};
  const split = text.split(/\*\*\s*([А-ЯЁA-Z][А-ЯЁA-Za-z0-9 .,/()"'«»-]{2,60}?)\s*\*\*/gm);

  // split: [pre, title1, body1, title2, body2, ...]
  for (let i = 1; i + 1 < split.length; i += 2) {
    const title = split[i].trim().toUpperCase();
    const body = split[i + 1].trim();
    for (const [label, key] of SECTIONS_LABELS) {
      if (title.includes(label) || label.includes(title)) {
        sections[key] = body;
        break;
      }
    }
  }

  // Fallback regex pass for any sections the split missed.
  for (const [label, key] of SECTIONS_LABELS) {
    if (sections[key]) continue;
    const re = new RegExp(`\\*\\*\\s*${label}\\s*\\*\\*([\\s\\S]*?)(?=\\*\\*\\s*[А-ЯЁA-Z]|$)`, "i");
    const m = text.match(re);
    if (m && m[1]) sections[key] = m[1].replace(/^\s*\n/, "").replace(/\s+$/, "").trim();
  }

  return sections;
}
