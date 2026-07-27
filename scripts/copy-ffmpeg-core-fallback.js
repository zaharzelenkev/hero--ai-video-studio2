// Fallback script for copying FFmpeg core files
// This uses CommonJS syntax for better compatibility

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const destDir = path.join(__dirname, '..', 'public', 'ffmpeg');

if (!fs.existsSync(srcDir)) {
  console.warn(
    '[copy-ffmpeg-core-fallback] @ffmpeg/core not found in node_modules - skipping. ' +
    'The app will fall back to loading the engine from a CDN at runtime.'
  );
  process.exit(0);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

try {
  const files = fs.readdirSync(srcDir);
  for (const file of files) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
  console.log(`[copy-ffmpeg-core-fallback] copied ${files.length} file(s) into public/ffmpeg/`);
} catch (error) {
  console.error('[copy-ffmpeg-core-fallback] Error copying files:', error.message);
  process.exit(0); // Exit gracefully - app will use CDN fallback
}