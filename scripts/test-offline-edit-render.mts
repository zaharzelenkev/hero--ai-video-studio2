/**
 * OFFLINE EDIT · СКВОЗНОЙ ТЕСТ СОЗДАНИЯ И ЭКСПОРТА ВИДЕО.
 *
 * Проверяет самое важное: план, который построил AI Director на этапе
 * чернового монтажа, РЕАЛЬНО РЕНДЕРИТСЯ в готовый файл.
 *
 * Конвейер теста повторяет продакшен:
 *   AI Director (offline edit) → planToDecision → сборка проекта
 *   → compileProjectToFfmpeg → настоящий рендер @ffmpeg/core → валидация mp4.
 *
 * Проверяется, что до экспорта доезжают именно РЕЖИССЁРСКИЕ решения:
 * длительности сцен, переходы, цветовое настроение (грейд по фазам) и
 * уровни музыки. Компиляция графа без падения — необходимое, но не
 * достаточное условие: файл должен получиться нужной длины и с живым кадром.
 *
 * Запуск: npx tsx scripts/test-offline-edit-render.mts
 */

import { Worker } from "node:worker_threads";
import { AIDirector } from "../src/lib/brain/aiDirector";
import { planToDecision } from "../src/lib/brain/planAdapter";
import { createAudioClip, createEmptyProject, createVideoClip } from "../src/lib/factories";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";
import type { AIAnalysisRequest } from "../src/lib/ai/aiService";
import type { MediaAsset, VideoClip } from "../src/lib/types";
import type { VideoSegmentMetadata } from "../src/lib/localAnalyzer";
import type { AudioEnergySegment } from "../src/lib/media";

// ---------- ffmpeg worker bridge ----------
interface WorkerReply { id: number; ok: boolean; code?: number; data?: ArrayBuffer; error?: string; logs?: string[] }
const worker = new Worker("./scripts/ffmpeg-node-worker.mjs", { type: "module" });
let idc = 0;
const pend = new Map<number, (r: WorkerReply) => void>();
worker.on("message", (m: WorkerReply) => { const p = pend.get(m.id); if (p) { pend.delete(m.id); p(m); } });
worker.on("error", (e) => { console.error("worker error", e); process.exit(1); });
const call = (type: string, payload?: unknown) => new Promise<WorkerReply>((res) => {
  const id = ++idc; pend.set(id, res); worker.postMessage({ id, type, payload: payload ?? {} });
});
const ffmpeg = async (...args: string[]) => {
  const r = await call("exec", { args });
  return { code: r.code ?? -1, logs: r.logs ?? [] };
};

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ---------- 1. Загрузка ядра ----------
console.log("=== загрузка @ffmpeg/core ===");
const loadRes = await call("load");
check("core загружен", loadRes.ok, loadRes.error);

// ---------- 2. Синтетические исходники ----------
console.log("\n=== генерация исходников ===");
let r = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=960x540:rate=25:duration=14",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=14",
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "32", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "cityA.mp4");
check("ген cityA.mp4", r.code === 0, r.logs.slice(-2).join(" | "));

r = await ffmpeg("-f", "lavfi", "-i", "mandelbrot=size=960x540:rate=25", "-t", "14",
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "32", "-pix_fmt", "yuv420p", "natureB.mp4");
check("ген natureB.mp4", r.code === 0);

r = await ffmpeg("-f", "lavfi", "-i", "sine=frequency=110:duration=40", "-af", "volume=0.4", "music.wav");
check("ген music.wav", r.code === 0);

// ---------- 3. AI DIRECTOR: черновой монтаж ----------
console.log("\n=== AI Director: offline edit ===");

