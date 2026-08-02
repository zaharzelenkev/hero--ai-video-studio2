/**
 * E2E-тест экспорта VFX: проект со ВСЕМИ эффектами (хромакей, motion blur,
 * glow, световые лучи, зерно, дисторсия, bloom, резкость, шумоподавление,
 * виньетка, LUT, blend-режимы слоёв) реально рендерится тем же ffmpeg.wasm,
 * что работает в браузере. Проверяется валидность filter_complex и то, что
 * на выходе не чёрный кадр.
 *
 * Запуск: npx tsx scripts/test-vfx-ffmpeg.mts
 */
import { Worker } from "node:worker_threads";
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { buildOutputArgs, compileProjectToFfmpeg } from "../src/lib/filterGraph";
import { writeLutCubes } from "../src/lib/editor/vfxExport";

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

console.log("=== загрузка @ffmpeg/core ===");
const loadRes = await call("load");
check("core загружен", loadRes.ok, loadRes.error);

// ---------- исходники ----------
let r = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=640x360:rate=15:duration=5", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-an", "vA.mp4");
check("ген vA.mp4 (базовый клип)", r.code === 0);

// ---------- проект со всеми VFX ----------
const asset = (id: string, duration: number): MediaAsset => ({
  id, name: id, kind: "video", mime: "video/mp4", blobKey: id, duration, width: 640, height: 360, createdAt: Date.now(),
});
const a1 = asset("a1", 6);
const a2 = asset("a2", 4);

const proj = createEmptyProject("vfx-e2e");
proj.resolution = { width: 640, height: 360 };
proj.exportSettings = { width: 640, height: 360, fps: 15, format: "mp4", crf: 30 };
proj.assets = [a1, a2];
const track1 = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const overlay = proj.tracks.find((t) => t.type === "video" && t.name === "Наложение")!;

// Базовый клип — куча эффектов.
const base = createVideoClip({ trackId: track1.id, asset: a1, start: 0, duration: 3, inPoint: 0, outPoint: 3 });
base.muted = true;
base.chroma = { enabled: true, color: "#ff00ff", similarity: 0.15, blend: 0.08, despill: 0.4 };
base.motionBlur = { enabled: true, samples: 12, shutterAngle: 180, angle: 30 };
base.vfx = {
  backgroundRemoval: { enabled: false, fill: "transparent", color: "#000000", blurAmount: 18, edgeSmooth: 6, foregroundOpacity: 1, threshold: 0.4 },
  objectRemoval: { enabled: false, strokes: [], brushRadius: 0.04 },
  glow: { enabled: true, radius: 14, strength: 0.7, threshold: 0.55 },
  lightRays: { enabled: true, centerX: 0.5, centerY: 0.4, length: 0.6, strength: 0.6, rayCount: 8 },
  filmGrain: { enabled: true, amount: 0.2, size: 2, monochrome: true, seed: 7 },
  lensDistortion: { enabled: true, amount: 0.15 },
  bloom: { enabled: true, radius: 12, strength: 0.5, threshold: 0.7 },
  sharpen: { enabled: true, amount: 0.8, radius: 1.5 },
  noiseReduction: { enabled: true, amount: 0.4, radius: 1 },
  vignette: { enabled: true, strength: 0.6, feather: 0.6 },
  lut: { enabled: true, preset: "teal-orange", amount: 0.8 },
};
track1.clips.push(base);

// Оверлей с blend-режимом (screen).
const ov = createVideoClip({ trackId: overlay.id, asset: a2, start: 0.5, duration: 2, inPoint: 0, outPoint: 2 });
ov.muted = true;
ov.fitMode = "contain";
ov.scale.value = 0.6;
ov.blendMode = "screen";
overlay.clips.push(ov);

proj.duration = 3;

const fileNameFor = (c: { assetId: string }) => `${c.assetId}.mp4`;
const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, fileNameFor, {
  lightRays: [{ clipId: base.id, path: "rays.png", strength: 0.6 }],
});

console.log("\n=== проверки filter_complex ===");
const fc = compiled.filterComplex;
check("chromakey в графе", fc.includes("chromakey="));
check("dblur (motion blur)", fc.includes("dblur=angle=30"));
check("glow: colorlevels+gblur+screen", fc.includes("colorlevels=rimin=0.55") && fc.includes("all_mode=screen"));
check("bloom: addition", fc.includes("all_mode=addition"));
check("light rays: вход rays.png + alphaextract", compiled.inputs.some((i) => i.path === "rays.png") && fc.includes("alphaextract"));
check("зерно: noise", fc.includes("noise=alls="));
check("дисторсия: lenscorrection", fc.includes("lenscorrection=k1="));
check("резкость: unsharp", fc.includes("unsharp=5:5:"));
check("шумоподавление: hqdn3d", fc.includes("hqdn3d="));
check("виньетка: vignette=angle", fc.includes("vignette=angle="));
check("LUT: lut3d + .cube", fc.includes("lut3d=file=/lut_teal-orange.cube") && compiled.lutFiles.includes("teal-orange"));
check("blend-режим оверлея: gbrp+blend+alphamerge", fc.includes("all_mode=screen:all_opacity=") && fc.includes("alphamerge"));

