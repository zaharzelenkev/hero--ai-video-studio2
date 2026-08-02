import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import { compileProjectToFfmpeg } from "../src/lib/filterGraph";
import { defaultVfxSettings, type MediaAsset } from "../src/lib/types";
import {
  applyChromaKeyPixels,
  applyLutPixels,
  changedByteCount,
  distortLensPixels,
  inpaintObjectPixels,
  motionBlurWeights,
  processVfxPixels,
} from "../src/lib/editor/vfx";

function check(label: string, condition: boolean, details = "") {
  if (!condition) throw new Error(`VFX FAIL: ${label}${details ? ` — ${details}` : ""}`);
  console.log(`✓ ${label}`);
}

function makeGradient(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = (x * 17 + y * 3) % 256;
      data[i + 1] = (y * 21 + x * 5) % 256;
      data[i + 2] = (x * 9 + y * 13) % 256;
      data[i + 3] = 255;
    }
  }
  return data;
}

const width = 24;
const height = 16;
const base = makeGradient(width, height);
const defaults = defaultVfxSettings();

const chromaInput = new Uint8ClampedArray(base);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    if (x < 8 || x > 15) {
      chromaInput[i] = 0;
      chromaInput[i + 1] = 255;
      chromaInput[i + 2] = 0;
    } else {
      chromaInput[i] = 220;
      chromaInput[i + 1] = 40;
      chromaInput[i + 2] = 30;
    }
  }
}
const keyed = applyChromaKeyPixels(chromaInput, width, height, { enabled: true, color: "#00ff00", similarity: 0.12, blend: 0.08 });
check("Chroma Key removes the selected color", keyed[3] < 16 && keyed[(8 * 4) + 3] === 255);

const backgroundInput = new Uint8ClampedArray(base);
for (let i = 0; i < backgroundInput.length; i += 4) {
  backgroundInput[i] = 20;
  backgroundInput[i + 1] = 30;
  backgroundInput[i + 2] = 40;
  backgroundInput[i + 3] = 255;
}
for (let y = 5; y < 11; y += 1) {
  for (let x = 8; x < 16; x += 1) {
    const i = (y * width + x) * 4;
    backgroundInput[i] = 230;
    backgroundInput[i + 1] = 80;
    backgroundInput[i + 2] = 50;
  }
}
const backgroundSettings = { ...defaults.backgroundRemoval, enabled: true, mode: "color" as const, sampleColor: "#141e28", threshold: 0.08, softness: 0.04, edgeBlur: 0 };
const removedBackground = processVfxPixels(backgroundInput, width, height, { ...defaults, backgroundRemoval: backgroundSettings });
check("Background Removal creates a transparent connected matte", removedBackground[3] < 10 && removedBackground[(8 * width + 8) * 4 + 3] > 220);

const objectInput = new Uint8ClampedArray(base);
const objectOriginal = objectInput.slice();
for (let y = 5; y < 11; y += 1) for (let x = 9; x < 15; x += 1) {
  const i = (y * width + x) * 4;
  objectInput[i] = 255;
  objectInput[i + 1] = 0;
  objectInput[i + 2] = 255;
}
const objectRemoved = inpaintObjectPixels(objectInput, width, height, { ...defaults.objectRemoval, enabled: true, x: 9 / width, y: 5 / height, width: 6 / width, height: 6 / height, iterations: 16 });
check("Object Removal inpaints the selected region", changedByteCount(objectInput, objectRemoved) > 30 && objectRemoved[(7 * width + 11) * 4] !== 255);

const cases: Array<[string, ReturnType<typeof defaultVfxSettings>]> = [
  ["Motion Blur kernel", defaults],
  ["Film Grain", { ...defaults, filmGrain: { ...defaults.filmGrain, enabled: true } }],
  ["Lens Distortion", { ...defaults, lensDistortion: { enabled: true, amount: 0.55 } }],
  ["Sharpen", { ...defaults, sharpen: { enabled: true, amount: 0.8 } }],
  ["Noise Reduction", { ...defaults, noiseReduction: { enabled: true, amount: 0.75 } }],
  ["LUT Pipeline", { ...defaults, lutPipeline: { enabled: true, preset: "teal-orange", intensity: 1 } }],
];
for (const [label, settings] of cases.slice(1)) {
  const result = processVfxPixels(base, width, height, settings, { seed: 17 });
  check(label, changedByteCount(base, result) > 0);
}
check("Motion Blur has normalized temporal samples", motionBlurWeights(12).length === 12 && Math.abs(motionBlurWeights(12).reduce((a, b) => a + b, 0) - 1) < 0.0001);
check("Lens distortion remaps pixels", changedByteCount(base, distortLensPixels(base, width, height, -0.4)) > 0);
const lut = applyLutPixels(base, width, height, "bw", 1);
check("LUT transform changes RGB values", changedByteCount(base, lut) > 0);

const project = createEmptyProject("VFX smoke test");
const asset: MediaAsset = { id: "asset-vfx", name: "fixture.mp4", kind: "video", mime: "video/mp4", blobKey: "fixture", duration: 4, width: 640, height: 360, createdAt: Date.now() };
project.assets.push(asset);
const baseClip = createVideoClip({ trackId: project.tracks[0].id, asset, start: 0, duration: 4 });
baseClip.muted = true;
baseClip.motionBlur = { enabled: true, samples: 8, shutterAngle: 240 };
baseClip.effects = ["background-removal", "object-removal", "motion-blur", "glow", "light-rays", "film-grain", "lens-distortion", "bloom", "sharpen", "noise-reduction", "vignette", "lut-pipeline"];
baseClip.vfx = {
  ...defaults,
  backgroundRemoval: { ...defaults.backgroundRemoval, enabled: true, mode: "color", sampleColor: "#141e28" },
  objectRemoval: { ...defaults.objectRemoval, enabled: true },
  glow: { ...defaults.glow, enabled: true },
  lightRays: { ...defaults.lightRays, enabled: true },
  filmGrain: { ...defaults.filmGrain, enabled: true },
  lensDistortion: { enabled: true, amount: 0.2 },
  bloom: { ...defaults.bloom, enabled: true },
  sharpen: { enabled: true, amount: 0.4 },
  noiseReduction: { enabled: true, amount: 0.25 },
  vignette: { ...defaults.vignette, enabled: true },
  lutPipeline: { enabled: true, preset: "cinematic", intensity: 0.7 },
};
project.tracks[0].clips.push(baseClip);
const overlayClip = createVideoClip({ trackId: project.tracks[1].id, asset, start: 0.5, duration: 2 });
overlayClip.muted = true;
overlayClip.blendMode = "screen";
project.tracks[1].clips.push(overlayClip);
project.duration = 4;
const compiled = compileProjectToFfmpeg(project, project.exportSettings, () => "fixture.mp4");
for (const token of ["colorkey", "delogo", "tmix", "gblur", "geq", "noise=", "lenscorrection", "unsharp", "hqdn3d", "vignette", "maskedmerge", "all_mode=screen"]) {
  check(`FFmpeg export contains ${token}`, compiled.filterComplex.includes(token));
}
check("Composite Layers exports all video inputs", compiled.inputs.length >= 2);
console.log("All VFX smoke tests passed.");