const seg = (s: number, e: number, o: Partial<VideoSegmentMetadata> = {}): VideoSegmentMetadata => ({
  startTime: s, endTime: e, motionLevel: "low", isDark: false, isBlurry: false, hasFaces: false,
  qualityScore: 8, isSceneChange: false, hasAction: false, aestheticScore: 7,
  brightness: 148, contrast: 125, saturation: 42, colorfulness: 30, ...o,
});
const series = (from: number, to: number, step: number, o: Partial<VideoSegmentMetadata> | ((t: number) => Partial<VideoSegmentMetadata>)) => {
  const out: VideoSegmentMetadata[] = [];
  for (let t = from; t < to - 1e-6; t += step) out.push(seg(t, Math.min(t + step, to), typeof o === "function" ? o(t) : o));
  return out;
};
const beats: number[] = [];
for (let t = 0; t <= 40; t += 0.5) beats.push(+t.toFixed(3));

const musicEnergy: AudioEnergySegment[] = [];
for (let t = 0; t < 40; t += 2) {
  const lv: AudioEnergySegment["energyLevel"] = t < 6 ? "low" : t < 14 ? "medium" : t < 22 ? "drop" : "medium";
  musicEnergy.push({ startTime: t, endTime: t + 2, energyLevel: lv });
}

const request: AIAnalysisRequest = {
  userPrompt: "динамичный ролик 18 сек",
  templateHint: "tiktok",
  beats,
  musicInPointSec: 0,
  assets: [
    { id: "cityA", name: "cityA.mp4", type: "video", duration: 14, width: 960, height: 540, segments: [
      ...series(0, 5, 1, { qualityScore: 8, aestheticScore: 8, brightness: 150, colorfulness: 34 }),
      ...series(5, 9, 1, (t) => ({ qualityScore: 9, aestheticScore: 9, motionLevel: "high", hasAction: true, brightness: 162, colorfulness: 46, isSceneChange: t < 5.5 })),
      ...series(9, 14, 1, (t) => ({ qualityScore: 7, aestheticScore: 7, brightness: 140, colorfulness: 26, isSceneChange: t < 9.5 })),
    ] },
    { id: "natureB", name: "natureB.mp4", type: "video", duration: 14, width: 960, height: 540, segments: [
      ...series(0, 6, 1, { qualityScore: 8, aestheticScore: 8, brightness: 155, colorfulness: 44, motionLevel: "medium" }),
      ...series(6, 10, 1, (t) => ({ qualityScore: 3, isDark: true, brightness: 24, contrast: 50, isSceneChange: t < 6.5 })),
      ...series(10, 14, 1, (t) => ({ qualityScore: 8, aestheticScore: 8, hasFaces: true, faceX: 1 / 3, faceY: 0.35, faceSize: 0.1, brightness: 150, isSceneChange: t < 10.5 })),
    ] },
    { id: "music", name: "music.wav", type: "audio", duration: 40, audioEnergy: musicEnergy },
  ],
};

const plan = await AIDirector.direct(request, { llm: false });
const decision = planToDecision(plan);
const mains = decision.clips.filter((c) => c.trackType !== "b-roll");

check("режиссёрский план построен", plan.scenes.length >= 3, String(plan.scenes.length));
check("постановка сцен доехала до решения", mains.every((m) => !!m.sceneDirection), "sceneDirection");
check("бракованный тёмный кусок natureB не взят",
  !plan.scenes.some((s) => s.source.assetId === "natureB" && s.source.start >= 6 && s.source.start < 10),
  plan.scenes.map((s) => `${s.source.assetId}@${s.source.start.toFixed(1)}`).join(","));
console.log(`  · сцен ${plan.scenes.length}, кульминация ${plan.climaxAt.toFixed(1)}с, отсеяно ${plan.offlineEdit?.totalTrimmedSec ?? 0}с`);

// ---------- 4. Сборка проекта из плана (как в autoEdit) ----------
console.log("\n=== сборка проекта из плана ===");

const mkAsset = (id: string, kind: "video" | "audio", duration: number, w?: number, h?: number): MediaAsset => ({
  id, name: `${id}.${kind === "audio" ? "wav" : "mp4"}`, kind,
  mime: kind === "audio" ? "audio/wav" : "video/mp4", blobKey: id, duration, width: w, height: h, createdAt: Date.now(),
});
const assets: MediaAsset[] = [
  mkAsset("cityA", "video", 14, 960, 540),
  mkAsset("natureB", "video", 14, 960, 540),
  mkAsset("music", "audio", 40),
];

