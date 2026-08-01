import type {
  DirectorBrief,
  PreProduction,
  ScriptScene,
  VisionShot,
} from "../production";
import { emptyPreProduction } from "../production";
import { uid } from "../id";

/**
 * Локальный (без внешней модели) генератор препродакшена по брифу.
 * Используется как фоллбек, когда Groq недоступна, и как стартовый шаблон
 * при первом заходе пользователя в AI Director.
 */
export function buildOfflinePreprod(brief: DirectorBrief): PreProduction {
  const p = emptyPreProduction();

  const idea = brief.idea.trim() || "Короткое видео без чёткой темы";
  const audience = brief.audience.trim() || "Активная аудитория 18–45 лет, интересующаяся темой проекта";
  const platform = brief.platform || "YouTube";
  const duration = parseInt(brief.duration, 10) || 45;
  const mood = brief.mood || "уверенный, современный";
  const style = brief.style || "чистый кинематографичный";
  const keyMessage = brief.keyMessage || idea;
  const cta = brief.callToAction || "Поделитесь впечатлениями и подпишитесь";
  const isShort = /tiktok|reel|short|тик|шортс/i.test(platform) || duration <= 30;

  // --- IDEA ---
  p.idea = {
    refined: `${idea} — в основе лежит ясная драматургическая дуга: зритель видит проблему, узнаёт решение и получает эмоциональный payoff, привязанный к сообщению «${keyMessage}».`,
    audience,
    potential: 7,
    pros: [
      "Чётко сформулированная тема — есть за что зацепиться в первом кадре.",
      "Сообщение понятно и может быть выражено визуально без длинных объяснений.",
      `Формат ${platform} соответствует ожиданиям аудитории.`,
      `Длительность ~${duration} сек позволяет раскрыть мысль и удержать внимание.`,
    ],
    cons: [
      "Нужен сильный визуальный хук в первые 2 секунды, иначе риск потери зрителя.",
      "Без деталей в конфликте/решении история превратится в перечисление фактов.",
      "Стоит заранее продумать финальный CTA, чтобы не терять конверсию.",
    ],
    variants: [
      {
        id: uid("iv"),
        title: "Классическая схема «проблема — решение — результат»",
        concept: "Зритель видит боль героя, затем получение решения и трансформацию. Проверенная драматургическая модель.",
        audience,
        hook: "Открываем кадром до трансформации — зритель сразу хочет узнать, как это изменилось.",
        potential: 8,
        reasoning: "Максимально понятная структура для любого формата; высокая конверсия в досмотр.",
      },
      {
        id: uid("iv"),
        title: "История от первого лица / testimonial",
        concept: "Рассказывает реальный человек — это добавляет доверия и вовлечения.",
        audience,
        hook: "Герой в первом кадре задаёт зрителю прямой вопрос.",
        potential: 7,
        reasoning: "Отлично работает для образовательного, продуктового и личного контента.",
      },
      {
        id: uid("iv"),
        title: "Визуальный аттракцион / cinematic mood",
        concept: "Ставка на атмосферу, свет и монтаж под музыку; минимум слов, максимум ощущений.",
        audience,
        hook: "Самый сильный и неожиданный кадр идёт первым, вопрос «как это сделано?» удерживает.",
        potential: 6,
        reasoning: "Хорош для брендового и арт-контента, но требует высокого качества съёмки.",
      },
    ],
  };

  // --- LOGLINE ---
  const hero = "Герой (зритель/персонаж)";
  const goalText = `хочет получить результат: «${keyMessage}»`;
  const conflictText = "но сталкивается с сомнениями, нехваткой информации или визуальным препятствием";
  const stakes = `и если он не разберётся за ${duration} секунд — потеряет время/возможность/эмоцию`;
  const primary = `${hero} ${goalText}, ${conflictText} — ${stakes}.`;
  p.logline = {
    primary,
    hero,
    goal: goalText,
    conflict: conflictText,
    stakes,
    variants: [
      { id: uid("lv"), text: `За ${duration} секунд зритель вместе с героем проходит путь «${keyMessage}» и выходит с ясным следующим шагом.`, strengths: ["Чёткий тайминг", "Ясный результат"], weaknesses: ["Нужен яркий антагонист/препятствие"] },
      { id: uid("lv"), text: `История о том, как один кадр меняет восприятие темы «${idea}».`, strengths: ["Визуально-сильная подача", "Фокус на эмоции"], weaknesses: ["Без драматургии может остаться красивой картинкой"] },
      { id: uid("lv"), text: `Короткое эмоциональное путешествие: от «а что это?» к «я это хочу».`, strengths: ["Чистая арка трансформации", "Хорошо для рекламы"], weaknesses: ["Требует точной актёрской игры"] },
    ],
  };

  // --- TREATMENT ---
  p.treatment = {
    title: idea.replace(/[.!?].*$/, "").slice(0, 60) || "Рабочее название",
    logline: primary,
    genre: isShort ? "Короткий вертикальный ролик / рекламный" : /film|док|кино/i.test(platform) ? "Документальный / кинематографичный" : "Брендовое видео / YouTube-ролик",
    tone: `${mood}; ${style}`,
    themes: ["трансформация", "честность vs шаблон", "внимание к детали", "эмоциональная достоверность"],
    synopsisLong: `Ролик открывается сильным визуальным хуком — зритель сразу понимает ставку и эмоцию. Герой (или сам зритель в лице рассказчика) сталкивается с темой «${idea}»: сначала это кажется привычным или неразрешимым. По ходу истории открывается новая перспектива, мы видим процесс, детали и результат — всё это выстроено под общую эмоцию «${mood}». Финал даёт ясный посыл «${keyMessage}» и прямой призыв к действию: «${cta}».`,
    act1: `Акт 1 (завязка, ~${Math.round(duration * 0.2)} сек). В первых 2–3 секундах даём сильный образ или фразу, останавливающую скролл. Знакомим с контекстом: где мы, кто герой, что происходит. Намёк на проблему или вопрос.`,
    act2: `Акт 2 (развитие и поворот, ~${Math.round(duration * 0.5)} сек). Показываем процесс, столкновение героя с препятствием, детали. Эмоциональная дуга наращивается: музыка поднимается, планы укрупняются, ритм ускоряется. К финалу акта даём key moment — момент истины.`,
    act3: `Акт 3 (кульминация и развязка, ~${Math.round(duration * 0.3)} сек). Результат визуально и эмоционально. Зритель получает payoff — видит трансформацию. Последние 3–5 секунд отводятся CTA: «${cta}».`,
    characters: [
      { name: "Герой", role: "Главный персонаж / аватар зрителя", description: "Выглядит как представитель ЦА; живой, с микро-эмоциями; зритель должен узнать себя." },
      { name: "Голос за кадром (опционально)", role: "Рассказчик / проводник", description: "Спокойный, уверенный тембр; не переигрывает, помогает собрать смысл." },
    ],
    keyMoments: [
      "Хук в первые 2 секунды (визуальный + звуковой акцент).",
      "Введение проблемы/контекста (зритель понимает, о чём речь).",
      "Поворот — новый взгляд на тему/решение.",
      "Ключевой кадр-доказательство (результат/цифра/эмоция).",
      `Финал с призывом: «${cta}».`,
    ],
    ending: `Зритель чувствует лёгкий эмоциональный подъём и ясность. После просмотра у него остаётся одна мысль: «${keyMessage}» — и понятно, какой следующий шаг сделать.`,
  };

  // --- SCRIPT ---
  const sceneCount = isShort ? 4 : duration >= 90 ? 7 : 5;
  const phaseDurations = splitDuration(duration, sceneCount);
  const headings = isShort
    ? ["ЭКСТ. УЛИЦА — ДЕНЬ", "ИНТ. ПОМЕЩЕНИЕ — ДЕНЬ", "ИНТ. ПРОЦЕСС — ДЕНЬ", "ЭКСТ./ИНТ. ФИНАЛ — ДЕНЬ"]
    : [
        "ЭКСТ. ЛОКАЦИЯ ОТКРЫТИЯ — РАССВЕТ",
        "ИНТ. ПРОСТРАНСТВО ГЕРОЯ — УТРО",
        "ИНТ./ЭКСТ. ПРОЦЕСС — ДЕНЬ",
        "ИНТ./ЭКСТ. КУЛЬМИНАЦИЯ — ДЕНЬ",
        "ЭКСТ./ИНТ. ФИНАЛ — ВЕЧЕР",
        "ИНТ. ТИТРЫ — ДЕНЬ",
        "ЭКСТ. END CARD — ДЕНЬ",
      ];
  const sceneTitles = ["Hook / открытие", "Контекст и проблема", "Развитие / процесс", "Поворот", "Доказательство", "Результат", "CTA / финал"];

  const scenes: ScriptScene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const d = phaseDurations[i];
    const action = sceneAction(i, sceneCount, idea, keyMessage);
    const dialogues = sceneDialogue(i, sceneCount, keyMessage, cta);
    scenes.push({
      id: uid("sc"),
      number: i + 1,
      heading: headings[i] || `СЦЕНА ${i + 1}`,
      location: locationForScene(i),
      timeOfDay: timeForScene(i),
      action,
      dialogue: dialogues,
      durationSec: d,
      notes: i === 0 ? "Снять несколько вариантов хука." : i === sceneCount - 1 ? "CTA в safe area, логотип и ссылка." : undefined,
    });
  }
  p.script = {
    concept: `Формат: ${isShort ? "вертикальное видео 9:16 с акцентом на первый кадр" : "горизонтальное 16:9 с кинематографичным языком камеры"}. Сверхидея — передать «${keyMessage}» через визуальную драматургию, а не через объяснения.`,
    synopsis: p.treatment.synopsisLong,
    scenes,
    finalText: scenes.map((s) => {
      const dlg = s.dialogue.map((x) => `${x.character}${x.direction ? ` (${x.direction})` : ""}\n${x.line}`).join("\n\n");
      return `${s.heading}\n\n${s.action}${dlg ? "\n\n" + dlg : ""}`;
    }).join("\n\n---\n\n"),
  };

  // --- VISION ---
  p.vision = {
    overallStyle: `Стиль — ${style}. Визуальный язык: ${isShort ? "крупные планы, чистый фон, акцент на герое и детали, быстрые смены планов в актах 2 и 3." : "сочетание общих и средних планов с воздухом, глубиной резкости и мотивированным движением камеры."}. Атмосфера: ${mood}.`,
    visualLanguage: "Камера всегда двигается ПО ПРИЧИНЕ: zoom-in — чтобы сфокусировать на эмоции, pan — чтобы показать параллельное действие, steadicam — чтобы пойти за героем. Оптика 35/50mm как база; 85mm для крупных планов с размытием фона; 24mm для establishing shots.",
    referenceFilms: [
      "Рекламные ролики Apple — лаконизм и свет.",
      "Nike — героика и динамика.",
      "A24-стиль indie-кино — естественный свет и живые эмоции.",
    ],
    scenes: scenes.map((s, i) => ({
      sceneId: s.id,
      sceneTitle: sceneTitles[i] || s.heading,
      shot: buildVisionShot(i, sceneCount, s, mood, isShort),
    })),
  };

  // --- STORYBOARD ---
  const frameCount = Math.min(isShort ? 6 : 8, duration / 3 | 0 || 6);
  const shotSizes = ["WS", "MS", "CU", "MS", "CU", "INSERT", "MCU", "ECU", "WS"];
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    const sceneIdx = Math.min(Math.floor((i / frameCount) * sceneCount), sceneCount - 1);
    const sc = scenes[sceneIdx];
    frames.push({
      id: uid("fr"),
      number: i + 1,
      sceneId: sc.id,
      description: frameDescription(i, frameCount, idea, keyMessage),
      composition: i === 0 ? "Крупный план в левой трети (rule of thirds), место под титр справа." : "Герой в центре или в трети; ведущая линия ведёт взгляд к ключевой детали.",
      cameraMovement: i === 0 ? "Статика → лёгкий zoom-in на 10%" : i === frameCount - 1 ? "Плавное приближение к CTA" : "Steadicam, лёгкое движение в сторону действия",
      objectPlacement: "Герой в зоне внимания; ключевой предмет в контрасте к фону.",
      lighting: i === 0 ? "Контровой контурный свет, мягкая тень на половине лица." : i === frameCount - 1 ? "Мягкий high-key, чистый свет на логотипе." : "Естественный свет + практические источники в кадре.",
      color: mood,
      shotSize: shotSizes[i] || "MS",
      mood: emotionForFrame(i, frameCount),
      imagePrompt: `cinematic storyboard sketch, shot ${i + 1}, ${shotSizes[i]}, black and white with golden accent, director's vis, storyboard pro style --ar 16:9`,
      notes: i === 0 ? "Это хук — кадр должен цеплять сам по себе." : undefined,
    });
  }
  p.storyboard = {
    aspectRatio: isShort ? "9:16" : "16:9",
    style: "Кино-эскиз, чёрно-белый с одним акцентным цветом; схемы света и стрелочки движения камеры.",
    frames,
  };

  // --- SHOT LIST ---
  const shotItems = [];
  let shotNum = 1;
  for (let si = 0; si < scenes.length; si++) {
    const sc = scenes[si];
    const baseShots = isShort ? [
      { size: "WS/Establishing", desc: "Установочный кадр локации" },
      { size: "MS", desc: `${sc.action.slice(0, 80)}` },
      { size: "CU", desc: "Крупный план лица/детали героя" },
      { size: "INSERT", desc: "Ключевая деталь/предмет" },
    ] : [
      { size: "ELS/WS", desc: "Установочный кадр локации, показывающий контекст" },
      { size: "MS", desc: `${sc.action.slice(0, 90)}` },
      { size: "MCU", desc: "Средний крупный план героя в действии" },
      { size: "CU лицо", desc: "Крупный план реакции/эмоции" },
      { size: "INSERT", desc: "Ключевая деталь (предмет/руки/экран)" },
    ];
    for (const bs of baseShots) {
      shotItems.push({
        number: shotNum++,
        description: bs.desc,
        shotType: bs.size,
        camera: "Основная камера (Sony/Canon/iPhone)",
        lens: lensFor(bs.size),
        movement: movementFor(bs.size, si, scenes.length),
        equipment: equipmentFor(bs.size),
        props: propsFor(bs.size, si),
        duration: `${Math.max(1.5, Math.round(sc.durationSec / baseShots.length * 10) / 10)} сек`,
        priority: si === 0 || si === scenes.length - 1 ? "critical" as const : si === Math.floor(scenes.length / 2) ? "high" as const : "medium" as const,
        location: sc.location,
      });
    }
  }
  p.shotlist = {
    totalShots: shotItems.length,
    estimatedTime: `${Math.max(1, Math.ceil(shotItems.length / 5))} рабочих часов (с учётом сетапа и перестановок)`,
    shots: shotItems,
  };

  // --- PLANNING ---
  const days = Math.max(1, Math.ceil(scenes.length / 4));
  const schedule = [];
  for (let d = 0; d < days; d++) {
    const from = Math.floor((d / days) * scenes.length);
    const to = Math.floor(((d + 1) / days) * scenes.length);
    const dayScenes = scenes.slice(from, to);
    schedule.push({
      day: d + 1,
      location: dayScenes[0]?.location || "Основная локация",
      scenes: dayScenes.map((s) => `Сцена ${s.number} — ${s.heading}`),
      shots: shotItems.filter((_sh, i) => i >= from * Math.floor(shotItems.length / scenes.length) && i < to * Math.ceil(shotItems.length / scenes.length)).map((sh) => sh.number),
      callTime: "08:00",
      wrapTime: "20:00",
      notes: [
        "Проверить звук на площадке до первого дубля.",
        "Сделать белый баланс по серой карте на каждой локации.",
        "Запасные батареи и карты памяти — на оператора.",
      ],
    });
  }
  p.planning = {
    schedule,
    sceneOrder: scenes.map((s) => `Сцена ${s.number}: ${s.heading}`),
    checklists: [
      { id: uid("chk"), category: "Камера", items: [
        { text: "Камера + 4 аккумулятора (заряжены)", done: false },
        { text: "Объективы 24 / 35 / 50 / 85 mm", done: false },
        { text: "Карты памяти SD (×3, отформатированы)", done: false },
        { text: "ND-фильтры", done: false },
        { text: "Серая карта для баланса белого", done: false },
      ]},
      { id: uid("chk"), category: "Свет", items: [
        { text: "LED-панель (×2) + стойки", done: false },
        { text: "Софтбокс / октобокс", done: false },
        { text: "Отражатель 5-в-1", done: false },
        { text: "Флаги / негатив-филл", done: false },
        { text: "Удлинители и сетевые фильтры", done: false },
      ]},
      { id: uid("chk"), category: "Звук", items: [
        { text: "Петлички (×2) + запасные батарейки", done: false },
        { text: "Рекордер (Zoom/Tascam)", done: false },
        { text: "Пушка + удочка", done: false },
        { text: "Ветрозащита", done: false },
        { text: "Наушники для мониторинга", done: false },
      ]},
      { id: uid("chk"), category: "До выхода", items: [
        { text: "Реквизит собран и подписан по сценам", done: false },
        { text: "Локации подтверждены, разрешения получены", done: false },
        { text: "Актёрам отправлен call-time и адрес", done: false },
        { text: "Мудборд и раскадровка распечатаны команде", done: false },
        { text: "Контактный лист команды у всех", done: false },
      ]},
    ],
    props: ["Ключевой предмет героя", "Реквизит для процесса", "Ноутбук/телефон для screen inserts", "Блокнот и ручка", "Костюмы по референсам", "Вода и снеки для команды"],
    equipment: ["Камера", "Объективы (24/35/50/85)", "Стабилизатор (Ronin/Gimbal)", "Штатив", "Монопод", "Слайдер", "LED-панели (×2)", "Отражатели", "Петлички", "Рекордер", "Дрон (опционально)"],
    cast: [],
    locations: [],
    directorNotes: [
      "На съёмке важнее живость, чем идеальная картинка — лучше хороший дубль с живой эмоцией, чем стерильный.",
      "Каждый план снимаем с вариантами: безопасный, авторский, экстремальный.",
      "Записываем вайт-трек (30 сек тишины в каждой локации) для чистки шума потом.",
      "B-roll докупаем/доснимаем по месту — всё, что может иллюстрировать действие."
    ],
    teamTasks: [
      { assignee: "Режиссёр", task: "Разобрать раскадровку с оператором и художником по свету", dueBy: "За 2 дня до съёмок", done: false },
      { assignee: "Оператор", task: "Собрать и протестировать комплект оборудования", dueBy: "Накануне", done: false },
      { assignee: "Продюсер", task: "Подтвердить локации, транспорт и питание", dueBy: "За 3 дня", done: false },
      { assignee: "Звукорежиссёр", task: "Проверить рекордер и петлички, собрать комплект", dueBy: "Накануне", done: false },
      { assignee: "Художник по свету", task: "Сделать световую схему на каждую сцену", dueBy: "За 1 день", done: false },
      { assignee: "Ассистент", task: "Распечатать шот-лист и раскадровку, собрать реквизит", dueBy: "Утро дня съёмок", done: false },
    ],
  };

  // --- CASTING ---
  p.casting = [
    {
      id: uid("cast"),
      role: "Главный герой",
      description: "Через него зритель переживает всю историю; должен быть живым и эмпатичным.",
      look: isShort ? "Яркая внешность, заметная мимика (на маленьком экране нужно читать эмоции)" : "Естественная внешность, типажный представитель ЦА",
      notes: "Смотреть на микроэмоции и тембр голоса; не брать по одному фото — нужна видеовизитка с репликой.",
    },
  ];
  if (!isShort) {
    p.casting.push({
      id: uid("cast"),
      role: "Второй персонаж / собеседник (опционально)",
      description: "Создаёт диалог и контрапункт; через него зритель получает аргументы.",
      look: "Визуально контрастирует с главным героем (иначе путаница в кадре).",
      notes: "Важна химия с главным актёром — делай читку вдвоём.",
    });
  }

  // --- LOCATIONS ---
  p.locations = [
    {
      id: uid("loc"),
      name: "Основная локация героя",
      description: "Пространство, где живёт/работает герой; раскрывает его характер.",
      mood: mood,
      lighting: "Большие окна или мягкий верхний свет; минимум перепада яркости.",
      pros: ["Естественный свет", "Доступ к розеткам", "Логична для истории"],
      cons: ["Посторонние шумы", "Ограниченное время съёмки"],
      suitable: true,
    },
    {
      id: uid("loc"),
      name: "Локация действия / процесса",
      description: "Место, где происходит главный процесс из темы ролика.",
      mood: `рабочая, концентрированная атмосфера; ${mood}`,
      lighting: "Комбинированный свет (естественный + LED для драматизма).",
      pros: ["Визуально насыщенно", "Много B-roll"],
      cons: ["Возможны помехи", "Нужен доступ заранее для сетапа"],
      suitable: true,
    },
  ];

  // --- RISKS ---
  p.risks = {
    readiness: Math.min(85, 40 + (brief.goal ? 10 : 0) + (brief.audience ? 10 : 0) + (brief.keyMessage ? 10 : 0) + (brief.style ? 10 : 0) + (brief.mood ? 5 : 0)),
    missingItems: [
      ...(brief.goal ? [] : ["Чёткая цель видео (что должен сделать зритель после просмотра)"]),
      ...(brief.audience ? [] : ["Портрет целевой аудитории"]),
      ...(brief.keyMessage ? [] : ["Ключевая мысль (одна фраза, которую запомнят)"]),
      ...(brief.style ? [] : ["Визуальный стиль/референсы"]),
      ...(brief.references ? [] : ["Референсы по стилю и монтажу"]),
      "Подтверждённые локации на даты съёмок",
      "Кастинг главного героя утверждён",
    ],
    weakScenes: [
      { sceneId: `Сцена ${Math.ceil(sceneCount / 2)}`, reason: "Это сцена поворота — без точной постановки и акцентного света она может провалиться и к финалу не будет эмоционального подъёма." },
    ],
    risks: [
      { id: uid("risk"), severity: "high", category: "сценарий", description: "Хук может не сработать — первые 2 секунды не остановят скролл.", mitigation: "Снять 3–4 варианта хука (визуально разных), смонтировать и протестировать на коллегах/фокус-группе." },
      { id: uid("risk"), severity: "high", category: "время", description: "Не укладываемся в световой день / график съёмок.", mitigation: "Начинать со сложных сцен; shot list с приоритетами — критичные планы снимаем в первую очередь." },
      { id: uid("risk"), severity: "medium", category: "техника", description: "Проблемы со звуком на локации (шумы, эхо).", mitigation: "Запасная локация для ADR; лавальеры под одеждой; вайт-трек в каждой локации." },
      { id: uid("risk"), severity: "medium", category: "кастинг", description: "Актёр не вытягивает ключевую реплику/эмоцию.", mitigation: "Репетиция накануне; несколько дублей с разными подачами; безопасный план за кадром." },
      { id: uid("risk"), severity: "medium", category: "съёмка", description: "Плохой естественный свет в день Х.", mitigation: "Комплект LED всегда с собой; план Б по световой схеме под пасмурную погоду." },
      { id: uid("risk"), severity: "low", category: "бюджет", description: "Неожиданные расходы на локации / питание.", mitigation: "Заложить 15% резерв бюджета." },
      { id: uid("risk"), severity: "low", category: "другое", description: "Форс-мажор с актёром/локацией.", mitigation: "Дублёр для главной роли и резервная локация в том же районе." },
    ],
  };

  p.chat = [
    { id: uid("m"), role: "director", text: `Добро пожаловать в препродакшен. Я — ваш режиссёр. Начнём с идеи: «${idea}» — у неё хороший потенциал. Скажите, чего в этой истории вам самим не хватает? Или я сразу предложу, как её усилить.`, at: Date.now() },
  ];

  return p;
}

