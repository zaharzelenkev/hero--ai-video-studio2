/**
 * MOTION GRAPHICS · СКВОЗНОЙ РЕНДЕР-ТЕСТ.
 *
 * Собирает проект с 7 видами моушн-графики (title, lowerThird, progressBar,
 * cta, kinetic, trackingText, outro) и РЕНДЕРИТ его настоящим ffmpeg.wasm
 * (тем же ядром, что в браузере): drawtext-слои, drawbox, PNG-оверлеи
 * панелей, fade/crop/overlay-цепочки. Затем проверяет кадры: тёмная
 * полноэкранная подложка outro и плашка lower third реально попали в видео.
 *
 * Запуск: npm run test:motion-ffmpeg
 */

import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";
import { createMotionGraphicClip, MG_KINDS } from "../src/lib/motionGraphics";
import type { MediaAsset } from "../src/lib/types";

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
async function ffmpeg(...args: string[]): Promise<{ code: number; logs: string[] }> {
  const r = await call("exec", { args });
  return { code: r.code ?? -1, logs: r.logs ?? [] };
}
const writeFile = (name: string, data: Uint8Array) => call("writeFile", { name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
const readFile = async (name: string) => new Uint8Array((await call("readFile", { name })).data ?? new ArrayBuffer(0));

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const W = 640;
const H = 360;
const FPS = 15;

console.log("=== загрузка @ffmpeg/core ===");
const loadRes = await call("load");
check("core загружен", loadRes.ok, loadRes.error);

console.log("\n=== исходники ===");
let r = await ffmpeg("-f", "lavfi", "-i", `testsrc2=size=${W}x${H}:rate=${FPS}:duration=27`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-an", "a1.mp4");
check("ген city.mp4", r.code === 0, r.logs.slice(-2).join(" | "));

// PNG-панели, которые «рисует» canvas-рендерер (в тесте их генерирует ffmpeg).
// Двухпроходный подход: сначала собираем все spec панелей, затем генерируем
// PNG нужного размера/цвета и компилируем повторно с настоящими файлами.
const panelPngs = new Map<string, { path: string; png: Uint8Array }>();
async function ensurePanelPng(spec: { x: number; y: number; w: number; h: number; bg: string; alpha: number }): Promise<string> {
  const key = `${spec.x},${spec.y},${spec.w},${spec.h},${spec.bg},${spec.alpha}`;
  if (panelPngs.has(key)) return panelPngs.get(key)!.path;
  const name = `panel_${panelPngs.size}.png`;
  const rr = await ffmpeg(
    "-f", "lavfi",
    "-i", `color=c=${spec.bg}@${spec.alpha.toFixed(2)}:size=${Math.max(2, Math.round(spec.w))}x${Math.max(2, Math.round(spec.h))}`,
    "-frames:v", "1", "-c:v", "png", name,
  );
  if (rr.code !== 0) throw new Error(`panel gen failed: ${rr.logs.slice(-2).join(" | ")}`);
  const png = await readFile(name);
  panelPngs.set(key, { path: name, png });
  return name;
}
const collectedSpecs: { x: number; y: number; w: number; h: number; bg: string; alpha: number }[] = [];

// Шрифты — те же, что монтируются в браузере.
const fontDir = "public/fonts/";
for (const f of ["DejaVuSans.ttf", "Montserrat-Bold.ttf"]) {
  await writeFile(f, readFileSync(`${fontDir}${f}`));
}

console.log("\n=== проект с моушн-графикой ===");
const asset: MediaAsset = { id: "a1", name: "city", kind: "video", mime: "video/mp4", blobKey: "a1", duration: 26, width: W, height: H, createdAt: Date.now() };
const proj = createEmptyProject("mg-e2e");
proj.resolution = { width: W, height: H };
proj.exportSettings = { width: W, height: H, fps: FPS, format: "mp4", crf: 30 };
proj.assets = [asset];
proj.duration = 26;
const videoTrack = proj.tracks.find((t) => t.type === "video")!;
const base = createVideoClip({ trackId: videoTrack.id, asset, start: 0, duration: 26, inPoint: 0, outPoint: 26 });
base.muted = true;
videoTrack.clips = [base];

const textTrack = { id: "mg_track", type: "text" as const, name: "Титры", clips: [], hidden: false, muted: false, locked: false };
const plan: { kind: (typeof MG_KINDS)[number]["id"]; at: number; text?: string }[] = [
  { kind: "title", at: 0, text: "Заголовок" },
  { kind: "lowerThird", at: 2.5, text: "Алексей" },
  { kind: "progressBar", at: 6.5, text: "Загрузка" },
  { kind: "cta", at: 10, text: "Подписаться" },
  { kind: "kinetic", at: 13.5, text: "Кинетическая типографика" },
  { kind: "trackingText", at: 17.5, text: "Бегущая строка" },
  { kind: "outro", at: 21, text: "Спасибо!" },
];
for (const p of plan) {
  const clip = createMotionGraphicClip({ trackId: textTrack.id, start: p.at, kind: p.kind, text: p.text });
  if (p.kind === "progressBar") {
    clip.motionGraphic!.progress = { value: 0, keyframes: [{ id: "k1", time: 0, value: 0, easing: "linear" }, { id: "k2", time: clip.duration, value: 1, easing: "linear" }] };
  }
  textTrack.clips.push(clip);
}
proj.tracks = [...proj.tracks, textTrack];

let overlayCalls = 0;
const fileNameFor = (c: { assetId: string }) => `${c.assetId}.mp4`;
// Первый проход компиляции: собираем spec всех панелей моушн-графики.
const compiledFirst = compileProjectToFfmpeg(proj, proj.exportSettings, fileNameFor, {
  renderMgOverlay: (clip, W2, H2, spec) => {
    collectedSpecs.push({ x: spec.x, y: spec.y, w: spec.w, h: spec.h, bg: spec.bg, alpha: spec.alpha });
    return null;
  },
  measureText: (text, px) => text.length * px * 0.6,
});
void compiledFirst;
let compiled: ReturnType<typeof compileProjectToFfmpeg>;
{
  // Второй проход: генерируем PNG для каждого собранного spec.
  for (const spec of collectedSpecs) {
    await ensurePanelPng(spec);
  }
  compiled = compileProjectToFfmpeg(proj, proj.exportSettings, fileNameFor, {
    renderMgOverlay: (clip, W2, H2, spec) => {
      const key = `${spec.x},${spec.y},${spec.w},${spec.h},${spec.bg},${spec.alpha}`;
      const entry = panelPngs.get(key);
      if (!entry) return null;
      overlayCalls += 1;
      return { path: entry.path, png: entry.png };
    },
    measureText: (text, px) => text.length * px * 0.6,
  });
}

const fc = compiled.filterComplex;
console.log("\n=== проверки filter_complex ===");
for (const l of fc.split(";")) {
  if (l.includes("bg_") || (l.includes("overlay") && l.includes("21."))) console.log("DBG:", l.slice(0, 260));
}
check("drawtext в графе", fc.includes("drawtext"));
check("drawbox в графе", fc.includes("drawbox"));
check("overlay в графе", fc.includes("overlay="));
check("fade с alpha=1 (панели)", fc.includes("alpha=1"));
check("crop (заливка прогресс-бара)", fc.includes("crop=w="));
check("проценты прогресс-бара (%{eif)", fc.includes("%{eif"));
check("enable between (окна клипов)", fc.includes("enable='between"));
check("нет мусора в графе", !/undefined|NaN/.test(fc), fc.slice(0, 300));
check("PNG-панели запрошены", overlayCalls > 0, `overlayCalls=${overlayCalls}`);
check("overlayFiles собраны", compiled.overlayFiles.length > 0);

console.log("\n=== реальный рендер ===");
const args: string[] = [];
for (const input of compiled.inputs) {
  args.push(...input.pre, "-i", input.path);
}
for (const f of compiled.overlayFiles) {
  await writeFile(f.path, f.png);
}
args.push("-filter_complex", compiled.filterComplex);
args.push("-map", `[${compiled.videoMapLabel}]`, "-an");
args.push("-t", String(compiled.totalDuration.toFixed(3)));
args.push(...buildOutputArgs(proj.exportSettings, "mg_out.mp4", compiled.totalDuration));
r = await ffmpeg(...args);
check("рендер MP4 с моушн-графикой", r.code === 0, r.logs.slice(-3).join(" | "));
if (r.code !== 0) console.log("LOGS:\n" + r.logs.slice(-30).join("\n"));

const outSize = (await readFile("mg_out.mp4")).length;
check("выходной файл непустой", outSize > 10_000, `bytes=${outSize}`);

// Длительность.
r = await ffmpeg("-i", "mg_out.mp4", "-f", "null", "-");
const durLine = (r.logs.find((l) => l.includes("Duration:")) ?? "").match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
const secs = durLine ? Number(durLine[1]) * 3600 + Number(durLine[2]) * 60 + Number(durLine[3]) : 0;
check("длительность ≈ 26с", Math.abs(secs - 26) < 1.5, `duration=${secs}`);

function frameMean(frame: Uint8Array, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += frame[y * W + x] ?? 0;
      count++;
    }
  }
  return count ? sum / count : 255;
}
async function extractFrame(n: number, name: string): Promise<Uint8Array> {
  const rr = await ffmpeg("-i", "mg_out.mp4", "-vf", `select='eq(n,${n})'`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", `${name}.raw`);
  return readFile(`${name}.raw`);
}

console.log("\n=== проверка кадров (моушн-графика реально в кадре) ===");
// Кадр на outro (22с, fade завершён): полноэкранная тёмная подложка.
const outroRaw = await extractFrame(Math.round(22 * FPS), "outro");
check("извлечён кадр outro", outroRaw.length === W * H, `len=${outroRaw.length}`);
const outroMean = frameMean(outroRaw, 0, 0, W, H);
check(`outro тёмный (mean=${outroMean.toFixed(1)} < 40)`, outroMean < 40, `mean=${outroMean.toFixed(1)}`);

// Кадр на lower third (4с): плашка в зоне x∈[60,260], y∈[260,320].
const ltRaw = await extractFrame(Math.round(4 * FPS), "lt");
check("извлечён кадр lower third", ltRaw.length === W * H);
const ltMean = frameMean(ltRaw, 60, 260, 260, 320);

// Кадр на title (1с): центральная плашка заголовка.
const titleRaw = await extractFrame(Math.round(1 * FPS), "title");
check("извлечён кадр title", titleRaw.length === W * H);
const titleMean = frameMean(titleRaw, 120, 100, 520, 220);
check(`title плашка заметна (mean=${titleMean.toFixed(1)} < 105)`, titleMean < 105, `mean=${titleMean.toFixed(1)}`);

// Контроль: тот же кадр title (1с), но зоны без моушн-графики:
// правый верхний угол и нижняя полоса вне плашки lower third.
const ctrlCorner = frameMean(titleRaw, 540, 0, W, 80);
check(`контрольный угол яркий (mean=${ctrlCorner.toFixed(1)} > 80)`, ctrlCorner > 80, `mean=${ctrlCorner.toFixed(1)}`);
// Сравнение lower third: та же зона без плашки (в кадре title её нет) vs с плашкой (в кадре lt).
const ltCtrl = frameMean(titleRaw, 60, 260, 260, 320);
check(`lower third затемняет плашку (${ltMean.toFixed(1)} < ${ltCtrl.toFixed(1)} - 25)`, ltMean < ltCtrl - 25, `lt=${ltMean.toFixed(1)} ctrl=${ltCtrl.toFixed(1)}`);

worker.terminate();
console.log(failures === 0 ? "\nMotion Graphics FFmpeg: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ✔" : `\nMotion Graphics FFmpeg: ${failures} ПРОВАЛОВ ✘`);
process.exit(failures === 0 ? 0 : 1);
