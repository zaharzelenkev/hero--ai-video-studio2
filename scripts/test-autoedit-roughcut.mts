/**
 * Комплексный тест АВТОМОНТАЖА и ЧЕРНОВОГО МОНТАЖА.
 *
 * Проверяет:
 *  1. buildStyleFromBrief — корректное определение типа проекта из брифа
 *  2. refineMontage — исправление запрещённых переходов и фото-длительностей
 *  3. finalizePictureLock — фиксация монтажа с реальными клипами
 *  4. autoEditToProject — полный конвейер для разных типов контента
 *  5. Picture Lock + ensureMinDuration — итоговая корректность проекта
 *
 * Запуск: npx tsx scripts/test-autoedit-roughcut.mts
 */
import { autoEditToProject } from "../src/lib/autoEdit";
import { refineMontage, suggestTempoAdjustments, type RefineInput } from "../src/lib/brain/autoMontageRefine";
import { finalizePictureLock, fixPictureLock, analyzePictureLock, mainShots, timelineDurationOf } from "../src/lib/pictureLock";
import { ensureMinDuration } from "../src/lib/minDuration";
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import { detectProjectType, PROJECT_TYPE_PROFILES } from "../src/lib/brain/projectType";
import type { GenerationStyle, MediaAsset, VideoClip } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ---------------------------------------------------------------------------
// 1. buildStyleFromBrief — определение типа проекта
// ---------------------------------------------------------------------------
console.log("\n=== 1. buildStyleFromBrief: определение типа ===");

{
  const { buildStyleFromBrief } = await import("../src/components/director/DraftMontageModal");
  
  // TikTok (вертикальный, быстрый)
  const tiktokStyle = buildStyleFromBrief({
    idea: "динамичный ролик про город",
    goal: "набрать просмотры",
    audience: "молодёжь",
    platform: "TikTok",
    duration: "15",
    style: "энергичный",
    mood: "драйвовый",
    tempo: "быстрый",
    references: "",
    keyMessage: "город мечты",
    callToAction: "подпишись",
  });
  check("TikTok: pace = fast/dynamic", tiktokStyle.pace === "fast" || tiktokStyle.pace === "dynamic",
    `pace=${tiktokStyle.pace}`);
  check("TikTok: intelligentCuts = true", tiktokStyle.intelligentCuts === true);
  check("TikTok: beatSync = true", tiktokStyle.beatSync === true);
  check("TikTok: targetDuration = 15", tiktokStyle.targetDuration === 15,
    `targetDuration=${tiktokStyle.targetDuration}`);
  check("TikTok: rawPrompt содержит DETECTED_TYPE", tiktokStyle.rawPrompt.includes("DETECTED_TYPE"),
    tiktokStyle.rawPrompt.slice(0, 100));
  
  // Подкаст (горизонтальный, медленный)
  const podcastStyle = buildStyleFromBrief({
    idea: "интервью с предпринимателем",
    goal: "полезный контент",
    audience: "предприниматели",
    platform: "YouTube",
    duration: "120",
    style: "разговорный",
    mood: "деловой",
    tempo: "спокойный",
    references: "",
    keyMessage: "как начать бизнес",
    callToAction: "",
  });
  check("Подкаст: pace = slow/medium", podcastStyle.pace === "slow" || podcastStyle.pace === "medium",
    `pace=${podcastStyle.pace}`);
  check("Подкаст: targetDuration = 120", podcastStyle.targetDuration === 120,
    `targetDuration=${podcastStyle.targetDuration}`);
  
  // Wedding (кинематографичный)
  const weddingStyle = buildStyleFromBrief({
    idea: "свадебное видео",
    goal: "красивый фильм",
    audience: "семья",
    platform: "",
    duration: "180",
    style: "кинематографичный",
    mood: "романтичный",
    tempo: "плавный",
    references: "",
    keyMessage: "день любви",
    callToAction: "",
  });
  check("Свадьба: colorGrade = warm/cinematic", 
    weddingStyle.colorGrade === "warm" || weddingStyle.colorGrade === "cinematic",
    `colorGrade=${weddingStyle.colorGrade}`);
}

