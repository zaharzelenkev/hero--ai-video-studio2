/**
 * Настоящий E2E тест экспорта MONTIQ.
 *
 * Генерирует синтетические исходники тем же ffmpeg.wasm core, что работает в браузере,
 * компилирует типовой проект автомонтажа через наш filterGraph и РЕНДЕРИТ его.
 * Проверяет: ffmpeg не падает (весь filter complex синтаксически валиден),
 * длительность корректна, кадр в середине ролика не чёрный.
 *
 * Запуск: npx tsx scripts/test-ffmpeg-e2e.mts
 */
import { Worker } from "node:worker_threads";
import { createAudioClip, createEmptyProject, createTextClip, createVideoClip } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";

// ---------- Worker bridge over @ffmpeg/core (как в браузере, но в Node) ----------
interface WorkerReply { id: number; ok: boolean; code?: number; data?: ArrayBuffer; exists?: boolean; error?: string; logs?: string[] }

const worker = new Worker("./scripts/ffmpeg-node-worker.mjs", { type: "module" });
let idc = 0;
const pend = new Map<number, (r: WorkerReply) => void>();
worker.on("message", (m: WorkerReply) => { const p = pend.get(m.id); if (p) { pend.delete(m.id); p(m); } });
worker.on("error", (e) => { console.error("worker error", e); process.exit(1); });
const call = (type: string, payload?: any) => new Promise<WorkerReply>((res) => {
  const id = ++idc; pend.set(id, res); worker.postMessage({ id, type, payload: payload ?? {} });
});

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function ffmpeg(...args: string[]): Promise<{ code: number; logs: string[] }> {
  const r = await call("exec", { args });
  return { code: r.code ?? -1, logs: r.logs ?? [] };
}
async function writeFile(name: string, data: Uint8Array) {
  await call("writeFile", { name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
}

// ---------- 1. Загрузка ----------
console.log("=== загрузка @ffmpeg/core (тот же core, что в браузере) ===");
const loadRes = await call("load");
check("core загружен", loadRes.ok, loadRes.error);

// ---------- 2. Генерация синтетических исходников ----------
console.log("\n=== генерация исходников ===");
let r = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=10", "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "vA.mp4");
check("ген vA.mp4", r.code === 0, r.logs.slice(-3).join(" | "));

r = await ffmpeg("-f", "lavfi", "-i", "mandelbrot=size=1280x720:rate=30", "-f", "lavfi", "-i", "sine=frequency=660:duration=12", "-t", "12", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "vB.mp4");
check("ген vB.mp4", r.code === 0);

r = await ffmpeg("-f", "lavfi", "-i", "gradients=size=1600x1200:duration=0.2", "-frames:v", "1", "iC.png");
check("ген iC.png", r.code === 0);

r = await ffmpeg("-f", "lavfi", "-i", "sine=frequency=120:duration=22", "-af", "volume=0.5", "mD.wav");
check("ген mD.wav", r.code === 0);

// ---------- 3. Проект MONTIQ (типовой результат автомонтажа) ----------
console.log("\n=== проект MONTIQ ===");
const asset = (id: string, kind: "video" | "image" | "audio", duration: number, w?: number, h?: number): MediaAsset => ({
  id, name: id, kind, mime: kind === "audio" ? "audio/wav" : kind === "image" ? "image/png" : "video/mp4",
  blobKey: id, duration, width: w, height: h, createdAt: Date.now(),
});

const proj = createEmptyProject("e2e");
proj.resolution = { width: 1080, height: 1920 };
proj.exportSettings = { width: 540, height: 960, fps: 30, format: "mp4", crf: 26 }; // ниже для скорости wasm
proj.openingFadeIn = 0.5;
proj.endingFadeOut = 0.6;

const vA = asset("vA", "video", 10, 1280, 720);
const vB = asset("vB", "video", 12, 1280, 720);
const iC = asset("iC", "image", 4, 1600, 1200);
const mD = asset("mD", "audio", 22);
proj.assets = [vA, vB, iC, mD];

const videoTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const overlayTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Наложение")!;
const textTrack = proj.tracks.find((t) => t.type === "text")!;
const audioTrack = proj.tracks.find((t) => t.type === "audio")!;

const c1 = createVideoClip({ trackId: videoTrack.id, asset: vA, start: 0, duration: 3.5, inPoint: 1, outPoint: 4.5 });
c1.effects = ["vignette"];
const c2 = createVideoClip({ trackId: videoTrack.id, asset: vB, start: 3.2, duration: 3, inPoint: 0, outPoint: 6, transitionIn: { type: "hblur", duration: 0.3 } });
c2.speed = 2;
const c3 = createVideoClip({ trackId: videoTrack.id, asset: vB, start: 6.2, duration: 3, inPoint: 7, outPoint: 8.5, transitionIn: { type: "cut", duration: 0 } });
c3.speed = 0.5;
const c4 = createVideoClip({ trackId: videoTrack.id, asset: iC, start: 9.2, duration: 2.8, transitionIn: { type: "crossfade", duration: 0.4 } });
c4.cameraMotion = "zoom-in";
videoTrack.clips.push(c1, c2, c3, c4);

const b1 = createVideoClip({ trackId: overlayTrack.id, asset: vA, start: 1.2, duration: 2, inPoint: 6, outPoint: 8 });
b1.muted = true;
b1.fitMode = "contain";
b1.scale.value = 0.55;
b1.y.value = -0.2;
b1.opacity.keyframes = [
  { id: "k1", time: 0, value: 0, easing: "linear" },
  { id: "k2", time: 0.3, value: 1, easing: "linear" },
  { id: "k3", time: 1.7, value: 1, easing: "linear" },
  { id: "k4", time: 2, value: 0, easing: "linear" },
];
// Beat flash: keyframe-вспышка яркости поверх B-roll (путь анимированного eq)
b1.color.brightness.keyframes = [
  { id: "f1", time: 0.9, value: 0, easing: "linear" },
  { id: "f2", time: 1.0, value: 0.3, easing: "easeOut" },
  { id: "f3", time: 1.3, value: 0, easing: "easeIn" },
];
overlayTrack.clips.push(b1);

const t1 = createTextClip({ trackId: textTrack.id, start: 0.5, duration: 3, text: "MONTIQ: e2e тест" });
t1.fontFamily = "DejaVu Sans";
textTrack.clips.push(t1);

const a1 = createAudioClip({ trackId: audioTrack.id, asset: mD, start: 0, duration: 11.6, inPoint: 6, outPoint: 17.6 });
a1.loop = true;
a1.fadeIn = 0.35;
a1.fadeOut = 2;
// Авто-дакинг под речь: keyframe-провали громкости (путь анимированного volume)
a1.volume.keyframes = [
  { id: "d1", time: 1.0, value: 0.9, easing: "linear" },
  { id: "d2", time: 2.0, value: 0.15, easing: "linear" },
  { id: "d3", time: 4.0, value: 0.15, easing: "linear" },
  { id: "d4", time: 5.0, value: 0.9, easing: "linear" },
];
audioTrack.clips.push(a1);
proj.duration = 11.6;

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip) => {
  const a = proj.assets.find((x) => x.id === clip.assetId)!;
  return `${a.id}.${a.kind === "audio" ? "wav" : a.kind === "image" ? "png" : "mp4"}`;
});

