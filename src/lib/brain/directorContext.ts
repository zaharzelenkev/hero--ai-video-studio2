/**
 * Builds a CONTEXT SNAPSHOT that the AI Director sees BEFORE EVERY answer.
 *
 * It is a dense, structured dump of everything the user has already told us:
 * brief, existing preproduction docs, recent chat history. The idea is that
 * the director NEVER answers from the prompt alone — it always sees the
 * whole project.
 */

import type {
  DirectorBrief,
  PreProduction,
  ChatMessage,
} from "@/lib/production";

const MAX_CHAT_MESSAGES = 14;

function summarizeBrief(b: DirectorBrief): string {
  const lines: string[] = [];
  const push = (label: string, v?: string) => {
    if (v && v.trim()) lines.push(`- ${label}: ${v.trim()}`);
  };
  push("Тема / идея", b.idea);
  push("Ниша / контекст", b.style);
  push("Цель ролика (что зритель должен сделать/почувствовать)", b.goal);
  push("Целевая аудитория", b.audience);
  push("Платформа", b.platform);
  push("Формат / длительность (сек)", b.duration);
  push("Настроение", b.mood);
  push("Темп", b.tempo);
  push("Ключевая мысль", b.keyMessage);
  push("CTA / призыв", b.callToAction);
  push("Референсы", b.references);
  push("Локация", b.location);
  push("Материалы", b.materials);
  return lines.join("\n") || "- Бриф пока пуст — задай художественные рамки сам.";
}

function summarizePreprod(p: PreProduction | null | undefined): string {
  if (!p) return "— Препродакшен ещё не сгенерирован.\n";
  const out: string[] = [];

  if (p.idea?.refined) out.push(`[Идея, утончённая] ${p.idea.refined}`);
  if (p.idea?.pros?.length || p.idea?.cons?.length) {
    out.push(
      `[Сильные стороны] ${(p.idea.pros || []).slice(0, 4).join("; ")}`,
      `[Слабые стороны / зоны роста] ${(p.idea.cons || []).slice(0, 4).join("; ")}`,
      `[Оценка потенциала] ${p.idea.potential}/10`
    );
  }

  if (p.logline?.primary) {
    out.push(`[Логлайн] ${p.logline.primary}`);
    if (p.logline.hero) out.push(`[Герой] ${p.logline.hero}`);
    if (p.logline.goal) out.push(`[Цель героя] ${p.logline.goal}`);
    if (p.logline.conflict) out.push(`[Конфликт] ${p.logline.conflict}`);
    if (p.logline.stakes) out.push(`[Ставки] ${p.logline.stakes}`);
  }

  if (p.treatment?.title) out.push(`[Рабочее название] ${p.treatment.title}`);
  if (p.treatment?.genre) out.push(`[Жанр / формат] ${p.treatment.genre}`);
  if (p.treatment?.tone) out.push(`[Тон] ${p.treatment.tone}`);
  if (p.treatment?.synopsisLong)
    out.push(`[Treatment / синопсис] ${p.treatment.synopsisLong.slice(0, 1200)}`);
  if (p.treatment?.act1) out.push(`[Акт 1 — хук] ${p.treatment.act1.slice(0, 600)}`);
  if (p.treatment?.act2) out.push(`[Акт 2 — развитие] ${p.treatment.act2.slice(0, 600)}`);
  if (p.treatment?.act3) out.push(`[Акт 3 — финал/CTA] ${p.treatment.act3.slice(0, 600)}`);
  if (p.treatment?.characters?.length) {
    out.push(
      `[Персонажи] ${p.treatment.characters
        .map((c) => `${c.name} (${c.role}) — ${c.description}`)
        .join(" | ")}`
    );
  }

  if (p.script?.concept) out.push(`[Сценарная концепция] ${p.script.concept}`);
  if (p.script?.scenes?.length) {
    const scenes = p.script.scenes
      .slice(0, 12)
      .map((s, i) => {
        const dialogue = (s.dialogue || [])
          .map((d) => `${d.character}: ${d.line}`)
          .join(" / ");
        return `С${i + 1} (${s.durationSec || "?"}с, ${s.heading || ""}): ${(s.action || "").slice(0, 220)}${
          dialogue ? " :: " + dialogue.slice(0, 220) : ""
        }`;
      })
      .join("\n  ");
    out.push(`[Сценарий, ${p.script.scenes.length} сцен]\n  ${scenes}`);
  }

  if (p.vision?.overallStyle) out.push(`[Режиссёрское видение] ${p.vision.overallStyle}`);
  if (p.vision?.visualLanguage) out.push(`[Язык камеры] ${p.vision.visualLanguage}`);
  if (p.vision?.scenes?.length) {
    const v = p.vision.scenes
      .slice(0, 12)
      .map((s, i) => {
        const sh = s.shot || {};
        return `V${i + 1} «${s.sceneTitle || ""}»: ${sh.composition || ""} / ${sh.cameraMovement || ""} / свет: ${sh.lighting || ""} / цвет: ${(sh.colorPalette || []).join(", ")} / звук: ${sh.sound || ""} / эмоция: ${sh.emotion || ""}`;
      })
      .join("\n  ");
    out.push(`[Визуальный разбор по сценам]\n  ${v}`);
  }

  if (p.storyboard?.frames?.length) {
    const f = p.storyboard.frames
      .slice(0, 8)
      .map((fr, i) => `F${i + 1} (${fr.shotSize}): ${(fr.description || "").slice(0, 140)}`)
      .join(" | ");
    out.push(`[Storyboard, ${p.storyboard.frames.length} кадров] ${f}`);
  }

  if (p.shotlist?.shots?.length) {
    const s = p.shotlist.shots
      .slice(0, 12)
      .map((sh, i) => `#${i + 1} ${sh.shotType} ${sh.lens} ${sh.movement} — ${sh.description?.slice(0, 80)}`)
      .join(" | ");
    out.push(`[Shot list, ${p.shotlist.shots.length} планов] ${s}`);
  }

  if (p.risks?.weakScenes?.length) {
    out.push(
      `[Слабые сцены / риски по драматургии] ${p.risks.weakScenes
        .map((w) => `${w.sceneId}: ${w.reason}`)
        .join(" | ")}`
    );
  }
  if (p.risks?.risks?.length) {
    out.push(
      `[Критичные продакшн-риски] ${p.risks.risks
        .filter((r) => r.severity === "high" || r.severity === "critical")
        .slice(0, 5)
        .map((r) => `[${r.severity}] ${r.description} → ${r.mitigation}`)
        .join(" | ")}`
    );
  }

  return out.join("\n") || "— Препродакшен пока пуст.\n";
}

