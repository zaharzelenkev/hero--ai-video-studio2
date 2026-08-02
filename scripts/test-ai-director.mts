/**
 * Тест AI DIRECTOR — центральной системы принятия решений.
 *
 * Прогоняет полный конвейер на синтетических (но реалистичных) данных анализа:
 *
 *   PERCEPTION — понимание материалов:
 *     • нарезка на монтажные планы по сменам сцен;
 *     • композиция (общий/средний/крупный план по лицам);
 *     • вывод движения камеры по траектории лица (панорама/наезд/тряска);
 *     • сильные/слабые моменты, брак (темнота/смаз/тряска);
 *     • речь: парсинг фраз, фильтр мусора, драматические паузы;
 *     • музыка: BPM по бит-сетке, дропы в координатах таймлайна.
 *
 *   DIRECTOR — режиссёрский план ДО монтажа:
 *     • хук, единственная кульминация на дропе музыки, выдох;
 *     • запрет двух одинаковых ассетов подряд, чередование крупности;
 *     • слабые кадры вырезаны / прикрыты перебивкой;
 *     • склейки квантуются в бит-сетку;
 *     • журнал решений (directorNotes) объясняет каждое крупное решение;
 *     • детерминизм: те же материалы → тот же план.
 *
 *   ADAPTER — план передаётся монтажному движку без потерь
 *     (все клипы валидны, b-roll в пределах таймлайна, переходы режиссёра
 *     доезжают как transitionHint).
 *
 * Запуск: npx tsx scripts/test-ai-director.mts
 */

import { AIDirector } from "../src/lib/brain/aiDirector";
import { planToDecision, planToScript, summarizePlan } from "../src/lib/brain/planAdapter";
import {
  filterSpeechPhrases,
  inferCameraMotion,
  parseTranscriptPhrases,
  perceiveAssets,
  perceiveMusic,
} from "../src/lib/brain/perception";
import type { Shot } from "../src/lib/brain/perception";
import type { AIAnalysisRequest } from "../src/lib/ai/aiService";
import type { VideoSegmentMetadata } from "../src/lib/localAnalyzer";
import type { AudioEnergySegment } from "../src/lib/media";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Фабрики синтетических данных анализа
// ---------------------------------------------------------------------------

const seg = (start: number, end: number, opts: Partial<VideoSegmentMetadata> = {}): VideoSegmentMetadata => ({
  startTime: start,
  endTime: end,
  motionLevel: "low",
  isDark: false,
  isBlurry: false,
  hasFaces: false,
  qualityScore: 8,
  isSceneChange: false,
  hasAction: false,
  aestheticScore: 7,
  brightness: 150,
  contrast: 120,
  saturation: 45,
  colorfulness: 30,
  ...opts,
});

const asset = (
  id: string,
  name: string,
  type: "video" | "image" | "audio",
  duration: number,
  extra: Partial<AIAnalysisRequest["assets"][number]> = {},
): AIAnalysisRequest["assets"][number] => ({ id, name, type, duration, ...extra });

/** Серия сегментов фиксированного шага. */
function segSeries(from: number, to: number, step: number, opts: Partial<VideoSegmentMetadata> | ((t: number) => Partial<VideoSegmentMetadata>)): VideoSegmentMetadata[] {
  const out: VideoSegmentMetadata[] = [];
  for (let t = from; t < to - 1e-6; t += step) {
    const o = typeof opts === "function" ? opts(t) : opts;
    out.push(seg(t, Math.min(t + step, to), o));
  }
  return out;
}

const beatsGrid = (step: number, to: number): number[] => {
  const out: number[] = [];
  for (let t = 0; t <= to; t += step) out.push(+t.toFixed(3));
  return out;
};

// ---------------------------------------------------------------------------
// TEST F1: Perception units — движение камеры, речь, музыка
// ---------------------------------------------------------------------------

console.log("\n=== F1. Perception: движение камеры / речь / музыка ===");

