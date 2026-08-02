/**
 * OFFLINE EDIT — регрессионный тест чернового монтажа.
 *
 * Покрывает пять обязательных подсистем этапа постпродакшена:
 *
 *   1. AI DIRECTOR ↔ АВТОМОНТАЖ: каждая сцена плана несёт полный
 *      постановочный пакет (цель, эмоция, длительность, темп, переход,
 *      B-Roll, музыка, цвет) и доезжает до монтажного движка без потерь.
 *   2. УМНЫЙ ВЫБОР ДУБЛЕЙ: из похожих кадров выбирается лучший по десяти
 *      критериям, худшие отбраковываются с объяснением.
 *   3. АВТОСИНХРОНИЗАЦИЯ ЗВУКА: сдвиг между камерой и внешним рекордером
 *      находится по кросс-корреляции огибающих.
 *   4. ЧИСТКА РЕЧИ: длинные паузы, слова-паразиты, кашель, вдохи и
 *      случайные дубли удаляются, драматические паузы сохраняются.
 *   5. ДРАМАТУРГИЯ: монтаж строится как история (арка, единственная
 *      кульминация, темповая кривая), а не как нарезка.
 *
 * Запуск: npx tsx scripts/test-offline-edit.mts
 */

import { AIDirector } from "../src/lib/brain/aiDirector";
import { planToDecision } from "../src/lib/brain/planAdapter";
import {
  scoreTake,
  selectBestTakes,
  takeDistance,
  fileStem,
  TAKE_CRITERIA_LABELS,
} from "../src/lib/brain/takeSelection";
import { buildShotsForAsset } from "../src/lib/brain/perception";
import type { Shot } from "../src/lib/brain/perception";
import {
  bestOffsetByCorrelation,
  decideAudioSync,
  envelopeFromSamples,
  onsetEnvelope,
} from "../src/lib/audioSync";
import { cleanupSpeech, parseWords, phraseSimilarity } from "../src/lib/brain/speechCleanup";
import { scenePace, sceneColorMood, sceneMusic, sceneGoal } from "../src/lib/brain/sceneDirection";
import { detectVisualTopic } from "../src/lib/brain/brollDirection";
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
// Фабрики
// ---------------------------------------------------------------------------

const seg = (start: number, end: number, o: Partial<VideoSegmentMetadata> = {}): VideoSegmentMetadata => ({
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
  ...o,
});

function segSeries(
  from: number,
  to: number,
  step: number,
  o: Partial<VideoSegmentMetadata> | ((t: number) => Partial<VideoSegmentMetadata>),
): VideoSegmentMetadata[] {
  const out: VideoSegmentMetadata[] = [];
  for (let t = from; t < to - 1e-6; t += step) {
    out.push(seg(t, Math.min(t + step, to), typeof o === "function" ? o(t) : o));
  }
  return out;
}

const asset = (
  id: string,
  name: string,
  type: "video" | "image" | "audio",
  duration: number,
  extra: Partial<AIAnalysisRequest["assets"][number]> = {},
): AIAnalysisRequest["assets"][number] => ({ id, name, type, duration, ...extra });

const beatsGrid = (step: number, to: number): number[] => {
  const out: number[] = [];
  for (let t = 0; t <= to; t += step) out.push(+t.toFixed(3));
  return out;
};

const shotOf = (id: string, name: string, segments: VideoSegmentMetadata[], duration: number): Shot =>
  buildShotsForAsset({ id, name, type: "video", duration, segments })[0];

// ===========================================================================
// 1. УМНЫЙ ВЫБОР ДУБЛЕЙ
// ===========================================================================

console.log("\n=== 1. Умный выбор дублей (10 критериев) ===");

