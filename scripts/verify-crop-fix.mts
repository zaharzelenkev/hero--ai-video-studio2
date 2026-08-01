/**
 * ВЕРИФИКАЦИЯ фикса: рендер автомонтажа С Smart Reframe (focusX/focusY — лица)
 * и SFX. До фикса падало с "No such filter: '0'". После фикса должно рендериться.
 *
 * Запуск: npx tsx scripts/verify-crop-fix.mts
 */
import { Worker } from "node:worker_threads";
import { createAudioClip, createEmptyProject, createVideoClip, createTrack } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";

interface WorkerReply { id: number; ok: boolean; code?: number; error?: string; logs?: string[] }
const worker = new Worker("./scripts/ffmpeg-node-worker.mjs", { type: "module" });
let idc = 0;
const pend = new Map<number, (r: WorkerReply) => void>();
worker.on("message", (m: WorkerReply) => { const p = pend.get(m.id); if (p) { pend.delete(m.id); p(m); } });
worker.on("error", (e) => { console.error("worker error", e); process.exit(1); });
const call = (type: string, payload?: any) => new Promise<WorkerReply>((res) => {
  const id = ++idc; pend.set(id, res); worker.postMessage({ id, type, payload: payload ?? {} });
});
const ffmpeg = (...args: string[]) => call("exec", { args });
const writeFile = (name: string, data: Uint8Array) =>
  call("writeFile", { name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });

console.log("=== загрузка core ===");
const loadRes = await call("load");
if (!loadRes.ok) { console.error("core не загрузился:", loadRes.error); process.exit(1); }

// Исходники
await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=10", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "vA.mp4");
await ffmpeg("-f", "lavfi", "-i", "sine=frequency=120:duration=22", "-af", "volume=0.5", "mD.wav");
for (const [name, dur] of [["pop", 0.3], ["whoosh", 0.5], ["hit", 0.4], ["impact", 1.0]] as [string, number][]) {
  await ffmpeg("-f", "lavfi", "-i", `sine=frequency=440:duration=${dur}:sample_rate=44100`, "-ac", "1", "-c:a", "pcm_s16le", `sfx_${name}.wav`);
}

// Проект с Smart Reframe (focusX/focusY) + SFX — точная модель бага
const asset = (id: string, kind: "video" | "image" | "audio", duration: number): MediaAsset => ({
  id, name: id, kind, mime: kind === "audio" ? "audio/wav" : "video/mp4", blobKey: id, duration, createdAt: Date.now(),
});
const proj = createEmptyProject("verify-crop");
proj.resolution = { width: 1080, height: 1920 };
proj.exportSettings = { width: 540, height: 960, fps: 30, format: "mp4", crf: 26 };

const vA = asset("vA", "video", 10);
const mD = asset("mD", "audio", 22);
proj.assets = [vA, mD];
const videoTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const audioTrack = proj.tracks.find((t) => t.type === "audio")!;

// 3 видеоклипа СО Smart Reframe (focusX/focusY — как автомонтаж для клипов с лицами)
const c1 = createVideoClip({ trackId: videoTrack.id, asset: vA, start: 0, duration: 3.5, inPoint: 1, outPoint: 4.5 });
c1.muted = true;
c1.focusX = { value: 0.5, keyframes: [] }; c1.focusY = { value: 0.4, keyframes: [] }; // лицо в кадре
const c2 = createVideoClip({ trackId: videoTrack.id, asset: vA, start: 3.5, duration: 3, inPoint: 0, outPoint: 3, transitionIn: { type: "hblur", duration: 0.3 } });
c2.muted = true;
// с анимированным focusX (keyframes) — проверяем и выражения с \,
c2.focusX = { value: 0.5, keyframes: [{ id: "fx1", time: 0, value: 0.3, easing: "linear" }, { id: "fx2", time: 3, value: 0.7, easing: "linear" }] };
c2.focusY = { value: 0.5, keyframes: [] };
const c3 = createVideoClip({ trackId: videoTrack.id, asset: vA, start: 6.5, duration: 3, inPoint: 0, outPoint: 3, transitionIn: { type: "cut", duration: 0 } });
c3.muted = true;
c3.focusX = { value: 0.6, keyframes: [] }; c3.focusY = { value: 0.5, keyframes: [] };
videoTrack.clips.push(c1, c2, c3);

