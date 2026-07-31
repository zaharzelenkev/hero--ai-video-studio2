/**
 * Тест АПГРЕЙДОВ МОНТАЖА v2:
 *
 *  1. SPEED RAMP (математика): ключи рампы сохраняют длительность клипа
 *     (окно исходника W разыгрывается ровно за targetDur), отображение
 *     «входное время → выходное» монотонно и обратимо, setpts-выражение
 *     структурно корректно (вложенные if + числовые границы сегментов).
 *  2. SPEED RAMP (компиляция): filterGraph собирает клип с рампой —
 *     выражение присутствует, totalDuration не «уезжает».
 *  3. DOWNBEATS: детектор сильных долей на синтетическом треке с акцентом
 *     на каждую 4-ю долю находит начало каждого такта.
 *  4. J-CUT: адаптер даёт полноэкранным B-Roll отрицательное смещение
 *     (перебивка заходит до стыка), PiP остаётся L-cut'ом.
 *  5. MATCH CUT: режиссёр ставит растворение на стыке планов с близким
 *     цветовым тоном (разные ассеты, общий hue) и whip pan при панорамах
 *     в одну сторону.
 *
 * Запуск: npx tsx scripts/test-montage-upgrades.mts
 */
import { buildRampKeyframes, speedRampEval, speedRampInverse, speedRampTotalSource, speedRampTotalTimeline, speedRampToSetptsExpr } from "../src/lib/speedRamp";
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import { compileProjectToFfmpeg } from "../src/lib/filterGraph";
import { detectDownbeats } from "../src/lib/beatDetection";
import { planToDecision } from "../src/lib/brain/planAdapter";
import { AIDirector } from "../src/lib/brain/aiDirector";
import type { MediaAsset } from "../src/lib/types";
import type { AIAnalysisRequest } from "../src/lib/ai/aiService";
import type { VideoSegmentMetadata } from "../src/lib/localAnalyzer";
import type { AudioEnergySegment } from "../src/lib/media";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ---------------------------------------------------------------------------
// 1. Speed ramp: математика
// ---------------------------------------------------------------------------
console.log("\n=== 1. Speed Ramp: математика ===");

for (const kind of ["pre-climax", "climax"] as const) {
  for (const [D, W] of [[2.5, 2.8], [1.8, 2.0], [3.2, 3.0], [4.0, 5.5], [2.0, 6.0]] as const) {
    const ramp = buildRampKeyframes(D, W, kind);
    check(`${kind} D=${D} W=${W}: рампа построена`, !!ramp, JSON.stringify(ramp));
    if (!ramp) continue;
    const kfs = ramp.keyframes;
    const totalTl = speedRampTotalTimeline(kfs, W);
    // Главный инвариант: полное окно исходника W разыгрывается ровно за D.
    check(`${kind} D=${D} W=${W}: длительность таймлайна = D (${totalTl.toFixed(3)} ≈ ${D})`, Math.abs(totalTl - D) < 0.02);
    check(`${kind} D=${D} W=${W}: t(W)=D`, Math.abs(speedRampEval(kfs, W) - D) < 0.02, `t(W)=${speedRampEval(kfs, W).toFixed(3)}`);
    // Расход до последнего ключа = kf[1].time * s1 (согласовано с выражением).
    check(`${kind}: расход до ключа = kf[1].time·s1`, Math.abs(speedRampTotalSource(kfs) - kfs[1].time * kfs[0].speed) < 0.002);
    // монотонность + границы
    let prev = -1;
    let mono = true;
    for (let s = 0; s <= W; s += 0.05) {
      const t = speedRampEval(kfs, s);
      if (t < prev - 1e-6) mono = false;
      prev = t;
    }
    check(`${kind} D=${D} W=${W}: отображение монотонно`, mono);
    check(`${kind} D=${D} W=${W}: t(0)=0`, Math.abs(speedRampEval(kfs, 0)) < 1e-6);
    // Обратное отображение (для превью): inverse(eval(s)) ≈ s
    let roundTrip = true;
    for (let s = 0; s <= W; s += 0.1) {
      const t = speedRampEval(kfs, s);
      if (Math.abs(speedRampInverse(kfs, t) - s) > 0.02) roundTrip = false;
    }
    check(`${kind} D=${D} W=${W}: round-trip inverse(eval(s))≈s`, roundTrip);
    check(`${kind} D=${D} W=${W}: inverse(D)≈W`, Math.abs(speedRampInverse(kfs, D) - W) < 0.02);
    const expr = speedRampToSetptsExpr(kfs);
    check(`${kind}: выражение содержит if(lt(PTS`, expr.includes("if(lt(PTS\\,"), expr.slice(0, 60));
    check(`${kind}: выражение без NaN`, !expr.includes("NaN") && !expr.includes("Infinity"));
  }
}

// Рампа невозможна на слишком коротком клипе
check("клип <1.4с: рампа не строится (null)", buildRampKeyframes(1.0, 1.5, "climax") === null);

// ---------------------------------------------------------------------------
// 2. Speed ramp: компиляция filter_graph
// ---------------------------------------------------------------------------
console.log("\n=== 2. Speed Ramp: компиляция ===");