// Три дубля одного и того же кадра: чистый, смазанный, тёмный.
{
  const clean = shotOf("t_clean", "TAKE_01.mp4",
    segSeries(0, 6, 1, { hasFaces: true, faceX: 1 / 3, faceY: 0.4, faceSize: 0.07, qualityScore: 9, aestheticScore: 8, brightness: 150, contrast: 130 }), 6);
  const blurry = shotOf("t_blur", "TAKE_02.mp4",
    segSeries(0, 6, 1, { hasFaces: true, faceX: 1 / 3, faceY: 0.4, faceSize: 0.07, isBlurry: true, qualityScore: 6, aestheticScore: 5, brightness: 148, contrast: 128 }), 6);
  const dark = shotOf("t_dark", "TAKE_03.mp4",
    segSeries(0, 6, 1, { hasFaces: true, faceX: 1 / 3, faceY: 0.4, faceSize: 0.07, isDark: true, qualityScore: 4, aestheticScore: 3, brightness: 22, contrast: 55 }), 6);

  const sClean = scoreTake(clean);
  const sBlur = scoreTake(blurry);
  const sDark = scoreTake(dark);

  check("резкий дубль оценён выше смазанного", sClean.total > sBlur.total, `${sClean.total} vs ${sBlur.total}`);
  check("резкий дубль оценён выше тёмного", sClean.total > sDark.total, `${sClean.total} vs ${sDark.total}`);
  check("смаз опознан по критерию motionBlur", sBlur.criteria.motionBlur < sClean.criteria.motionBlur,
    `${sBlur.criteria.motionBlur} vs ${sClean.criteria.motionBlur}`);
  check("провал экспозиции опознан", sDark.criteria.exposure < 0.3, String(sDark.criteria.exposure));
  check("все 10 критериев посчитаны", Object.keys(sClean.criteria).length === 10, String(Object.keys(sClean.criteria).length));
  check("критерии в диапазоне 0..1",
    Object.values(sClean.criteria).every((v) => v >= 0 && v <= 1),
    JSON.stringify(sClean.criteria));
  check("у лучшего дубля перечислены сильные стороны", sClean.strengths.length >= 1, JSON.stringify(sClean.strengths));
  check("у бракованного дубля перечислены слабые стороны", sDark.flaws.length >= 1, JSON.stringify(sDark.flaws));

  const result = selectBestTakes([clean, blurry, dark], { minKeep: 1, threshold: 0.34 });
  check("похожие дубли объединены в одну группу", result.groups.length === 1, `groups=${result.groups.length}`);
  check("победил чистый дубль", result.groups[0]?.bestShotId === clean.id, result.groups[0]?.bestShotId);
  check("худшие дубли отбракованы", result.rejected.length === 2, String(result.rejected.length));
  check("у каждого отказа есть причина",
    (result.groups[0]?.rejected ?? []).every((r) => r.reason.length > 10),
    JSON.stringify(result.groups[0]?.rejected.map((r) => r.reason)));
  check("вердикт группы человекочитаем", (result.groups[0]?.verdict ?? "").includes("Дублей"), result.groups[0]?.verdict);
}

// Тряска: критерий стабильности должен убить дубль.
{
  const steady = shotOf("s1", "steady.mp4", segSeries(0, 4, 1, { motionLevel: "medium", qualityScore: 8 }), 4);
  const shaky = shotOf("s2", "shaky.mp4", segSeries(0, 4, 1, { motionLevel: "shake", qualityScore: 8 }), 4);
  const a = scoreTake(steady);
  const b = scoreTake(shaky);
  check("стабильный кадр выигрывает у трясущегося", a.total > b.total, `${a.total} vs ${b.total}`);
  check("тряска опознана критерием stability", b.criteria.stability <= 0.25, String(b.criteria.stability));
}

// Композиция и направление взгляда.
{
  const thirds = shotOf("c1", "thirds.mp4", segSeries(0, 4, 1, { hasFaces: true, faceX: 1 / 3, faceY: 1 / 3, faceSize: 0.07 }), 4);
  const corner = shotOf("c2", "corner.mp4", segSeries(0, 4, 1, { hasFaces: true, faceX: 0.94, faceY: 0.95, faceSize: 0.07 }), 4);
  const t = scoreTake(thirds);
  const c = scoreTake(corner);
  check("кадр по правилу третей сильнее углового", t.criteria.composition > c.criteria.composition,
    `${t.criteria.composition} vs ${c.criteria.composition}`);
  check("лицо у края → взгляд упирается в рамку", c.criteria.gaze <= 0.3, String(c.criteria.gaze));
  check("лицо на трети → есть воздух под взгляд", t.criteria.gaze >= 0.5, String(t.criteria.gaze));
}

// Качество звука: распознанная речь = разборчивая дорожка.
{
  const withSpeech = shotOf("a1", "mic_good.mp4", segSeries(0, 5, 1, { hasFaces: true, faceX: 0.5, faceY: 0.45, faceSize: 0.07 }), 5);
  const noSpeech = shotOf("a2", "mic_dead.mp4", segSeries(0, 5, 1, { hasFaces: true, faceX: 0.5, faceY: 0.45, faceSize: 0.07 }), 5);
  const ctx = {
    speechCoverage: (assetId: string) => (assetId === "a1" ? 0.85 : 0),
    hasAudio: () => true,
  };
  const good = scoreTake(withSpeech, ctx);
  const bad = scoreTake(noSpeech, ctx);
  check("дубль с разборчивой речью звучит лучше", good.criteria.audio > bad.criteria.audio,
    `${good.criteria.audio} vs ${bad.criteria.audio}`);
  check("качество звука влияет на итоговую оценку", good.total > bad.total, `${good.total} vs ${bad.total}`);
}

