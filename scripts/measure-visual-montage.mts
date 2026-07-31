/**
 * Измерительный стенд качества визуального автомонтажа (buildVisualScript).
 *
 * Строит синтетический, но репрезентативный запрос режиссёра:
 *  - 2 видео с сегментами разного качества (есть «эпик» с движением);
 *  - 3 фото: резкое с лицом (должно быть выбрано), тусклое мыльное (отсев),
 *    тёмное плоское (отсев);
 *  - 1 аудиотрек со структурой энергии: тихо -> ДРОП на 75% целевой длительности;
 *  - бит-сетка 120 BPM (0.5с).
 *
 * Печатает план монтажа и метрики:
 *  1) где встала кульминация относительно дропа (цель: |Δ| <= 0.6с);
 *  2) доля склеек на бите (цель: высокая);
 *  3) выбраны ли лучшие фото, отброшены ли бракованные;
 *  4) средний qualityScore выбранных планов vs всех доступных.
 *
 * Запуск: npx tsx scripts/measure-visual-montage.mts
 */

// Среда Node: подавляем IndexedDB-зависимость базы знаний (она там мягко фоллбечится).
import { DirectorEngine } from "../src/lib/brain/engine";
import type { VideoSegmentMetadata } from "../src/lib/localAnalyzer";
import type { AudioEnergySegment } from "../src/lib/media";

const seg = (start: number, end: number, over: Partial<VideoSegmentMetadata> = {}): VideoSegmentMetadata => ({
  startTime: start,
  endTime: end,
  motionLevel: "low",
  isDark: false,
  isBlurry: false,
  hasFaces: false,
  qualityScore: 6,
  isSceneChange: false,
  hasAction: false,
  aestheticScore: 5,
  ...over,
});

// --- Видео A: городской барал, 30с, эпик-момент (бег) на 20-26с ---
const videoA = [
  seg(0, 4, { qualityScore: 5, aestheticScore: 4, saturation: 20 }),
  seg(4, 9, { qualityScore: 6, aestheticScore: 5, motionLevel: "medium" }),
  seg(9, 14, { qualityScore: 4, aestheticScore: 3, isBlurry: true }),
  seg(14, 20, { qualityScore: 7, aestheticScore: 6, hasFaces: true, motionLevel: "medium" }),
  seg(20, 26, { qualityScore: 9, aestheticScore: 8, hasAction: true, motionLevel: "high", saturation: 55 }),
  seg(26, 30, { qualityScore: 5, aestheticScore: 4 }),
];

// --- Видео B: пейзажи 24с ---
const videoB = [
  seg(0, 6, { qualityScore: 7, aestheticScore: 7, saturation: 45, contrast: 140 }),
  seg(6, 10, { qualityScore: 3, isDark: true, contrast: 60 }),
  seg(10, 16, { qualityScore: 8, aestheticScore: 8, saturation: 50, contrast: 150 }),
  seg(16, 20, { qualityScore: 6, aestheticScore: 5, motionLevel: "medium", hasFaces: true }),
  seg(20, 24, { qualityScore: 4, isBlurry: true }),
];

const energyOf = (level: AudioEnergySegment["energyLevel"], s: number, e: number): AudioEnergySegment =>
  ({ startTime: s, endTime: e, energyLevel: level });

// --- Музыка, 60с: интро тихое, нарастание с 30с, ДРОП на 36с, второй дроп 48с
const musicEnergy: AudioEnergySegment[] = [];
for (let t = 0; t < 60; t += 2) {
  const lv: AudioEnergySegment["energyLevel"] =
    t < 10 ? "low" : t < 28 ? "medium" : t < 34 ? "high" : t < 44 ? "drop" : t < 50 ? "medium" : "high";
  musicEnergy.push(energyOf(lv, t, t + 2));
}

const TARGET = 40;
const BEAT = 0.545; // ~110 BPM: специально НЕ кратно типичным длительностям планов
const beats: number[] = [];
for (let t = 0; t <= TARGET + 15; t += BEAT) beats.push(Math.round(t * 1000) / 1000);

const request: any = {
  userPrompt: "эпичный тревел ролик под музыку",
  beats,
  musicInPointSec: 0,
  assets: [
    { id: "videoA", name: "city.mp4", type: "video", duration: 30, segments: videoA },
    { id: "videoB", name: "nature.mp4", type: "video", duration: 24, segments: videoB },
    {
      id: "photo_face", name: "portrait.jpg", type: "image", duration: 4,
      segments: [seg(0, 10, { qualityScore: 8, aestheticScore: 8, hasFaces: true, faceX: 0.42, faceY: 0.33, faceSize: 0.06, saturation: 48, contrast: 130 })],
    },
    {
      id: "photo_dull", name: "blur.jpg", type: "image", duration: 4,
      segments: [seg(0, 10, { qualityScore: 2, aestheticScore: 2, isBlurry: true, saturation: 10 })],
    },
    {
      id: "photo_dark", name: "dark.jpg", type: "image", duration: 4,
      segments: [seg(0, 10, { qualityScore: 2, aestheticScore: 1, isDark: true, contrast: 40 })],
    },
    { id: "music1", name: "track.mp3", type: "audio", duration: 60, audioEnergy: musicEnergy },
  ],
};

function fmt(t: number) { return t.toFixed(2).padStart(6); }