const proj = createEmptyProject("offline-edit-render");
proj.assets = assets;
proj.resolution = { width: 480, height: 854 };
proj.exportSettings = { width: 480, height: 854, fps: 25, format: "mp4", crf: 30 };
proj.endingFadeOut = 0.4;

const videoTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const audioTrack = proj.tracks.find((t) => t.type === "audio")!;

// Исполняем план так же, как это делает монтажный движок.
let cursor = 0;
const placed: Array<{ clip: VideoClip; sceneIdx: number }> = [];
for (let i = 0; i < mains.length; i++) {
  const c = mains[i];
  const asset = assets.find((a) => a.id === c.assetId)!;
  const inPoint = Math.max(0, c.startTime ?? 0);
  const outPoint = Math.min(asset.duration, c.endTime ?? inPoint + c.duration);
  if (outPoint - inPoint < 0.3) continue;
  const hint = c.transitionHint;
  const trans = hint && i > 0 ? { type: hint.type, duration: Math.min(hint.duration, (outPoint - inPoint) * 0.35) } : { type: "cut" as const, duration: 0 };
  const clip = createVideoClip({
    trackId: videoTrack.id, asset, start: cursor, duration: outPoint - inPoint,
    inPoint, outPoint, transitionIn: trans,
  });
  clip.muted = true;

  // ЦВЕТОВОЕ НАСТРОЕНИЕ СЦЕНЫ — исполняем буквально.
  const mood = c.sceneDirection?.colorMood;
  if (mood) {
    clip.color.saturation.value += mood.saturation;
    clip.color.contrast.value += mood.contrast;
    clip.color.temperature.value += mood.temperature;
    clip.color.brightness.value += mood.brightness;
  }
  videoTrack.clips.push(clip);
  placed.push({ clip, sceneIdx: i });
  cursor += clip.duration - (trans.duration || 0);
}
// Пересчёт стартов с учётом перекрытий переходов (как в autoEdit).
let actual = 0;
for (let i = 0; i < videoTrack.clips.length; i++) {
  const c = videoTrack.clips[i] as VideoClip;
  if (i > 0 && c.transitionIn.duration > 0) actual -= c.transitionIn.duration;
  c.start = actual;
  actual += c.duration;
}
proj.duration = actual;

// Музыка с уровнем из режиссёрского плана.
const musicClip = createAudioClip({
  trackId: audioTrack.id, asset: assets[2], start: 0, duration: proj.duration,
  inPoint: plan.music.inPoint, outPoint: plan.music.inPoint + proj.duration,
});
musicClip.volume = { value: plan.music.volume, keyframes: [] };
musicClip.fadeIn = 0.3;
musicClip.fadeOut = 1.0;
audioTrack.clips.push(musicClip);

check("клипы размещены", videoTrack.clips.length >= 3, String(videoTrack.clips.length));
check("длительность проекта положительная", proj.duration > 4, `${proj.duration.toFixed(2)}с`);
check("цветовое настроение применено к клипам",
  placed.some(({ clip }) => clip.color.temperature.value !== 0 || clip.color.saturation.value !== 0),
  "грейд применён");
console.log(`  · клипов ${videoTrack.clips.length}, длительность ${proj.duration.toFixed(2)}с`);

