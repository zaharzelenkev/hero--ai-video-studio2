/**
 * Тест компиляции blur-pad ветки filterGraph (портретный источник на 16:9).
 * Запуск: npx tsx scripts/test-blurpad-compile.mts
 */
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { compileProjectToFfmpeg } from "../src/lib/filterGraph";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const proj = createEmptyProject("blurpad-test");
proj.resolution = { width: 1920, height: 1080 };
proj.exportSettings = { width: 1920, height: 1080, fps: 30, format: "mp4", crf: 21 };

const portrait = {
  id: "phone", name: "phone.mp4", kind: "video", mime: "video/mp4", blobKey: "phone",
  duration: 8, width: 1080, height: 1920, createdAt: Date.now(),
} as MediaAsset;
proj.assets = [portrait];

const track = proj.tracks.find(t => t.type === "video" && t.name === "Видео 1")!;
const clip = createVideoClip({ trackId: track.id, asset: portrait, start: 0, duration: 5, inPoint: 0, outPoint: 5 });
clip.blurPad = true;
track.clips.push(clip);
proj.duration = 5;

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, () => "phone.mp4");

check("split на подложку и передний план", /split=2\[/.test(compiled.filterComplex));
check("подложка: cover scale + boxblur + затемнение",
  /scale='iw\*max\(1920\/iw\\,1080\/ih\)'.*crop=1920:1080.*boxblur=12:5.*eq=brightness=-0\.05/.test(compiled.filterComplex.replace(/\n/g, "")));
check("передний план: contain (force_original_aspect_ratio=decrease)",
  /scale=1920:1080:force_original_aspect_ratio=decrease/.test(compiled.filterComplex));
check("оверлей fg по центру подложки", /overlay=\(W-w\)\/2:\(H-h\)\/2/.test(compiled.filterComplex));
check("нет висячих потоков (blur-ветка доходит до вывода)", (() => {
  const labels = new Set<string>();
  for (const m of compiled.filterComplex.matchAll(/\[([a-zA-Z0-9_]+)\]/g)) labels.add(m[1]);
  // каждая объявленная после фильтра метка должна где-то потребляться
  const produced = new Set<string>();
  for (const stmt of compiled.filterComplex.split(";\n")) {
    const outM = stmt.match(/\[([a-zA-Z0-9_]+)\](?=(?::|;|$))/g);
    if (outM) for (const t of outM) produced.add(t.replace(/\[|\]/g, ""));
  }
  for (const p of produced) {
    if (p === compiled.videoMapLabel || p === compiled.audioMapLabel) continue;
    if (!compiled.filterComplex.split(";\n").some(s => s.includes(`[${p}]`) && !s.trim().endsWith(`[${p}]`))) return false;
  }
  return true;
})());

if (failures === 0) console.log("\n✅ BLUR-PAD COMPILE: ВСЕ ПРОВЕРКИ ПРОШЛИ");
else { console.error(`\n❌ Провалено: ${failures}`); process.exit(1); }