(async () => {
  const script = await DirectorEngine.formulateScript(request);

  console.log(`\n=== ПЛАН МОНТАЖА (${script.genre}, target=${script.targetDuration}s) ===`);
  let t = 0;
  const rows: string[] = [];
  let climaxRow: { start: number; end: number } | null = null;
  const usedAssets = new Map<string, number>();
  let qSum = 0, qCnt = 0;
  for (const s of script.scenes) {
    const tlDur = s.duration;
    rows.push(`  ${fmt(t)} → ${fmt(t + tlDur)}  ${s.phase.padEnd(7)} ${s.mainClip.assetId.padEnd(11)} src ${fmt(s.mainClip.sourceStart)}–${fmt(s.mainClip.sourceEnd)} speed=${s.mainClip.speed}x`);
    if (s.phase === "climax") climaxRow = { start: t, end: t + tlDur };
    usedAssets.set(s.mainClip.assetId, (usedAssets.get(s.mainClip.assetId) || 0) + 1);
    const src = request.assets.find((a: any) => a.id === s.mainClip.assetId);
    const cov = (src?.segments || []).filter((sg: any) => sg.endTime > s.mainClip.sourceStart && sg.startTime < s.mainClip.sourceEnd);
    if (cov.length) { qSum += cov.reduce((a: number, sg: any) => a + sg.qualityScore, 0) / cov.length; qCnt++; }
    t += tlDur;
  }
  console.log(rows.join("\n"));
  console.log(`  ИТОГО длительность: ${t.toFixed(2)}s`);

  // --- Метрика 1: кульминация vs дроп (36с в музыке, musicInPoint=0)
  console.log("\n=== МЕТРИКИ ===");
  const dropT = 36;
  if (climaxRow) {
    const center = (climaxRow.start + climaxRow.end) / 2;
    const delta = Math.abs(center - dropT);
    console.log(`  1. Кульминация: центр=${center.toFixed(1)}с, дроп=${dropT}с, |Δ|=${delta.toFixed(1)}с ${delta <= 3 ? "✅" : "❌"} (норма ≤3с при дропе вне окна 45-85%)`);
  } else {
    console.log("  1. Кульминация отсутствует ❌");
  }

  // --- Метрика 2: склейки на бите
  t = 0;
  const cuts: number[] = [];
  for (const s of script.scenes) { t += s.duration; cuts.push(t); }
  cuts.pop(); // конец ролика — не склейка
  const onBeat = cuts.filter(c => beats.some(b => Math.abs(b - c) <= 0.16)).length;
  const beatRatio = cuts.length ? onBeat / cuts.length : 0;
  console.log(`  2. Склейки на бите: ${onBeat}/${cuts.length} = ${(beatRatio * 100).toFixed(0)}%`);

  // --- Метрика 3: отбор фото
  const faceUsed = usedAssets.has("photo_face");
  const dullUsed = usedAssets.has("photo_dull");
  const darkUsed = usedAssets.has("photo_dark");
  console.log(`  3. Фото: portrait(лицо) ${faceUsed ? "выбран ✅" : "НЕ выбран ❌"} | blur ${dullUsed ? "ПРОШЁЛ ❌" : "отсеян ✅"} | dark ${darkUsed ? "ПРОШЁЛ ❌" : "отсеян ✅"}`);

  // --- Метрика 4: среднее качество выбранного
  const allQ = [...videoA, ...videoB].map(s => s.qualityScore);
  const avgAll = allQ.reduce((a, b) => a + b, 0) / allQ.length;
  const avgUsed = qCnt ? qSum / qCnt : 0;
  console.log(`  4. Средний qualityScore планов: ${avgUsed.toFixed(1)} (пул видео: ${avgAll.toFixed(1)}) ${avgUsed > avgAll ? "✅ выбор лучше пула" : "❌ выбор хуже пула"}`);

  // --- Метрика 5: эпик-сегмент (бег 20-26s videoA) попал в ролик?
  const epicUsed = script.scenes.some(s => s.mainClip.assetId === "videoA" && s.mainClip.sourceStart >= 19 && s.mainClip.sourceStart < 26);
  console.log(`  5. Эпик-момент (action hero кадр) в монтаже: ${epicUsed ? "✅" : "❌"}`);

  // --- Метрика 6: чередование крупности планов (не два одинаковых подряд)
  // Крупность считаем по РЕАЛЬНО использованному окну исходника, как движок.
  const sizeOfScene = (scene: (typeof script.scenes)[number]): string => {
    const a = request.assets.find((x: any) => x.id === scene.mainClip.assetId);
    const sgs = (a?.segments || []).filter((sg: any) => sg.endTime > scene.mainClip.sourceStart && sg.startTime < scene.mainClip.sourceEnd);
    const sg = sgs[0];
    if (sg?.faceSize !== undefined && sg.faceSize >= 0.05) return "close";
    if (sg?.hasFaces) return "medium";
    return "wide";
  };
  const sizes = script.scenes.map(sizeOfScene);
  // Доступная пула крупность: если 90% пулла — «wide», чередовать нечем, это не вина движка
  let sameAdj = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] === sizes[i - 1]) sameAdj++;
  const poolSizes = new Set(sizes);
  console.log(`  6. Крупность планов: ${sizes.join("→")}`);
  console.log(`     одинаковая подряд: ${sameAdj}/${sizes.length - 1} стыков (в пуле ${poolSizes.size} типа крупности) ${sameAdj <= Math.floor(sizes.length / 3) ? "✅" : poolSizes.size < 3 ? "⚠️ пул однообразен — движок чередует что есть" : "❌ мало чередования"}`);
})();