// ---------------------------------------------------------------------------
// 2. refineMontage — исправление проблем
// ---------------------------------------------------------------------------
console.log("\n=== 2. refineMontage: исправления ===");

{
  // 2a. Запрещённые переходы
  const tiktokProfile = PROJECT_TYPE_PROFILES["tiktok"];
  check("TikTok профиль существует", !!tiktokProfile);
  
  const clips: VideoClip[] = [];
  for (let i = 0; i < 5; i++) {
    clips.push({
      id: `clip_${i}`,
      trackId: "v1",
      type: "video",
      name: `clip${i}.mp4`,
      assetId: `asset_${i}`,
      start: i * 1.5,
      duration: 1.5,
      inPoint: 0,
      outPoint: 1.5,
      speed: 1,
      transitionIn: { type: i === 0 ? "cut" as any : "pixelize" as any, duration: 0.3 },
      opacity: { value: 1, keyframes: [] },
      x: { value: 0, keyframes: [] },
      y: { value: 0, keyframes: [] },
      scale: { value: 1, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      volume: { value: 1, keyframes: [] },
      color: { brightness: { value: 0, keyframes: [] }, contrast: { value: 0, keyframes: [] }, saturation: { value: 0, keyframes: [] } } as any,
      fitMode: "cover",
      cameraMotion: "none",
      muted: false,
      effects: [],
    } as any);
  }
  
  const input: RefineInput = {
    clips,
    bRollClips: [],
    profile: tiktokProfile,
    beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0],
    downbeats: [0, 2.0, 4.0, 6.0],
    totalDuration: 7.5,
  };
  
  const result = refineMontage(input);
  
  // Проверим, что запрещённые переходы исправлены
  const forbidden = new Set(tiktokProfile.transition.avoid);
  const remainingForbidden = clips.filter(c => forbidden.has((c.transitionIn?.type || "cut") as string));
  check("Запрещённые переходы исправлены", remainingForbidden.length === 0,
    `осталось: ${remainingForbidden.length}, запрещённые: ${[...forbidden].join(",")}`);
  
  // 2b. Фото-клипы с неправильной длительностью
  const photoClips: VideoClip[] = [];
  for (let i = 0; i < 3; i++) {
    photoClips.push({
      id: `photo_${i}`,
      trackId: "v1",
      type: "image",
      name: `photo${i}.jpg`,
      assetId: `photo_asset_${i}`,
      start: i * 0.8,
      duration: 0.8, // ниже минимума 1.2с для TikTok
      inPoint: 0,
      outPoint: 0.8,
      speed: 1,
      transitionIn: { type: "cut", duration: 0 },
      opacity: { value: 1, keyframes: [] },
      x: { value: 0, keyframes: [] },
      y: { value: 0, keyframes: [] },
      scale: { value: 1, keyframes: [] },
      rotation: { value: 0, keyframes: [] },
      volume: { value: 1, keyframes: [] },
      color: { brightness: { value: 0, keyframes: [] }, contrast: { value: 0, keyframes: [] }, saturation: { value: 0, keyframes: [] } } as any,
      fitMode: "cover",
      cameraMotion: "zoom-in",
      muted: true,
      effects: [],
    } as any);
  }
  
  const photoInput: RefineInput = {
    clips: photoClips,
    bRollClips: [],
    profile: tiktokProfile,
    beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5],
    downbeats: [0, 2.0],
    totalDuration: 2.4,
  };
  
  const photoResult = refineMontage(photoInput);
  
  // После исправления: все фото должны быть >= minDurationSec
  const minDur = tiktokProfile.photo.minDurationSec;
  const shortPhotos = photoClips.filter(c => c.duration < minDur);
  check(`Фото исправлены до >= ${minDur}с`, shortPhotos.length === 0,
    `коротких: ${shortPhotos.length}, длительности: ${photoClips.map(c => c.duration.toFixed(2)).join(", ")}`);
  
  // 2c. suggestTempoAdjustments
  const tempoNotes = suggestTempoAdjustments(clips, tiktokProfile);
  check("suggestTempoAdjustments возвращает заметки", tempoNotes.length > 0,
    tempoNotes.join("; "));
}