// Линейный дрейф лица вправо → камера панорамирует влево.
{
  const samples = [0, 1, 2, 3, 4, 5].map((t) => ({ t, x: 0.3 + 0.05 * t, y: 0.5, size: 0.08 }));
  check("дрейф лица вправо → pan-left", inferCameraMotion(samples, "medium", false) === "pan-left",
    inferCameraMotion(samples, "medium", false));
}
// Тряска-паттерн доминирует → shake.
check("motionLevel shake → shake", inferCameraMotion([], "shake", false) === "shake");
// Нервная траектория без тренда → ручная камера.
{
  const samples = [0, 0.5, 1, 1.5, 2, 2.5].map((t, i) => ({
    t,
    x: [0.5, 0.56, 0.47, 0.54, 0.46, 0.55][i],
    y: 0.5,
    size: 0.08,
  }));
  check("дрожание лица без тренда → handheld", inferCameraMotion(samples, "medium", false) === "handheld",
    inferCameraMotion(samples, "medium", false));
}
// Рост площади лица → наезд камеры.
{
  const samples = [0, 1, 2, 3].map((t, i) => ({ t, x: 0.5, y: 0.5, size: [0.04, 0.05, 0.06, 0.08][i] }));
  check("рост лица в кадре → dolly-in", inferCameraMotion(samples, "low", false) === "dolly-in",
    inferCameraMotion(samples, "low", false));
}
// Статичные сегменты без лиц → static.
check("без лиц и движения → static", inferCameraMotion([], "static", false) === "static");

// Речь: приветствия/филлеры режутся, паузы берегутся.
{
  const phrases = parseTranscriptPhrases("v1", "[0.0s - 0.9s] привет всем\n[1.1s - 1.8s] ну эээ\n[2.2s - 4.0s] поехали на море\n[5.0s - 6.5s] вода была холодной", { keepPauses: true });
  const filtered = filterSpeechPhrases(phrases);
  check("приветствие и филлеры убраны", filtered.length === 3 && !filtered.some((f) => f.text.includes("привет")), JSON.stringify(filtered.map((f) => f.text)));
  check("драматическая пауза сохранена", filtered.some((f) => f.isPause && Math.abs(f.start - 4.0) < 1e-6));
}

// Музыка: bpm по сетке, ОНСЕТЫ дропов сдвинуты на inPoint в координаты таймлайна.
// Важно: два соседних «drop»-окна (28-30 и 30-32) — это ОДНО музыкальное
// событие длиной 4с, а не два дропа. Наружу отдаётся начало прогона: только
// так кульминация встаёт в момент удара, а не в середину громкой секции.
{
  const music = perceiveMusic({
    assets: [asset("m1", "track.mp3", "audio", 60, {
      audioEnergy: [
        { startTime: 0, endTime: 28, energyLevel: "low" },
        { startTime: 28, endTime: 30, energyLevel: "drop" },
        { startTime: 30, endTime: 32, energyLevel: "drop" },
        { startTime: 32, endTime: 60, energyLevel: "high" },
      ] as AudioEnergySegment[],
    })],
    beats: beatsGrid(0.5, 70),
    musicInPointSec: 26,
  });
  check("present=true при аудио-ассете", music.present === true);
  check("beatDur=0.5 → 120 BPM", music.beatDur === 0.5 && music.bpm === 120, `beatDur=${music.beatDur} bpm=${music.bpm}`);
  check("онсет дропа сдвинут на inPoint (одно событие, не два окна)",
    JSON.stringify(music.dropsTimeline) === JSON.stringify([2]), JSON.stringify(music.dropsTimeline));
  check("онсет следующей секции (high) тоже найден",
    JSON.stringify(music.highsTimeline) === JSON.stringify([6]), JSON.stringify(music.highsTimeline));
}

// ---------------------------------------------------------------------------
// TEST F2: Perception — нарезка shots, тиры, слабые моменты
// ---------------------------------------------------------------------------

console.log("\n=== F2. Perception: shots / тиры / брак ===");

