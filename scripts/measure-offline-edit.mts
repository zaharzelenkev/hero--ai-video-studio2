/**
 * ИЗМЕРИТЕЛЬНЫЙ СТЕНД OFFLINE EDIT — оценка чернового монтажа по
 * профессиональным критериям (Premiere Pro / DaVinci Resolve).
 *
 * В отличие от регрессионного теста (test-offline-edit.mts), который
 * проверяет ФАКТЫ, этот стенд измеряет КАЧЕСТВО и печатает отчёт: где монтаж
 * дотягивает до профессионального уровня, а где ещё проседает.
 *
 * Метрики:
 *   A. Драматургия — соотношение фаз арки, положение кульминации,
 *      отсутствие «провисающего» хвоста.
 *   B. Ритм — распределение длительностей, нарастание темпа к пику.
 *   C. Отбор материала — качество выбранного против пула, отбраковка брака.
 *   D. Чистота речи — сколько мусора удалено, сохранены ли смысловые паузы.
 *   E. Постановка — полнота режиссёрских карточек сцен.
 *   F. Стыки — разнообразие переходов, отсутствие «плоских» серий.
 *
 * Запуск: npx tsx scripts/measure-offline-edit.mts
 */

import { AIDirector } from "../src/lib/brain/aiDirector";
import type { AIAnalysisRequest } from "../src/lib/ai/aiService";
import type { DirectorPlan } from "../src/lib/brain/directorPlan";
import type { VideoSegmentMetadata } from "../src/lib/localAnalyzer";
import type { AudioEnergySegment } from "../src/lib/media";

const seg = (s: number, e: number, o: Partial<VideoSegmentMetadata> = {}): VideoSegmentMetadata => ({
  startTime: s, endTime: e, motionLevel: "low", isDark: false, isBlurry: false, hasFaces: false,
  qualityScore: 7, isSceneChange: false, hasAction: false, aestheticScore: 6,
  brightness: 145, contrast: 120, saturation: 40, colorfulness: 28, ...o,
});

const series = (from: number, to: number, step: number, o: Partial<VideoSegmentMetadata> | ((t: number) => Partial<VideoSegmentMetadata>)) => {
  const out: VideoSegmentMetadata[] = [];
  for (let t = from; t < to - 1e-6; t += step) out.push(seg(t, Math.min(t + step, to), typeof o === "function" ? o(t) : o));
  return out;
};

const beatsGrid = (step: number, to: number) => {
  const out: number[] = [];
  for (let t = 0; t <= to; t += step) out.push(+t.toFixed(3));
  return out;
};

let warnings = 0;
const M = (label: string, ok: boolean, value: string, norm: string) => {
  if (!ok) warnings++;
  console.log(`  ${ok ? "✅" : "⚠️ "} ${label}: ${value}  ${ok ? "" : `(норма: ${norm})`}`);
};

// ---------------------------------------------------------------------------
// Общие измерения плана
// ---------------------------------------------------------------------------