// Дубли НЕ должны схлопывать разные кадры.
{
  const city = shotOf("d1", "city.mp4", segSeries(0, 5, 1, { brightness: 160, contrast: 140, colorfulness: 45, motionLevel: "medium" }), 5);
  const face = shotOf("d2", "portrait.mp4", segSeries(0, 5, 1, { hasFaces: true, faceX: 0.5, faceY: 0.4, faceSize: 0.12, brightness: 120, colorfulness: 15 }), 5);
  check("непохожие кадры далеки по метрике", takeDistance(city, face) > 0.3, String(takeDistance(city, face).toFixed(3)));
  const r = selectBestTakes([city, face], { minKeep: 1 });
  check("разные кадры НЕ считаются дублями", r.rejected.length === 0, String(r.rejected.length));
}

// Родство имён файлов помогает узнать серию дублей.
check("стем имени файла: IMG_0042.mp4 → img", fileStem("IMG_0042.mp4") === "img", fileStem("IMG_0042.mp4"));
check("стем имени файла: take-3.mov → take", fileStem("take-3.mov") === "take", fileStem("take-3.mov"));

// Пул не схлопывается ниже минимума.
{
  const a1 = shotOf("m1", "a.mp4", segSeries(0, 4, 1, { qualityScore: 9, brightness: 150 }), 4);
  const a2 = shotOf("m2", "a2.mp4", segSeries(0, 4, 1, { qualityScore: 5, isBlurry: true, brightness: 150 }), 4);
  const a3 = shotOf("m3", "a3.mp4", segSeries(0, 4, 1, { qualityScore: 4, isBlurry: true, brightness: 149 }), 4);
  const r = selectBestTakes([a1, a2, a3], { minKeep: 3 });
  check("защита от схлопывания пула работает", r.chosen.length >= 3, String(r.chosen.length));
}

// Детерминизм отбора.
{
  const mk = () => [
    shotOf("z1", "z1.mp4", segSeries(0, 4, 1, { qualityScore: 9, brightness: 150 }), 4),
    shotOf("z2", "z2.mp4", segSeries(0, 4, 1, { qualityScore: 6, isBlurry: true, brightness: 150 }), 4),
  ];
  const r1 = selectBestTakes(mk(), { minKeep: 1 });
  const r2 = selectBestTakes(mk(), { minKeep: 1 });
  check("отбор дублей детерминирован",
    JSON.stringify(r1.chosen.map((s) => s.id)) === JSON.stringify(r2.chosen.map((s) => s.id)));
}

check("критерии подписаны по-русски", Object.keys(TAKE_CRITERIA_LABELS).length === 10);

// ===========================================================================
// 2. АВТОСИНХРОНИЗАЦИЯ ЗВУКА
// ===========================================================================

console.log("\n=== 2. Автоматическая синхронизация аудио ===");

/** Синтетический сигнал: серия «событий» (хлопков) на заданных секундах. */
function makeSignal(durationSec: number, sampleRate: number, events: number[], noise = 0.02, seed = 1): Float32Array {
  const out = new Float32Array(Math.round(durationSec * sampleRate));
  // Детерминированный шум (LCG) — тест не должен «моргать».
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
  for (let i = 0; i < out.length; i++) out[i] = rnd() * noise;
  for (const e of events) {
    const at = Math.round(e * sampleRate);
    const len = Math.round(sampleRate * 0.12);
    for (let i = 0; i < len && at + i < out.length; i++) {
      const env = Math.exp(-i / (sampleRate * 0.03));
      out[at + i] += Math.sin((2 * Math.PI * 220 * i) / sampleRate) * env * 0.9;
    }
  }
  return out;
}

{
  const sr = 8000;
  const events = [1.0, 2.4, 3.1, 5.6, 7.2, 9.4, 11.0, 13.3];
  const camera = makeSignal(16, sr, events, 0.03, 7);
  // Внешний рекордер стартовал на 2.35с РАНЬШЕ камеры и записан тише.
  const offsetTrue = 2.35;
  const external = makeSignal(16, sr, events.map((e) => e + offsetTrue), 0.05, 99);
  for (let i = 0; i < external.length; i++) external[i] *= 0.35;

  const envA = envelopeFromSamples(camera, sr);
  const envB = envelopeFromSamples(external, sr);
  const est = bestOffsetByCorrelation(onsetEnvelope(envA), onsetEnvelope(envB), envA.hopSec);

  check("сдвиг найден с точностью ±60мс", Math.abs(est.offsetSec - offsetTrue) <= 0.06,
    `найдено ${est.offsetSec.toFixed(3)}с, истина ${offsetTrue}с`);
  check("уверенность синхронизации высокая", est.confidence >= 0.55, est.confidence.toFixed(3));
  check("разный уровень записи не мешает (нормализация огибающих)", est.peak > 0.4, est.peak.toFixed(3));

  const decisions = decideAudioSync(
    [{ assetId: "vid", name: "camera.mp4", envelope: envA }],
    [{ assetId: "aud", name: "recorder.wav", envelope: envB }],
  );
  check("решение о синхронизации принято", decisions.length === 1 && decisions[0].applied === true,
    JSON.stringify(decisions[0]));
  check("решение объяснено человекочитаемо", (decisions[0]?.reason ?? "").includes("синхронизирован"), decisions[0]?.reason);
  check("сдвиг в решении совпадает с найденным", Math.abs((decisions[0]?.offsetSec ?? 0) - offsetTrue) <= 0.06,
    String(decisions[0]?.offsetSec));
}

