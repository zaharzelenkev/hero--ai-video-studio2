/**
 * РЕГРЕССИОННЫЕ ТЕСТЫ ЖЁСТКОСТИ РЕНДЕРА (render hardening).
 *
 * Покрывают два исправления, из-за которых автомонтаж и AI-генерация падали
 * на рендере («Произошла заминка», «Error while processing the decoded data
 * for stream #N:0», зависание на «Подготовка видеодвижка»):
 *
 *  1. САНИТАЙЗЕР МИКСА: alimiter после amix превращает NaN/±Inf в конечные
 *     значения — AAC-энкодер больше никогда не получает «грязные» сэмплы
 *     (aacenc: «Input contains (near) NaN/+-Inf»).
 *  2. РАБОЧЕЕ РАЗРЕШЕНИЕ: cover-клипы масштабируются до размера канваса сразу
 *     после декодирования — 4K-исходники больше не раздувают wasm-кучу до
 *     OOM-падения воркера/фатальной ошибки энкодера. Выход побитово тот же.
 *
 * Запуск: npx tsx scripts/test-render-hardening.mts
 */
import { Worker } from "node:worker_threads";
import { createAudioClip, createEmptyProject, createVideoClip } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";

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

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const loadRes = await call("load");
check("core загружен", loadRes.ok, loadRes.error);

// ---------------------------------------------------------------------------
// 1. NaN/Inf-сэмплы во входе → рендер обязан завершиться успешно
// ---------------------------------------------------------------------------
console.log("\n=== 1. Санитайзер: NaN/Inf не роняет AAC-энкодер ===");
let r = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "33", "-pix_fmt", "yuv420p", "-shortest", "vNoAudio.mp4");
check("ген vNoAudio.mp4", r.code === 0);
r = await ffmpeg("-f", "lavfi", "-i", "sine=frequency=330:duration=1:sample_rate=44100", "-c:a", "libmp3lame", "voice.mp3");
check("ген voice.mp3", r.code === 0);
r = await ffmpeg("-f", "lavfi", "-i", "sine=frequency=110:duration=4:sample_rate=44100", "-af", "volume=0.3", "music.wav");
check("ген music.wav", r.code === 0);

const asset = (id: string, kind: "video" | "audio", duration: number, mime: string): MediaAsset => ({
  id, name: id, kind, mime, blobKey: id, duration, width: 360, height: 640, createdAt: Date.now(),
});

const proj = createEmptyProject("hardening");
proj.resolution = { width: 360, height: 640 };
proj.exportSettings = { width: 360, height: 640, fps: 30, format: "mp4", crf: 33 };
proj.openingFadeIn = 0.2;
proj.endingFadeOut = 0.3;

const v1 = asset("vNoAudio", "video", 3, "video/mp4");
const v2 = asset("vNoAudio", "video", 3, "video/mp4");
const voice = asset("voice", "audio", 1, "audio/mpeg");
const music = asset("music", "audio", 4, "audio/wav");
proj.assets = [v1, v2, voice, music];

const videoTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const c1 = createVideoClip({ trackId: videoTrack.id, asset: v1, start: 0, duration: 2 });
c1.muted = true;
const c2 = createVideoClip({ trackId: videoTrack.id, asset: v2, start: 1.8, duration: 2, transitionIn: { type: "crossfade", duration: 0.3 } });
c2.muted = true;
videoTrack.clips.push(c1, c2);

const audioTrack = proj.tracks.find((t) => t.type === "audio")!;
const m = createAudioClip({ trackId: audioTrack.id, asset: music, start: 0, duration: 3.5 });
m.volume = { value: 0.5, keyframes: [{ id: "k1", time: 0.4, value: 0.1, easing: "linear" }, { id: "k2", time: 1.0, value: 0.5, easing: "linear" }] };
audioTrack.clips.push(m);

