import { AI_CONFIG } from "@/config/ai";

import type { Project, MediaAsset } from "../types";
import { uid } from "../id";
import { saveBlob } from "../db";
import { sanitizeGlyphs } from "../presets";
import { pooled } from "../pooled";

interface SceneMedia {
  /** Visual asset for the scene: a REAL generated video clip when the free
   *  text-to-video backend is available, otherwise an AI image (Flux). */
  image: MediaAsset | null;
  voice: MediaAsset | null;
  duration: number;
}

/**
 * One-time capability probe: is real text-to-video generation available?
 * (Requires a free Pollinations key on the server — see /api/video-gen.)
 * Cached for the whole session so 6 scenes don't fire 6 probes.
 */
let videoGenAvailable: Promise<boolean> | null = null;
function isVideoGenAvailable(): Promise<boolean> {
  if (!videoGenAvailable) {
    videoGenAvailable = fetch("/api/video-gen?health=1")
      .then((r) => (r.ok ? r.json() : { videoEnabled: false }))
      .then((j) => Boolean(j.videoEnabled))
      .catch(() => false);
  }
  return videoGenAvailable;
}

export async function generateMagicVideo(prompt: string, style: import("../types").GenerationStyle, onProgress?: (msg: string) => void, filesByAssetId?: Map<string, File>): Promise<Project> {
  onProgress?.("📝 Пишем сценарий...");

  const systemPrompt = `Ты — гениальный креативный директор и копирайтер топового YouTube-продакшена.
Твоя задача написать сценарий для вирусного короткого видео (Shorts/Reels/TikTok) по запросу пользователя.
Сделай от 4 до 6 сцен. Каждая сцена длится 3-6 секунд.

ПРАВИЛА НАПИСАНИЯ ОЗВУЧКИ (voiceover):
1. СТРОГО ЗАПРЕЩЕНЫ БАНАЛЬНОСТИ ("природа тут захватывающая", "это очень красиво", "посмотрите на это великолепное озеро", "сегодня я расскажу").
2. Текст должен быть кинематографичным, сочным и интригующим. Пиши так, чтобы дух захватывало!
3. Используй сильные глаголы, метафоры и ритмичный сторителлинг.
4. В первой сцене ОБЯЗАТЕЛЬНО должен быть мощный "Хук" (парадокс, интригующий вопрос, шокирующий факт или смелое заявление), чтобы зритель не свайпнул.
5. Предложения должны быть короткими, хлёсткими и разговорными.

ВИЗУАЛ:
Для каждой сцены реши, какая нужна картинка: сгенерированная ИИ (для абстракций, будущего, арта) или РЕАЛЬНОЕ ФОТО из интернета (для существующих городов, гор, людей, машин).

Для каждой сцены верни:
- voiceover: текст озвучки (на русском). Только то, что произносит диктор!
- imageType: "ai" или "real"
- imagePrompt: 
   - Если imageType="ai", напиши детальный промпт для нейросети на АНГЛИЙСКОМ (например: "A cyberpunk city at night, neon lights, 8k resolution").
   - Если imageType="real", напиши точный поисковый запрос на АНГЛИЙСКОМ для поиска НАСТОЯЩЕГО фото, обязательно с названием места И локацией (страна/город), например: "Eiffel Tower, Paris, France", "Taj Mahal, Agra, India", "Elon Musk", "Mount Everest, Nepal". Не выдумывай объект — это реальная достопримечательность, её фото есть в интернете.
- motion: короткое описание ДВИЖЕНИЯ в кадре на АНГЛИЙСКОМ для видео-нейросети (движение камеры + движение объекта, например: "slow cinematic dolly-in, mist drifting between skyscrapers" или "drone orbit shot, waves crashing in slow motion"). Всегда заполняй!

Ответь строго в JSON формате:
{
  "title": "Название видео",
  "scenes": [
    { "voiceover": "Она возвышается над Парижем как стальной титан, приковывая взгляды миллионов.", "imageType": "real", "imagePrompt": "Eiffel Tower", "motion": "slow aerial orbit around the tower at golden hour, birds passing" },
    { "voiceover": "Но что, если завтра её поглотят неоновые джунгли?", "imageType": "ai", "imagePrompt": "Futuristic flying cars around a glowing tower, sci-fi city, 8k", "motion": "cinematic dolly-in through neon rain, flying cars streaking past" }
  ]
}`;

  let scriptData;
  try {
    const res = await fetch(AI_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AI_CONFIG.groqApiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    scriptData = JSON.parse(json.choices[0].message.content);
  } catch (e) {
    console.error("Script generation failed, using fallback.", e);
    scriptData = {
      title: "Генерация",
      scenes: [
        { voiceover: prompt.slice(0, 50), imageType: "ai", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" },
        { voiceover: "Продолжение...", imageType: "ai", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" },
        { voiceover: "Финал.", imageType: "ai", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" }
      ]
    };
  }

  const _filesByAssetId = filesByAssetId || new Map<string, File>();
  const sceneCount: number = scriptData.scenes.length;
  const titleLength = String(scriptData.title || "").length;

  // Сцены независимы друг от друга (TTS + подбор картинки), поэтому генерируем их
  // параллельно пулом из 3 воркеров вместо строго последовательного цикла — это
  // существенно ускоряет "Магию" на сценариях из 5-6 сцен.
  let doneScenes = 0;
  onProgress?.(`✨ Генерация медиа 0/${sceneCount}...`);
  const sceneMedia: (SceneMedia | null)[] = await pooled(scriptData.scenes, 3, async (scene: any, i: number) => {
    const media = await buildSceneMedia(scene, i, style, titleLength, _filesByAssetId);
    doneScenes++;
    onProgress?.(`✨ Генерация медиа ${doneScenes}/${sceneCount}...`);
    return media;
  });

  // fallback to full generator logic but enhanced
  return generateEnhancedMagicVideo(scriptData, sceneMedia, _filesByAssetId, onProgress, style);
}

/** Generates the TTS voiceover + a matching image for a single scene. Never throws:
 *  individual failures degrade gracefully (missing voice and/or missing image),
 *  but always keep the caller's scene index so slots don't shift. */
async function buildSceneMedia(
  scene: any,
  i: number,
  style: import("../types").GenerationStyle,
  titleLength: number,
  filesByAssetId: Map<string, File>
): Promise<SceneMedia> {
  // 1. Fetch TTS
  let audioDuration = 3;
  let voiceAsset: MediaAsset | null = null;
  try {
    const ttsUrl = `/api/tts?text=${encodeURIComponent(scene.voiceover)}`;
    const ttsRes = await fetch(ttsUrl);
    if (ttsRes.ok) {
      const audioBlob = await ttsRes.blob();
      const audioKey = uid("blob");
      const file = new File([audioBlob], `Voiceover ${i + 1}`, { type: "audio/mpeg" });
      await saveBlob(audioKey, file);
      filesByAssetId.set(audioKey, file);

      // РЕАЛЬНАЯ длительность озвучки: оценка «chars/12» обрезала голос посреди слова
      // или оставляла визуал висеть в тишине после фразы.
      try {
        const { readAudioMeta } = await import("../media");
        audioDuration = Math.max(2, (await readAudioMeta(file)).duration);
      } catch {
        audioDuration = Math.max(2, scene.voiceover.length / 12);
      }

      voiceAsset = {
        id: audioKey,
        name: `Voice ${i + 1}`,
        kind: "audio",
        mime: "audio/mpeg",
        blobKey: audioKey,
        duration: audioDuration,
        createdAt: Date.now(),
        hasAudio: true
      };
    }
  } catch (e) {
    console.error("TTS failed", e);
  }

  // 2. Fetch visual — REAL VIDEO first (if the free video backend is up),
  //    then image fallbacks. A moving AI shot beats a Ken-Burns photo in
  //    perceived quality by an order of magnitude.
  let imageAsset: MediaAsset | null = null;
  try {
    const isLandscape = style.contentType === "youtube" || style.contentType === "presentation" || style.contentType === "documentary";
    const w = isLandscape ? 1920 : 1080;
    const h = isLandscape ? 1080 : 1920;

    // --- 2a. Text-to-Video (Seedance via Pollinations, free tier) ---
    if (await isVideoGenAvailable()) {
      try {
        // Video models want a single "action shot" description: subject + motion.
        const videoPrompt = [scene.imagePrompt, scene.motion].filter(Boolean).join(", ");
        // Длительность клипа = длительность озвучки сцены (2–10с — лимиты модели).
        const clipDur = Math.max(2, Math.min(10, Math.ceil(audioDuration + 0.5)));
        const seed = (i * 7919 + titleLength * 131) % 10000;
        const vidUrl = `/api/video-gen?prompt=${encodeURIComponent(videoPrompt)}&duration=${clipDur}&aspectRatio=${isLandscape ? "16:9" : "9:16"}&seed=${seed}`;
        const vidRes = await fetch(vidUrl);
        if (vidRes.ok && (vidRes.headers.get("content-type") || "").includes("video")) {
          const vidBlob = await vidRes.blob();
          if (vidBlob.size > 20_000) {
            const vidKey = uid("blob");
            const file = new File([vidBlob], `Scene ${i + 1}.mp4`, { type: "video/mp4" });
            await saveBlob(vidKey, file);
            filesByAssetId.set(vidKey, file);

            // Реальная длительность сгенерированного клипа (может отличаться от заказанной)
            let realDur = clipDur;
            try {
              const { readVideoMeta } = await import("../media");
              realDur = Math.max(1, (await readVideoMeta(file)).duration || clipDur);
            } catch { /* keep requested duration */ }

            imageAsset = {
              id: vidKey,
              name: `Scene ${i + 1} (AI video)`,
              kind: "video",
              mime: "video/mp4",
              blobKey: vidKey,
              duration: realDur,
              width: w, height: h,
              createdAt: Date.now(),
              hasAudio: false
            };
          }
        }
      } catch (e) {
        console.warn("Video generation failed, falling back to image", e);
      }
    }

    let imgUrl = "";

    // РЕАЛЬНОЕ ФОТО ИЗ ИНТЕРНЕТА: сцена про существующий объект (достопримечательность,
    // город, страна, известное место) — генерировать выдумку нельзя, ищем настоящее фото.
    // Срабатывает и когда LLM пометил сцену imageType="real", и когда промпт явно
    // указывает на реальный объект (страховка для режима без ключа / ошибки LLM).
    // Сцена явно помечена как реальная (LLM решил: объект существует) — если фото
    // не найдётся, выдумку НЕ генерируем (пользователь просил настоящее). Для
    // сцен, которые лишь детектор счёл реальными (ai-сцена), ИИ-фоллбэк допустим.
    const explicitlyReal = scene.imageType === "real";

    if (!imageAsset) {
      const { looksLikeRealWorldSubject } = await import("../realSubjectDetector");
      const wantsReal = explicitlyReal || looksLikeRealWorldSubject(scene.imagePrompt);
      if (wantsReal) {
        try {
          const { searchRealPhoto } = await import("../realImageSearch");
          const real = await searchRealPhoto(scene.imagePrompt, w, h);
          if (real) imgUrl = real.url;
          else console.warn("Реальное фото не найдено для:", scene.imagePrompt);
        } catch (e) {
          console.warn("Real photo search failed", e);
        }
      }
    }

    // ИИ-фоллбэк только там, где это допустимо (не для явно реальных объектов).
    if (!imageAsset && !imgUrl && !explicitlyReal) {
      // Детерминированный сид: тот же сценарий (та же сцена, тот же заголовок) —
      // тот же кадр. Math.random() делал повторную генерацию непредсказуемой и
      // ломал воспроизводимость превью/экспорта.
      const seed = (i * 7919 + titleLength * 131) % 10000;
      imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(scene.imagePrompt)}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
    }

    if (!imageAsset && imgUrl) {
      const imgRes = await fetch(imgUrl);
      if (imgRes.ok) {
        const imgBlob = await imgRes.blob();
        const imgKey = uid("blob");
        // Реальные фото бывают не только JPEG (PNG/WebP и т.п.) — берём MIME из
        // ответа, чтобы расширение файла и рендер не путали формат.
        const mime = /^image\//.test(imgBlob.type) ? imgBlob.type : "image/jpeg";
        const file = new File([imgBlob], `Scene ${i + 1}`, { type: mime });
        await saveBlob(imgKey, file);
        filesByAssetId.set(imgKey, file);

        imageAsset = {
          id: imgKey,
          name: `Scene ${i + 1}`,
          kind: "image",
          mime,
          blobKey: imgKey,
          duration: audioDuration + 0.5,
          width: w, height: h,
          createdAt: Date.now(),
          hasAudio: true
        };
      }
    }
  } catch (e) {
    console.error("Image gen failed", e);
  }

  return { image: imageAsset, voice: voiceAsset, duration: audioDuration };
}

// Re-implementing the loop to make it extremely pro
async function generateEnhancedMagicVideo(scriptData: any, sceneMedia: (SceneMedia | null)[], _filesByAssetId: Map<string, File>, _onProgress: any, style: any) {
  const { createAudioClip, createTextClip, createVideoClip, createEmptyProject } = await import("../factories");
  const { applyTextAnimation } = await import("../textAnimations");

  const project = createEmptyProject(scriptData.title);
  // Собираем ассеты сцен по индексу, допуская "дырки" там, где TTS или картинка
  // не сгенерировались — иначе (при простом push только успешных ассетов)
  // индексы съезжают и озвучка/картинка одной сцены попадает на другую.
  // TTS-ассет раньше вообще нигде не оказывался в project.assets → озвучка
  // молча терялась при экспорте (клипы ссылались на assetId, которого не было
  // в проекте). Теперь voice-ассеты собираются наравне с картинками.
  const imageAssets = sceneMedia.map((m) => m?.image).filter(Boolean) as MediaAsset[];
  const voiceAssets = sceneMedia.map((m) => m?.voice).filter(Boolean) as MediaAsset[];
  project.assets = [...imageAssets, ...voiceAssets];

  const isLandscape = style.contentType === "youtube" || style.contentType === "presentation" || style.contentType === "documentary";
  const w = isLandscape ? 1920 : 1080;
  const h = isLandscape ? 1080 : 1920;

  project.resolution = { width: w, height: h };
  project.exportSettings.width = w;
  project.exportSettings.height = h;

  const { TEMPLATES, getTemplateForContentType } = await import("../templates");
  let activeTemplate = TEMPLATES.find(t => t.id === style.templateId);
  if (!activeTemplate || activeTemplate.id === "auto") activeTemplate = getTemplateForContentType(style.contentType || "tiktok");

  const videoTrack = project.tracks.find((t: any) => t.type === "video")!;
  const audioTrack = project.tracks.find((t: any) => t.type === "audio")!;
  const textTrack = project.tracks.find((t: any) => t.type === "text")!;

  // Add music — хронометраж по РЕАЛЬНЫМ длительностям сцен (после измерения TTS),
  // иначе длинные сценарии уезжали в тишину после 30 секунды.
  try {
    const { generateProceduralMusic, proceduralStyleForTemplate } = await import("../musicGenerator");
    const { downloadFreeMusicTrack, musicMoodForVideo, selectFreeMusicTrack } = await import("../freeMusicLibrary");
    // Реальная длительность сцены на таймлайне = озвучка + 0.5с «воздуха»
    // (то же правило, что и при размещении клипов ниже). Раньше сетка BGM
    // считалась только по озвучке — музыка кончалась на ~0.5с × N раньше видео.
    const sceneDurs: number[] = scriptData.scenes.map((s: any, idx: number) =>
      (sceneMedia[idx]?.duration || Math.max(2, (s.voiceover?.length || 24) / 12)) + 0.5);
    // перекрытия xfade (0.4с на сцену) укорачивают суммарный хронометраж
    const fullDur = Math.max(3, sceneDurs.reduce((a: number, b: number) => a + b, 0) - Math.max(0, scriptData.scenes.length - 1) * 0.4);
    const mSeed = (String(scriptData.title || "").length + scriptData.scenes.length * 17 + Math.round(fullDur * 13)) | 0;
    const libraryTrack = selectFreeMusicTrack(musicMoodForVideo(activeTemplate.id, scriptData.title), mSeed);
    _onProgress?.(`🎵 Подбираем музыку: ${libraryTrack.title}...`);
    let mBlob = await downloadFreeMusicTrack(libraryTrack);
    let bgmName = libraryTrack.title;
    let bgmMime = mBlob?.type || "audio/ogg";
    // Не меняем устойчивость «Магии»: если открытая библиотека недоступна,
    // остаётся уже проверенный генератор как резервный путь.
    if (!mBlob) {
      mBlob = await generateProceduralMusic(proceduralStyleForTemplate(activeTemplate.id), fullDur + 0.5, mSeed);
      bgmName = "AI Music (fallback)";
      bgmMime = "audio/wav";
    }
    if (!mBlob) throw new Error("background music unavailable");
    const mId = "bgm_" + Date.now();
    const { saveBlob } = await import("../db");
    const bgmFile = new File([mBlob], bgmName, { type: bgmMime });
    await saveBlob(mId, bgmFile);
    _filesByAssetId.set(mId, bgmFile);
    const mAsset = { id: mId, name: bgmName, kind: "audio", mime: bgmMime, blobKey: mId, duration: fullDur + 0.5, createdAt: Date.now() };
    project.assets.push(mAsset as any);

    const mClip = createAudioClip({ trackId: audioTrack.id, asset: mAsset as any, start: 0, duration: fullDur });
    mClip.fadeOut = 1.5;

    // Build ducking keyframes (та же формула курсора, что и в цикле сцен ниже)
    const kfs: any[] = [];
    let totalDur = 0;
    for (let si = 0; si < scriptData.scenes.length; si++) {
      const sDur = sceneDurs[si];
      kfs.push({ id: "k_" + Date.now() + Math.random(), time: Math.max(0, totalDur - 0.2), value: 0.4, easing: "linear" });
      kfs.push({ id: "k_" + Date.now() + Math.random(), time: totalDur, value: 0.05, easing: "linear" });
      kfs.push({ id: "k_" + Date.now() + Math.random(), time: totalDur + sDur, value: 0.05, easing: "linear" });
      kfs.push({ id: "k_" + Date.now() + Math.random(), time: totalDur + sDur + 0.5, value: 0.4, easing: "linear" });
      totalDur += sDur - (si < scriptData.scenes.length - 1 ? 0.4 : 0);
    }

    mClip.volume = { value: 0.4, keyframes: kfs };
    audioTrack.clips.push(mClip);
  } catch (e) { }

  // Кинематографичные края
  project.openingFadeIn = 0.3;
  project.endingFadeOut = 0.5;

  let cursor = 0;
  for (let i = 0; i < scriptData.scenes.length; i++) {
    const scene = scriptData.scenes[i];

    // Find matching image asset for THIS scene index (may be a hole if the
    // fetch failed) — do not assume a densely packed array.
    const imgAsset = sceneMedia[i]?.image;
    if (!imgAsset) continue;

    const isRealVideo = imgAsset.kind === "video";
    const voiceDur = sceneMedia[i]?.duration || 3;
    // Для видео-сцены хронометраж диктует озвучка; клип растягиваем slow-mo,
    // если он короче фразы (кинематографично и бесшовно), но не медленнее 55%.
    let sceneDuration = imgAsset.duration || 3;
    let sceneSpeed = 1;
    if (isRealVideo) {
      const needed = voiceDur + 0.5;
      const srcDur = imgAsset.duration || needed;
      if (srcDur >= needed) {
        sceneDuration = needed;
      } else {
        sceneSpeed = Math.max(0.55, srcDur / needed);
        sceneDuration = Math.min(needed, srcDur / sceneSpeed);
      }
    }

    // 1. Video Clip with Ken Burns & Transitions
    const vClip = createVideoClip({
      trackId: videoTrack.id,
      asset: imgAsset,
      start: cursor,
      duration: sceneDuration
    });
    if (isRealVideo) {
      // Сгенерированное видео уже содержит движение камеры — искусственный
      // Ken Burns поверх реального моушена выглядит как дрожь.
      vClip.cameraMotion = "none";
      if (sceneSpeed !== 1) {
        vClip.speed = sceneSpeed;
        vClip.outPoint = vClip.inPoint + sceneDuration * sceneSpeed;
      }
      vClip.muted = true; // звук сцены — озвучка + музыка, не шум модели
    } else {
      // Детерминированное движение камеры: та же сцена — тот же монтаж (превью = экспорт).
      const motionPool = i === 0
        ? ["zoom-out", "pan-left"]
        : ["zoom-in", "pan-left", "pan-right", "zoom-in", "pan-up", "pan-down"];
      vClip.cameraMotion = motionPool[(i * 5 + 2) % motionPool.length] as any;
    }
    vClip.transitionIn = i === 0 ? { type: "cut", duration: 0 } : { type: activeTemplate.transition, duration: 0.4 };
    // Объединяющий грейд шаблона: сцены из разных генераторов/источников
    // иначе выглядят как нарезка из разных фильмов.
    if (activeTemplate.colorGrade && activeTemplate.colorGrade !== "none") {
      vClip.color.lut = activeTemplate.colorGrade;
    }
    videoTrack.clips.push(vClip);

    // 2. Audio voiceover — берём ассет ЭТОЙ сцены по индексу, а не по имени
    // в общем списке (там могут отсутствовать дырявые сцены).
    const aAsset = sceneMedia[i]?.voice;
    if (aAsset) {
      const aClip = createAudioClip({
        trackId: audioTrack.id,
        asset: aAsset,
        start: cursor,
        duration: aAsset.duration || sceneDuration
      });
      audioTrack.clips.push(aClip);
    }

    // 3. Text
    const words = scene.voiceover.split(" ");
    let textStart = cursor;
    // Распределение времени по весу, а не равномерно: длинные слова говорятся дольше,
    // после знака препинания TTS делает паузу. Иначе субтитры «плывут» внутри сцены
    // (накопительный сдвиг до ~20% хронометража к концу фразы).
    const weightOf = (ws: string[]) =>
      ws.reduce((a, w) => a + Math.max(1, w.length) + (/[.!?,:;…]$/.test(w) ? 2.4 : 0), 0);
    const totalWeight = Math.max(1, weightOf(words));

    let wordsPerGroup = 1;
    if (activeTemplate.pace === "slow") wordsPerGroup = 5;
    else if (activeTemplate.pace === "medium") wordsPerGroup = 3;

    const groups = [];
    let currentGroup = [];
    for (let i = 0; i < words.length; i++) {
      currentGroup.push(words[i]);
      if (currentGroup.length >= wordsPerGroup || i === words.length - 1) {
        groups.push(currentGroup.join(" "));
        currentGroup = [];
      }
    }

    for (let gIndex = 0; gIndex < groups.length; gIndex++) {
      const phrase = groups[gIndex];
      const phraseDur = Math.max(0.15, (weightOf(phrase.split(" ")) / totalWeight) * sceneDuration);

      const tClip = createTextClip({
        trackId: textTrack.id,
        start: textStart,
        duration: phraseDur,
        text: sanitizeGlyphs(phrase)
      });

      tClip.y.value = activeTemplate.text.yPosition;
      tClip.fontSize = activeTemplate.text.fontSize;
      tClip.fontFamily = activeTemplate.text.fontFamily;

      let tColor = activeTemplate.text.color || "#FFFFFF";
      if (activeTemplate.id === "hormozi" || activeTemplate.id === "mrbeast") {
        tColor = gIndex % 2 === 0 ? (activeTemplate.id === "mrbeast" ? "#00FF00" : "#FFE81A") : "#FFFFFF";
      }
      tClip.color = tColor;

      tClip.backgroundColor = activeTemplate.text.backgroundColor || "transparent";
      tClip.strokeWidth = activeTemplate.text.strokeWidth || 3;
      tClip.strokeColor = activeTemplate.text.strokeColor || "#000000";
      tClip.animationIn = activeTemplate.text.animation || "pop";

      applyTextAnimation(tClip, tClip.animationIn, tClip.y.value, phraseDur);

      textTrack.clips.push(tClip);
      textStart += phraseDur;
    }

    // Следующая сцена перекрывается переходом (0.4с), иначе субтитры уплывали бы
    // относительно рендеренной цепочки — та же математика, что и у основного autoEdit.
    cursor += sceneDuration - (i < scriptData.scenes.length - 1 ? 0.4 : 0);
  }

  project.duration = cursor;

  // --- SOUND DESIGN: whoosh на переходах, impact на старте ---
  // Тот же приём, что в основном autoEdit: смена сцены без звукового
  // акцента ощущается «плоской», удар+вжух склеивают монтаж в единое целое.
  if (typeof window !== "undefined" && window.OfflineAudioContext) {
    try {
      const { generateSfx } = await import("../sfx");
      const { saveBlob } = await import("../db");
      const { createTrack } = await import("../factories");
      const sfxTrack = createTrack("audio", "Звуковые эффекты");
      project.tracks.push(sfxTrack);

      const mkSfx = async (type: import("../sfx").SfxType, name: string, dur: number) => {
        const blob = await generateSfx(type);
        const id = "sfx_" + type + "_" + Date.now();
        const file = new File([blob], name, { type: "audio/wav" });
        await saveBlob(id, file);
        _filesByAssetId.set(id, file);
        const asset = { id, name, kind: "audio" as const, mime: "audio/wav", blobKey: id, duration: dur, createdAt: Date.now() };
        project.assets.push(asset as any);
        return asset;
      };

      const whoosh = await mkSfx("whoosh", "SFX: Whoosh", 0.5);
      const impact = await mkSfx("impact", "SFX: Impact", 1.0);

      // Impact на самом первом кадре — мгновенная энергия хука
      const first = createAudioClip({ trackId: sfxTrack.id, asset: impact as any, start: 0, duration: impact.duration });
      first.volume = { value: 0.5, keyframes: [] };
      sfxTrack.clips.push(first);

      for (const c of videoTrack.clips as import("../types").VideoClip[]) {
        if (c.start > 0.5 && c.transitionIn && c.transitionIn.type !== "cut") {
          const s = createAudioClip({ trackId: sfxTrack.id, asset: whoosh as any, start: Math.max(0, c.start - 0.15), duration: whoosh.duration });
          s.volume = { value: 0.45, keyframes: [] };
          sfxTrack.clips.push(s);
        }
      }
    } catch { /* саунд-дизайн опционален — монтаж не ломаем */ }
  }

  return project;
}