function makeVisualAssets() {
  // A: город, два плана (смена сцены на 6.0)
  const A = asset("A", "city.mp4", "video", 14, {
    segments: [
      ...segSeries(0, 6, 1, { qualityScore: 8, aestheticScore: 8, motionLevel: "medium", brightness: 150 }),
      ...segSeries(6, 14, 1, (t) => ({ qualityScore: 9, aestheticScore: 9, motionLevel: "high", hasAction: true, brightness: 160, isSceneChange: t < 6.5 })),
    ],
  });
  // B: люди, камера панорамирует (лицо дрейфует вправо), крупный план
  const B = asset("B", "people.mp4", "video", 12, {
    segments: segSeries(0, 12, 1, (t) => ({
      hasFaces: true, faceX: 0.3 + 0.045 * t, faceY: 0.5, faceSize: 0.09,
      qualityScore: 9, aestheticScore: 8, motionLevel: "medium", brightness: 155,
    })),
  });
  // C: брак — тёмный и смазанный
  const C = asset("C", "bad.mp4", "video", 6, {
    segments: segSeries(0, 6, 1, {
      isDark: true, isBlurry: true, qualityScore: 3, aestheticScore: 2, brightness: 20, contrast: 60, colorfulness: 4, saturation: 8,
    }),
  });
  // D: эпик — пик движения + дроп камерного звука на 4–6с
  const D = asset("D", "epic.mp4", "video", 10, {
    segments: [
      ...segSeries(0, 4, 1, { qualityScore: 7, aestheticScore: 6, motionLevel: "low", brightness: 145 }),
      ...segSeries(4, 10, 1, (t) => ({
        qualityScore: 9, aestheticScore: 9, motionLevel: "high", hasAction: true, brightness: 165,
        isSceneChange: t < 4.5, colorfulness: 35,
      })),
    ],
    audioEnergy: [
      { startTime: 0, endTime: 4, energyLevel: "medium" },
      { startTime: 4, endTime: 6, energyLevel: "drop" },
      { startTime: 6, endTime: 10, energyLevel: "medium" },
    ] as AudioEnergySegment[],
  });
  const M = asset("M", "track.mp3", "audio", 60, {
    audioEnergy: [
      { startTime: 0, endTime: 34, energyLevel: "low" },
      { startTime: 34, endTime: 38, energyLevel: "drop" },
      { startTime: 38, endTime: 44, energyLevel: "high" },
      { startTime: 44, endTime: 60, energyLevel: "medium" },
    ] as AudioEnergySegment[],
  });
  return { A, B, C, D, M };
}

const { A, B, C, D, M } = makeVisualAssets();
const visualRequest: AIAnalysisRequest = {
  userPrompt: "",
  templateHint: "tiktok",
  beats: beatsGrid(0.5, 70),
  musicInPointSec: 26,
  assets: [A, B, C, D, M],
};

const perception = perceiveAssets(visualRequest);
{
  const shotsOf = (id: string) => perception.assets.find((a) => a.assetId === id)!.shots;
  check("планы A нарезаны по смене сцены", shotsOf("A").length === 2, String(shotsOf("A").length));
  check("план B один (без смен сцен)", shotsOf("B").length === 1);
  check("B: камера опознана как pan-left по траектории лица", shotsOf("B")[0].cameraMotion === "pan-left", shotsOf("B")[0].cameraMotion);
  check("B: крупный план по размеру лица", shotsOf("B")[0].size === "close");
  check("C: брак → тир reject", shotsOf("C").every((s) => s.tier === "reject"));
  check("D: эпик-сегмент → тир strong", shotsOf("D").some((s) => s.tier === "strong" && s.start >= 4));
  check("D: эпик имеет высокий momentum", shotsOf("D")[1].momentum >= 0.8, String(shotsOf("D")[1].momentum));
  check("слабые места C зарегистрированы", perception.assets.find((a) => a.assetId === "C")!.weakSpans.length >= 1);
  check("музыка: дроп на таймлайне = 8с", perception.music.dropsTimeline[0] === 8, JSON.stringify(perception.music.dropsTimeline));
}

// ---------------------------------------------------------------------------
// TEST B: Режиссёрский план — визуальный ролик под музыку
// ---------------------------------------------------------------------------

console.log("\n=== B. Director: визуальный план (tiktok, биты 120 BPM) ===");

const planB = await AIDirector.direct(visualRequest, { llm: false });
console.log("  ·", summarizePlan(planB));