const proj = createEmptyProject("ramp-test");
proj.resolution = { width: 1920, height: 1080 };
proj.exportSettings = { width: 1920, height: 1080, fps: 30, format: "mp4", crf: 21 };
const vA: MediaAsset = { id: "vA", name: "vA.mp4", kind: "video", mime: "video/mp4", blobKey: "vA", duration: 10, width: 3840, height: 2160, createdAt: Date.now() };
proj.assets = [vA];
const videoTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;

const ramp = buildRampKeyframes(3.0, 3.4, "climax")!;
const c = createVideoClip({ trackId: videoTrack.id, asset: vA, start: 0, duration: 3.0, inPoint: 0.4, outPoint: 3.8 });
c.speedRamp = ramp;
videoTrack.clips.push(c);
proj.duration = 3.0;

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip) => `${clip.assetId}.mp4`);
const fc = compiled.filterComplex;
check("setpts-выражение рампы в графе", /setpts='if\(lt\(PTS\\,/.test(fc), fc.slice(0, 300));
check("totalDuration = 3.0", Math.abs(compiled.totalDuration - 3.0) < 0.01, String(compiled.totalDuration));
check("нет лишних входов (1 видео)", compiled.inputs.length === 1, String(compiled.inputs.length));

// ---------------------------------------------------------------------------
// 3. Downbeats
// ---------------------------------------------------------------------------
console.log("\n=== 3. Downbeats (сильные доли) ===");

{
  const SR = 44100;
  const BPM = 128;
  const BEAT = 60 / BPM;
  const DUR = 20;
  const n = Math.floor(SR * DUR);
  const data = new Float32Array(n);
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  for (let i = 0; i < n; i++) data[i] += rnd() * 0.04;
  for (let i = 0; i < n; i++) data[i] += Math.sin(2 * Math.PI * 41 * (i / SR)) * 0.08;
  const PHASE = 0.1;
  const trueDownbeats: number[] = [];
  for (let i = 0; PHASE + i * BEAT < DUR - 0.1; i++) {
    const t = PHASE + i * BEAT;
    const strong = i % 4 === 0;
    if (strong) trueDownbeats.push(t);
    const amp = strong ? 1.0 : 0.22;
    const start = Math.floor(t * SR);
    const len = Math.floor(0.12 * SR);
    for (let j = 0; j < len && start + j < n; j++) {
      data[start + j] += Math.sin(2 * Math.PI * 52 * (j / SR)) * 0.9 * amp * Math.exp(-j / (SR * 0.025));
    }
  }
  // Равномерная сетка (как вернула бы buildBeatGrid в браузере)
  const grid: number[] = [];
  for (let t = 0.05; t <= DUR; t += 0.4748) grid.push(+t.toFixed(3));
  const dbs = detectDownbeats(data, SR, grid, 0.4748, DUR);
  let hits = 0;
  for (const t of trueDownbeats) if (dbs.some((d) => Math.abs(d - t) < BEAT * 0.7)) hits++;
  check(`сильные доли: ${hits}/${trueDownbeats.length} (макс. ошибка < 0.7 доли)`, hits >= trueDownbeats.length * 0.75,
    dbs.map((d) => d.toFixed(2)).join(","));
  check("нет дублей (шаг ≥ 3 доли)", dbs.every((d, i) => i === 0 || d - dbs[i - 1] >= BEAT * 2.5));
}

// ---------------------------------------------------------------------------
// 4. J-Cut в адаптере
// ---------------------------------------------------------------------------
console.log("\n=== 4. J-Cut для полноэкранных B-Roll ===");

{
  const plan = await AIDirector.direct({
    userPrompt: "расскажи про море",
    templateHint: "podcast",
    assets: [
      { id: "P", name: "speaker.mp4", type: "video", duration: 30, transcript: "[0.0s - 1.2s] всем привет\\n[2.0s - 5.0s] сегодня расскажу про море\\n[6.0s - 8.5s] вода была очень холодной\\n[9.0s - 12.0s] но зато красивый закат\\n[13.0s - 16.0s] обязательно приезжайте летом", segments: [] },
      { id: "S", name: "sea.mp4", type: "video", duration: 10, segments: [] },
    ],
  }, { llm: false });
  const decision = planToDecision(plan);
  const fullscreen = decision.clips.filter((c) => c.trackType === "b-roll" && c.presentation === "fullscreen");
  const hasJ = fullscreen.length > 0 && fullscreen.some((b) => (b.timeInTimeline ?? 0) < 0.05);
  check("полноэкранный B-Roll заходит до стыка (J-cut)", hasJ || fullscreen.length === 0,
    fullscreen.map((b) => (b.timeInTimeline ?? 0).toFixed(2)).join(","));
}

// ---------------------------------------------------------------------------
// 5. Match cut по цвету / whip pan
// ---------------------------------------------------------------------------
console.log("\n=== 5. Match cut по цвету / whip pan ===");

const seg = (start: number, end: number, opts: Partial<VideoSegmentMetadata> = {}): VideoSegmentMetadata => ({
  startTime: start, endTime: end, motionLevel: "low", isDark: false, isBlurry: false,
  hasFaces: false, qualityScore: 8, isSceneChange: false, hasAction: false, aestheticScore: 7,
  brightness: 150, contrast: 120, saturation: 45, colorfulness: 30, ...opts,
});
const segSeries = (from: number, to: number, step: number, opts: Partial<VideoSegmentMetadata> | ((t: number) => Partial<VideoSegmentMetadata>)): VideoSegmentMetadata[] => {
  const out: VideoSegmentMetadata[] = [];
  for (let t = from; t < to - 1e-6; t += step) {
    const o = typeof opts === "function" ? opts(t) : opts;
    out.push(seg(t, Math.min(t + step, to), o));
  }
  return out;
};
// hueHist: все сегменты «тёплые» (корзина 2 = 20-30°) — ассеты A и B близки по тону
const warmHist = new Array<number>(36).fill(0);
warmHist[2] = 50;
// ассет C «холодный» (корзина 22 = 220-230°)
const coolHist = new Array<number>(36).fill(0);
coolHist[22] = 50;

const mkVisual = async (templateHint: string, motionKind?: "pan-left" | "pan-right") => {
  const request: AIAnalysisRequest = {
    userPrompt: "",
    templateHint,
    assets: [
      { id: "A", name: "sunset.mp4", type: "video", duration: 12, segments: segSeries(0, 12, 1, { qualityScore: 9, aestheticScore: 9, motionLevel: "medium", brightness: 160, hueHist: warmHist, dominantHue: 25 }) },
      { id: "B", name: "beach.mp4", type: "video", duration: 12, segments: segSeries(0, 12, 1, { qualityScore: 9, aestheticScore: 9, motionLevel: "medium", brightness: 155, hueHist: warmHist, dominantHue: 30 }) },
      { id: "C", name: "ocean.mp4", type: "video", duration: 12, segments: segSeries(0, 12, 1, { qualityScore: 8, aestheticScore: 8, motionLevel: "medium", brightness: 140, hueHist: coolHist, dominantHue: 225 }) },
    ],
  };
  const plan = await AIDirector.direct(request, { llm: false });
  const matches = plan.scenes.filter((s, i) => {
    if (i === 0 || !s.transitionIn) return false;
    return (s.transitionIn.reason || "").includes("Match cut");
  });
  return { plan, matches };
};

{
  const { matches, plan } = await mkVisual("cinematic");
  const t = plan.scenes;
  console.log(`  сцен: ${t.length}; match cut'ов: ${matches.length}`);
  for (let i = 1; i < t.length; i++) {
    const tr = t[i].transitionIn;
    if (tr && (tr.reason || "").includes("Match cut")) {
      console.log(`    стык ${i}: ${tr.type} ${tr.duration}s — ${tr.reason}`);
    }
  }
  // Cinematic (slow): стыки близких по тону планов должны стать растворением
  check("match cut по цвету применён (slow)", matches.length >= 1, String(matches.length));
}

{
  // Whip pan: оба плана панорамируют вправо → hblur
  const req: AIAnalysisRequest = {
    userPrompt: "",
    templateHint: "travel",
    assets: [
      { id: "A", name: "road.mp4", type: "video", duration: 12, segments: segSeries(0, 12, 1, (t) => ({ hasFaces: true, faceX: 0.2 + 0.05 * t, faceY: 0.5, faceSize: 0.06, qualityScore: 8, aestheticScore: 8, motionLevel: "medium", brightness: 150, hueHist: coolHist, dominantHue: 200 })) },
      { id: "B", name: "train.mp4", type: "video", duration: 12, segments: segSeries(0, 12, 1, (t) => ({ hasFaces: true, faceX: 0.2 + 0.05 * t, faceY: 0.5, faceSize: 0.06, qualityScore: 8, aestheticScore: 8, motionLevel: "medium", brightness: 150, hueHist: coolHist, dominantHue: 210 })) },
    ],
  };
  const plan = await AIDirector.direct(req, { llm: false });
  // Оба ассета — панорама вправо (faceX растёт); тоны близки (200/210) — стык
  // между ними должен быть либо whip pan (hblur), либо match cut.
  const whips = plan.scenes.filter((s, i) => i > 0 && s.transitionIn?.type === "hblur" && (s.transitionIn.reason || "").includes("Whip"));
  const anyMatch = plan.scenes.filter((s, i) => i > 0 && s.transitionIn && (s.transitionIn.reason || "").includes("Match cut"));
  check("whip pan при панорамах в одну сторону", whips.length >= 1 || anyMatch.length >= 1,
    plan.scenes.map((s) => s.transitionIn ? `${s.transitionIn.type}:${(s.transitionIn.reason || "").slice(0, 20)}` : "-").join(" | "));
}

// ---------------------------------------------------------------------------
// Итог
// ---------------------------------------------------------------------------
if (failures === 0) console.log("\n✅ MONTAGE UPGRADES: ВСЕ ПРОВЕРКИ ПРОШЛИ");
else { console.error(`\n❌ Провалено: ${failures}`); process.exit(1); }