// Несвязанные дорожки: синхронизации быть не должно.
{
  const sr = 8000;
  const camera = makeSignal(14, sr, [0.8, 2.2, 4.9, 6.1, 8.8, 11.5], 0.03, 3);
  // Музыка: ровная ритмическая сетка без общих событий с камерой.
  const music = new Float32Array(sr * 14);
  let ms = 42 >>> 0;
  for (let i = 0; i < music.length; i++) {
    ms = (Math.imul(ms, 1103515245) + 12345) >>> 0;
    music[i] = Math.sin((2 * Math.PI * 110 * i) / sr) * 0.3 + ((ms / 0xffffffff) * 2 - 1) * 0.05;
  }
  const decisions = decideAudioSync(
    [{ assetId: "v", name: "cam.mp4", envelope: envelopeFromSamples(camera, sr) }],
    [{ assetId: "m", name: "track.mp3", envelope: envelopeFromSamples(music, sr) }],
  );
  check("музыка не выдаётся за синхронный звук", decisions[0]?.applied === false,
    `confidence=${decisions[0]?.confidence}`);
  check("отказ объяснён", (decisions[0]?.reason ?? "").includes("музыка"), decisions[0]?.reason);
}

// Отрицательный сдвиг (внешний звук стартовал ПОЗЖЕ камеры).
{
  const sr = 8000;
  const events = [2.0, 3.5, 5.0, 7.5, 9.0, 11.5];
  const camera = makeSignal(15, sr, events, 0.03, 11);
  const lateOffset = -1.6;
  const external = makeSignal(15, sr, events.map((e) => e + lateOffset).filter((e) => e > 0.2), 0.04, 21);
  const est = bestOffsetByCorrelation(
    onsetEnvelope(envelopeFromSamples(camera, sr)),
    onsetEnvelope(envelopeFromSamples(external, sr)),
    0.02,
  );
  check("отрицательный сдвиг определяется", Math.abs(est.offsetSec - lateOffset) <= 0.08,
    `найдено ${est.offsetSec.toFixed(3)}, истина ${lateOffset}`);
}

// ===========================================================================
// 3. ЧИСТКА РЕЧИ
// ===========================================================================

console.log("\n=== 3. Автоматическое удаление пауз / паразитов / кашля / вдохов / дублей ===");

{
  const transcript = [
    "[0.0s - 0.4s] ну",
    "[0.5s - 0.9s] эээ",
    "[1.0s - 1.4s] короче",
    "[1.6s - 2.1s] сегодня",
    "[2.15s - 2.7s] расскажу",
    "[2.75s - 3.3s] про монтаж",
    "[3.4s - 3.9s] [кашель]",
    "[4.0s - 4.5s] это",
    "[4.55s - 5.1s] типа",
    "[5.15s - 5.8s] очень важно",
    // длинная пауза 5.8 → 12.0 (мёртвый воздух)
    "[12.0s - 12.6s] первое правило",
    "[12.7s - 13.4s] монтажа простое",
    "[13.5s - 14.0s] (вдох)",
    // случайный дубль: та же мысль дважды
    "[14.2s - 15.0s] кадр должен",
    "[15.05s - 15.9s] работать на историю",
    "[16.2s - 17.0s] кадр должен",
    "[17.05s - 17.9s] работать на историю",
    // драматическая пауза 17.9 → 19.0 (1.1с) — сохраняем
    "[19.0s - 19.9s] вот и всё",
  ].join("\n");

  const words = parseWords(transcript);
  check("транскрипт разобран пословно", words.length === 18, String(words.length));

  const res = cleanupSpeech(words, { maxPauseSec: 0.65 });

  const cutKinds = new Set(res.cuts.map((c) => c.kind));
  check("слова-паразиты вырезаны", res.stats.fillers >= 4, `fillers=${res.stats.fillers}`);
  check("кашель вырезан", res.stats.coughs >= 1, `coughs=${res.stats.coughs}`);
  check("лишний вдох вырезан", res.stats.breaths >= 1, `breaths=${res.stats.breaths}`);
  check("длинная пауза вырезана", res.stats.pauses >= 1, `pauses=${res.stats.pauses}`);
  check("случайный дубль фразы вырезан", res.stats.retakes >= 1, `retakes=${res.stats.retakes}`);
  check("зарегистрированы все виды правок", cutKinds.size >= 4, JSON.stringify([...cutKinds]));

  const covered = (t: number) => res.keep.some((k) => t >= k.start && t <= k.end);
  check("«ну/эээ/короче» не попали в монтаж", !covered(0.2) && !covered(0.7) && !covered(1.2));
  check("кашель не попал в монтаж", !covered(3.6));
  check("мёртвый воздух (7-11с) вырезан", !covered(8) && !covered(10));
  check("осмысленная речь сохранена", covered(2.4) && covered(5.4) && covered(12.3));
  check("драматическая пауза (1.1с) сохранена внутри фрагмента",
    res.keep.some((k) => k.start <= 17.9 && k.end >= 19.0),
    JSON.stringify(res.keep.map((k) => [k.start.toFixed(1), k.end.toFixed(1)])));
  check("вырезано существенное время", res.stats.removedSec > 6, `${res.stats.removedSec}с`);
  check("чистая речь осталась", res.stats.keptSec > 5, `${res.stats.keptSec}с`);
  check("каждая правка объяснена", res.cuts.every((c) => c.reason.length > 5));
  check("сводка чистки записана", res.notes.length >= 1, JSON.stringify(res.notes));

  // Дубль: остаётся ровно одна копия повторённой фразы.
  const kepText = res.keep.map((k) => k.text).join(" ");
  const occurrences = (kepText.match(/кадр должен/g) ?? []).length;
  check("повторённая фраза осталась в единственном экземпляре", occurrences === 1, `вхождений: ${occurrences}`);
}

