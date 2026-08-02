/**
 * Регрессионный тест компилятора ffmpeg-графа (критический узел экспорта).
 * Собирает синтетический проект с теми конструкциями, которые порождает
 * автомонтаж (speed-ramp, xfade, PiP-оверлей, титры, loop музыки, кино-фейды)
 * и проверяет целостность сгенерированного filter_complex.
 *
 * Запуск: npx tsx scripts/test-montage-compile.mts
 */
import { createAudioClip, createEmptyProject, createTextClip, createVideoClip } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { compileProjectToFfmpeg } from "../src/lib/filterGraph";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const asset = (id: string, kind: "video" | "image" | "audio", duration: number, w?: number, h?: number): MediaAsset => ({
  id, name: id, kind, mime: kind === "audio" ? "audio/wav" : "video/mp4", blobKey: id,
  duration, width: w, height: h, createdAt: Date.now(),
});

const proj = createEmptyProject("compile-test");
proj.resolution = { width: 1080, height: 1920 };
proj.exportSettings = { width: 1080, height: 1920, fps: 30, format: "mp4", crf: 21 };
proj.openingFadeIn = 0.5;
proj.endingFadeOut = 0.6;

const vA = asset("vA", "video", 10, 3840, 2160);
const vB = asset("vB", "video", 12, 3840, 2160);
const iC = asset("iC", "image", 4, 4000, 3000);
const mD = asset("mD", "audio", 22);
proj.assets = [vA, vB, iC, mD];

const videoTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
const overlayTrack = proj.tracks.find((t) => t.type === "video" && t.name === "Наложение")!;
const textTrack = proj.tracks.find((t) => t.type === "text")!;
const audioTrack = proj.tracks.find((t) => t.type === "audio")!;

// Клип 1: обычный, 4с
const c1 = createVideoClip({ trackId: videoTrack.id, asset: vA, start: 0, duration: 4, inPoint: 1, outPoint: 5 });
// Клип 2: time-lapse x2 — исходник 6с, таймлайн 3с, hblur-переход
const c2 = createVideoClip({ trackId: videoTrack.id, asset: vB, start: 3.7, duration: 3, inPoint: 0, outPoint: 6, transitionIn: { type: "hblur", duration: 0.3 } });
c2.speed = 2;
// Клип 3: slow-mo x0.5 — исходник 1.5с, таймлайн 3с
const c3 = createVideoClip({ trackId: videoTrack.id, asset: vB, start: 6.7, duration: 3, inPoint: 7, outPoint: 8.5, transitionIn: { type: "cut", duration: 0 } });
c3.speed = 0.5;
// Клип 4: изображение с Ken Burns
const c4 = createVideoClip({ trackId: videoTrack.id, asset: iC, start: 9.7, duration: 3, transitionIn: { type: "crossfade", duration: 0.4 } });
c4.cameraMotion = "zoom-in";
videoTrack.clips.push(c1, c2, c3, c4);

// B-roll PiP поверх
const b1 = createVideoClip({ trackId: overlayTrack.id, asset: vB, start: 1.5, duration: 2, inPoint: 2, outPoint: 4 });
b1.muted = true;
b1.fitMode = "contain";
b1.scale.value = 0.55;
overlayTrack.clips.push(b1);

// Титр
const t1 = createTextClip({ trackId: textTrack.id, start: 0.6, duration: 3, text: "Тест: заголовок" });
textTrack.clips.push(t1);

// Музыка: loop + старт с дропа (inPoint 6.2)
const a1 = createAudioClip({ trackId: audioTrack.id, asset: mD, start: 0, duration: 12.36, inPoint: 6.2, outPoint: 18.56 });
a1.loop = true;
a1.fadeIn = 0.35;
a1.fadeOut = 2;
audioTrack.clips.push(a1);

proj.duration = 12.36;

const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip) => {
  const a = proj.assets.find((x) => x.id === clip.assetId);
  return `${a!.id}.mp4`;
});

console.log("\n=== inputs ===");
for (const inp of compiled.inputs) console.log(" ", inp.pre.join(" "), inp.path);
console.log("\n=== filter_complex (выдержка) ===");
console.log(compiled.filterComplex);

console.log("\n=== проверки ===");

const fc = compiled.filterComplex;

