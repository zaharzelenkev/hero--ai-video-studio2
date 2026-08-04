/**
 * РЕГРЕССИОННЫЙ ТЕСТ: 4K-экспорт с blend/gbrap-эффектами не падает с OOM.
 *
 * Баг: на 4K-канвасе каждая alphaAwareBlend-цепочка (LUT-микс, glow, bloom,
 * световые лучи, blend-режим оверлея) держит в wasm-куче ~200 МБ (потолок
 * кучи @ffmpeg/core — 2 ГБ). Проект с несколькими эффектами ронял рендер на
 * ПЕРВОМ кадре: «[swscaler] No accelerated colorspace conversion found from
 * yuv420p to gbrap … Error while filtering: Out of memory → Conversion failed!».
 *
 * Исправление (src/lib/filterGraph.ts): VFX-цепочки считаются в рабочем
 * разрешении ≤1920px (effectWork) и поднимаются до канваса.
 *
 * Запуск: npx tsx scripts/test-render-4k-vfx.mts
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
async function ffmpeg(...args: string[]): Promise<{ code: number; logs: string[] }> {
  const r = await call("exec", { args });
  return { code: r.code ?? -1, logs: r.logs ?? [] };
}
async function writeFile(name: string, data: Uint8Array) {
  await call("writeFile", { name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
}

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Короткая отрисовка — достаточно, чтобы пройти точку падения (1-й кадр).
const RENDER_SECONDS = 0.4;

console.log("=== загрузка @ffmpeg/core ===");
const loadRes = await call("load");
check("core загружен", loadRes.ok, loadRes.error);

// ---------- 4K исходники ----------
let r = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30:duration=6", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-an", "vA.mp4");
check("ген vA.mp4 (4K)", r.code === 0, r.logs.slice(-3).join(" | "));
r = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30:duration=6", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-an", "vB.mp4");
check("ген vB.mp4 (4K)", r.code === 0);

// ---------- проект: 4K канвас + все blend-эффекты ----------
const asset = (id: string, duration: number): MediaAsset => ({
  id, name: id, kind: "video", mime: "video/mp4", blobKey: id, duration, width: 3840, height: 2160, createdAt: Date.now(),
});

const proj = createEmptyProject("4k-vfx");
proj.resolution = { width: 3840, height: 2160 };
proj.exportSettings = { width: 3840, height: 2160, fps: 30, format: "mp4", crf: 26 };
proj.assets = [asset("a1", 6), asset("a2", 6)];
const track1 = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const overlay = proj.tracks.find((t) => t.type === "video" && t.name === "Наложение")!;

const c1 = createVideoClip({ trackId: track1.id, asset: proj.assets[0], start: 0, duration: 5 });
c1.muted = true;
// LUT-микс + glow + bloom + световые лучи — 4 blend-цепочки на клипе.
c1.vfx = {
  lut: { enabled: true, preset: "film-noir", amount: 0.8 },
  glow: { enabled: true, radius: 14, strength: 0.7, threshold: 0.55 },
  bloom: { enabled: true, radius: 14, strength: 0.5, threshold: 0.72 },
  lightRays: { enabled: true, centerX: 0.5, centerY: 0.4, length: 0.6, strength: 0.6, rayCount: 8 },
} as any;

const c2 = createVideoClip({ trackId: overlay.id, asset: proj.assets[1], start: 0.5, duration: 4 });
c2.muted = true;
c2.blendMode = "screen";
c2.fitMode = "cover";
c2.opacity = { value: 0.8, keyframes: [] } as any;
(overlay.clips as any[]).push(c2);

track1.clips.push(c1);

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip: any) => (clip.assetId === "a1" ? "vA.mp4" : "vB.mp4"), {
  lightRays: [{ clipId: c1.id, path: "rays.png", strength: 0.6 }],
});

// Фильтр-граф должен содержать рабочее разрешение (1920x1080 обвязку).
const hasWorkWrap = /\]scale=1920:1080\[[^\]]*_wrd_/.test(compiled.filterComplex);
check("effectWork-обвязка 1920x1080 в графе", hasWorkWrap);
const hasBlendWrap = /bwa_|bwb_|bwu_/.test(compiled.filterComplex);
check("blendMode-оверлей тоже в рабочем разрешении", hasBlendWrap);

r = await ffmpeg("-f", "lavfi", "-i", "gradients=size=3840x2160:duration=0.1", "-frames:v", "1", "rays.png");
check("ген rays.png", r.code === 0);

await writeLutCubes({ writeFile, onLog: undefined as any } as any, compiled.lutFiles);

const args: string[] = [];
for (const input of compiled.inputs) {
  args.push(...input.pre, "-i", input.path);
}
args.push("-filter_complex", compiled.filterComplex);
if (compiled.videoMapLabel) args.push("-map", `[${compiled.videoMapLabel}]`);
args.push("-an");
args.push("-t", RENDER_SECONDS.toFixed(3));
args.push(...buildOutputArgs(proj.exportSettings, "out.mp4", compiled.totalDuration));

console.log(`\n=== рендер 4K (${RENDER_SECONDS}с — точка OOM была на 1-м кадре) ===`);
const t0 = Date.now();
r = await ffmpeg(...args);
const dt = ((Date.now() - t0) / 1000).toFixed(1);
check(`ffmpeg завершился без ошибок (${dt}с)`, r.code === 0, r.logs.filter((l) => /error|failed/i.test(l)).slice(-2).join(" | "));
check("нет «Out of memory»", !r.logs.some((l) => l.includes("Out of memory")));
check("нет «Conversion failed»", !r.logs.some((l) => l.includes("Conversion failed")));
check("есть закодированные кадры", r.logs.some((l) => /frame=\s*[1-9]/.test(l)), "frame= 0 во всех строках");

console.log(failures === 0 ? "\n✅ 4K VFX РЕНДЕР ПРОШЁЛ" : `\n❌ ПРОВАЛЕНО: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