// ---------------------------------------------------------------------------
// 3. finalizePictureLock — фиксация монтажа с реальными клипами
// ---------------------------------------------------------------------------
console.log("\n=== 3. finalizePictureLock: фиксация ===");

{
  const proj = createEmptyProject("lock-test");
  proj.resolution = { width: 1920, height: 1080 };
  proj.style.pace = "medium";
  proj.style.targetDuration = 20;
  proj.assets = [
    { id: "v1", name: "v1.mp4", kind: "video", mime: "video/mp4", blobKey: "v1", duration: 30, width: 1920, height: 1080, createdAt: Date.now() },
    { id: "v2", name: "v2.mp4", kind: "video", mime: "video/mp4", blobKey: "v2", duration: 20, width: 1920, height: 1080, createdAt: Date.now() },
  ];
  
  const videoTrack = proj.tracks.find(t => t.type === "video" && t.name === "Видео 1")!;
  
  // Клип 1: слишком длинный (8с при лимите 6.5с для medium)
  videoTrack.clips.push(createVideoClip({
    trackId: videoTrack.id, asset: proj.assets[0], start: 0, duration: 8, inPoint: 0, outPoint: 8,
  }));
  
  // Клип 2: нормальный
  videoTrack.clips.push(createVideoClip({
    trackId: videoTrack.id, asset: proj.assets[1], start: 8, duration: 3.5, inPoint: 0, outPoint: 3.5,
    transitionIn: { type: "crossfade", duration: 0.4 },
  }));
  
  // Клип 3: дыра (начинается на 13, а предыдущий кончается на 11.5)
  videoTrack.clips.push(createVideoClip({
    trackId: videoTrack.id, asset: proj.assets[0], start: 13, duration: 3, inPoint: 10, outPoint: 13,
    transitionIn: { type: "cut", duration: 0 },
  }));
  
  proj.duration = 16;
  
  // Анализ ДО фикса
  const beforeReport = analyzePictureLock(proj);
  check("ДО фикса: есть длинные кадры", beforeReport.longShots > 0, `longShots=${beforeReport.longShots}`);
  check("ДО фикса: есть дыры", beforeReport.issues.some(i => i.message.includes("Дыра") || i.message.includes("пустот")),
    beforeReport.issues.map(i => i.message).join(" | ").slice(0, 100));
  
  // Финализация
  const fixed = finalizePictureLock(proj);
  const afterReport = fixed.pictureLock?.report;
  check("После фикса: есть отчёт Picture Lock", !!afterReport);
  check("После фикса: stage = review", fixed.pictureLock?.stage === "review");
  
  const shots = mainShots(fixed);
  check("После фикса: есть планы на дорожке", shots.length > 0, `clips=${shots.length}`);
  
  // Проверим, что дыры закрыты
  let hasGaps = false;
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i-1];
    const cur = shots[i];
    const gap = cur.start - (prev.start + prev.duration);
    if (gap > 0.1) hasGaps = true;
  }
  check("После фикса: нет дыр между планами", !hasGaps);
  
  // Проверим, что длинные кадры исправлены
  const paceLimits = { maxShot: 6.5 }; // medium pace
  const stillLong = shots.filter(s => s.duration > paceLimits.maxShot + 0.05);
  check("После фикса: длинные кадры укорочены", stillLong.length === 0,
    stillLong.map(s => `${s.duration.toFixed(2)}с`).join(", "));
}

// ---------------------------------------------------------------------------
// 4. autoEditToProject — полный конвейер для разных типов
// ---------------------------------------------------------------------------
console.log("\n=== 4. autoEditToProject: полный конвейер ===");