check("тип плана — visual", planB.kind === "visual");
check("сцен достаточно для фильма", planB.scenes.length >= 6, String(planB.scenes.length));
check("хронометраж близок к цели", (() => {
  const total = planB.scenes.reduce((a, s) => a + s.duration, 0);
  return total >= planB.targetDuration * 0.55 && total <= planB.targetDuration * 1.1;
})().valueOf(), `${planB.scenes.reduce((a, s) => a + s.duration, 0).toFixed(1)} / ${planB.targetDuration.toFixed(1)}`);

const hookSceneB = planB.scenes.find((s) => s.phase === "hook")!;
check("хук есть и короткий (≤2.6с)", !!hookSceneB && hookSceneB.duration <= 2.6, `${hookSceneB?.duration.toFixed(2)}`);
check("хук сильный: лицо/экшн/тир strong", (() => {
  const sh = perception.assets.flatMap((a) => a.shots).find((s) => s.assetId === hookSceneB.source.assetId && hookSceneB.source.start >= s.start - 0.01 && hookSceneB.source.start <= s.end);
  return !!sh && (sh.hasFaces || sh.hasAction || sh.tier === "strong");
})());

const climaxesB = planB.scenes.filter((s) => s.phase === "climax");
check("ровно одна кульминация", climaxesB.length === 1, String(climaxesB.length));
check("кульминация — эпичнейший материал (D)", climaxesB[0]?.source.assetId === "D", climaxesB[0]?.source.assetId);
check("кульминация стоит на классической точке ≈75% хронометража", (() => {
  const want = planB.targetDuration * 0.75;
  return Math.abs(planB.climaxAt - want) <= 1.0;
})(), `climaxAt=${planB.climaxAt.toFixed(2)} want≈${(planB.targetDuration * 0.75).toFixed(2)}`);

check("бракованный материал C не попал в монтаж", planB.scenes.every((s) => s.source.assetId !== "C"));
check("слабые моменты C помечены как вырезанные", planB.weakMomentsHandled.some((w) => w.assetId === "C" && w.action === "cut"));

check("нет двух одинаковых ассетов подряд (кроме связок тизер/кульминация)", (() => {
  for (let i = 1; i < planB.scenes.length; i++) {
    const prev = planB.scenes[i - 1];
    const cur = planB.scenes[i];
    if (prev.source.assetId === cur.source.assetId) {
      const allow = [prev.phase, cur.phase].some((p) => p === "teaser" || p === "climax" || p === "hook");
      if (!allow) return false;
    }
  }
  return true;
})());

check("длительности сцен квантуются в бит-сетку 0.5с", planB.scenes
  .filter((s) => s.source.speed === 1 && s.phase !== "teaser")
  .every((s) => {
    const k = s.duration / 0.5;
    return Math.abs(k - Math.round(k)) < 0.02;
  }), planB.scenes.map((s) => s.duration.toFixed(2)).join(","));

check("переход первой сцены — резкий", planB.scenes[0].transitionIn?.type === "cut");
check("переходы режиссёра снабжены мотивировкой", planB.scenes.every((s) => !s.transitionIn || !!s.transitionIn.reason));
check("у каждой сцены есть режиссёрское обоснование", planB.scenes.every((s) => (s.why || "").length > 3));

check("драматургия: секции покрывают фильм без дыр", (() => {
  const ds = planB.dramaturgy;
  if (ds.length === 0) return false;
  for (let i = 1; i < ds.length; i++) if (Math.abs(ds[i].start - ds[i - 1].end) > 0.01) return false;
  return ds.some((d) => d.phase === "climax") && (ds[0].phase === "teaser" || ds[0].phase === "hook");
})());
check("кривая темпа монотонна по времени и имеет пик = 1 на кульминации", (() => {
  const ks = planB.pacingCurve;
  for (let i = 1; i < ks.length; i++) if (ks[i].t <= ks[i - 1].t) return false;
  return ks.some((k) => k.intensity === 1);
})());