// Заикание одного слова.
{
  const words = parseWords("[0.0s - 0.3s] я\n[0.35s - 0.65s] я\n[0.7s - 1.4s] думал\n[1.5s - 2.4s] что успею");
  const res = cleanupSpeech(words);
  const text = res.keep.map((k) => k.text).join(" ");
  // \b в JS не работает с кириллицей — считаем по токенам.
  const yaCount = text.split(/\s+/).filter((w) => w === "я").length;
  check("заикание («я я думал») схлопнуто", yaCount === 1, text);
}

// Похожесть фраз.
check("похожие фразы опознаются", phraseSimilarity("кадр должен работать", "кадр должен работать") === 1);
check("разные фразы не считаются дублем", phraseSimilarity("кадр должен работать", "музыка задаёт ритм") < 0.3);

// Пустой ввод не ломает конвейер.
{
  const res = cleanupSpeech([]);
  check("пустой транскрипт обрабатывается без падения", res.keep.length === 0 && res.cuts.length === 0);
}

// ===========================================================================
// 4. ПОСТАНОВКА СЦЕНЫ (цель / темп / музыка / цвет)
// ===========================================================================

console.log("\n=== 4. Режиссёрская постановка сцены ===");

check("цель хука сформулирована", sceneGoal("hook", "Cold Open", false).length > 8, sceneGoal("hook", "Cold Open", false));
check("цель кульминации отличается от цели хука",
  sceneGoal("climax", "Payoff", true) !== sceneGoal("hook", "Cold Open", true));
check("Pattern Interrupt имеет собственную цель",
  sceneGoal("buildup", "Pattern Interrupt", true).includes("монотон"),
  sceneGoal("buildup", "Pattern Interrupt", true));

check("короткая сцена → быстрый темп", ["frantic", "fast"].includes(scenePace(0.8, "buildup", "fast")), scenePace(0.8, "buildup", "fast"));
check("сверхкороткая сцена → рваный темп", scenePace(0.5, "buildup", "medium") === "frantic", scenePace(0.5, "buildup", "medium"));
check("длинная сцена в кино → медленный темп", scenePace(8, "buildup", "slow") === "slow", scenePace(8, "buildup", "slow"));
check("темп зависит от жанра (3с: fast≠slow)",
  scenePace(3, "buildup", "fast") !== scenePace(3, "buildup", "slow"),
  `${scenePace(3, "buildup", "fast")} / ${scenePace(3, "buildup", "slow")}`);

{
  const climax = sceneColorMood("climax", "dramatic", "medium");
  const outro = sceneColorMood("outro", "calm", "medium");
  const buildup = sceneColorMood("buildup", "neutral", "medium");
  check("кульминация теплее выдоха", climax.temperature > outro.temperature,
    `${climax.temperature} vs ${outro.temperature}`);
  check("нарастание холоднее кульминации", buildup.temperature < climax.temperature,
    `${buildup.temperature} vs ${climax.temperature}`);
  check("кульминация насыщеннее выдоха", climax.saturation > outro.saturation);
  check("у цветового решения есть мотивировка", climax.reason.length > 15, climax.reason);
  check("цветовое настроение подписано", climax.mood.length > 3, climax.mood);
}