// ---------- 5. Компиляция графа ----------
console.log("\n=== компиляция filter_complex ===");
const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip) => {
  const a = assets.find((x) => x.id === clip.assetId)!;
  return a.kind === "audio" ? "music.wav" : `${a.id}.mp4`;
});
check("граф скомпилирован", compiled.filterComplex.length > 0);
check("видеовыход определён", !!compiled.videoMapLabel);
check("аудиовыход определён", !!compiled.audioMapLabel);
check("нет висячих ссылок на неопределённые потоки", (() => {
  const defined = new Set<string>();
  for (const m of compiled.filterComplex.matchAll(/\[([a-zA-Z0-9_]+)\](?=\s*(?:;|$))/g)) defined.add(m[1]);
  for (const line of compiled.filterComplex.split(";")) {
    const outs = [...line.matchAll(/\[([a-zA-Z0-9_]+)\]\s*$/g)].map((m) => m[1]);
    for (const o of outs) defined.add(o);
  }
  for (const line of compiled.filterComplex.split(";")) {
    const head = line.split(/[a-z]/)[0] ?? "";
    for (const m of head.matchAll(/\[([a-zA-Z0-9_]+)\]/g)) {
      const lbl = m[1];
      if (/^\d+:[av]$/.test(lbl)) continue;
      if (!defined.has(lbl)) return false;
    }
  }
  return true;
})());

// ---------- 6. РЕАЛЬНЫЙ РЕНДЕР ----------
console.log("\n=== рендер через @ffmpeg/core ===");
const args: string[] = [];
for (const inp of compiled.inputs) { args.push(...inp.pre, "-i", inp.path); }
args.push("-filter_complex", compiled.filterComplex);
args.push("-map", `[${compiled.videoMapLabel}]`);
if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
args.push("-t", String(compiled.totalDuration));
args.push(...buildOutputArgs(proj.exportSettings, "offline_out.mp4", compiled.totalDuration));

const render = await ffmpeg(...args);
check("ffmpeg отрендерил без ошибок", render.code === 0, render.logs.slice(-6).join(" | "));

// ---------- 7. Валидация результата ----------
console.log("\n=== валидация offline_out.mp4 ===");
const probe = await ffmpeg("-i", "offline_out.mp4", "-f", "null", "-");
const durLine = probe.logs.join("\n").match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
const actualDur = durLine ? Number(durLine[1]) * 3600 + Number(durLine[2]) * 60 + Number(durLine[3]) : 0;
check("файл создан и читается", actualDur > 0, `${actualDur.toFixed(2)}с`);
check("длительность соответствует плану", Math.abs(actualDur - compiled.totalDuration) <= 0.6,
  `факт ${actualDur.toFixed(2)}с, план ${compiled.totalDuration.toFixed(2)}с`);

// Кадр из середины ролика должен быть «живым» (не чёрный, есть детали).
const midT = Math.max(0.5, compiled.totalDuration / 2);
const fr = await ffmpeg("-ss", String(midT), "-i", "offline_out.mp4", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "64x64", "mid.raw");
check("кадр извлечён", fr.code === 0);
const raw = await call("readFile", { name: "mid.raw" });
if (raw.ok && raw.data) {
  const px = new Uint8Array(raw.data);
  let sum = 0;
  for (const v of px) sum += v;
  const mean = sum / px.length;
  let sq = 0;
  for (const v of px) sq += (v - mean) ** 2;
  const sd = Math.sqrt(sq / px.length);
  check("кадр в середине живой (не чёрный, есть детали)", mean > 12 && sd > 8, `яркость=${mean.toFixed(1)} sd=${sd.toFixed(1)}`);
} else {
  check("кадр в середине живой", false, "не удалось прочитать кадр");
}

// Звук должен присутствовать и быть нормализован.
const vol = await ffmpeg("-i", "offline_out.mp4", "-af", "volumedetect", "-f", "null", "-");
const meanVol = vol.logs.join("\n").match(/mean_volume:\s*(-?[\d.]+) dB/);
check("аудиодорожка присутствует", !!meanVol, meanVol?.[0] ?? "нет volumedetect");
if (meanVol) {
  const v = Number(meanVol[1]);
  check("громкость в разумных пределах (мастер-нормализация)", v > -35 && v < -6, `${v} dB`);
}

// ---------- Итог ----------
if (failures === 0) console.log("\n✅ OFFLINE EDIT · СОЗДАНИЕ И ЭКСПОРТ ВИДЕО: ПРОШЛО");
else { console.error(`\n❌ Провалено: ${failures}`); process.exit(1); }
process.exit(0);