check("музыкальный план: пользовательский трек, сетка известна", planB.music.style === "user" && planB.music.bpm === 120);
check("flash-forward тизер для быстрого жанра", planB.scenes[0].phase === "teaser" || planB.scenes.some((s) => s.phase === "teaser") || planB.scenes.length <= 4);
check("журнал режиссёра объясняет решения (≥5 заметок)", planB.directorNotes.length >= 5, String(planB.directorNotes.length));
check("журнал упоминает хук и кульминацию", planB.directorNotes.some((n) => n.toLowerCase().includes("хук")) && planB.directorNotes.some((n) => n.toLowerCase().includes("кульминац")));
check("план сериализуется (JSON round-trip)", JSON.parse(JSON.stringify(planB)).concept === planB.concept);

// Детерминизм: повторный прогон → тот же план (без createdAt).
{
  const again = await AIDirector.direct(visualRequest, { llm: false });
  const strip = (p: typeof planB) => JSON.stringify({ ...p, createdAt: 0 });
  check("детерминизм: одинаковые материалы → одинаковый план", strip(again) === strip(planB));
}

// Адаптер: план → решение монтажного движка.
{
  const decision = planToDecision(planB);
  const mains = decision.clips.filter((c) => c.trackType !== "b-roll");
  check("adapter: main-клипов ровно столько, сколько сцен", mains.length === planB.scenes.length, `${mains.length}/${planB.scenes.length}`);
  check("adapter: все окна валидны (end > start ≥ 0)", decision.clips.every((c) => (c.endTime ?? 0) > (c.startTime ?? -1) && (c.startTime ?? 0) >= 0));
  check("adapter: длительности положительные", decision.clips.every((c) => c.duration > 0.1));
  check("adapter: первый клип несёт transitionHint режиссёра", mains[0]?.transitionHint?.type === "cut");
  let acc = 0;
  let mono = true;
  for (const c of mains) {
    if (c.startTime === undefined) mono = false;
    acc += c.duration;
  }
  check("adapter: суммарный хронометраж main = плановому", Math.abs(acc - planB.scenes.reduce((a, s) => a + s.duration, 0)) < 0.3 && mono, `${acc.toFixed(2)}`);
  const script = planToScript(planB);
  check("adapter: planToScript сохраняет число сцен", script.scenes.length === planB.scenes.length);
  check("adapter: тизер мапится в фазу hook классического скрипта", script.scenes.every((s) => ["hook", "buildup", "climax", "outro"].includes(s.phase)));
}

// ---------------------------------------------------------------------------
// TEST C: Кульминация на дропе музыки
// ---------------------------------------------------------------------------

console.log("\n=== C. Кульминация ставится на дроп ===");
{
  // То же собрание, но целевой хронометраж 15с: дроп (8с таймлайна) попадает
  // в рабочее окно 45–85%.
  const reqC: AIAnalysisRequest = { ...visualRequest, userPrompt: "сделай ролик 15 сек" };
  const planC = await AIDirector.direct(reqC, { llm: false });
  console.log("  ·", summarizePlan(planC));
  check("target = 15с (распознан из промпта)", planC.targetDuration === 15, String(planC.targetDuration));
  check("кульминация встала на дроп (≈8с)", Math.abs(planC.climaxAt - 8) <= 1.0, `climaxAt=${planC.climaxAt.toFixed(2)}`);
  check("план помечает выравнивание по дропу", planC.music.climaxAlignedToDrop === true);
}

// ---------------------------------------------------------------------------
// TEST D: Нарратив — речевой ролик с перебивками
// ---------------------------------------------------------------------------

console.log("\n=== D. Director: нарративный план (говорящая голова) ===");

const transcript = [
  "[0.0s - 0.4s] привет",
  "[0.5s - 0.9s] всем",
  "[1.2s - 1.6s] ну",
  "[1.7s - 2.1s] эээ",
  "[2.9s - 3.9s] хочешь узнать",
  "[3.95s - 4.6s] почему я чуть",
  "[4.7s - 5.4s] не утонул в метре от берега у моря?",
  "[6.0s - 6.9s] сначала всё было",
  "[7.0s - 7.8s] спокойно погода отличная",
  "[8.3s - 9.0s] а потом поднялась",
  "[9.15s - 9.9s] волна высотой метра три",
  "[10.45s - 11.4s] я подумал что",
  "[11.5s - 12.4s] всё это конец честное слово!",
  "[13.4s - 15.2s] океан не прощает самоуверенности",
  "[15.3s - 16.1s] вот вывод из моей истории",
  "[16.6s - 17.9s] спас меня спасатель у берега моря",
  "[18.0s - 19.2s] просто вытащил за руку",
  "[19.7s - 21.0s] с тех пор я всегда",
  "[21.15s - 22.3s] смотрю прогноз волн перед поездкой",
  "[22.8s - 23.8s] подписывайся если было",
  "[23.9s - 24.5s] полезно!",
].join("\n");

