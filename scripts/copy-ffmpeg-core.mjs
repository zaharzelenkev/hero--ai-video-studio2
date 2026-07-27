// Runs automatically after `npm install` (see package.json "postinstall").
// Copies the @ffmpeg/core WASM engine out of node_modules into public/ffmpeg,
// so the browser loads it from our own domain instead of an external CDN.
// This is what makes video generation/export work reliably regardless of
// whether a visitor's network can reach unpkg.com or similar CDNs.
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "..", "node_modules", "@ffmpeg", "core", "dist", "umd");
const destDir = path.join(__dirname, "..", "public", "ffmpeg");

if (!existsSync(srcDir)) {
  console.warn(
    "[copy-ffmpeg-core] @ffmpeg/core not found in node_modules - skipping. " +
      "The app will fall back to loading the engine from a CDN at runtime.",
  );
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
const files = readdirSync(srcDir);
for (const file of files) {
  copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}
console.log(`[copy-ffmpeg-core] copied ${files.length} file(s) into public/ffmpeg/`);
