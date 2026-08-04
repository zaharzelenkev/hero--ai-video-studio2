/**
 * SMOKE TEST: реальный автомонтаж (autoEditToProject) в Node-окружении.
 *
 * Прогоняет тот же конвейер, что вызывает GenerationScreenV2:
 *   материалы → autoEditToProject → finalizePictureLock
 * и проверяет, что монтаж не падает и даёт валидный проект с дорожками,
 * клипами и длительностью. Музыкальная библиотека/SFX в Node пропускаются
 * (они требуют window.OfflineAudioContext) — здесь проверяется движок монтажа.
 *
 * Запуск: npx tsx scripts/smoke-autoedit.mts
 */
import { autoEditToProject } from "../src/lib/autoEdit";
import { finalizePictureLock } from "../src/lib/pictureLock";
import { ensureMinDuration } from "../src/lib/minDuration";
import type { GenerationStyle, MediaAsset } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const mkAsset = (id: string, kind: "video" | "image", duration: number, w = 1920, h = 1080): MediaAsset => ({
  id, name: `${id}.${kind === "image" ? "jpg" : "mp4"}`, kind,
  mime: kind === "image" ? "image/jpeg" : "video/mp4",
  blobKey: id, duration, width: w, height: h, createdAt: Date.now(),
});

const assets: MediaAsset[] = [
  mkAsset("a1", "video", 12),
  mkAsset("a2", "video", 9),
  mkAsset("a3", "image", 4),
  mkAsset("a4", "image", 4),
];

const style: GenerationStyle = {
  pace: "fast",
  bw: false,
  colorGrade: "none",
  kenBurns: true,
  beatSync: true,
  transition: "smart",
  addCaptions: true,
  rawPrompt: "динамичный ролик для TikTok, 18 секунд",
  contentType: "tiktok",
  targetDuration: 18,
  intelligentCuts: true,
  autoSubtitles: true,
  templateId: "auto",
};

const progress: string[] = [];
try {
  console.log("=== автомонтаж: autoEditToProject ===");
  const project = await autoEditToProject({
    title: "Смоук-тест автомонтажа",
    assets,
    filesByAssetId: new Map(), // в Node без реальных файлов: локальный анализ пропускается
    style,
    onProgress: (msg) => { progress.push(msg); console.log(`  · ${msg}`); },
  });

  check("автомонтаж не бросил исключение", true);
  check("проект создан", !!project && !!project.id);
  check("длительность ролика > 0", (project.duration ?? 0) > 0, `duration=${project.duration}`);
  const videoTrack = project.tracks.find((t) => t.type === "video" && t.name === "Видео 1");
  check("есть видеодорожка с клипами", !!videoTrack && videoTrack.clips.length > 0,
    `clips=${videoTrack?.clips.length ?? 0}`);
  const audioTrack = project.tracks.find((t) => t.type === "audio");
  check("есть аудиодорожка", !!audioTrack);
  const textTrack = project.tracks.find((t) => t.type === "text");
  check("есть текстовая дорожка", !!textTrack);
  check("есть прогресс-сообщения", progress.length > 0, `${progress.length}`);

  console.log("\n=== Picture Lock + минимум длительности ===");
  const locked = finalizePictureLock(project);
  ensureMinDuration(locked, 10);
  check("Picture Lock прошёл", locked.tracks.length === project.tracks.length);
  check("итоговая длительность >= 10с", (locked.duration ?? 0) >= 10, `duration=${locked.duration}`);

  const totalClips = locked.tracks.reduce((n, t) => n + t.clips.length, 0);
  check("в проекте есть клипы", totalClips > 0, `clips=${totalClips}`);
} catch (e) {
  failures++;
  console.error("❌ автомонтаж упал:", e);
  if (e instanceof Error) console.error(e.stack);
}

console.log(failures === 0 ? "\nSMOKE: OK" : `\nSMOKE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
