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
    name: "TikTok / Reels / Shorts",
    targetDurationMin: 15,
    targetDurationMax: 60,
    pace: "dynamic",
    colorGrade: "vivid",
    coreDirectives: [
      "1-2 секунды на первый кадр (Hook). Зритель должен увидеть движение или лицо, иначе свайпнет.",
      "Динамичный монтаж (Jump cuts), если есть спикер, вырезай каждое дыхание (Dead air = death).",
      "Большой, агрессивный текст (Yellow/White) по центру (Hormozi style).",
      "Меняй масштаб (Zoom IN/OUT) каждые 3 секунды, даже если это одно и то же видео.",
      "Резкие звуковые эффекты (Whoosh, Riser) на сменах кадров и появлении текста."
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
      "Используй J-Cuts и L-Cuts: звук новой сцены начинается раньше картинки, или картинка уходит, а звук остается.",
      "Темп должен совпадать с дыханием пейзажа: дай зрителю насладиться кадром (4-6 секунд).",
      "Чередуй масштаб: Крупный план (деталь) -> Общий план (пейзаж). Никогда не ставь два общих плана подряд.",
      "Обязателен эффект Ken Burns для статичных кадров, чтобы всегда было плавное движение.",
      "Speed Ramping: Замедляй кадры в кульминации (Слоу-мо), ускоряй неважные переходы (Time-lapse)."
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
      "B-Roll: перекрывай лицо спикера тематическими кадрами, когда он говорит о чем-то длинном (правило 10 секунд).",
      "Фокус на глазах: всегда используй лица. При долгой речи делай медленный Zoom In.",
      "Используй L-Cuts: оставляй голос говорящего, пока показываешь реакцию второго человека или B-Roll."
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
      "Фокус на продукте: первые 3 секунды должны интриговать и показывать товар.",
      "Монтаж по ритму (Match Cuts) — режь ровно в биты музыки.",
      "Текст должен легко читаться и появляться с анимацией (Slide, Pop).",
      "Заканчивай сильным призывом к действию (CTA) на последних 3-5 секундах."
    ]
  },
  {
    genreId: "documentary",
    name: "Documentary",
    targetDurationMin: 120,
    targetDurationMax: 600,
    pace: "medium",
    colorGrade: "cinematic",
    coreDirectives: [
      "Соблюдай Правило Шести Уолтера Мёрча (Эмоция > История > Ритм > Направление взгляда > 2D плоскость > 3D пространство).",
      "Закадровый голос должен вести историю, визуальный ряд может метафорически дополнять её.",
      "Используй медленный темп для нагнетания обстановки."
    ]
  }
];

export const MASTERCLASS_PATTERNS = [
  "ПАТТЕРН УДЕРЖАНИЯ (Retention Hook): Сначала покажи самый эпичный кадр на 1 сек -> Черный экран (0.5 сек) со звуком -> Начало истории.",
  "ПАТТЕРН ЭМОЦИЙ (Murch's Rule): Склеивай кадры не по движению, а по эмоции. Если человек удивляется, следующий кадр должен быть тем, на что он смотрит (POV).",
  "ПАТТЕРН РИТМА (Beat Sync): Чередуй длинные кадры (успокоение) и серию коротких (напряжение). [4с - 4с - 1с - 1с - 1с - 4с].",
  "ПАТТЕРН J-CUT: Звук из следующего кадра начинается за 1-2 секунды до появления самого кадра. Это сглаживает переход."
];

export async function getKnowledgeForGenre(genreId: string): Promise<string> {
  const base = BASE_KNOWLEDGE.find(k => k.genreId === genreId) || BASE_KNOWLEDGE.find(k => k.genreId === "tiktok")!;
  
  let pastLessons = "";
  try {
    const lessons = await loadLessonsByGenre(genreId);
    if (lessons.length > 0) {
      const recent = lessons.sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
      pastLessons = "\\n\\nИЗВЛЕЧЕННЫЙ ОПЫТ (ПРЕДЫДУЩИЕ ОШИБКИ):\\n" + recent.map(r => "- " + r.lesson).join("\\n");
    }
  } catch(e) {
    console.warn("Could not load experience", e);
  }

  const patterns = MASTERCLASS_PATTERNS.join("\\n- ");

  return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\n${base.coreDirectives.map(d => "- " + d).join("\n")}\n\nПРОДВИНУТЫЕ ПАТТЕРНЫ МОНТАЖА (MASTERCLASS):\n- ${patterns}${pastLessons}`;
}

export async function saveLearnedLesson(genreId: string, lesson: string) {
  try {
    await saveExperienceLesson({
      id: uid("exp"),
      genre: genreId,
      lesson,
      createdAt: Date.now()
    });
    console.log(`🧠 Мозг усвоил новый урок для ${genreId}: ${lesson}`);
  } catch(e) {
    console.warn("Could not save lesson", e);
  }
}