// ---------- реальный рендер ----------
console.log("\n=== рендер VFX-проекта ===");
await writeFile("a1.mp4", new Uint8Array(await (await call("readFile", { name: "vA.mp4" })).data));
await writeFile("a2.mp4", new Uint8Array(await (await call("readFile", { name: "vA.mp4" })).data));
// LUT .cube — тот же, что в превью.
await writeLutCubes({ writeFile: (p, d) => call("writeFile", { name: p, data: d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) }) }, compiled.lutFiles);
// PNG лучей генерируем самим ffmpeg (в браузере его делает JS).
r = await ffmpeg("-f", "lavfi", "-i", "color=white:size=640x360", "-frames:v", "1", "rays.png");
check("ген rays.png", r.code === 0);

const args: string[] = [];
for (const input of compiled.inputs) {
  args.push(...input.pre, "-i", input.path);
}
args.push("-filter_complex", compiled.filterComplex);
args.push("-map", `[${compiled.videoMapLabel}]`);
if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
else args.push("-an");
args.push("-t", String(compiled.totalDuration.toFixed(3)));
args.push(...buildOutputArgs(proj.exportSettings, "out.mp4", compiled.totalDuration));

r = await ffmpeg(...args);
check("рендер завершился без ошибок", r.code === 0, r.logs.slice(-10).join(" | "));

// Проверяем, что кадр в середине не чёрный: извлекаем средний кадр и смотрим яркость.
r = await ffmpeg("-i", "out.mp4", "-vf", "select='eq(n,22)'", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "frame.raw");
check("извлечение кадра 2с", r.code === 0, r.logs.slice(-3).join(" | "));
const rawRes = await call("readFile", { name: "frame.raw" });
if (rawRes.data) {
  const raw = new Uint8Array(rawRes.data);
  let sum = 0;
  for (let i = 0; i < raw.length; i += 7) sum += raw[i];
  const avg = sum / (raw.length / 7);
  check("кадр не чёрный (средняя яркость > 10)", avg > 10, `avg=${avg.toFixed(1)}`);
} else {
  check("кадр не чёрный", false, "нет данных кадра");
}

// ---------- быстрый рендер одиночного LUT (без остального) ----------
console.log("\n=== LUT без прочих эффектов ===");
const proj2 = createEmptyProject("lut-only");
proj2.exportSettings = { width: 640, height: 360, fps: 24, format: "mp4", crf: 30 };
proj2.assets = [a1];
const t1 = proj2.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const c1 = createVideoClip({ trackId: t1.id, asset: a1, start: 0, duration: 2, inPoint: 0, outPoint: 2 });
c1.muted = true;
c1.vfx = {
  ...(c1.vfx ?? { backgroundRemoval: { enabled: false, fill: "transparent" as const, color: "#000000", blurAmount: 18, edgeSmooth: 6, foregroundOpacity: 1, threshold: 0.4 }, objectRemoval: { enabled: false, strokes: [], brushRadius: 0.04 } }),
  lut: { enabled: true, preset: "film-noir", amount: 1 },
};
t1.clips.push(c1);
proj2.duration = 2;
const compiled2 = compileProjectToFfmpeg(proj2, proj2.exportSettings, fileNameFor);
await writeLutCubes({ writeFile: (p, d) => call("writeFile", { name: p, data: d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) }) }, compiled2.lutFiles);
check("film-noir LUT в графе", compiled2.filterComplex.includes("lut3d=file=/lut_film-noir.cube"));
const args2: string[] = [];
for (const input of compiled2.inputs) args2.push(...input.pre, "-i", input.path);
args2.push("-filter_complex", compiled2.filterComplex, "-map", `[${compiled2.videoMapLabel}]`, "-an", "-t", "2", ...buildOutputArgs(proj2.exportSettings, "out2.mp4", compiled2.totalDuration));
r = await ffmpeg(...args2);
check("рендер LUT-проекта", r.code === 0, r.logs.slice(-3).join(" | "));

process.exit(0);
