// Воркер: запускает @ffmpeg/core (полнофункциональный ffmpeg.wasm, тот же, что в браузере)
// внутри worker_threads — тут разрешён Atomics.wait, необходимый pthreads-сборке.
import { parentPort } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

// Минимальная браузерная среда для UMD-обёртки
globalThis.self = globalThis;

const corePath = resolve("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js");
const wasmPath = resolve("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm");
const mod = await import(pathToFileURL(corePath).href);
const createCore = mod.default ?? mod;

parentPort.on("message", async (msg) => {
  const { id, type, payload } = msg;
  try {
    if (type === "load") {
      // UMD-обёртка ждёт URL с base64-суффиксом {wasmURL, workerURL} после '#'.
      const suffix = Buffer.from(JSON.stringify({ wasmURL: wasmPath, workerURL: corePath })).toString("base64");
      globalThis.__core = await createCore({
        mainScriptUrlOrBlob: `${corePath}#${suffix}`,
      });
      globalThis.__logs = [];
      globalThis.__core.setLogger(({ message }) => {
        globalThis.__logs.push(message);
        if (globalThis.__logs.length > 600) globalThis.__logs.shift();
      });
      parentPort.postMessage({ id, ok: true });
    } else if (type === "writeFile") {
      globalThis.__core.FS.writeFile(payload.name, new Uint8Array(payload.data));
      parentPort.postMessage({ id, ok: true });
    } else if (type === "readFile") {
      const data = globalThis.__core.FS.readFile(payload.name);
      parentPort.postMessage({ id, ok: true, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
    } else if (type === "exec") {
      globalThis.__logs = [];
      const code = await globalThis.__core.exec(...payload.args);
      parentPort.postMessage({ id, ok: code === 0, code, logs: globalThis.__logs.slice() });
    } else if (type === "exists") {
      let ok = true;
      try { globalThis.__core.FS.readFile(payload.name); } catch { ok = false; }
      parentPort.postMessage({ id, ok: true, exists: ok });
    } else if (type === "delete") {
      try { globalThis.__core.FS.unlink(payload.name); } catch { /* ignore */ }
      parentPort.postMessage({ id, ok: true });
    }
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: String(e && e.message ? e.message : e), stack: e && e.stack ? String(e.stack).slice(0, 1500) : undefined });
  }
});
