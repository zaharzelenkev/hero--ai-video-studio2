# FFmpeg Core Files

This directory should contain FFmpeg.wasm core files. They will be copied here automatically during `npm install` via the postinstall script.

If these files are missing, the app will fall back to loading FFmpeg.wasm from a CDN at runtime.

For production deployment, ensure the postinstall script runs successfully, or manually copy the files from `node_modules/@ffmpeg/core/dist/umd/` to this directory.