async function testAutoEdit(contentType: string, prompt: string, width = 1920, height = 1080) {
  const assets: MediaAsset[] = [
    { id: "a1", name: "video1.mp4", kind: "video", mime: "video/mp4", blobKey: "a1", duration: 15, width, height, createdAt: Date.now() },
    { id: "a2", name: "video2.mp4", kind: "video", mime: "video/mp4", blobKey: "a2", duration: 10, width, height, createdAt: Date.now() },
    { id: "a3", name: "photo1.jpg", kind: "image", mime: "image/jpeg", blobKey: "a3", duration: 0, width, height, createdAt: Date.now() },
    { id: "a4", name: "photo2.jpg", kind: "image", mime: "image/jpeg", blobKey: "a4", duration: 0, width, height, createdAt: Date.now() },
  ];
  
  const style: GenerationStyle = {
    pace: "medium",
    bw: false,
    colorGrade: "none",
    kenBurns: true,
    beatSync: true,
    transition: "crossfade",
    addCaptions: true,
    rawPrompt: prompt,
    contentType: contentType as any,
    targetDuration: 20,
    intelligentCuts: true,
    autoSubtitles: true,
    templateId: "auto",
  };
  
  const progress: string[] = [];
  const project = await autoEditToProject({
    title: `Тест: ${contentType}`,
    assets,
    filesByAssetId: new Map(), // в Node без реальных файлов
    style,
    onProgress: (msg) => { progress.push(msg); },
  });
  
  return { project, progress };
}

// 4a. TikTok (вертикальный)
{
  const { project, progress } = await testAutoEdit("tiktok", "динамичный ролик для TikTok", 1080, 1920);
  check("TikTok: проект создан", !!project && !!project.id);
  check("TikTok: вертикальная резолюция", project.resolution.height > project.resolution.width,
    `${project.resolution.width}x${project.resolution.height}`);
  check("TikTok: есть прогресс-сообщения", progress.length > 5, `${progress.length}`);
  
  const videoTrack = project.tracks.find(t => t.type === "video" && t.name === "Видео 1");
  check("TikTok: есть видеодорожка", !!videoTrack);
  
  const textTrack = project.tracks.find(t => t.type === "text");
  check("TikTok: есть текстовая дорожка", !!textTrack);
  
  // Picture Lock
  const locked = finalizePictureLock(project);
  ensureMinDuration(locked, 10);
  check("TikTok: Picture Lock пройден", locked.pictureLock?.stage === "review");
  check("TikTok: длительность >= 10с", (locked.duration ?? 0) >= 10, `duration=${locked.duration}`);
}

// 4b. YouTube (горизонтальный)
{
  const { project, progress } = await testAutoEdit("youtube", "видео для youtube 16:9 про технологии");
  check("YouTube: проект создан", !!project);
  check("YouTube: горизонтальная резолюция", project.resolution.width > project.resolution.height,
    `${project.resolution.width}x${project.resolution.height}`);
  
  const locked = finalizePictureLock(project);
  ensureMinDuration(locked, 10);
  check("YouTube: длительность >= 10с", (locked.duration ?? 0) >= 10, `duration=${locked.duration}`);
}

// 4c. Presentation
{
  const { project } = await testAutoEdit("presentation", "презентация продукта для инвесторов");
  check("Presentation: проект создан", !!project);
  check("Presentation: горизонтальная резолюция", project.resolution.width >= project.resolution.height);
  
  const locked = finalizePictureLock(project);
  ensureMinDuration(locked, 10);
  check("Presentation: длительность >= 10с", (locked.duration ?? 0) >= 10);
}

// ---------------------------------------------------------------------------
// 5. Picture Lock + ensureMinDuration — итоговая корректность
// ---------------------------------------------------------------------------
console.log("\n=== 5. Picture Lock + ensureMinDuration ===");

