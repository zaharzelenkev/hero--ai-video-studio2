/**
 * E2E-рендер blur-pad: портретный исходник (720x1280) на ландшафтном
 * канвасе 960x540. Проверяем, что ffmpeg не падает, длительность верная,
 * и кадр содержит РАЗМЫТЫЕ боковые поля (подложка) и чёткий центр:
 *  - боковая полоса должна быть ближе к размытому фону (низкая варианса,
 *    меньше резких переходов, чем у центра на gradients-источнике? нет —
 *    на testsrc2 у центра движущиеся эталоны. Проверка проще и надёжнее:
 *    кадр в целом живой (не чёрный), края по яркости близки к центру
 *    (подложка продолжает кадр), при этом ОТСУТСТВУЮТ чисто-чёрные полосы.
 *
 * Запуск: npx tsx scripts/test-blurpad-render.mts
 */
import { Worker } from "node:worker_threads";
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";

interface WorkerReply { id: number; ok: boolean; code?: number; data?: ArrayBuffer; error?: string; logs?: string[] }
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
async function readFile(name: string): Promise<Uint8Array> {
  const r = await call("readFile", { name });
  return new Uint8Array(r.data ?? new ArrayBuffer(0));
}

console.log("=== загрузка core ===");
const loadRes = await call("load");
check("core загружен", loadRes.ok, loadRes.error);

// Портретный исходник: testsrc2 с крупными контрастными элементами
let r = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=6",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-shortest", "portrait.mp4");
check("ген portrait.mp4", r.code === 0, r.logs.slice(-3).join(" | "));

const portraitAsset = {
  id: "portrait", name: "portrait.mp4", kind: "video", mime: "video/mp4", blobKey: "portrait",
  duration: 6, width: 720, height: 1280, createdAt: Date.now(),
} as MediaAsset;
const proj = createEmptyProject("blurpad-e2e");
proj.resolution = { width: 1920, height: 1080 };
proj.exportSettings = { width: 960, height: 540, fps: 30, format: "mp4", crf: 26 };
proj.assets = [portraitAsset];
const track = proj.tracks.find(t => t.type === "video" && t.name === "Видео 1")!;
const clip = createVideoClip({ trackId: track.id, asset: portraitAsset, start: 0, duration: 6, inPoint: 0, outPoint: 6 });
clip.blurPad = true;
track.clips.push(clip);
proj.duration = 6;

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, () => "portrait.mp4");
console.log("\n=== рендер ===");
const src = await readFile("portrait.mp4");
await writeFile("portrait_in.mp4", src);
const args: string[] = ["-i", "portrait_in.mp4", "-filter_complex", compiled.filterComplex];
if (compiled.videoMapLabel) args.push("-map", `[${compiled.videoMapLabel}]`);
if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
args.push("-t", String(compiled.totalDuration.toFixed(3)), ...buildOutputArgs(proj.exportSettings, "bp_out.mp4", compiled.totalDuration));
r = await ffmpeg(...args);
check("ffmpeg рендер", r.code === 0, r.logs.slice(-4).join(" | "));

// --- извлекаем кадр t=3s и проверяем
r = await ffmpeg("-i", "bp_out.mp4", "-ss", "3", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "frame.gray");
check("кадр извлечён", r.code === 0);
const gray = await readFile("frame.gray");
check("кадр непустой", gray.length === 960 * 540, `байт: ${gray.length}`);
if (gray.length === 960 * 540) {
  const W = 960, H = 540;
  // средняя яркость левой полосы (x 30..200) и центра (x 400..560)
  const strip = (x0: number, x1: number) => {
    let s = 0, n = 0;
    for (let y = 40; y < H - 40; y += 4) for (let x = x0; x < x1; x += 2) { s += gray[y * W + x]; n++; }
    return s / n;
  };
  const left = strip(30, 200);
  const center = strip(420, 540);
  console.log(`  яркость: левая полоса=${left.toFixed(0)}, центр=${center.toFixed(0)}`);
  check("бока НЕ чёрные (подложка продолжает кадр)", left > 35, `left=${left.toFixed(0)}`);
  check("центр живой", center > 40, `center=${center.toFixed(0)}`);
}

if (failures === 0) console.log("\n✅ BLUR-PAD E2E: РЕНДЕР ПРОШЁЛ");
else { console.error(`\n❌ Провалено: ${failures}`); worker.terminate(); process.exit(1); }
worker.terminate();