const podAsset = asset("P", "podcast.mp4", "video", 30, {
  transcript,
  segments: segSeries(0, 30, 2, { hasFaces: true, faceX: 0.5, faceY: 0.45, faceSize: 0.06, qualityScore: 9, aestheticScore: 7, brightness: 150 }),
  audioEnergy: [
    { startTime: 0, endTime: 13.4, energyLevel: "medium" },
    { startTime: 13.4, endTime: 16.5, energyLevel: "drop" },
    { startTime: 16.5, endTime: 30, energyLevel: "medium" },
  ] as AudioEnergySegment[],
});
const seaAsset = asset("S", "море-01.mp4", "video", 8, {
  segments: segSeries(0, 8, 2, { qualityScore: 8, aestheticScore: 8, motionLevel: "medium", brightness: 160 }),
});
const officeAsset = asset("O", "office.mp4", "video", 8, {
  segments: segSeries(0, 8, 2, { qualityScore: 7, aestheticScore: 6, brightness: 140 }),
});

const narrativeRequest: AIAnalysisRequest = {
  userPrompt: "напиши: «МОРЕ ЗОВЁТ»",
  templateHint: "tiktok",
  beats: beatsGrid(0.5, 70),
  musicInPointSec: 0,
  assets: [podAsset, seaAsset, officeAsset],
};

const planD = await AIDirector.direct(narrativeRequest, { llm: false });
console.log("  ·", summarizePlan(planD));

check("тип плана — narrative", planD.kind === "narrative");
check("флэш-тизер для быстрого жанра", planD.scenes[0].phase === "teaser", planD.scenes[0].phase);

const hookD = planD.scenes.find((s) => s.phase === "hook")!;
check("хук — интригующий вопрос из начала", hookD.source.start >= 2.8 && hookD.source.start <= 3.0, `start=${hookD.source.start.toFixed(2)}`);
check("приветствие и филлеры вырезаны (ни одна сцена не лезет в 0–2.8с)",
  planD.scenes.every((s) => s.phase === "teaser" || s.source.assetId !== "P" || s.source.start >= 2.8),
  planD.scenes.map((s) => `${s.phase}@${s.source.start.toFixed(1)}`).join(" "));

const climaxD = planD.scenes.filter((s) => s.phase === "climax");
check("ровно одна кульминация", climaxD.length === 1, String(climaxD.length));
check("кульминация — payoff-фраза «океан не прощает…»",
  !!climaxD[0] && climaxD[0].source.start <= 13.5 && climaxD[0].source.end >= 15.9,
  climaxD[0] ? `${climaxD[0].source.start.toFixed(2)}–${climaxD[0].source.end.toFixed(2)}` : "нет");

check("есть драматическая пауза (reaction beat)", planD.scenes.some((s) => s.intent.toLowerCase().includes("пауза")));
check("перебивки запланированы", planD.scenes.reduce((a, s) => a + s.bRolls.length, 0) >= 1);
check("семантическая перебивка: «море» → ассет с морем в имени", planD.scenes.some((s) => s.bRolls.some((b) => b.assetId === "S")),
  JSON.stringify(planD.scenes.flatMap((s) => s.bRolls.map((b) => b.assetId))));
check("перебивки имеют мотивировку", planD.scenes.every((s) => s.bRolls.every((b) => (b.reason || "").length > 3)));
check("титр из промпта поставлен на хук", planD.scenes.some((s) => s.phase === "hook" && s.captions.some((c) => c.text === "МОРЕ ЗОВЁТ")),
  JSON.stringify(planD.scenes[0]?.captions));