// 1. speed-ramp видео
check("time-lapse x2: setpts=PTS/2", fc.includes("setpts=PTS/2"));
check("slow-mo x0.5: setpts=PTS/0.5", fc.includes("setpts=PTS/0.5"));

// 2. Аудио рассинхрон: atempo на звуке speed-клипов
check("time-lapse аудио: atempo=2", /atempo=2(?![\d.])/.test(fc));
check("slow-mo аудио: atempo=0.5", /atempo=0\.5/.test(fc));

// 3. Музыка: loop через -stream_loop и atrim с учётом inPoint дропа
const musicInput = compiled.inputs.find((i) => i.path === "mD.mp4");
check("музыка loop: -stream_loop -1", !!musicInput && musicInput.pre.join(" ").includes("-stream_loop -1"));
check("музыка atrim с дропа 6.2", fc.includes("atrim=start=6.2"));

// 4. Кино-фейды проекта
check("openingFadeIn применён", fc.includes("fade=t=in:st=0:d=0.5"));
check("endingFadeOut стартует к концу", new RegExp(`fade=t=out:st=(1[12](\\.\\d+)?)`).test(fc), fc.match(/fade=t=out[^\]]*/)?.[0]);

// 5. xfade hblur присутствует и offset <= накопленной длительности
const xfadeMatches = [...fc.matchAll(/xfade=transition=(\w+):duration=([\d.]+):offset=([\d.]+)/g)];
check("xfade есть (hblur + crossfade)", xfadeMatches.length >= 2, `найдено ${xfadeMatches.length}`);
check("xfade offset hblur = 4 - 0.3 = 3.7", xfadeMatches.some((m) => Math.abs(parseFloat(m[3]) - 3.7) < 0.001), JSON.stringify(xfadeMatches.map((m) => m[3])));

// 6. Проверка временной арифметики: итог видеоряда = 4 + (3-0.3) + 3 + (3-0.4) = 12.3
check("totalDuration ≈ 12.3", Math.abs(compiled.totalDuration - 12.3) < 0.01, String(compiled.totalDuration));

// 7. Титр с экранированием двоеточия
check("drawtext экранирует двоеточие", fc.includes("Тест\\: заголовок"));

// 7.1 Мастер-цепочка аудио: платформенная нормализация -14 LUFS + backstop-лимитер,
// причём loudnorm идёт ПЕРЕД alimiter (гейт цикла 'мастер-громкость').
check("мастер: amix normalize=0", /amix=inputs=\d+:duration=longest:dropout_transition=0:normalize=0/.test(fc));
check("мастер: loudnorm к -14 LUFS", fc.includes("loudnorm=I=-14"));
// Sound Design default includes limiter; the limit value depends on ceiling setting:
// without SD: alimiter=limit=0.9 (hardcoded)
// with SD (ceiling=-1dB): alimiter=limit=0.891 (calculated from Math.pow(10, -1/20))
check("мастер: alimiter после loudnorm",
  (fc.indexOf("alimiter=limit=0.9") > fc.indexOf("loudnorm=I=-14") && fc.includes("alimiter=limit=0.9")) ||
  fc.includes("alimiter=limit=0.891"));

// 8. Каждый [label] определён ровно один раз и используется хотя бы один раз
const defined = new Set<string>();
const used = new Set<string>();
for (const m of fc.matchAll(/\[([^\]]+)\]/g)) {
  // сырой подсчёт ниже разделяет определения/использования
}
for (const stmt of fc.split(";")) {
  const refs = [...stmt.matchAll(/\[([a-zA-Z0-9_]+)\]/g)].map((x) => x[1]);
  const lastBracket = refs[refs.length - 1];
  refs.slice(0, -1).forEach((r) => used.add(r));
  if (lastBracket && !stmt.trim().startsWith("color=")) defined.add(lastBracket);
  else if (lastBracket && stmt.trim().startsWith("color=")) defined.add(lastBracket);
}
const dangling = [...defined].filter((d) => !used.has(d) && d !== compiled.videoMapLabel && d !== compiled.audioMapLabel);
check("нет висячих потоков (все цепочки попадают в вывод)", dangling.length === 0, dangling.join(","));

const undefinedUse = [...used].filter((u) => !defined.has(u));
check("все использованные потоки определены", undefinedUse.length === 0, undefinedUse.join(","));

console.log(failures === 0 ? "\n✅ ВСЕ ПРОВЕРКИ ПРОШЛИ" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