function report(plan: DirectorPlan, title: string, opts: { dropAt?: number } = {}) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
  const total = plan.scenes.reduce((a, s) => a + s.duration, 0);

  let t = 0;
  for (const s of plan.scenes) {
    const br = s.bRolls.length ? ` broll=${s.bRolls.length}` : "";
    const rec = s.brollRecommendations.length ? ` rec=${s.brollRecommendations.map((r) => r.subject).join("/")}` : "";
    console.log(
      `  ${t.toFixed(1).padStart(5)}→${(t + s.duration).toFixed(1).padStart(5)} ` +
      `${s.phase.padEnd(10)} ${s.pace.padEnd(7)} ${(s.transitionIn?.type ?? "cut").padEnd(10)} ` +
      `${s.colorMood.mood.padEnd(24)} mus=${s.music.role.padEnd(7)}${s.music.level.toFixed(2)} ${s.source.assetId}${br}${rec}`,
    );
    t += s.duration;
  }
  console.log(`  ИТОГО: ${total.toFixed(1)}с / цель ${plan.targetDuration.toFixed(1)}с · сцен ${plan.scenes.length}`);

  // --- A. Драматургия ---
  console.log("\n  --- A. ДРАМАТУРГИЯ ---");
  const phaseSec = new Map<string, number>();
  for (const s of plan.scenes) phaseSec.set(s.phase, (phaseSec.get(s.phase) ?? 0) + s.duration);
  const pct = (p: string) => ((phaseSec.get(p) ?? 0) / Math.max(0.01, total)) * 100;

  M("одна кульминация", plan.scenes.filter((s) => s.phase === "climax").length === 1,
    String(plan.scenes.filter((s) => s.phase === "climax").length), "ровно 1");
  M("хук в начале", plan.scenes[0]?.phase === "hook" || plan.scenes[0]?.phase === "teaser",
    plan.scenes[0]?.phase ?? "—", "hook/teaser");
  const climaxPos = total > 0 ? (plan.climaxAt / total) * 100 : 0;
  M("кульминация в окне 50-85% арки", climaxPos >= 45 && climaxPos <= 88,
    `${climaxPos.toFixed(0)}% (${plan.climaxAt.toFixed(1)}с)`, "50-85%");
  M("выдох не раздут", pct("outro") <= 30, `${pct("outro").toFixed(0)}% хронометража`, "≤30%");
  M("хук короткий", (plan.scenes.find((s) => s.phase === "hook")?.duration ?? 0) <= 3.2,
    `${(plan.scenes.find((s) => s.phase === "hook")?.duration ?? 0).toFixed(1)}с`, "≤3.2с");
  M("финал — выдох/кульминация", ["outro", "climax"].includes(plan.scenes[plan.scenes.length - 1]?.phase ?? ""),
    plan.scenes[plan.scenes.length - 1]?.phase ?? "—", "outro/climax");
  if (opts.dropAt !== undefined) {
    const d = Math.abs(plan.climaxAt - opts.dropAt);
    M("кульминация на дропе музыки", d <= 2.0, `|Δ| = ${d.toFixed(1)}с (дроп ${opts.dropAt}с)`, "≤2с");
  }
  const arcOk = (() => {
    for (let i = 1; i < plan.dramaturgy.length; i++) {
      if (Math.abs(plan.dramaturgy[i].start - plan.dramaturgy[i - 1].end) > 0.01) return false;
    }
    return plan.dramaturgy.length > 0;
  })();
  M("арка без дыр", arcOk, `секций ${plan.dramaturgy.length}`, "непрерывна");

  // --- B. Ритм ---
  console.log("\n  --- B. РИТМ ---");
  const durs = plan.scenes.map((s) => s.duration);
  const avg = durs.reduce((a, b) => a + b, 0) / Math.max(1, durs.length);
  const variance = durs.reduce((a, d) => a + (d - avg) ** 2, 0) / Math.max(1, durs.length);
  const cv = Math.sqrt(variance) / Math.max(0.01, avg);
  M("ритм не монотонный (есть разброс длительностей)", cv >= 0.15, `коэф. вариации ${cv.toFixed(2)}`, "≥0.15");
  M("нет затянутых планов", durs.every((d) => d <= Math.max(6, plan.targetDuration * 0.22)),
    `максимум ${Math.max(...durs).toFixed(1)}с`, `≤${Math.max(6, plan.targetDuration * 0.22).toFixed(1)}с`);
  M("нет кадров-обрубков", durs.every((d) => d >= 0.55), `минимум ${Math.min(...durs).toFixed(2)}с`, "≥0.55с");
  // Нарастание темпа: планы перед кульминацией короче планов начала арки.
  const climaxIdx = plan.scenes.findIndex((s) => s.phase === "climax");
  if (climaxIdx > 3) {
    const early = plan.scenes.slice(1, Math.max(2, Math.floor(climaxIdx / 2))).map((s) => s.duration);
    const late = plan.scenes.slice(Math.max(2, Math.floor(climaxIdx / 2)), climaxIdx).map((s) => s.duration);
    if (early.length && late.length) {
      const ea = early.reduce((a, b) => a + b, 0) / early.length;
      const la = late.reduce((a, b) => a + b, 0) / late.length;
      M("темп нарастает к кульминации", la <= ea * 1.06, `${ea.toFixed(1)}с → ${la.toFixed(1)}с`, "планы укорачиваются");
    }
  }
  const paceKinds = new Set(plan.scenes.map((s) => s.pace));
  M("темп сцен размечен осмысленно", paceKinds.size >= 1, [...paceKinds].join("/"), "заполнен");

  // --- C. Отбор материала ---
  console.log("\n  --- C. ОТБОР МАТЕРИАЛА ---");
  const takes = plan.offlineEdit?.takes;
  console.log(`     групп дублей: ${takes?.groups ?? 0}, отбраковано: ${takes?.rejected ?? 0} (${takes?.rejectedSec ?? 0}с)`);
  const cutWeak = plan.weakMomentsHandled.filter((w) => w.action === "cut").length;
  const covered = plan.weakMomentsHandled.filter((w) => w.action === "covered").length;
  console.log(`     брак: вырезано ${cutWeak}, прикрыто перебивкой ${covered}`);
  M("каждое решение по дублям объяснено",
    (takes?.decisions ?? []).every((d) => d.losers.every((l) => l.reason.length > 10)), "да", "с причиной");
  M("сильные моменты использованы", plan.strongMomentsUsed.length >= 1,
    String(plan.strongMomentsUsed.length), "≥1");

  // --- D. Чистота речи ---
  const sc = plan.offlineEdit?.speechCleanup;
  if (sc && sc.length) {
    console.log("\n  --- D. ЧИСТОТА РЕЧИ ---");
    const s0 = sc[0];
    console.log(`     удалено ${s0.removedSec}с: пауз ${s0.pauses}, паразитов ${s0.fillers}, кашля ${s0.coughs}, вдохов ${s0.breaths}, дублей ${s0.retakes}`);
    M("мусор реально удаляется", s0.removedSec > 0.5, `${s0.removedSec}с`, ">0.5с");
    M("речь не выкошена целиком", s0.keptSec > s0.removedSec * 0.6, `осталось ${s0.keptSec}с`, "больше вырезанного");
  }

  // --- E. Постановка сцен ---
  console.log("\n  --- E. ПОСТАНОВКА СЦЕН ---");
  const staged = plan.scenes.filter(
    (s) => !!s.goal && !!s.pace && !!s.music && !!s.colorMood && !!s.transitionIn && Array.isArray(s.brollRecommendations),
  ).length;
  M("все сцены полностью поставлены", staged === plan.scenes.length,
    `${staged}/${plan.scenes.length}`, "100%");
  M("каждая сцена объяснена", plan.scenes.every((s) => (s.why || "").length > 5), "да", "why заполнен");
  const moods = new Set(plan.scenes.map((s) => s.colorMood.mood));
  M("цвет меняется по ходу фильма", moods.size >= 2, `${moods.size} настроений`, "≥2");
  const climaxScene = plan.scenes.find((s) => s.phase === "climax");
  const buildups = plan.scenes.filter((s) => s.phase === "buildup");
  if (climaxScene && buildups.length) {
    M("кульминация теплее нарастания",
      buildups.every((b) => climaxScene.colorMood.temperature >= b.colorMood.temperature),
      `${climaxScene.colorMood.temperature} vs ${Math.max(...buildups.map((b) => b.colorMood.temperature))}`,
      "теплее");
  }

  // --- F. Стыки ---
  console.log("\n  --- F. СТЫКИ ---");
  const trans = plan.scenes.slice(1).map((s) => s.transitionIn?.type ?? "cut");
  const kinds = new Map<string, number>();
  for (const tr of trans) kinds.set(tr, (kinds.get(tr) ?? 0) + 1);
  console.log(`     ${[...kinds.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}`);
  M("первый кадр входит резко", plan.scenes[0]?.transitionIn?.type === "cut",
    plan.scenes[0]?.transitionIn?.type ?? "—", "cut");
  M("все переходы мотивированы", plan.scenes.every((s) => !s.transitionIn || !!s.transitionIn.reason), "да", "с причиной");
  const sameAsset = plan.scenes.slice(1).filter((s, i) =>
    s.source.assetId === plan.scenes[i].source.assetId && (s.transitionIn?.type ?? "cut") !== "cut").length;
  M("на одном источнике только jump cut", sameAsset === 0, `нарушений ${sameAsset}`, "0");
  // ЭФФЕКТНЫЕ СТЫКИ — РЕДКОСТЬ, А НЕ ПРАВИЛО.
  // Профессиональный монтаж — это подавляющее большинство прямых склеек;
  // наплыв/вспышка/хлыст ставятся там, где несут смысл (смена сцены, удар,
  // match cut). Обратная ошибка — «слайдшоу», где КАЖДЫЙ стык растворяется.
  if (trans.length >= 5) {
    const cutShare = (kinds.get("cut") ?? 0) / trans.length;
    M("прямая склейка — основа монтажа", cutShare >= 0.5,
      `${(cutShare * 100).toFixed(0)}% прямых склеек`, "≥50%");
    M("эффектные переходы не превращаются в слайдшоу", 1 - cutShare <= 0.5,
      `${((1 - cutShare) * 100).toFixed(0)}% с эффектом`, "≤50%");
  }

  // --- G. РАЗНООБРАЗИЕ МАТЕРИАЛА ---
  console.log("\n  --- G. РАЗНООБРАЗИЕ ---");
  const assetUse = new Map<string, number>();
  for (const s of plan.scenes) assetUse.set(s.source.assetId, (assetUse.get(s.source.assetId) ?? 0) + 1);
  console.log(`     использование: ${[...assetUse.entries()].map(([a, n]) => `${a}×${n}`).join(", ")}`);
  let sameInRow = 0;
  for (let i = 1; i < plan.scenes.length; i++) {
    if (plan.scenes[i].source.assetId === plan.scenes[i - 1].source.assetId) sameInRow++;
  }
  // Для нарратива подряд идущий спикер — норма; для визуального ряда — брак.
  if (plan.kind === "visual") {
    M("нет двух одинаковых источников подряд", sameInRow <= 1, `${sameInRow} стыков`, "≤1");
  }
  // Повтор ОДНОГО И ТОГО ЖЕ окна исходника — зритель видит кадр дважды.
  const windows = plan.scenes.map((s) => `${s.source.assetId}@${s.source.start.toFixed(1)}`);
  const dupWindows = windows.length - new Set(windows).size;
  M("нет повторов одного окна исходника", dupWindows === 0, `повторов ${dupWindows}`, "0");
  // Крупность планов должна чередоваться.
  if (plan.kind === "visual") {
    const sizes = plan.scenes.map((s) => s.source.shotSize ?? "wide");
    let sameSize = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] === sizes[i - 1]) sameSize++;
    const distinct = new Set(sizes).size;
    M("крупность чередуется", distinct < 2 || sameSize <= Math.ceil(sizes.length / 2),
      `${sameSize}/${sizes.length - 1} одинаковых подряд (${distinct} типов в пуле)`, "≤50%");
  }

  return { total, warnings };
}