const { readFileSync } = await import("node:fs");
await writeFile("DejaVuSans.ttf", new Uint8Array(readFileSync("public/fonts/DejaVuSans.ttf")));

// ---------- 4. Рендер ----------
console.log("\n=== рендер через @ffmpeg/core ===");
const args: string[] = [];
for (const input of compiled.inputs) args.push(...input.pre, "-i", input.path);
args.push("-filter_complex", compiled.filterComplex);
if (compiled.videoMapLabel) args.push("-map", `[${compiled.videoMapLabel}]`);
if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
else args.push("-an");
args.push("-t", String(compiled.totalDuration.toFixed(3)));
args.push(...buildOutputArgs(proj.exportSettings, "out.mp4"));

r = await ffmpeg(...args);
check("ffmpeg отрендерил без ошибок", r.code === 0, r.logs.slice(-6).join(" | "));

// ---------- 5. Валидация результата ----------
console.log("\n=== валидация out.mp4 ===");
const durProbe = await ffmpeg("-i", "out.mp4", "-f", "null", "-");
const durMatch = durProbe.logs.join("\n").match(/Duration: (\d+):(\d+):([\d.]+)/);
const realDur = durMatch ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]) : -1;
check(`длительность ≈ 11.6с (факт: ${realDur.toFixed(2)}с)`, Math.abs(realDur - 11.6) < 0.35, String(realDur));

// Кадр в середине ролика не должен быть чёрным (ловит ошибки тайминга/оверлеев)
async function frameStdDev(t: number): Promise<{ mean: number; sd: number }> {
  await ffmpeg("-ss", String(t), "-i", "out.mp4", "-frames:v", "1", "-vf", "scale=64x64", "-f", "rawvideo", "-pix_fmt", "rgb24", `frame_${t}.raw`);
  const fr = await call("readFile", { name: `frame_${t}.raw` });
  if (!fr.data) return { mean: 0, sd: 0 };
  const px = new Uint8Array(fr.data);
  let sum = 0, sum2 = 0;
  for (let i = 0; i < px.length; i += 10) { sum += px[i]; sum2 += px[i] * px[i]; }
  const n = Math.floor(px.length / 10);
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}

const mid = await frameStdDev(5);
check(`кадр t=5s живой (sd=${mid.sd.toFixed(1)}, яркость=${mid.mean.toFixed(0)})`, mid.sd > 12 && mid.mean > 40);

const pi = await frameStdDev(2); // внутри PiP-окна
const piAfter = await frameStdDev(3.4); // после исчезновения PiP
const diff = Math.abs(pi.mean - piAfter.mean) + Math.abs(pi.sd - piAfter.sd);
check(`PiP-оверлей реально рисуется (разница кадров 2s vs 3.4s: ${diff.toFixed(1)})`, diff > 2);

// Метрики аудио для регрессионных сравнений качества (не блокируют тест)
const astats = await ffmpeg("-i", "out.mp4", "-af", "astats=metadata=1,ametadata=print:key=lavfi.astats.Overall.RMS_level", "-f", "null", "-");
const rmsLine = astats.logs.filter((l) => l.includes("RMS_level")).slice(0, 2);
const rmsVal = rmsLine.length ? parseFloat(rmsLine[0].split("RMS_level=")[1]) : NaN;
// Мастер-микс нормализован к -14 LUFS (loudnorm в filterGraph): RMS обязан
// держаться в платформенном коридоре, иначе баланс голос/музыка сломан.
check("мастер-громкость нормализована (-18..-12 dB RMS)", rmsVal > -18 && rmsVal < -12,
  Number.isFinite(rmsVal) ? `RMS=${rmsVal.toFixed(2)} dB (было -22.7 до loudnorm)` : "astats недоступен");

console.log(failures === 0 ? "\n✅ E2E РЕНДЕР ПРОШЁЛ" : `\n❌ Провалено: ${failures}`);
worker.terminate();
process.exit(failures === 0 ? 0 : 1);