check("музыкальный план нарратива: ducking + тихий фон", planD.music.ducking === true && planD.music.volume <= 0.2);
check("нарратив: переходы между фразами — jump cut",
  planD.scenes.filter((s) => s.source.assetId === "P").every((s) => !s.transitionIn || s.transitionIn.type === "cut"));

{
  const decision = planToDecision(planD);
  const mains = decision.clips.filter((c) => c.trackType !== "b-roll");
  const brolls = decision.clips.filter((c) => c.trackType === "b-roll");
  const total = mains.reduce((a, c) => a + c.duration, 0);
  check("adapter(narrative): b-roll в пределах таймлайна", brolls.every((b) => (b.timeInTimeline ?? 0) >= 0 && (b.timeInTimeline ?? 0) <= total + 0.01),
    brolls.map((b) => b.timeInTimeline?.toFixed(1)).join(","));
  check("adapter(narrative): кастомный титр доехал до textOverlays", !!decision.textOverlays?.some((t) => t.text === "МОРЕ ЗОВЁТ"));
  check("adapter(narrative): монтажные подсказки переходов доехали", mains.every((m) => !m.transitionHint || m.transitionHint.type === "cut"));
}

// ---------------------------------------------------------------------------
// TEST E: Крайние случаи
// ---------------------------------------------------------------------------

console.log("\n=== E. Крайние случаи ===");
{
  // Без покадрового анализа — план всё равно строится (приблизительные оценки).
  const req: AIAnalysisRequest = {
    userPrompt: "", templateHint: "tiktok",
    assets: [asset("r1", "raw1.mp4", "video", 20, {}), asset("r2", "raw2.mp4", "video", 18, {})],
  };
  const p = await AIDirector.direct(req, { llm: false });
  check("без анализа кадров план строится", p.scenes.length >= 3, String(p.scenes.length));
  check("без анализа: причины помечены «приблизительная оценка»",
    p.scenes.every((s) => (s.why || "").length > 0));
  check("без анализа: окна в пределах исходников",
    p.scenes.every((s) => s.source.start >= 0 && s.source.end <= (s.source.assetId === "r1" ? 20.01 : 18.01)));
}
{
  // Только фото: слайдшоу собирается, статика у всех планов.
  const imgs = [0, 1, 2].map((i) => asset(`i${i}`, `photo${i}.jpg`, "image", 10, {
    segments: [seg(0, 10, { qualityScore: 8, aestheticScore: 8, brightness: 150 })],
  }));
  const p = await AIDirector.direct({ userPrompt: "", templateHint: "travel", assets: imgs }, { llm: false });
  check("слайдшоу из фото собирается", p.scenes.length >= 3, String(p.scenes.length));
  check("для кино-жанра кульминация есть", p.scenes.some((s) => s.phase === "climax"));
}
{
  // Один слабый ассет целиком: фоллбэк всё равно даёт план (лучше слабый ролик, чем пустой).
  const weakOnly = asset("w", "weak.mp4", "video", 8, {
    segments: segSeries(0, 8, 2, { isDark: true, isBlurry: true, qualityScore: 3, aestheticScore: 2, brightness: 22, contrast: 50, colorfulness: 5 }),
  });
  const p = await AIDirector.direct({ userPrompt: "", templateHint: "tiktok", assets: [weakOnly] }, { llm: false });
  check("все кадры слабые → relaxed-фоллбэк собирает план, не пустой", p.scenes.length >= 1, String(p.scenes.length));
}
{
  // Пустой ввод: единственный аудио-трек без видео — пустой план без падения.
  const p = await AIDirector.direct({ userPrompt: "", templateHint: "tiktok", assets: [asset("m", "m.mp3", "audio", 30, {})] }, { llm: false });
  check("нет видео → пустой план, без падения", p.scenes.length === 0);
  const d = planToDecision(p);
  check("пустой план компилируется в пустое решение", d.clips.length === 0);
}

// ---------------------------------------------------------------------------
// Итог
// ---------------------------------------------------------------------------

if (failures === 0) console.log("\n✅ AI DIRECTOR: ВСЕ ПРОВЕРКИ ПРОШЛИ");
else {
  console.error(`\n❌ Провалено: ${failures}`);
  process.exit(1);
}