function splitDuration(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const rem = total - base * parts;
  const arr = new Array(parts).fill(base);
  // Вытягиваем начало и конец (хук чуть короче, развитие длиннее)
  for (let i = 0; i < rem; i++) arr[(i + 1) % parts] += 1;
  // Короткий хук, длиннее середина
  arr[0] = Math.max(2, arr[0] - 1);
  arr[Math.floor(parts / 2)] += 1;
  return arr;
}

function locationForScene(i: number): string {
  return ["Открытое пространство / улица", "Пространство героя", "Место действия/процесса", "Пространство действия", "Локация результата / финала", "Студия для титров", "End-card локация"][i] || "Основная локация";
}
function timeForScene(i: number): string {
  return ["рассвет/утро", "утро", "день", "день", "вечер", "день", "вечер"][i] || "день";
}
function sceneAction(i: number, total: number, idea: string, keyMessage: string): string {
  if (i === 0) return `Открываем самым сильным визуальным кадром по теме «${idea}». Зритель видит образ, который сразу задаёт эмоцию и вопрос: «что здесь происходит?». Появляется первый титр с ключевым словом темы.`;
  if (i === total - 1) return `Финальный кадр: результат виден, герой в состоянии после. Пауза, чтобы зритель прожил эмоцию. Появляется CTA и логотип с ясным сообщением «${keyMessage}».`;
  if (i === Math.floor(total / 2)) return `Поворотный момент: зритель видит решение или ключевой процесс, который меняет всё. Камера укрупняется, музыка поднимается. Это место — эмоциональный центр истории.`;
  return `Средний план с героем и контекстом. Происходит шаг по истории к сообщению «${keyMessage}». Визуально даём детали, которые позже отзовутся в финале.`;
}
function sceneDialogue(i: number, total: number, keyMessage: string, cta: string) {
  if (i === 0) return [{ character: "ГОЛОС/ГЕРОЙ", line: "Все думают, что это сложно. Но на самом деле…", direction: (i === 0 ? "тихо, уверенно" : "") }];
  if (i === total - 1) return [{ character: "ГОЛОС/ГЕРОЙ", line: cta, direction: "тёплым, уверенным тоном" }];
  if (i === Math.floor(total / 2)) return [{ character: "ГЕРОЙ", line: `Вот что действительно важно: ${keyMessage}.` }];
  return [{ character: "ГОЛОС", line: "…и это меняет всё.", direction: "под музыкальный акцент" }];
}
function buildVisionShot(i: number, total: number, s: ScriptScene, mood: string, isShort: boolean): VisionShot {
  const first = i === 0;
  const last = i === total - 1;
  return {
    goal: s.notes || (first ? "Остановить скролл и задать вопрос." : last ? "Дать ясный CTA и оставить послевкусие." : "Продвинуть историю и усилить эмоцию."),
    emotion: first ? "интрига, любопытство" : last ? "уверенность, лёгкий подъём" : i < total / 2 ? "напряжение, любопытство" : "надежда, прояснение",
    composition: first ? "Крупный план в левой трети, воздух под титры справа." : last ? "Центральная симметрия, CTA в нижней трети safe area." : "Правило третей; герой смотрит в свободное пространство кадра.",
    cameraMovement: first ? "Статика → лёгкий zoom-in (10%) за 2 сек" : last ? "Медленный zoom-in к финальному кадру" : "Steadicam с лёгким следованием за действием; мотивированные pan-ы",
    duration: `${s.durationSec} сек`,
    transition: first ? "Прямой cut из чёрного" : last ? "Fade to black в конце" : i === Math.floor(total / 2) ? "Match cut / J-cut на музыке" : "J/L-cut",
    pacing: first ? "мгновенный захват" : last ? "замедление, пауза" : i < total / 2 ? "умеренный" : "ускорение к кульминации",
    sound: first ? "Музыкальный downbeat + короткий фоли-акцент; голос позже" : last ? "Музыка выходит на основной уровень, голос читает CTA" : "Речь + фоли + музыка под диалогом (-18 dB); к концу сцены музыка нарастает",
    atmosphere: mood,
    lighting: first ? "Контровой контурный свет + полумрак в лице (интрига)" : last ? "Ровный high-key свет, акцент на логотипе/лице" : "Мотивированный естественный свет + мягкий заполняющий; ключевой источник со стороны окна/практического источника",
    colorPalette: ["#1a1620", "#6d5a8c", "#f0b96b", "#ffe0a8", "#2a1f36"],
    vfx: first ? "Лёгкая зернистость и виньетка" : "без эффектов — максимум лёгкий glow на контровом свете",
    dpNotes: `${isShort ? "Вертикаль 9:16" : "16:9"}; объектив ${first ? "50mm f/1.8" : last ? "35mm f/2.2" : "35mm f/2.0"}; снимаем с запасом 20% кадра для цифрового рефрейминга на монтаже.`,
  };
}
function frameDescription(i: number, total: number, idea: string, keyMessage: string): string {
  if (i === 0) return `Открывающий кадр: самый сильный образ по теме «${idea}». Крупный план, который цепляет сам по себе.`;
  if (i === total - 1) return `Финальный кадр: логотип/CTA с сообщением «${keyMessage}». Чистый, с воздухом.`;
  return `Ключевой момент сцены ${i + 1}: зритель видит движение к сообщению «${keyMessage}».`;
}
function emotionForFrame(i: number, total: number): string {
  if (i === 0) return "Интрига, любопытство";
  if (i === total - 1) return "Ясность, подъём";
  if (i < total / 2) return "Напряжение, интерес";
  return "Надежда, прояснение";
}
function lensFor(size: string): string {
  if (/ELS|WS/.test(size)) return "24mm f/2.8";
  if (/MS|MCU/.test(size)) return "35mm f/2.0";
  if (/CU|ECU/.test(size)) return "50–85mm f/1.8";
  if (/INSERT/.test(size)) return "85mm macro f/2.8";
  return "35mm f/2.0";
}
function movementFor(size: string, i: number, total: number): string {
  if (/ELS|WS/.test(size)) return "Статика / слайдер";
  if (/CU|ECU/.test(size)) return "Статика или микро-dolly-in";
  if (i === 0) return "zoom-in 10%";
  if (i === total - 1) return "static";
  return "Steadicam / gimbal";
}
function equipmentFor(size: string): string[] {
  const base = ["Камера"];
  if (/WS|ELS/.test(size)) return [...base, "Штатив", "Слайдер"];
  if (/CU|ECU|INSERT/.test(size)) return [...base, "Штатив", "Монитор"];
  return [...base, "Gimbal/стабилизатор"];
}
function propsFor(_size: string, sceneIdx: number): string[] {
  if (sceneIdx === 0) return ["—"];
  if (sceneIdx === 1) return ["Ключевой предмет"];
  return ["Реквизит процесса", "Детали B-roll"];
}
