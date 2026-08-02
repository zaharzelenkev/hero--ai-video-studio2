// Copies the MediaPipe Face Detection runtime (JS loader + WASM + model weights)
// out of node_modules into public/mediapipe, so the browser loads it from our own
// domain instead of an external CDN (same pattern as scripts/copy-ffmpeg-core.mjs).
// The analyzer uses it as a lazy-loaded, always-available face detection engine —
// the native window.FaceDetector API is missing in most browsers (Firefox/Safari/Chrome by default).
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "..", "node_modules", "@mediapipe", "face_detection");
const destDir = path.join(__dirname, "..", "public", "mediapipe", "face_detection");

if (!existsSync(srcDir)) {
  console.warn(
    "[copy-mediapipe] @mediapipe/face_detection not found in node_modules - skipping. " +
      "Face-aware auto-framing will fall back to native FaceDetector or heuristics.",
  );
  process.exit(0);
}

const NEEDED = [
  "face_detection.js",
  "face_detection_short.binarypb",
  "face_detection_short_range.tflite",
  "face_detection_solution_simd_wasm_bin.js",
  "face_detection_solution_simd_wasm_bin.wasm",
  "face_detection_solution_simd_wasm_bin.data",
  "face_detection_solution_wasm_bin.js",
  "face_detection_solution_wasm_bin.wasm",
];

mkdirSync(destDir, { recursive: true });
let copied = 0;
for (const file of NEEDED) {
  const src = path.join(srcDir, file);
  if (existsSync(src)) {
    copyFileSync(src, path.join(destDir, file));
    copied++;
  }
}

// Также копируем WASM-рантайм @mediapipe/tasks-vision — он нужен VFX-блоку
// (удаление фона SelfieSegmenter, AI-выделение объекта InteractiveSegmenter).
// Модели (.tflite) грузятся с публичного Google CDN при первом использовании.
const tasksSrcDir = path.join(__dirname, "..", "node_modules", "@mediapipe", "tasks-vision", "wasm");
const tasksDestDir = path.join(__dirname, "..", "public", "mediapipe", "tasks-vision", "wasm");
if (existsSync(tasksSrcDir)) {
  mkdirSync(tasksDestDir, { recursive: true });
  let tasksCopied = 0;
  for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
    const src = path.join(tasksSrcDir, file);
    if (existsSync(src)) {
      copyFileSync(src, path.join(tasksDestDir, file));
      tasksCopied++;
    }
  }
  console.log(`[copy-mediapipe] copied ${tasksCopied} file(s) into public/mediapipe/tasks-vision/wasm/`);
}

console.log(`[copy-mediapipe] copied ${copied} file(s) into public/mediapipe/face_detection/`);