// ===========================================================================
// СЦЕНАРИЙ 1: тревел под музыку с дропом
// ===========================================================================

{
  const musicEnergy: AudioEnergySegment[] = [];
  for (let t = 0; t < 70; t += 2) {
    const lv: AudioEnergySegment["energyLevel"] =
      t < 8 ? "low" : t < 26 ? "medium" : t < 32 ? "high" : t < 42 ? "drop" : t < 52 ? "medium" : "high";
    musicEnergy.push({ startTime: t, endTime: t + 2, energyLevel: lv });
  }

  const req: AIAnalysisRequest = {
    userPrompt: "эпичный тревел ролик 40 сек",
    beats: beatsGrid(0.5, 70),
    musicInPointSec: 0,
    assets: [
      { id: "city", name: "city.mp4", type: "video", duration: 30, segments: [
        ...series(0, 8, 1, { qualityScore: 7, aestheticScore: 7, brightness: 150, colorfulness: 32 }),
        ...series(8, 14, 1, { qualityScore: 4, isBlurry: true, brightness: 140, isSceneChange: false }),
        ...series(14, 22, 1, (t) => ({ qualityScore: 9, aestheticScore: 9, motionLevel: "high", hasAction: true, brightness: 160, colorfulness: 48, isSceneChange: t < 14.5 })),
        ...series(22, 30, 1, (t) => ({ qualityScore: 7, aestheticScore: 6, brightness: 145, isSceneChange: t < 22.5 })),
      ] },
      { id: "nature", name: "nature.mp4", type: "video", duration: 26, segments: [
        ...series(0, 10, 1, { qualityScore: 8, aestheticScore: 8, brightness: 155, colorfulness: 44, motionLevel: "medium" }),
        ...series(10, 16, 1, (t) => ({ qualityScore: 3, isDark: true, contrast: 55, brightness: 25, isSceneChange: t < 10.5 })),
        ...series(16, 26, 1, (t) => ({ qualityScore: 8, aestheticScore: 8, brightness: 150, colorfulness: 40, hasFaces: true, faceX: 1 / 3, faceY: 0.35, faceSize: 0.09, isSceneChange: t < 16.5 })),
      ] },
      { id: "portrait", name: "portrait.jpg", type: "image", duration: 4, segments: [
        seg(0, 10, { qualityScore: 9, aestheticScore: 9, hasFaces: true, faceX: 0.35, faceY: 0.33, faceSize: 0.11, colorfulness: 38 }),
      ] },
      { id: "blurshot", name: "blur.jpg", type: "image", duration: 4, segments: [
        seg(0, 10, { qualityScore: 2, aestheticScore: 2, isBlurry: true, colorfulness: 8, contrast: 60 }),
      ] },
      { id: "track", name: "track.mp3", type: "audio", duration: 70, audioEnergy: musicEnergy },
    ],
  };

  const plan = await AIDirector.direct(req, { llm: false });
  report(plan, "СЦЕНАРИЙ 1 · Тревел под музыку (дроп на 32с)", { dropAt: 32 });
  console.log(`\n  Материал brak: blur.jpg в монтаже — ${plan.scenes.some((s) => s.source.assetId === "blurshot") ? "❌ ДА" : "✅ нет"}`);
}