// Музыка
const a1 = createAudioClip({ trackId: audioTrack.id, asset: mD, start: 0, duration: 9.5, inPoint: 0, outPoint: 9.5 });
a1.loop = true; a1.fadeIn = 0.35; a1.fadeOut = 1; a1.volume = { value: 0.6, keyframes: [] };
audioTrack.clips.push(a1);

// SFX-дорожка
const sfxTrack = createTrack("audio", "Звуковые эффекты");
proj.tracks.push(sfxTrack);
const sfxAssets: Record<string, MediaAsset> = {};
for (const [name, dur] of [["pop", 0.3], ["whoosh", 0.5], ["hit", 0.4], ["impact", 1.0]] as [string, number][]) { const a = asset(`sfx_${name}`, "audio", dur); proj.assets.push(a); sfxAssets[name] = a; }
const mk = (a: MediaAsset, start: number) => { const c = createAudioClip({ trackId: sfxTrack.id, asset: a, start, duration: a.duration }); c.volume = { value: 0.55, keyframes: [] }; sfxTrack.clips.push(c); };
mk(sfxAssets.impact, 0); mk(sfxAssets.hit, 0); mk(sfxAssets.whoosh, 3.3); mk(sfxAssets.pop, 6.5); mk(sfxAssets.hit, 6.5);

proj.duration = 9.5;

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip) => {
  const a = proj.assets.find((x) => x.id === clip.assetId)!;
  return `${a.id}.${a.kind === "audio" ? "wav" : "mp4"}`;
});

// Проверим, что в filter_complex нет "clamp(" и запятые в clip() экранированы
const fc = compiled.filterComplex;
console.log("clamp( в графе:", fc.includes("clamp(") ? "⚠️ ЕСТЬ (плохо)" : "нет ✅");
const cropLine = fc.split(";").find((s) => s.includes("crop=")) || "";
console.log("crop-выражение:", cropLine.trim().slice(0, 200));

// Рендер
console.log("\n=== рендер ===");
const args: string[] = [];
for (const input of compiled.inputs) args.push(...input.pre, "-i", input.path);
args.push("-filter_complex", compiled.filterComplex);
if (compiled.videoMapLabel) args.push("-map", `[${compiled.videoMapLabel}]`);
if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
else args.push("-an");
args.push("-t", String(compiled.totalDuration.toFixed(3)));
args.push(...buildOutputArgs(proj.exportSettings, "out.mp4"));

const r = await ffmpeg(...args);
console.log("ffmpeg code:", r.code);
if (r.code !== 0) {
  console.log("ОШИБКИ:\n" + (r.logs ?? []).filter((l) => /No such|Error|Invalid|Unknown function|Failed/.test(l)).slice(-8).join("\n"));
  console.log("\n❌ ФИКС НЕ СРАБОТАЛ");
} else {
  // Проверим, что кадр не чёрный (рендер действительно прошёл)
  const probe = await ffmpeg("-ss", "1", "-i", "out.mp4", "-frames:v", "1", "-vf", "scale=32x32", "-f", "rawvideo", "-pix_fmt", "rgb24", "f.raw");
  const fr = await call("readFile", { name: "f.raw" });
  let sum = 0; if (fr.data) { const px = new Uint8Array(fr.data); for (let i = 0; i < px.length; i += 7) sum += px[i]; }
  const mean = fr.data ? sum / Math.floor(new Uint8Array(fr.data).length / 7) : 0;
  console.log(`кадр t=1s яркость=${mean.toFixed(0)} (>30 = живой)`);
  console.log("\n✅ ФИКС ПОДТВЕРЖДЁН: рендер с Smart Reframe + SFX прошёл без 'No such filter'");
}

worker.terminate();
process.exit(r.code === 0 ? 0 : 1);
