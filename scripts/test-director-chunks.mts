/**
 * Регрессионный тест ПОЛНОЙ сборки AI Director через /api/director.
 *
 * Проверяет фикс «AI Director не получил полный ответ»: раньше весь пакет из
 * 12 разделов генерировался ОДНИМ вызовом на 24 000 токенов — ответ обрезался
 * по max_tokens, JSON ломался, и маршрут всегда возвращал 502. Теперь:
 *   - сборка разбита на 7 последовательных блоков (каждый ≤ 9000 токенов —
 *     помещается даже в потолок вывода 4096–8192 токенов бесплатных моделей),
 *     каждый валидируется и ретраится отдельно;
 *   - провайдер — OpenRouter (бесплатные модели `:free`) с перебором запасных
 *     моделей, у вызовов НЕТ лимитов времени (timeoutMs: 0);
 *   - если блок всё же не получился, запуск НЕ падает: раздел добирается из
 *     локального пакета, ответ 200 + partial=true + warnings;
 *   - повторный запуск после неудачи (resume=true) переиспользует уже
 *     сгенерированные блоки и генерирует только недостающие.
 *
 * Тест подменяет глобальный fetch и отвечает за OpenRouter по заранее
 * заготовленным JSON-ответам (включая сценарий «первый ответ блока обрезан —
 * ретрай»).
 *
 * Запуск: npm run test:director-chunks
 */

import { buildOfflinePreprod } from "../src/lib/brain/offlinePreprod";

process.env.GROQ_API_KEY = "gsk_test_key_for_local_regression_test";
process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key-for-local-regression-test";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Заготовки JSON для каждого блока (минимум, но валидный по схеме пакета)
// ---------------------------------------------------------------------------

