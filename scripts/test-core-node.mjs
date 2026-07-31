import { Worker } from "node:worker_threads";

const w = new Worker("./scripts/ffmpeg-node-worker.mjs", { type: "module" });
let idc = 0;
const pend = new Map();
w.on("message", (m) => { const p = pend.get(m.id); if (p) { pend.delete(m.id); p(m); } });
w.on("error", (e) => { console.error("worker error", e); process.exit(1); });
const call = (type, payload) => new Promise((res) => { const id = ++idc; pend.set(id, res); w.postMessage({ id, type, payload }); });

console.log("loading core...");
let r = await call("load", {});
console.log("load:", JSON.stringify(r));
if (r.stack) console.log("stack:", r.stack);
r = await call("exec", { args: ["-version"] });
console.log("version exec:", JSON.stringify(r));
r = await call("exec", { args: ["-f", "lavfi", "-i", "color=c=red:s=320x240:d=1:r=30", "-pix_fmt", "yuv420p", "-y", "test.mp4"] });
console.log("render:", JSON.stringify(r));
r = await call("exists", { name: "test.mp4" });
console.log("exists:", JSON.stringify(r));
r = await call("readFile", { name: "test.mp4" });
console.log("size:", r.data ? r.data.byteLength : 0);
process.exit(0);
