import { NextRequest, NextResponse } from "next/server";
import { flattenSections } from "@/lib/production";
import type {
  DirectorBrief,
  DirectorSections,
  PreProduction,
} from "@/lib/production";
import {
  DIRECTOR_SYSTEM_PROMPT,
  DIRECTOR_VOICE_PROMPT,
} from "@/lib/brain/directorSystemPrompt";
import { buildOfflinePreprod } from "@/lib/brain/offlinePreprod";
import { localDirectorReply } from "@/lib/brain/localDirector";
import { buildDirectorContext } from "@/lib/brain/directorContext";
import { callGroq } from "@/lib/ai/groqClient";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function fullGenerationPrompt(
  brief: DirectorBrief,
  projectTitle: string,
  existing: PreProduction | null
): string {
  const ctx = buildDirectorContext({
    brief,
    preprod: existing,
    projectTitle,
    focus: "full",
  });
  return (
    ctx +
    `\n\nНа основе контекста выше сгенерируй ПОЛНЫЙ ПАКЕТ ПРЕПРОДАКШЕНА в JSON по схеме из системного промпта. ` +
    `Верни только JSON — без комментариев и без markdown.`
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
    `\n\nПользователь хочет ПЕРЕСОЗДАТЬ раздел "${stage}"${userPatch ? ` с комментарием: «${userPatch}»` : ""}.\n` +
    `Учти все изменения в других разделах (логлайн согласуется с идеей, сценарий с логлайном, storyboard со сценарием и т.д.). ` +
    `Сохрани лучшие детали от предыдущей версии, если они не противоречат обновлениям.\n` +
    `Верни ТОЛЬКО JSON фрагмент этого раздела (по той же схеме, что и в полном ответе) — без обёртки в дополнительный ключ, без markdown.`
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

  try {
    if (mode === "chat") {
      const userText = String(userMessage || "").trim();
      const sys = DIRECTOR_VOICE_PROMPT;
      const usr = chatPrompt(brief, projectName, basePreprod, userText);

      const groq = await callGroq({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        temperature: 0.9,
        maxTokens: 1400,
      });

      const reply = groq.ok
        ? groq.text.trim()
        : localDirectorReply(userText, brief, basePreprod);

      return NextResponse.json({ reply });
    }

    if (mode === "stage" && stage) {
      const sys = DIRECTOR_SYSTEM_PROMPT;
      const usr = stageRegenerationPrompt(
        String(stage),
        brief,
        projectName,
        basePreprod,
        userMessage ? String(userMessage) : undefined
      );
      const groq = await callGroq({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        temperature: 0.7,
        maxTokens: 5000,
        responseFormat: { type: "json_object" },
      });

      let data: any = null;
      if (groq.ok) {
        try {
          data = JSON.parse(extractJson(groq.text));
        } catch {
          data = null;
        }
      }
      if (!data) data = pickStageFromPreprod(basePreprod, String(stage));

      return NextResponse.json({ stage, data });
    }

    // full generation
    const sys = DIRECTOR_SYSTEM_PROMPT;
    const usr = fullGenerationPrompt(brief, projectName, existingPreprod || null);
    const groq = await callGroq({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: 0.65,
      maxTokens: 14000,
      responseFormat: { type: "json_object" },
    });

    let parsed: any = null;
    if (groq.ok) {
      try {
        parsed = JSON.parse(extractJson(groq.text));
      } catch {
        parsed = null;
      }
    }

    const preprod: PreProduction = parsed
      ? normalizePreprod(parsed, brief, basePreprod)
      : basePreprod;
    const sections = flattenToLegacy(preprod, brief);
    return NextResponse.json({ sections, preprod, brief });
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
        stage,
        data: pickStageFromPreprod(basePreprod, String(stage)),
      });
    }
    return NextResponse.json({
      sections: flattenToLegacy(basePreprod, brief),
      preprod: basePreprod,
      brief,
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

function pickStageFromPreprod(preprod: PreProduction, stage: string): any {
  switch (stage) {
    case "idea": return preprod.idea;
    case "logline": return preprod.logline;
    case "treatment": return preprod.treatment;
    case "script": return preprod.script;
    case "vision": return preprod.vision;
    case "storyboard": return preprod.storyboard;
    case "shotlist": return preprod.shotlist;
    case "planning": return preprod.planning;
    case "casting": return preprod.casting;
    case "locations": return preprod.locations;
    case "risks": return preprod.risks;
    default: return null;
  }
}

function flattenToLegacy(p: PreProduction, brief: DirectorBrief): DirectorSections {
  return flattenSections(p, brief);
}