const CHUNK_JSON: Record<string, any> = {
  core: {
    idea: {
      refined: "Идея: короткометражный рекламный ролик о кофейне в Петербурге.",
      audience: "Горожане 22–35, офисные работники, любят specialty-кофе.",
      potential: 8,
      pros: ["Яркая тема", "Конкретная ЦА", "Красивая локация"],
      cons: ["Сезонность", "Много конкурентов"],
      variants: [
        { title: "Утро бариста", concept: "Один день из жизни бариста", audience: "ЦА", hook: "Хук", potential: 7, reasoning: "Сильный герой" },
        { title: "От зерна до чашки", concept: "Производство", audience: "ЦА", hook: "Хук 2", potential: 6, reasoning: "Экспертиза" },
        { title: "Первая чашка", concept: "Ритуал", audience: "ЦА", hook: "Хук 3", potential: 8, reasoning: "Эмоция" },
      ],
    },
    logline: {
      primary: "Молодой бариста мечтает открыть свою кофейню, но страх провала и конкуренция мешают — пока одна утренняя смена не доказывает ему обратное.",
      variants: [
        { text: "В1", strengths: ["а"], weaknesses: ["б"] },
        { text: "В2", strengths: ["а"], weaknesses: ["б"] },
        { text: "В3", strengths: ["а"], weaknesses: ["б"] },
      ],
      hero: "Бариста Артём",
      goal: "Открыть кофейню",
      conflict: "Страх и конкуренция",
      stakes: "Мечта всей жизни",
    },
    treatment: {
      title: "Первая чашка",
      logline: "Тот же логлайн",
      genre: "Реклама / лайфстайл",
      tone: "Тёплый, вдохновляющий",
      themes: ["Мечта", "Труд", "Город"],
      synopsisLong: "Артём готовит кофе в своей смене, вспоминает мечту, получает поддержку от постоянной гостьи и решает рискнуть. Финальный кадр — вывеска «Скоро открытие».",
      act1: "Хук: рассвет, город, Артём открывает кофейню.",
      act2: "Конфликт: наплыв клиентов, сомнения, разговор с гостьей.",
      act3: "Развязка: решение открыть своё, CTA «Заходи на открытие».",
      characters: [
        { name: "Артём", role: "Бариста", description: "25 лет, амбициозный" },
        { name: "Гостья", role: "Постоянная клиентка", description: "40 лет, добрая" },
      ],
      keyMoments: ["Первый кофе", "Разговор у окна", "Вывеска"],
      ending: "Зритель хочет зайти в кофейню и попробовать кофе.",
    },
  },
  script: {
    script: {
      concept: "Сверх-идея: обычная смена меняет жизнь.",
      synopsis: "Артём проходит через напряжённую смену и решает открыть свою кофейню.",
      scenes: [
        {
          number: 1,
          heading: "INT. КОФЕЙНЯ — УТРО",
          location: "Кофейня",
          timeOfDay: "утро",
          action: "Артём зажигает свет, готовит первую чашку. Город просыпается за окном.",
          dialogue: [{ character: "Артём", line: "Ещё одна смена. Сегодня всё изменится.", direction: "про себя" }],
          durationSec: 10,
          notes: "Съёмка на рассвете",
        },
        {
          number: 2,
          heading: "INT. КОФЕЙНЯ — ДЕНЬ",
          location: "Кофейня",
          timeOfDay: "день",
          action: "Наплыв гостей, Артём работает в ритме. У окна сидит постоянная гостья.",
          dialogue: [
            { character: "Гостья", line: "У тебя лучший кофе в городе. Почему не своё место?", direction: "улыбаясь" },
            { character: "Артём", line: "Страшно. А вдруг не получится?", direction: "задумчиво" },
          ],
          durationSec: 15,
          notes: "Ручная камера",
        },
        {
          number: 3,
          heading: "EXT. УЛИЦА — ВЕЧЕР",
          location: "Улица",
          timeOfDay: "вечер",
          action: "Артём выходит после смены, смотрит на витрину пустого помещения с табличкой «Сдаётся».",
          dialogue: [],
          durationSec: 5,
          notes: "Финальный кадр",
        },
      ],
      finalText: "СЦЕНА 1 — ИНТ. КОФЕЙНЯ — УТРО\nАртём зажигает свет...",
    },
  },
  vision: {
    vision: {
      overallStyle: "Тёплый свет, зернистость, кинематографичный лайфстайл.",
      visualLanguage: "Ручная камера, 35mm, естественный свет из окна.",
      referenceFilms: ["La La Land — цвет", "Chef — энергия кухни"],
      scenes: [
        { sceneNumber: 1, sceneTitle: "Утро", shot: { goal: "Хук", emotion: "Ожидание", composition: "WS улица через окно", cameraMovement: "медленный наезд", duration: "4 сек", transition: "cut", pacing: "спокойно", sound: "город", atmosphere: "рассвет", lighting: "тёплый утренний", colorPalette: ["янтарь", "крем", "коричневый"], vfx: "без эффектов", dpNotes: "снять на рассвете" } },
        { sceneNumber: 2, sceneTitle: "День", shot: { goal: "Энергия", emotion: "Напряжение", composition: "CU руки бариста", cameraMovement: "хэндхелд", duration: "3 сек", transition: "cut", pacing: "быстро", sound: "шипение кофемашины", atmosphere: "ритм", lighting: "дневной контровой", colorPalette: ["карамель", "чёрный"], vfx: "без эффектов", dpNotes: "макросъёмка" } },
        { sceneNumber: 3, sceneTitle: "Вечер", shot: { goal: "Payoff", emotion: "Решимость", composition: "WS сзади, силуэт у витрины", cameraMovement: "статик", duration: "5 сек", transition: "fade out", pacing: "медленно", sound: "город, тишина", atmosphere: "финал", lighting: "неон вывески", colorPalette: ["синий", "янтарь"], vfx: "без эффектов", dpNotes: "гражданские сумерки" } },
      ],
    },
  },
  storyboard: {
    storyboard: {
      aspectRatio: "16:9",
      style: "Cinematic sketch, ч/б с акцентом янтарного",
      frames: [
        { number: 1, sceneNumber: 1, description: "Улица на рассвете", composition: "WS", cameraMovement: "наезд", objectPlacement: "витрина по центру", lighting: "рассвет", color: "янтарь", shotSize: "WS", mood: "ожидание", imagePrompt: "cinematic storyboard sketch, dawn street", notes: "" },
        { number: 2, sceneNumber: 2, description: "Руки бариста", composition: "CU", cameraMovement: "хэндхелд", objectPlacement: "руки в центре", lighting: "контровой", color: "карамель", shotSize: "CU", mood: "ритм", imagePrompt: "cinematic storyboard sketch, barista hands", notes: "" },
        { number: 3, sceneNumber: 3, description: "Силуэт у витрины", composition: "WS", cameraMovement: "static", objectPlacement: "силуэт справа", lighting: "неон", color: "синий", shotSize: "WS", mood: "финал", imagePrompt: "cinematic storyboard sketch, silhouette neon", notes: "" },
      ],
    },
  },
  shotlist: {
    shotlist: {
      totalShots: 12,
      estimatedTime: "1 съёмочный день, 8 часов",
      shots: [
        { number: 1, description: "Рассветная улица", shotType: "WS", camera: "Sony FX3", lens: "35mm", movement: "наезд", equipment: ["штатив"], props: ["чайник"], duration: "4 сек", priority: "high", location: "Улица" },
        { number: 2, description: "Руки бариста", shotType: "CU", camera: "Sony FX3", lens: "50mm", movement: "хэндхелд", equipment: ["гимбал"], props: ["кофемашина"], duration: "3 сек", priority: "critical", location: "Кофейня" },
        { number: 3, description: "Силуэт у витрины", shotType: "WS", camera: "Sony FX3", lens: "35mm", movement: "static", equipment: ["штатив"], props: [], duration: "5 сек", priority: "medium", location: "Улица" },
      ],
    },
  },
  planning: {
    planning: {
      schedule: [
        { day: 1, location: "Кофейня", scenes: ["Сцена 1", "Сцена 2"], shots: [1, 2], callTime: "06:00", wrapTime: "14:00", notes: ["Рассвет ловим рано"] },
        { day: 2, location: "Улица", scenes: ["Сцена 3"], shots: [3], callTime: "18:00", wrapTime: "21:00", notes: ["Гражданские сумерки"] },
      ],
      sceneOrder: ["Сцена 1", "Сцена 2", "Сцена 3"],
      checklists: [
        { category: "Оборудование", items: [{ text: "Камера", done: false }] },
        { category: "До выхода", items: [{ text: "Разрешение на съёмку", done: false }] },
        { category: "Звук", items: [{ text: "Рекордер", done: false }] },
        { category: "Свет", items: [{ text: "Лампы", done: false }] },
      ],
      props: ["Кофемашина", "Чашки"],
      equipment: ["Sony FX3", "35mm", "Гимбал"],
      cast: [{ role: "Бариста", name: "Артём", description: "25 лет", look: "Фартук", notes: "" }],
      locations: [{ name: "Кофейня", description: "Уютная", mood: "Тёплый", lighting: "Дневной", pros: ["Окна"], cons: ["Тесно"], suitable: true }],
      directorNotes: ["Снять рассвет первым", "Макро для рук"],
      teamTasks: [
        { assignee: "Режиссёр", task: "Раскадровка", dueBy: "До съёмок", done: false },
        { assignee: "Оператор", task: "Свет", dueBy: "До съёмок", done: false },
        { assignee: "Продюсер", task: "Локации", dueBy: "До съёмок", done: false },
      ],
    },
  },
  wrap: {
    casting: [
      { role: "Бариста", name: "Артём", description: "25 лет, обаятельный", look: "Фартук, кепка", notes: "Умеет готовить кофе" },
      { role: "Гостья", name: "Ирина", description: "40 лет, тёплая", look: "Пальто", notes: "" },
    ],
    locations: [
      { name: "Кофейня", description: "Спешелти-кофейня с большими окнами", mood: "Тёплый, уютный", lighting: "Дневной свет", pros: ["Окна", "Атмосфера"], cons: ["Мало места"], suitable: true },
      { name: "Улица", description: "Петербургская улица с неоном", mood: "Вечерний", lighting: "Неон", pros: ["Неон"], cons: ["Прохожие"], suitable: true },
    ],
    risks: {
      readiness: 80,
      missingItems: ["Разрешение на съёмку", "Запасное зеркало"],
      weakScenes: [{ sceneId: "3", reason: "Малая драматургия финала" }],
      risks: [
        { severity: "medium", category: "локация", description: "Нет разрешения на улицу", mitigation: "Подать заявку заранее" },
        { severity: "low", category: "техника", description: "Сломается кофемашина", mitigation: "Запасной реквизит" },
        { severity: "high", category: "время", description: "Рассвет длится 20 минут", mitigation: "Прогнать свет заранее" },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Mock LLM: глобальный fetch, отвечающий за openrouter.ai (и groq как страховку)
// ---------------------------------------------------------------------------

let truncatedFirst: Record<string, boolean> = {};
let callCount = 0;

/** Определяет блок по строке «Сгенерируй ТОЛЬКО разделы: ...» из промпта. */
function detectChunk(userContent: string): string {
  const m = userContent.match(/Сгенерируй ТОЛЬКО разделы:\s*([^\n.]+)/);
  if (!m) return "chat-or-stage";
  const fields = m[1].split(",").map((f) => f.trim().replace(/"/g, ""));
  const map: Record<string, string> = {
    '"idea"+"logline"+"treatment"': "core",
    '"script"': "script",
    '"vision"': "vision",
    '"storyboard"': "storyboard",
    '"shotlist"': "shotlist",
    '"planning"': "planning",
    '"casting"+"locations"+"risks"': "wrap",
  };
  // поля приходят в виде "idea", "logline" — соберём компактный ключ
  const compact = fields.map((f) => `"${f}"`).join("+");
  return map[compact] || "chat-or-stage";
}

async function mockedFetch(this: any, input: any, init?: any): Promise<Response> {
  callCount++;
  const url = typeof input === "string" ? input : input?.url || "";
  if (!url.includes("openrouter.ai") && !url.includes("api.groq.com")) {
    throw new Error(`unexpected fetch target: ${url}`);
  }
  const body = JSON.parse(String(init?.body || "{}"));
  const userMsg = (body.messages || []).find((m: any) => m.role === "user")?.content || "";
  const chunk = detectChunk(userMsg);

  if (!CHUNK_JSON[chunk]) {
    // stage/chat-режим тут не тестируем
    return new Response(JSON.stringify({ error: "unexpected mode" }), { status: 400 });
  }

  // Сценарий «обрезанный первый ответ»: как только он включён для блока,
  // первый вызов возвращает срезанный JSON (finish_reason=length).
  const cut = truncatedFirst[chunk];
  truncatedFirst[chunk] = false;
  if (cut) {
    const full = JSON.stringify(CHUNK_JSON[chunk]);
    const truncated = full.slice(0, Math.floor(full.length / 2));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: truncated }, finish_reason: "length" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(CHUNK_JSON[chunk]) }, finish_reason: "stop" }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// ---------------------------------------------------------------------------
// Тест
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockedFetch as any;

  try {
    const { POST } = await import("../src/app/api/director/route");

    // 1. Полная сборка: у блоков script и storyboard первый ответ обрезан —
    //    маршрут обязан сам доретраить и вернуть 200 с полным пакетом.
    truncatedFirst = { script: true, storyboard: true };
    callCount = 0;
    const req = new Request("http://localhost/api/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: {
          idea: "Рекламный ролик для петербургской спешелти-кофейни",
          goal: "Привлечь новых гостей в кофейню",
          audience: "Офисные работники 22-35",
          platform: "YouTube",
          duration: "30",
          style: "Лайфстайл, тёплый",
          mood: "Вдохновляющий",
          tempo: "Спокойный",
          references: "Ла-Ла Ленд, Шеф",
          keyMessage: "Мечта начинается с первой чашки",
          callToAction: "Заходи на открытие",
        },
        projectTitle: "Первая чашка",
        mode: "full",
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    check("полная сборка возвращает 200", res.status === 200, `status=${res.status}`);
    check("есть preprod", Boolean(data.preprod), "нет preprod");
    check("есть sections", Boolean(data.sections), "нет sections");
    if (data.preprod) {
      const p = data.preprod;
      check("idea.refined заполнен", Boolean(p.idea?.refined), "пусто");
      check("3 варианта идеи", p.idea?.variants?.length === 3, `len=${p.idea?.variants?.length}`);
      check("logline.primary заполнен", Boolean(p.logline?.primary), "пусто");
      check("treatment.synopsisLong заполнен", Boolean(p.treatment?.synopsisLong), "пусто");
      check("script.scenes не пуст", p.script?.scenes?.length >= 3, `len=${p.script?.scenes?.length}`);
      check("vision.scenes не пуст", p.vision?.scenes?.length === 3, `len=${p.vision?.scenes?.length}`);
      check("storyboard.frames не пуст", p.storyboard?.frames?.length === 3, `len=${p.storyboard?.frames?.length}`);
      check("shotlist.shots не пуст", p.shotlist?.shots?.length === 3, `len=${p.shotlist?.shots?.length}`);
      check("planning.schedule не пуст", p.planning?.schedule?.length === 2, `len=${p.planning?.schedule?.length}`);
      check("casting не пуст", p.casting?.length === 2, `len=${p.casting?.length}`);
      check("locations не пуст", p.locations?.length === 2, `len=${p.locations?.length}`);
      check("risks.risks не пуст", p.risks?.risks?.length === 3, `len=${p.risks?.risks?.length}`);
      check("finalText заполнен", Boolean(p.script?.finalText), "пусто");
    }
    // 7 блоков + 2 ретрая обрезанных = 9 вызовов LLM
    check("сделано 9 вызовов LLM (7 блоков + 2 ретрая)", callCount === 9, `calls=${callCount}`);

    // 2. Полная сборка без ретраев — счастливый путь, 7 вызовов.
    truncatedFirst = {};
    callCount = 0;
    const res2 = await POST(
      new Request("http://localhost/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: { idea: "Короткий ролик о кофейне", duration: "30" },
          projectTitle: "Кофе",
          mode: "full",
        }),
      })
    );
    const data2 = await res2.json();
    check("счастливый путь: 200", res2.status === 200, `status=${res2.status}`);
    check("счастливый путь: 7 вызовов LLM", callCount === 7, `calls=${callCount}`);
    check("счастливый путь: preprod готов", Boolean(data2.preprod), "нет preprod");

    // 3. Полный отказ одного блока → НЕ 502: запуск обязан всё равно вернуть
    //    полный препродакшен (неудавшийся раздел добирается из локального
    //    пакета) с partial=true и warnings — «главное чтобы дала ответ».
    truncatedFirst = {};
    const failing = CHUNK_JSON.shotlist;
    CHUNK_JSON.shotlist = { shotlist: { shots: [] } } as any; // невалидно
    const res3 = await POST(
      new Request("http://localhost/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: { idea: "Ролик о кофейне", duration: "30" },
          projectTitle: "Кофе",
          mode: "full",
        }),
      })
    );
    const data3 = await res3.json();
    check("сбой блока → 200 (всегда отвечаем)", res3.status === 200, `status=${res3.status}`);
    check("сбой блока → partial=true", data3.partial === true, `partial=${data3.partial}`);
    check(
      "сбой блока → есть warnings",
      Array.isArray(data3.warnings) && data3.warnings.length > 0,
      `warnings=${JSON.stringify(data3.warnings)}`
    );
    check(
      "сбой блока → preprod всё равно полный",
      Boolean(data3.preprod?.shotlist?.shots?.length) &&
        Boolean(data3.preprod?.planning?.schedule?.length) &&
        Boolean(data3.preprod?.script?.scenes?.length),
      "preprod неполный"
    );
    CHUNK_JSON.shotlist = failing;

    // 4. Resume после неудачи: preprod, где часть блоков уже собрана LLM
    //    (отличается от шаблона), а script — ещё локальный шаблон. Повторный
    //    запуск с resume=true переиспользует готовые блоки и генерирует
    //    только недостающие (1 вызов LLM вместо 7).
    const brief4 = {
      idea: "Ролик о кофейне",
      goal: "Привлечь гостей",
      audience: "Офисные работники 22-35",
      platform: "YouTube",
      duration: "30",
      style: "Лайфстайл",
      mood: "Тёплый",
      tempo: "Спокойный",
      references: "",
      keyMessage: "Кофе объединяет",
      callToAction: "Заходи",
    };
    const template4 = buildOfflinePreprod(brief4);
    const prev = await POST(
      new Request("http://localhost/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: brief4, projectTitle: "Кофе", mode: "full" }),
      })
    );
    const prevData = await prev.json();
    const resumePreprod = {
      ...prevData.preprod,
      // сценарий «не сгенерирован» — заменяем на локальный шаблон
      script: template4.script,
    };
    truncatedFirst = {};
    callCount = 0;
    const res4 = await POST(
      new Request("http://localhost/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief4,
          projectTitle: "Кофе",
          mode: "full",
          preprod: resumePreprod,
          resume: true,
        }),
      })
    );
    const data4 = await res4.json();
    check("resume: 200", res4.status === 200, `status=${res4.status}`);
    check("resume: только недостающий блок вызвал LLM (1 вызов)", callCount === 1, `calls=${callCount}`);
    check("resume: 6 блоков переиспользованы", data4.reused === 6, `reused=${data4.reused}`);
    check("resume: partial=false", data4.partial === false, `partial=${data4.partial}`);
    check(
      "resume: сценарий собран заново",
      Boolean(data4.preprod?.script?.scenes?.length),
      "сценарий пуст"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (failures > 0) {
    console.error(`\n${failures} failed`);
    process.exit(1);
  }
  console.log("\nAll director chunk tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