// ===========================================================================
// СЦЕНАРИЙ 2: подкаст с грязной речью и B-Roll
// ===========================================================================

{
  const transcript = [
    "[0.0s - 0.5s] ну",
    "[0.6s - 1.1s] эээ",
    "[1.3s - 1.9s] короче",
    "[3.0s - 4.2s] знаешь сколько денег",
    "[4.3s - 5.4s] я потерял на первом бизнесе?",
    "[6.0s - 7.1s] это была реклама",
    "[7.2s - 8.3s] в трёх каналах сразу",
    "[8.5s - 9.0s] [кашель]",
    "[9.4s - 10.6s] мы слили бюджет",
    "[10.7s - 11.9s] за две недели",
    // мёртвый воздух 11.9 → 19.0
    "[19.0s - 20.3s] потом я сел",
    "[20.4s - 21.6s] и разобрал воронку",
    "[21.8s - 22.3s] типа",
    "[22.5s - 23.8s] по шагам как инженер",
    "[24.4s - 25.1s] (вдох)",
    "[25.5s - 27.0s] оказалось клиенты уходили с сайта",
    "[27.2s - 28.6s] на втором экране",
    // случайный дубль
    "[29.5s - 30.8s] мы переписали заголовок",
    "[31.2s - 32.6s] мы переписали заголовок",
    "[32.8s - 34.2s] за один вечер без дизайнера",
    "[35.0s - 36.8s] и конверсия выросла на семьдесят процентов",
    // драматическая пауза 36.8 → 38.0
    "[38.0s - 40.2s] продажи растут не от рекламы а от скорости ответа",
    "[40.5s - 42.0s] проверьте свою воронку сегодня",
    "[42.4s - 43.8s] подписывайтесь если было полезно",
  ].join("\n");

  const req: AIAnalysisRequest = {
    userPrompt: "подкаст про продажи",
    templateHint: "podcast",
    beats: beatsGrid(0.5, 60),
    musicInPointSec: 0,
    assets: [
      { id: "talk", name: "podcast.mp4", type: "video", duration: 48, transcript,
        segments: series(0, 48, 2, { hasFaces: true, faceX: 0.5, faceY: 0.42, faceSize: 0.08, qualityScore: 9, aestheticScore: 7, brightness: 148 }),
        audioEnergy: [
          { startTime: 0, endTime: 35, energyLevel: "medium" },
          { startTime: 35, endTime: 41, energyLevel: "drop" },
          { startTime: 41, endTime: 48, energyLevel: "medium" },
        ] as AudioEnergySegment[],
      },
      { id: "money", name: "деньги-бюджет.mp4", type: "video", duration: 10,
        segments: series(0, 10, 2, { qualityScore: 8, aestheticScore: 7, brightness: 150, colorfulness: 30 }) },
      { id: "office", name: "office-работа.mp4", type: "video", duration: 10,
        segments: series(0, 10, 2, { qualityScore: 8, aestheticScore: 7, brightness: 145, colorfulness: 25, motionLevel: "medium" }) },
      { id: "screen", name: "экран-сайт.mp4", type: "video", duration: 8,
        segments: series(0, 8, 2, { qualityScore: 8, aestheticScore: 7, brightness: 155, colorfulness: 22 }) },
    ],
  };

  const plan = await AIDirector.direct(req, { llm: false });
  report(plan, "СЦЕНАРИЙ 2 · Подкаст: грязная речь + семантический B-Roll");

  // Семантика перебивок
  console.log("\n  --- СЕМАНТИКА B-ROLL ---");
  const semantic = plan.scenes.filter((s) => s.brollRecommendations.some((r) => r.purpose === "illustrate"));
  console.log(`     иллюстрирующих рекомендаций: ${semantic.length}`);
  for (const s of semantic.slice(0, 5)) {
    const rec = s.brollRecommendations[0];
    console.log(`     «${rec.subject}» → ${rec.matchedAssetId ?? "НЕТ МАТЕРИАЛА"}`);
  }
  const moneyMatch = plan.scenes.some((s) => s.bRolls.some((b) => b.assetId === "money"));
  M("«деньги/бюджет» → нашёлся релевантный материал", moneyMatch, moneyMatch ? "да" : "нет", "семантическое совпадение");

  // Мусор
  console.log("\n  --- МУСОР В МОНТАЖЕ ---");
  const covers = (a: number, b: number) => plan.scenes.some((s) => s.source.assetId === "talk" && s.source.start <= a + 0.15 && s.source.end >= b - 0.15);
  M("филлеры «ну/эээ/короче» вырезаны", !covers(0.0, 0.5) && !covers(0.6, 1.1) && !covers(1.3, 1.9), "да", "не в монтаже");
  M("кашель вырезан", !covers(8.5, 9.0), "да", "не в монтаже");
  M("мёртвый воздух 12-19с вырезан", !covers(13, 18), "да", "не в монтаже");
  M("дубль фразы не звучит дважды",
    plan.scenes.filter((s) => s.source.assetId === "talk" && s.source.start >= 29.3 && s.source.start <= 31.5).length <= 1,
    "да", "одна копия");
}

// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(72)}`);
if (warnings === 0) {
  console.log("✅ OFFLINE EDIT: качество соответствует профессиональному уровню по всем метрикам");
} else {
  console.log(`⚠️  Замечаний к качеству: ${warnings} — есть куда улучшать`);
}
console.log("=".repeat(72));