{
  // Тестируем с проектом из autoEdit
  const { project } = await testAutoEdit("tiktok", "короткий вертикальный ролик", 1080, 1920);
  
  const locked = finalizePictureLock(project);
  ensureMinDuration(locked, 10);
  
  const report = locked.pictureLock?.report;
  check("Финальный отчёт есть", !!report);
  
  // Проверка целостности
  const totalClips = locked.tracks.reduce((n, t) => n + t.clips.length, 0);
  check("В проекте есть клипы", totalClips > 0, `clips=${totalClips}`);
  
  // Проверка таймлайна
  const tlDur = timelineDurationOf(locked);
  check("Таймлайн > 0", tlDur > 0, `tlDur=${tlDur}`);
  
  // Проверка: все клипы на видеодорожке не перекрываются (с учётом переходов)
  const videoTrack = locked.tracks.find(t => t.type === "video" && t.name === "Видео 1");
  if (videoTrack && videoTrack.clips.length > 1) {
    const sorted = [...videoTrack.clips].sort((a, b) => a.start - b.start);
    let overlaps = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i-1] as VideoClip;
      const cur = sorted[i] as VideoClip;
      const prevEnd = prev.start + prev.duration;
      const overlap = prevEnd - cur.start;
      const allowedOverlap = cur.transitionIn?.duration ?? 0;
      if (overlap > allowedOverlap + 0.1) overlaps++;
    }
    check("Нет аномальных перекрытий на видеодорожке", overlaps === 0, `overlaps=${overlaps}`);
  }
  
  // Проверка: нет клипов с отрицательным стартом
  let negativeStarts = 0;
  for (const track of locked.tracks) {
    for (const clip of track.clips) {
      if (clip.start < -0.01) negativeStarts++;
    }
  }
  check("Нет клипов с отрицательным стартом", negativeStarts === 0, `negative=${negativeStarts}`);
  
  // Проверка: нет клипов с duration <= 0
  let zeroDur = 0;
  for (const track of locked.tracks) {
    for (const clip of track.clips) {
      if (clip.duration <= 0) zeroDur++;
    }
  }
  check("Нет клипов с нулевой длительностью", zeroDur === 0, `zeroDur=${zeroDur}`);
  
  // Проверка: directorPlan сохранён
  check("Режиссёрский план сохранён", !!locked.directorPlan);
}

// ---------------------------------------------------------------------------
// 6. detectProjectType — детекция типа проекта
// ---------------------------------------------------------------------------
console.log("\n=== 6. detectProjectType ===");

{
  // TikTok (вертикальное видео, быстрое)
  const ttDet = detectProjectType({
    brief: { idea: "ролик", goal: "", audience: "", platform: "tiktok", duration: "15", style: "", mood: "", tempo: "быстрый", references: "", keyMessage: "", callToAction: "" } as any,
    rawPrompt: "динамичный тикток",
    assets: [{ kind: "video", duration: 15, width: 1080, height: 1920, hasAudio: true, hasTranscript: false, transcriptLength: 0, name: "video.mp4" }],
  });
  check("TikTok детектирован", ttDet.type === "tiktok" || ttDet.profile.id === "tiktok",
    `type=${ttDet.type}, profile=${ttDet.profile.id}`);
  
  // Подкаст (есть речь, горизонтальное)
  const podDet = detectProjectType({
    brief: { idea: "интервью с экспертом", goal: "", audience: "", platform: "youtube", duration: "120", style: "", mood: "", tempo: "", references: "", keyMessage: "", callToAction: "" } as any,
    rawPrompt: "подкаст интервью",
    assets: [{ kind: "video", duration: 120, width: 1920, height: 1080, hasAudio: true, hasTranscript: true, transcriptLength: 5000, name: "interview.mp4" }],
  });
  check("Подкаст/интервью детектирован", 
    podDet.type === "podcast" || podDet.type === "interview" || podDet.profile.isTalking === true,
    `type=${podDet.type}, profile=${podDet.profile.id}`);
  
  // Свадьба (кинематографичное, медленное)
  const wedDet = detectProjectType({
    brief: { idea: "свадебное видео", goal: "", audience: "", platform: "", duration: "180", style: "кинематограф", mood: "романтика", tempo: "медленный", references: "", keyMessage: "", callToAction: "" } as any,
    rawPrompt: "свадебный фильм кинематографичный",
    assets: [{ kind: "video", duration: 180, width: 3840, height: 2160, hasAudio: true, hasTranscript: false, transcriptLength: 0, name: "wedding.mp4" }],
  });
  // wedding → short-film (кинематографичный профиль — ближайший тип в системе)
  check("Свадьба → кинематографичный профиль", 
    wedDet.profile.isSlow === true || wedDet.type === "short-film" || wedDet.type === "cinematic",
    `type=${wedDet.type}, profile=${wedDet.profile.id}, isSlow=${wedDet.profile.isSlow}`);
}

// ---------------------------------------------------------------------------
// Итог
// ---------------------------------------------------------------------------
console.log("");
if (failures === 0) console.log("✅ AUTOEDIT + ROUGH CUT: ВСЕ ПРОВЕРКИ ПРОШЛИ");
else { console.error(`❌ Провалено: ${failures}`); process.exit(1); }