{
  const narrBuild = sceneMusic("buildup", true, 0.15);
  const narrClimax = sceneMusic("climax", true, 0.15);
  const pause = sceneMusic("buildup", true, 0.15, { isPause: true });
  const visClimax = sceneMusic("climax", false, 0.6);
  check("в нарративе музыка уходит под речь", narrBuild.role === "duck" && narrBuild.ducking === true);
  check("на кульминации нарратива музыка приподнята", narrClimax.level > narrBuild.level,
    `${narrClimax.level} vs ${narrBuild.level}`);
  check("в драматической паузе музыка выходит вперёд", pause.level > narrBuild.level && pause.ducking === false,
    `${pause.level}`);
  check("в визуальном ролике музыка ведёт", visClimax.role === "lead" && visClimax.accent === true);
  check("у музыкального решения есть мотивировка", visClimax.reason.length > 15, visClimax.reason);
}

check("визуальная тема «море» распознана", detectVisualTopic("поехали на море купаться")?.topic === "море");
check("визуальная тема «деньги» распознана", detectVisualTopic("слили весь бюджет")?.topic === "деньги");
check("нейтральная реплика не даёт ложной темы", detectVisualTopic("это было довольно неожиданно") === null);
// Ложные срабатывания по подстроке — самый вредный класс ошибок B-Roll:
// перебивка «спортзал» под рассказ о воронке продаж хуже её отсутствия.
{
  const falsePositives: Array<[string, string | null]> = [
    ["оказалось клиенты уходили с сайта", "экран"], // «ока-ЗАЛ-ось» ≠ спорт
    ["подписывайтесь если было полезно", null],      // «по-ЛЕЗ-но» ≠ лес
    ["показали результат", null],                    // «пока-ЗАЛ-и» ≠ спорт
    ["мы поехали в горы", "природа"],
    ["в лесу было тихо", "природа"],
    ["наш дом большой", "дом"],
    ["мы пошли в спортзал на тренировку", "спорт"],
  ];
  const wrong = falsePositives.filter(([t, exp]) => (detectVisualTopic(t)?.topic ?? null) !== exp);
  check("нет ложных срабатываний B-Roll по подстроке", wrong.length === 0,
    JSON.stringify(wrong.map(([t, exp]) => `${t}: ${detectVisualTopic(t)?.topic ?? null} ≠ ${exp}`)));
}
check("тема выбирается по плотности упоминаний",
  detectVisualTopic("клиенты и продажи это бизнес, а деньги вторичны")?.topic === "бизнес",
  detectVisualTopic("клиенты и продажи это бизнес, а деньги вторичны")?.topic);

// ===========================================================================
// 5. AI DIRECTOR ↔ АВТОМОНТАЖ: сквозная интеграция
// ===========================================================================

console.log("\n=== 5. AI Director передаёт полный план монтажному движку ===");

