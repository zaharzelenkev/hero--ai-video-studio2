/** Real ffmpeg.wasm render smoke test for the complete VFX stack. */
import { Worker } from "node:worker_threads";
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";
import { defaultVfxSettings, type MediaAsset } from "../src/lib/types";

interface Reply { id: number; ok: boolean; code?: number; data?: ArrayBuffer; logs?: string[]; error?: string }
const worker = new Worker("./scripts/ffmpeg-node-worker.mjs", { type: "module" });
let requestId = 0;
const pending = new Map<number, (reply: Reply) => void>();
worker.on("message", (reply: Reply) => {
  const resolve = pending.get(reply.id);
  if (resolve) {
    pending.delete(reply.id);
    resolve(reply);
  }
});
worker.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
const call = (type: string, payload: Record<string, unknown> = {}) => new Promise<Reply>((resolve) => {
  const id = ++requestId;
  pending.set(id, resolve);
  worker.postMessage({ id, type, payload });
});
const ffmpeg = async (...args: string[]) => call("exec", { args });
const fail = (message: string): never => {
  console.error(`VFX render FAIL: ${message}`);
  process.exit(1);
};

const loaded = await call("load");
if (!loaded.ok) fail(loaded.error ?? "ffmpeg core did not load");
const source = await ffmpeg("-f", "lavfi", "-i", "testsrc2=size=320x180:rate=12:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "fixture-vfx.mp4");
if (source.code !== 0) fail((source.logs ?? []).slice(-5).join(" | "));

const project = createEmptyProject("VFX render");
project.resolution = { width: 320, height: 180 };
project.exportSettings = { width: 320, height: 180, fps: 12, format: "mp4", crf: 30 };
const asset: MediaAsset = { id: "fixture-vfx", name: "fixture-vfx.mp4", kind: "video", mime: "video/mp4", blobKey: "fixture-vfx.mp4", duration: 4, width: 320, height: 180, createdAt: Date.now() };
project.assets = [asset];
const defaults = defaultVfxSettings();
const base = createVideoClip({ trackId: project.tracks[0].id, asset, start: 0, duration: 4 });
base.muted = true;
base.motionBlur = { enabled: true, samples: 4, shutterAngle: 180 };
base.effects = ["background-removal", "object-removal", "motion-blur", "glow", "light-rays", "film-grain", "lens-distortion", "bloom", "sharpen", "noise-reduction", "vignette", "lut-pipeline"];
base.vfx = {
  ...defaults,
  backgroundRemoval: { ...defaults.backgroundRemoval, enabled: true, mode: "color", sampleColor: "#00ff00", threshold: 0.01 },
  objectRemoval: { ...defaults.objectRemoval, enabled: true, x: 0.42, y: 0.35, width: 0.12, height: 0.2 },
  glow: { ...defaults.glow, enabled: true },
  lightRays: { ...defaults.lightRays, enabled: true },
  filmGrain: { ...defaults.filmGrain, enabled: true },
  lensDistortion: { enabled: true, amount: 0.12 },
  bloom: { ...defaults.bloom, enabled: true },
  sharpen: { enabled: true, amount: 0.25 },
  noiseReduction: { enabled: true, amount: 0.2 },
  vignette: { ...defaults.vignette, enabled: true },
  lutPipeline: { enabled: true, preset: "cinematic", intensity: 0.5 },
};
project.tracks[0].clips.push(base);
const overlay = createVideoClip({ trackId: project.tracks[1].id, asset, start: 0.5, duration: 2 });
overlay.muted = true;
overlay.blendMode = "screen";
project.tracks[1].clips.push(overlay);
project.duration = 4;

const compiled = compileProjectToFfmpeg(project, project.exportSettings, () => "fixture-vfx.mp4");
const args: string[] = [];
for (const input of compiled.inputs) args.push(...input.pre, "-i", input.path);
args.push("-filter_complex", compiled.filterComplex, "-map", `[${compiled.videoMapLabel}]`, "-an", "-t", "4", ...buildOutputArgs(project.exportSettings, "vfx-out.mp4"));
const rendered = await ffmpeg(...args);
if (rendered.code !== 0) fail((rendered.logs ?? []).slice(-12).join(" | "));
const frame = await ffmpeg("-i", "vfx-out.mp4", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "vfx-frame.raw");
if (frame.code !== 0) fail((frame.logs ?? []).slice(-5).join(" | "));
const raw = await call("readFile", { name: "vfx-frame.raw" });
if (!raw.data || raw.data.byteLength < 320 * 180 * 3) fail("rendered frame is missing");
const bytes = new Uint8Array(raw.data);
let sum = 0;
for (let i = 0; i < bytes.length; i += 13) sum += bytes[i];
const mean = sum / Math.ceil(bytes.length / 13);
if (mean < 8) fail(`rendered frame is unexpectedly black (mean=${mean.toFixed(2)})`);
console.log(`✓ ffmpeg rendered full VFX stack; frame mean=${mean.toFixed(2)}`);
console.log("All VFX export passes are syntactically valid and render successfully.");
await worker.terminate();
