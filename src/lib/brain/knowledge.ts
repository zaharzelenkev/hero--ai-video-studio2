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
    targetDurationMin: 10,
    targetDurationMax: 600,
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
    targetDurationMin: 10,
    targetDurationMax: 3600,
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
    targetDurationMax: 3600,
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
    genreId: "interview",
    name: "Interview",
    targetDurationMin: 45,
    targetDurationMax: 3600,
    pace: "medium",
    colorGrade: "neutral",
    coreDirectives: [
      "Чередуй крупность: вопрос — средний план, ответ — крупный. Смена крупности каждые 8-12 секунд.",
      "Вырезай паузы, «эээ» и повторы: плотность мысли — главный критерий.",
      "Реакция слушающего (nod shot) — лучшая перебивка между длинными ответами.",
      "Нижние титры с именем спикера в первые 3 секунды его первого появления."
    ]
  },
  {
    genreId: "vlog",
    name: "Vlog",
    targetDurationMin: 10,
    targetDurationMax: 3600,
    pace: "dynamic",
    colorGrade: "warm",
    coreDirectives: [
      "Джамп-каты — язык влога: режь каждую паузу дыхания, темп речи должен быть плотнее реального.",
      "Каждые 15-20 секунд — смена локации/плана, иначе внимание падает.",
      "Начинай с самого яркого момента дня (cold open), потом объясняй контекст.",
      "B-Roll деталей (руки, еда, дорога) перекрывает монотонные куски речи."
    ]
  },
  {
        genreId: "gaming",
    name: "Gaming",
    targetDurationMin: 10,
    targetDurationMax: 3600,
    pace: "fast",
    colorGrade: "vivid",
    coreDirectives: [
      "Хайлайты вперед: лучший момент (клатч/хедшот) — первые 2 секунды, потом реплей с контекстом.",
      "Синхронизируй килл/событие с битом или SFX-хитом.",
      "Зум-панчи на моменты урона и побед, глитч-переходы между раундами.",
      "Режь всё, где ничего не происходит: в гейминге мертвый эфир непростителен."
    ]
  },
  {
        genreId: "fitness",
    name: "Fitness / Sport",
    targetDurationMin: 10,
    targetDurationMax: 3600,
    pace: "fast",
    colorGrade: "dramatic",
    coreDirectives: [
      "Пик усилия (последнее повторение, рывок) — в кульминацию на дроп музыки.",
      "Чередуй скорость: слоу-мо на пике движения, ускорение на подготовке.",
      "Контровый свет и контраст: мышцы читаются на тёмном фоне.",
      "Жёсткие каты строго в бит — ритм монтажа = ритм тренировки."
    ]
  },
  {
    genreId: "wedding",
    name: "Wedding",
    targetDurationMin: 10,
    targetDurationMax: 3600,
    pace: "slow",
    colorGrade: "warm",
    coreDirectives: [
      "Эмоции — главные кадры: слёзы, смех, объятия. Детали (кольца, платье) — связки между ними.",
      "Долгие кроссфейды (0.8-1.2с) и мягкий тёплый грейд.",
      "Строй историю дня хронологически: сборы → церемония → банкет, кульминация — первый танец/поцелуй.",
      "Никаких резких зумов и глитчей: только плавное движение и Ken Burns."
    ]
  },
  {
    genreId: "food",
    name: "Food / Cooking",
    targetDurationMin: 10,
    targetDurationMax: 1800,
    pace: "medium",
    coreDirectives: [
      "Финальное блюдо — первым кадром (food porn hook), потом процесс.",
      "Макро-детали: пар, соус, разрез — каждые 2-3 плана.",
      "Наезды (zoom-in) на текстуру еды, тёплый грейд усиливает аппетитность.",
      "Звуки готовки (шипение, нарезка) оставляй громкими — это ASMR-крючок."
    ],
    colorGrade: "warm"
  },
  {
    genreId: "musicvideo",
    name: "Music Video",
    targetDurationMin: 10,
    targetDurationMax: 1800,
    pace: "fast",
    colorGrade: "teal-orange",
    coreDirectives: [
      "Каждая склейка — строго в бит. Без исключений.",
      "Чередуй серию коротких кадров (1 бит) с длинным (4 бита) — динамика волной.",
      "На дропе — самый эффектный кадр + вспышка/зум.",
      "Letterbox и teal-orange грейд для кинематографичности."
    ]
  },
  {
    genreId: "education",
    name: "Education / Tutorial",
    targetDurationMin: 60,
    targetDurationMax: 3600,
    pace: "medium",
    colorGrade: "neutral",
    coreDirectives: [
      "Структура: обещание результата (5 сек) → шаги → итог. Зритель должен сразу знать, что получит.",
      "Титры-заголовки на каждом новом шаге (Шаг 1, Шаг 2...).",
      "Вырезай паузы размышления, оставляй плотное объяснение.",
      "Зум-ин на ключевые детали экрана/объекта, о которых идёт речь."
    ]
  },
  {
        genreId: "realestate",
    name: "Real Estate",
    targetDurationMin: 10,
    targetDurationMax: 3600,
    pace: "slow",
    colorGrade: "neutral",
    coreDirectives: [
      "Порядок показа: фасад → гостиная → кухня → спальни → фишка объекта (вид/бассейн) в финале.",
      "Плавные широкие планы, движение всегда в одну сторону в рамках комнаты.",
      "Максимум света: подними экспозицию, окна не должны быть пересвечены.",
      "Титры с ключевыми фактами (метраж, комнаты) на первых секундах каждой зоны."
    ]
  },
  {
    genreId: "ad",
    name: "Product Promo",
    targetDurationMin: 10,
    targetDurationMax: 600,
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
    targetDurationMax: 3600,
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
