import path from "node:path";

globalThis.self = globalThis;
const core = await (await import(path.resolve("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js"))).default({
  mainScriptUrlOrBlob: path.resolve("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js") + "#" +
    Buffer.from(JSON.stringify({ wasmURL: path.resolve("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm"), workerURL: path.resolve("node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js") })).toString("base64"),
});
const logs = [];
core.setLogger(({ message }) => logs.push(message));
async function probe(name, args) {
  logs.length = 0;
  let c = -1;
  try { c = await core.exec(...args); } catch { c = -99; }
  const errs = logs.filter((l) => /error|invalid|failed|undefined/i.test(l)).slice(0, 2);
  console.log((c === 0 ? "OK   " : "FAIL ") + name + (errs.length ? " :: " + errs.join(" | ") : ""));
  try { core.reset(); } catch { /* ignore */ }
}

await probe("volume t-expr без eval=frame", ["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-af", "volume='if(between(t,0,1),0.9,0.2)'", "v.wav"]);
await probe("volume t-expr с eval=frame", ["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-af", "volume='if(between(t,0,1),0.9,0.2)':eval=frame", "v2.wav"]);
await probe("eq t-expr", ["-f", "lavfi", "-i", "testsrc2=size=160x120:duration=1:rate=30", "-vf", "eq=brightness='if(between(t,0.5,1),0.3,0)'", "-pix_fmt", "yuv420p", "e.mp4"]);
await probe("ccmixer t-expr", ["-f", "lavfi", "-i", "testsrc2=size=160x120:duration=1:rate=30", "-vf", "format=yuva420p,colorchannelmixer=aa='if(between(t,0.5,1),0,1)'", "-pix_fmt", "yuv420p", "c.mp4"]);
await probe("fade alpha=1", ["-f", "lavfi", "-i", "testsrc2=size=160x120:duration=1:rate=30", "-vf", "format=yuva420p,fade=t=in:st=0:d=0.5:alpha=1,fade=t=out:st=0.5:d=0.5:alpha=1", "-pix_fmt", "yuv420p", "c2.mp4"]);
await probe("geq lum T-expr", ["-f", "lavfi", "-i", "testsrc2=size=160x120:duration=1:rate=30", "-vf", "format=yuva420p,geq=lum='clip(lum(X,Y)+if(between(T,0.5,1),0.3,0)*255,0,255)'", "-pix_fmt", "yuv420p", "g2.mp4"]);
await probe("geq alpha T-expr (opacity kf fallback)", ["-f", "lavfi", "-i", "testsrc2=size=160x120:duration=1:rate=30", "-vf", "format=yuva420p,geq=lum='lum(X,Y)':a='alpha(X,Y)*if(between(T,0,0.5),T/0.5,1)'", "-pix_fmt", "yuv420p", "g3.mp4"]);
await probe("hue t-expr", ["-f", "lavfi", "-i", "testsrc2=size=160x120:duration=1:rate=30", "-vf", "hue=h='30*t'", "-pix_fmt", "yuv420p", "h.mp4"]);
await probe("fade alpha merge (fade-in->const->fade-out seq)", ["-f", "lavfi", "-i", "testsrc2=size=160x120:duration=2:rate=30", "-vf", "format=yuva420p,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=1.6:d=0.4:alpha=1", "-pix_fmt", "yuv420p", "c3.mp4"]);
process.exit(0);