function summarizeChat(chat: ChatMessage[] | undefined): string {
  if (!chat || chat.length === 0) return "— История переписки пуста.\n";
  const tail = chat.slice(-MAX_CHAT_MESSAGES);
  return tail
    .map((m) => {
      const who = m.role === "user" ? "USER" : "DIRECTOR";
      return `${who}: ${m.text.replace(/\s+/g, " ").trim().slice(0, 800)}`;
    })
    .join("\n");
}

export function buildDirectorContext(params: {
  brief: DirectorBrief;
  preprod: PreProduction | null | undefined;
  projectTitle: string;
  userMessage?: string;
  chatHistory?: ChatMessage[];
  focus?: "full" | "stage" | "chat";
  stage?: string;
}): string {
  const { brief, preprod, projectTitle, userMessage, chatHistory, focus, stage } = params;
  return [
    `======================================================`,
    `ПРОЕКТ: «${projectTitle || "Новый проект"}»`,
    `КОНТЕКСТ: ${focus === "chat" ? "живой разговор с режиссёром" : focus === "stage" ? `перегенерация раздела «${stage}»` : "полная сборка препродакшена"}`,
    `======================================================`,
    ``,
    `=== 1. ТЕМА / НИША / ЦА / ПЛОЩАДКА / ФОРМАТ / ЦЕЛЬ ===`,
    summarizeBrief(brief),
    ``,
    `=== 2. ТЕКУЩИЕ ДОКУМЕНТЫ ПРОЕКТА ===`,
    `(идея, логлайн, treatment, сценарий, визуальное видение, цветовая палитра, эмоции, герои, конфликт, разгадка/решение, CTA, storyboard, shot list, риски)`,
    summarizePreprod(preprod),
    ``,
    `=== 3. ПОСЛЕДНИЕ СООБЩЕНИЯ ПЕРЕПИСКИ ===`,
    summarizeChat(chatHistory || preprod?.chat),
    userMessage
      ? `\n=== 4. ТЕКУЩЕЕ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ ===\n${userMessage.trim()}\n`
      : "",
    `======================================================`,
    `Прежде чем отвечать — ОБЯЗАТЕЛЬНО ПРОАНАЛИЗИРУЙ все блоки выше.
Не отвечай изолированно от проекта. Если пользователь пишет "сделай хук сильнее" —
ты уже знаешь тему, нишу, ЦА, платформу, формат, цель, текущий сценарий и не спрашиваешь это заново.
Опирайся на КОНКРЕТНЫЕ детали этого проекта (название, герой, сцены, кадры, длительность, платформа),
а не на общие режиссёрские истины.`,
  ].join("\n");
}