const transcriptFull = [
  "[0.0s - 0.4s] ну",
  "[0.5s - 0.9s] эээ",
  "[1.2s - 1.6s] короче",
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

const narrativeRequest: AIAnalysisRequest = {
  userPrompt: "",
  templateHint: "tiktok",
  beats: beatsGrid(0.5, 70),
  musicInPointSec: 0,
  audioSync: [
    {
      audioAssetId: "MIC",
      audioName: "recorder.wav",
      videoAssetId: "P",
      videoName: "podcast.mp4",
      offsetSec: 2.35,
      confidence: 0.82,
      applied: true,
      reason: "Звук «recorder.wav» синхронизирован с «podcast.mp4»: сдвиг +2.35с (уверенность 82%).",
    },
  ],
  assets: [
    asset("P", "podcast.mp4", "video", 30, {
      transcript: transcriptFull,
      segments: segSeries(0, 30, 2, { hasFaces: true, faceX: 0.5, faceY: 0.45, faceSize: 0.06, qualityScore: 9, aestheticScore: 7, brightness: 150 }),
      audioEnergy: [
        { startTime: 0, endTime: 13.4, energyLevel: "medium" },
        { startTime: 13.4, endTime: 16.5, energyLevel: "drop" },
        { startTime: 16.5, endTime: 30, energyLevel: "medium" },
      ] as AudioEnergySegment[],
    }),
    asset("S", "море-01.mp4", "video", 8, {
      segments: segSeries(0, 8, 2, { qualityScore: 8, aestheticScore: 8, motionLevel: "medium", brightness: 160 }),
    }),
    asset("O", "office.mp4", "video", 8, {
      segments: segSeries(0, 8, 2, { qualityScore: 7, aestheticScore: 6, brightness: 140 }),
    }),
  ],
};

const plan = await AIDirector.direct(narrativeRequest, { llm: false });

// --- Каждая сцена полностью поставлена ---
check("сцены построены", plan.scenes.length >= 4, String(plan.scenes.length));
check("у КАЖДОЙ сцены есть ЦЕЛЬ", plan.scenes.every((s) => (s.goal || "").length > 5),
  JSON.stringify(plan.scenes.map((s) => s.goal)));
check("у КАЖДОЙ сцены есть ЭМОЦИЯ", plan.scenes.every((s) => !!s.emotion));
check("у КАЖДОЙ сцены есть ДЛИТЕЛЬНОСТЬ > 0", plan.scenes.every((s) => s.duration > 0));
check("у КАЖДОЙ сцены есть ТЕМП", plan.scenes.every((s) => ["slow", "medium", "fast", "frantic"].includes(s.pace)),
  JSON.stringify(plan.scenes.map((s) => s.pace)));
check("у КАЖДОЙ сцены есть ТИП ПЕРЕХОДА", plan.scenes.every((s) => !!s.transitionIn?.type));
check("у КАЖДОЙ сцены есть блок B-ROLL (рекомендации/размещения)",
  plan.scenes.every((s) => Array.isArray(s.brollRecommendations) && Array.isArray(s.bRolls)));
check("у КАЖДОЙ сцены есть МУЗЫКАЛЬНАЯ ДИРЕКТИВА",
  plan.scenes.every((s) => !!s.music && typeof s.music.level === "number" && s.music.level >= 0 && s.music.level <= 1),
  JSON.stringify(plan.scenes.map((s) => s.music?.level)));
check("у КАЖДОЙ сцены есть ЦВЕТОВОЕ НАСТРОЕНИЕ",
  plan.scenes.every((s) => !!s.colorMood && typeof s.colorMood.temperature === "number"));
check("каждое цветовое решение объяснено", plan.scenes.every((s) => (s.colorMood.reason || "").length > 10));
check("каждое музыкальное решение объяснено", plan.scenes.every((s) => (s.music.reason || "").length > 10));

// --- Offline edit report ---
check("отчёт чернового монтажа сформирован", !!plan.offlineEdit, JSON.stringify(!!plan.offlineEdit));
check("отчёт содержит чистку речи", (plan.offlineEdit?.speechCleanup?.length ?? 0) >= 1,
  JSON.stringify(plan.offlineEdit?.speechCleanup?.map((s) => s.removedSec)));
check("чистка удалила паразиты из отчёта",
  (plan.offlineEdit?.speechCleanup?.[0]?.fillers ?? 0) >= 2,
  String(plan.offlineEdit?.speechCleanup?.[0]?.fillers));
check("отчёт включает синхронизацию звука", (plan.offlineEdit?.audioSync?.pairs.length ?? 0) === 1);
check("синхронизация помечена применённой", plan.offlineEdit?.audioSync?.pairs[0]?.applied === true);
check("сводка отчёта человекочитаема", (plan.offlineEdit?.summary.length ?? 0) >= 2,
  JSON.stringify(plan.offlineEdit?.summary));

// --- Драматургия: это история, а не нарезка ---
check("есть хук", plan.scenes.some((s) => s.phase === "hook"));
check("ровно одна кульминация", plan.scenes.filter((s) => s.phase === "climax").length === 1);
check("фильм заканчивается выдохом или кульминацией",
  ["outro", "climax"].includes(plan.scenes[plan.scenes.length - 1].phase),
  plan.scenes[plan.scenes.length - 1].phase);
check("драматургическая арка без дыр", (() => {
  const ds = plan.dramaturgy;
  for (let i = 1; i < ds.length; i++) if (Math.abs(ds[i].start - ds[i - 1].end) > 0.01) return false;
  return ds.length > 0;
})());
check("кривая темпа имеет пик на кульминации", plan.pacingCurve.some((k) => k.intensity === 1));

// --- Мусор не попал в монтаж ---
check("филлеры «ну/эээ/короче» не попали ни в одну сцену",
  plan.scenes.every((s) => s.phase === "teaser" || s.source.assetId !== "P" || s.source.start >= 2.5),
  plan.scenes.map((s) => `${s.phase}@${s.source.start.toFixed(1)}`).join(" "));

// --- Передача в монтажный движок ---
{
  const decision = planToDecision(plan);
  const mains = decision.clips.filter((c) => c.trackType !== "b-roll");
  check("adapter: клипов столько же, сколько сцен", mains.length === plan.scenes.length,
    `${mains.length}/${plan.scenes.length}`);
  check("adapter: постановка сцены доехала до движка",
    mains.every((m) => !!m.sceneDirection && !!m.sceneDirection.colorMood && !!m.sceneDirection.music),
    JSON.stringify(mains.map((m) => !!m.sceneDirection)));
  check("adapter: цель сцены доехала", mains.every((m) => (m.sceneDirection?.goal || "").length > 5));
  check("adapter: темп сцены доехал", mains.every((m) => !!m.sceneDirection?.pace));
  check("adapter: фаза сцены доехала", mains.every((m) => !!m.sceneDirection?.phase));
  check("adapter: у кульминации самая тёплая палитра", (() => {
    const climax = mains.find((m) => m.sceneDirection?.phase === "climax");
    if (!climax) return false;
    const others = mains.filter((m) => m.sceneDirection?.phase === "buildup");
    if (others.length === 0) return true;
    return others.every((o) => (climax.sceneDirection!.colorMood.temperature) >= (o.sceneDirection!.colorMood.temperature));
  })());
  check("adapter: окна валидны", decision.clips.every((c) => (c.endTime ?? 0) > (c.startTime ?? -1)));
}

// --- Детерминизм всего конвейера ---
{
  const again = await AIDirector.direct(narrativeRequest, { llm: false });
  const strip = (p: typeof plan) => JSON.stringify({ ...p, createdAt: 0 });
  check("весь конвейер offline edit детерминирован", strip(again) === strip(plan));
}

// ===========================================================================
// 6. ВИЗУАЛЬНЫЙ РОЛИК: дубли, постановка, драматургия
// ===========================================================================

console.log("\n=== 6. Визуальный монтаж: отбор дублей внутри конвейера ===");

{
  // Три близких дубля одного пейзажа (один смазан, один трясётся) + два разных кадра.
  const visualRequest: AIAnalysisRequest = {
    userPrompt: "сделай ролик 20 сек",
    templateHint: "travel",
    beats: beatsGrid(0.5, 40),
    assets: [
      asset("G1", "sunset_01.mp4", "video", 8, {
        segments: segSeries(0, 8, 1, { qualityScore: 9, aestheticScore: 9, brightness: 155, contrast: 135, colorfulness: 42, motionLevel: "low" }),
      }),
      asset("G2", "sunset_02.mp4", "video", 8, {
        segments: segSeries(0, 8, 1, { qualityScore: 5, aestheticScore: 4, isBlurry: true, brightness: 153, contrast: 132, colorfulness: 41, motionLevel: "low" }),
      }),
      asset("G3", "sunset_03.mp4", "video", 8, {
        segments: segSeries(0, 8, 1, { qualityScore: 5, aestheticScore: 4, motionLevel: "shake", brightness: 154, contrast: 133, colorfulness: 40 }),
      }),
      asset("C1", "crowd.mp4", "video", 10, {
        segments: segSeries(0, 10, 1, { hasFaces: true, faceX: 0.33, faceY: 0.4, faceSize: 0.08, qualityScore: 9, aestheticScore: 8, motionLevel: "medium", hasAction: true, brightness: 140, colorfulness: 25 }),
      }),
      asset("A1", "action.mp4", "video", 10, {
        segments: segSeries(0, 10, 1, { qualityScore: 9, aestheticScore: 9, motionLevel: "high", hasAction: true, brightness: 165, colorfulness: 48 }),
      }),
    ],
  };

  const vplan = await AIDirector.direct(visualRequest, { llm: false });
  check("визуальный план построен", vplan.kind === "visual" && vplan.scenes.length >= 3, String(vplan.scenes.length));
  check("отбор дублей отработал", (vplan.offlineEdit?.takes?.groups ?? 0) >= 1,
    JSON.stringify(vplan.offlineEdit?.takes));
  check("смазанный дубль не попал в монтаж", !vplan.scenes.some((s) => s.source.assetId === "G2"),
    vplan.scenes.map((s) => s.source.assetId).join(","));
  check("трясущийся дубль не попал в монтаж", !vplan.scenes.some((s) => s.source.assetId === "G3"),
    vplan.scenes.map((s) => s.source.assetId).join(","));
  check("лучший дубль пейзажа взят в монтаж", vplan.scenes.some((s) => s.source.assetId === "G1"));
  check("решение по дублям объяснено",
    (vplan.offlineEdit?.takes?.decisions ?? []).every((d) => d.losers.every((l) => l.reason.length > 10)));
  check("оценка выбранного дубля записана в сцену",
    vplan.scenes.some((s) => typeof s.takeScore === "number" && s.takeScore > 0),
    JSON.stringify(vplan.scenes.map((s) => s.takeScore)));
  check("визуальные сцены полностью поставлены",
    vplan.scenes.every((s) => !!s.goal && !!s.pace && !!s.music && !!s.colorMood && !!s.transitionIn));
  check("визуальный ролик: музыка ведёт", vplan.scenes.every((s) => s.music.role !== "duck"),
    JSON.stringify(vplan.scenes.map((s) => s.music.role)));
  check("кульминация визуального ролика теплее нарастания", (() => {
    const c = vplan.scenes.find((s) => s.phase === "climax");
    const b = vplan.scenes.filter((s) => s.phase === "buildup");
    if (!c || b.length === 0) return true;
    return b.every((x) => c.colorMood.temperature >= x.colorMood.temperature);
  })());
  check("сводка чернового монтажа объясняет отбор",
    (vplan.offlineEdit?.summary ?? []).some((s) => s.includes("дубл")),
    JSON.stringify(vplan.offlineEdit?.summary));
}

// ---------------------------------------------------------------------------
// Итог
// ---------------------------------------------------------------------------

if (failures === 0) console.log("\n✅ OFFLINE EDIT: ВСЕ ПРОВЕРКИ ПРОШЛИ");
else {
  console.error(`\n❌ Провалено: ${failures}`);
  process.exit(1);
}