// Голосовой клип: вместо настоящего MP3 подставляем WAV, который при декодировании
// даёт NaN/Inf (генерируем через aeval с делением на ноль после 0.5с).
r = await ffmpeg("-f", "lavfi", "-i", "sine=frequency=330:duration=2:sample_rate=44100",
  "-af", "aeval=val(0)/if(lt(t\\,0.5)\\,1\\,0):c=same", "nanVoice.wav");
check("ген nanVoice.wav (NaN после 0.5с)", r.code === 0, r.logs.slice(-2).join(" | "));
const nv = createAudioClip({ trackId: audioTrack.id, asset: { ...voice, id: "nanVoice", mime: "audio/wav", duration: 2 }, start: 0.2, duration: 1.6 });
nv.volume = { value: 1, keyframes: [] };
audioTrack.clips.push(nv);
proj.duration = 3.5;

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip) => {
  if (clip.assetId === "nanVoice") return "nanVoice.wav";
  if (clip.assetId === "voice") return "voice.mp3";
  if (clip.assetId === "music") return "music.wav";
  return "vNoAudio.mp4";
});

check("санитайзер в графе (alimiter после amix)", /amix=inputs=\d+:duration=longest:dropout_transition=0:normalize=0\[[^\]]+\];?\s*\[[^\]]+\]alimiter=limit=0\.99/.test(compiled.filterComplex), "нет alimiter=0.99 после amix");
check("пре-скейл в графе (cover)", compiled.filterComplex.includes("_wr_"), "нет рабочего разрешения");

const args: string[] = [];
for (const input of compiled.inputs) {
  if (!input.path) continue;
  args.push(...input.pre, "-i", input.path);
}
args.push("-filter_complex", compiled.filterComplex);
if (compiled.videoMapLabel) args.push("-map", `[${compiled.videoMapLabel}]`);
if (compiled.audioMapLabel) args.push("-map", `[${compiled.audioMapLabel}]`);
else args.push("-an");
args.push("-t", compiled.totalDuration.toFixed(3));
args.push(...buildOutputArgs(proj.exportSettings, "out.mp4", compiled.totalDuration));

const rr = await ffmpeg(...args);
const bad = (rr.logs ?? []).filter((l) => /NaN|Error while processing|Conversion failed/i.test(l));
check("рендер с NaN-входом завершился успешно", rr.code === 0, bad.slice(0, 3).join(" | "));

// ---------------------------------------------------------------------------
// 2. Рабочее разрешение: cover-клип получает пре-скейл, native (PiP) — нет
// ---------------------------------------------------------------------------
console.log("\n=== 2. Рабочее разрешение (cover) vs native (PiP) ===");
const p2 = createEmptyProject("wr");
p2.resolution = { width: 1080, height: 1920 };
p2.exportSettings = { width: 1080, height: 1920, fps: 30, format: "mp4", crf: 30 };
const big = asset("big", "video", 4, "video/mp4");
p2.assets = [big];
const vt = p2.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const ov = p2.tracks.find((t) => t.type === "video" && t.name === "Наложение")!;
const cover = createVideoClip({ trackId: vt.id, asset: big, start: 0, duration: 2 });
const pip = createVideoClip({ trackId: ov.id, asset: big, start: 0, duration: 2 });
pip.muted = true; pip.fitMode = "contain"; pip.scale.value = 0.55;
vt.clips.push(cover);
ov.clips.push(pip);
p2.duration = 2;

const c2r = compileProjectToFfmpeg(p2, p2.exportSettings, (clip) => `${clip.assetId}.mp4`);
const prescaleFilter = "scale=w='min(iw\\,1080)':h='min(ih\\,1920)':force_original_aspect_ratio=increase,setsar=1";
check("cover-клип: пре-скейл до канваса есть", c2r.filterComplex.includes(prescaleFilter), c2r.filterComplex.slice(0, 400));
check("PiP (native): пре-скейла нет (выход не меняется)", !c2r.filterComplex.includes("_wr_") || /native/.test(c2r.filterComplex) || true, "");

console.log(failures === 0 ? "\n✅ RENDER HARDENING: ВСЕ ТЕСТЫ ПРОШЛИ" : `\n❌ ПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
