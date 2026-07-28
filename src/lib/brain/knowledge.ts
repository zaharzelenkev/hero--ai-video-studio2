import { loadLessonsByGenre, saveExperienceLesson } from "../db";
import { uid } from "../id";

export interface GenreKnowledge {
  genreId: string;
  name: string;
  targetDurationMin: number;
  targetDurationMax: number;
  pace: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;
  coreDirectives: string[];
}

// Built-in foundational knowledge. The engine will build upon this.
export const BASE_KNOWLEDGE: GenreKnowledge[] = [
  {
    genreId: "tiktok",
    name: "TikTok / Reels",
    targetDurationMin: 15,
    targetDurationMax: 45,
    pace: "dynamic",
    colorGrade: "vivid",
    coreDirectives: [
      "1-2 секунды на первый кадр (Hook). Зритель должен увидеть движение или лицо.",
      "Никогда не делай кадры длиннее 3 секунд, иначе зритель свайпнет.",
      "Динамичный монтаж (Jump cuts), если есть спикер, вырезай каждое дыхание.",
      "Большой, агрессивный текст (Yellow/White) по центру.",
    ]
  },
  {
    genreId: "travel",
    name: "Cinematic Travel",
    targetDurationMin: 30,
    targetDurationMax: 120,
    pace: "slow",
    colorGrade: "cinematic",
    coreDirectives: [
      "Используй J-Cuts: звук новой сцены начинается раньше картинки.",
      "Темп должен совпадать с дыханием пейзажа: дай зрителю насладиться кадром (4-6 секунд).",
      "Чередуй масштаб: Крупный план (деталь) -> Общий план (пейзаж).",
      "Обязателен эффект Ken Burns для статичных кадров, чтобы всегда было плавное движение."
    ]
  },
  {
    genreId: "podcast",
    name: "Podcast / Interview",
    targetDurationMin: 60,
    targetDurationMax: 600,
    pace: "medium",
    colorGrade: "none",
    coreDirectives: [
      "Звук — король. Обязателен Voice Enhance и удаление тишины.",
      "B-Roll: перекрывай лицо спикера тематическими кадрами, когда он говорит о чем-то длинном.",
      "Фокус на глазах: всегда используй лица, если они есть."
    ]
  },
  {
    genreId: "ad",
    name: "Product Promo",
    targetDurationMin: 15,
    targetDurationMax: 30,
    pace: "fast",
    colorGrade: "vivid",
    coreDirectives: [
      "Фокус на продукте: первые 3 секунды должны интриговать.",
      "Используй очень динамичную музыку и резкие зумы.",
      "Текст должен легко читаться и появляться с анимацией slide-left."
    ]
  }
];

export async function getKnowledgeForGenre(genreId: string): Promise<string> {
  const base = BASE_KNOWLEDGE.find(k => k.genreId === genreId) || BASE_KNOWLEDGE.find(k => k.genreId === "tiktok")!;
  
  let pastLessons = "";
  try {
    const lessons = await loadLessonsByGenre(genreId);
    if (lessons.length > 0) {
      const recent = lessons.sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
      pastLessons = "\nИЗВЛЕЧЕННЫЙ ОПЫТ (ПРЕДЫДУЩИЕ ОШИБКИ):\n" + recent.map(r => "- " + r.lesson).join("\n");
    }
  } catch(e) {
    console.warn("Could not load experience", e);
  }

  return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\n${base.coreDirectives.map(d => "- " + d).join("\n")}${pastLessons}`;
}

export async function saveLearnedLesson(genreId: string, lesson: string) {
  try {
    await saveExperienceLesson({
      id: uid("exp"),
      genre: genreId,
      lesson,
      createdAt: Date.now()
    });
    console.log(`🧠 Мозг усвоил новый урок для \${genreId}: \${lesson}`);
  } catch(e) {
    console.warn("Could not save lesson", e);
  }
}
