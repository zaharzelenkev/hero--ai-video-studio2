import type { GenerationStyle, MediaAsset, Project } from "./types";
import { PACE_CLIP_SECONDS } from "./promptStyle";
import { createTextClip, createVideoClip, createEmptyProject } from "./factories";
import { detectBeats } from "./beatDetection";
import { applyTextAnimation } from "./textAnimations";
import { analyzeWithAI, type AIAnalysisRequest } from "./ai/aiService";
import { analyzeVideoLocally, type VideoSegmentMetadata } from "./localAnalyzer";
import { AI_CONFIG } from "@/config/ai";
import { extractAudioForTranscription, transcribeAudio } from "./transcribe";
import { TEMPLATES, getTemplateForContentType } from "./templates";

export interface AutoEditInput {
  onProgress?: (msg: string) => void;
  title: string;
  assets: MediaAsset[];
  filesByAssetId: Map<string, File>;
  style: GenerationStyle;
  }

/**
 * MONTIQ Professional Auto-Editor with AI Integration
 * 
 * Combines rule-based editing with optional AI intelligence:
 * - Analyzes user prompt and video content
 * - Detects best moments and emotional peaks
 * - Creates format-specific edits (podcast, shorts, ads, etc.)
 * - Syncs cuts to music beats
 * - Generates intelligent clip selection
 * - Applies professional color grading and transitions
 */
function wrapText(text: string, max: number): string {
  const words = text.split(" ");
  let lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + w).length > max) {
      if (cur) lines.push(cur.trim());
      cur = w + " ";
    } else {
      cur += w + " ";
    }
  }
  if (cur) lines.push(cur.trim());
  return lines.join("\n");
}

export async function autoEditToProject(input: AutoEditInput): Promise<Project> {
  const { title, assets, filesByAssetId, style, onProgress } = input;
  const project = createEmptyProject(title);
  project.style = style;
  project.assets = assets;

  const visualAssets = assets.filter((a) => a.kind === "video" || a.kind === "image");
  const musicAsset = assets.find((a) => a.kind === "audio");

  // Pick project resolution based on content type or dominant orientation
  const portraitVotes = visualAssets.filter((a) => (a.height ?? 0) > (a.width ?? 1)).length;
  
  if (style.contentType === "youtube" || style.contentType === "presentation" || style.contentType === "documentary") {
    project.resolution = { width: 1920, height: 1080 };
  } else if (style.contentType === "shorts" || style.contentType === "reels" || style.contentType === "tiktok") {
    project.resolution = { width: 1080, height: 1920 };
  } else if (visualAssets.length && portraitVotes > visualAssets.length / 2) {
    project.resolution = { width: 1080, height: 1920 };
  } else {
    project.resolution = { width: 1920, height: 1080 };
  }
  
  project.exportSettings.width = project.resolution.width;
  project.exportSettings.height = project.resolution.height;

  // Music beat detection for sync
  let beats: number[] = [];
  if (style.beatSync && musicAsset) {
    const file = filesByAssetId.get(musicAsset.id);
    if (file) {
      try {
        beats = await detectBeats(file);
      } catch {
        beats = [];
      }
    }
  }

  
  

  // 0.1 Analyze Audio Energy для ВСЕХ дорожек с аудио:
  // громкие пики камерного звука = эмоциональные кульминации (аплодисменты, крики драйва),
  // пики музыки = дропы. Без этого кульминационная логика работала вслепую.
  const audioEnergyMap = new Map<string, import("./media").AudioEnergySegment[]>();
  if (style.intelligentCuts || style.beatSync) {
    onProgress?.("Слушаем энергию аудиодорожек...");
    for (const a of assets) {
      if (a.kind === "image") continue;
      const file = filesByAssetId.get(a.id);
      if (!file) continue;
      try {
        const { analyzeAudioEnergy } = await import("./media");
        const energies = await analyzeAudioEnergy(file);
        if (energies.length) audioEnergyMap.set(a.id, energies);
      } catch (e) { console.warn(e); }
    }
  }

  // 0. Local Fast Vision Analysis
  const localSegments = new Map<string, VideoSegmentMetadata[]>();
  if (style.intelligentCuts) {
    for (const asset of visualAssets) {
      if (asset.kind === "video") {
        onProgress?.(`Анализ динамики: ${asset.name}...`);
        const file = filesByAssetId.get(asset.id);
        if (file) {
          try {
             const segs = await analyzeVideoLocally(file);
             localSegments.set(asset.id, segs);
          } catch(e) {
             console.warn("Local analysis failed for", asset.name, e);
          }
        }
      }
    }
  }

  // 1. Transcribe audio from videos

  const transcripts = new Map<string, string>();
  // Store raw segments for auto-subtitling
  const segmentsByAssetId = new Map<string, import("./transcribe").TranscriptWord[] | import("./transcribe").TranscriptSegment[]>();
  if (style.intelligentCuts && AI_CONFIG.groqApiKey) {
    for (const asset of visualAssets) {
      if (asset.kind === "video") {
        onProgress?.(`Распознавание речи: ${asset.name}...`);
        try {
          const file = filesByAssetId.get(asset.id);
          if (file && file.size < 100 * 1024 * 1024) { // skip giant files
            const audioBlob = await extractAudioForTranscription(file, asset);
            const transcriptResult = await transcribeAudio(audioBlob);
            const segments = transcriptResult.words.length > 0 ? transcriptResult.words : transcriptResult.segments;
            if (segments && segments.length > 0) {
              const fullText = segments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${(s as any).text || (s as any).word}`).join("\n");
              segmentsByAssetId.set(asset.id, segments);
              transcripts.set(asset.id, fullText);
              
              // If autoSubtitles is true, we might want to store segments somewhere or let the AI decision return them.
              // Actually, AI Edit Decision can return textOverlays with exact timings!
            }
          }
        } catch (err) {
          console.warn("Transcription failed for", asset.name, err);
        }
      }
    }
  }

  onProgress?.("Интеллектуальный анализ...");
  
  // AI-powered analysis (if API key provided and intelligent cuts enabled)

  onProgress?.("Интеллектуальный анализ и планирование...");
  const analysisRequest: AIAnalysisRequest = {
    userPrompt: style.rawPrompt,
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.kind,
      duration: a.duration,
      transcript: transcripts.get(a.id),
      segments: localSegments.get(a.id),
      audioEnergy: audioEnergyMap.get(a.id),
    })),
  };
  const aiDecision = await analyzeWithAI(analysisRequest);

  if (aiDecision.pace) style.pace = aiDecision.pace as any;
  if (aiDecision.colorGrade && aiDecision.colorGrade !== "none") {
    style.colorGrade = aiDecision.colorGrade as any;
  }

  // --- TEMPLATE ENGINE APPLICATION ---
  // If auto, resolve based on AI decision content type
  let activeTemplate = TEMPLATES.find(t => t.id === style.templateId);
  if (!activeTemplate || activeTemplate.id === "auto") {
     activeTemplate = getTemplateForContentType(aiDecision?.contentType || "generic");
  }

  // Force style overrides based on template!
  style.pace = activeTemplate.pace;
  if (style.colorGrade === "none" || style.templateId !== "auto") {
      style.colorGrade = activeTemplate.colorGrade as any;
  }
  style.transition = activeTemplate.transition;
  style.kenBurns = activeTemplate.kenBurns;
  
  const targetClipLen = PACE_CLIP_SECONDS[style.pace];

  // --- СТАРТ МУЗЫКИ С ДРОПА ---
  // Профи начинают трек с энергетического крюка (дроп/припев), а не с произвольной
  // нулевой секунды — иначе первые 10-20 секунд музыки часто бывают "пустым" интро.
  // Выбираем inPoint на границе пикового энергосегмента, выровненную по сетке битов,
  // и сдвигаем сетку: все склейки, вспышки и снаппинг ниже работают уже в слышимом ритме.
  let musicInPoint = 0;
  if (musicAsset && (musicAsset.duration || 0) > 0) {
    const estDuration = Math.max(10, aiDecision?.targetDuration || 30);
    const spareRoom = (musicAsset.duration || 0) - estDuration;
    if (spareRoom > 4) {
      const energies = audioEnergyMap.get(musicAsset.id);
      let target = energies
        ?.filter(e => (e.energyLevel === "drop" || e.energyLevel === "high") && e.startTime <= spareRoom + 1)
        .map(e => e.startTime)
        .find(t => t > 0.5) ?? 0;
      if (target > 0 && beats.length) {
        // начало музыкальной фразы: ближайший бит не позже пика энергии
        const aligned = [...beats].filter(b => b <= target + 0.3).pop();
        if (aligned !== undefined) target = aligned;
      }
      musicInPoint = Math.max(0, Math.min(target, spareRoom));
    }
    if (musicInPoint > 0.2 && beats.length) {
      beats = beats.map(b => b - musicInPoint).filter(b => b >= 0.25);
    }
  }

  // Биты как визуальные маркеры на таймлайне для удобства ручной правки
  if (beats.length) {
    project.markers = beats.map((b, i) => ({
       id: `beat_${i}`,
       time: b,
       label: i % 4 === 0 ? "Bar" : "Beat",
       color: i % 4 === 0 ? "#FF3366" : "#A855F7"
    }));
  }

  const videoTrack = project.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
  // Ensure we have a B-roll overlay track
  let bRollTrack = project.tracks.find((t) => t.type === "video" && t.name === "Наложение");
  if (!bRollTrack) {
    const { createTrack } = require("./factories");
    bRollTrack = createTrack("video", "Наложение");
    project.tracks.push(bRollTrack!);
  }

  let cursor = 0;
  // Карта планового времени компиляции решения -> реального времени ролика (учёт перекрытий xfade).
  // По умолчанию тождественная (нет переходов — нет сдвига).
  let mapPlannedTime: (t: number) => number = (t) => t;

  // Use AI-suggested clips if available, otherwise use rule-based approach
  if (aiDecision && aiDecision.clips.length > 0) {
    const mainClips = aiDecision.clips.filter(c => c.trackType !== "b-roll");
    const bRollClips = aiDecision.clips.filter(c => c.trackType === "b-roll");
    
    // Вспомогательная функция для размещения
    const placeClip = (aiClip: any, track: import("./types").Track, isBroll: boolean, timelineStart: number, maxTimelineDur?: number) => {
      const asset = assets.find((a) => a.id === aiClip.assetId);
      if (!asset || (asset.kind !== "video" && asset.kind !== "image")) return null;

      // Скорость воспроизведения (slow-mo / time-lapse). Длительность на таймлайне = исходные секунды / speed.
      const speed = (typeof aiClip.speed === "number" && aiClip.speed > 0) ? aiClip.speed : 1;

      const maxDur = asset.kind === "video" ? (asset.duration || 10) : 10;
      const providedStart = aiClip.startTime !== undefined ? aiClip.startTime : Math.random() * Math.max(0, maxDur - aiClip.duration);
      let inPoint = Math.max(0, Math.min(providedStart, Math.max(0, maxDur - 0.5)));
      let outPoint = Math.max(inPoint + 0.5, Math.min(aiClip.endTime !== undefined ? aiClip.endTime : (inPoint + aiClip.duration * speed), maxDur));

      // Стыки планов: B-Roll входит ровно на границе монтажного плана (если она рядом, ±0.5с) —
      // случайный врез посередине плана выглядит дилетантски.
      if (isBroll && asset.kind === "video") {
         const segs = localSegments.get(asset.id);
         const boundary = segs?.find(s => s.isSceneChange && s.startTime > 0.3 && Math.abs(s.startTime - inPoint) < 0.5);
         if (boundary) {
            const span = outPoint - inPoint;
            inPoint = boundary.startTime;
            outPoint = Math.min(maxDur, inPoint + span);
         }
      }

      // Длительность на таймлайне в секундах воспроизведения (превью считает так же).
      let duration = (outPoint - inPoint) / speed;

      if (maxTimelineDur !== undefined && duration > maxTimelineDur) {
        duration = Math.max(0.5, maxTimelineDur);
        outPoint = Math.min(maxDur, inPoint + duration * speed);
        duration = (outPoint - inPoint) / speed;
      }

      if (!isBroll && beats.length && duration > 1.0) {
        // Квантование конца клипа к БЛИЖАЙШЕМУ биту (в обе стороны) — ритм ощущается "сшитым".
        const rawEnd = timelineStart + duration;
        let closestEnd = rawEnd;
        let bestDist = Infinity;
        for (const b of beats) {
          if (b <= timelineStart + 0.6) continue;
          const d = Math.abs(b - rawEnd);
          if (d < bestDist) { bestDist = d; closestEnd = b; }
        }
        if (bestDist <= targetClipLen * 0.5) {
          const newDuration = closestEnd - timelineStart;
          const newOut = inPoint + newDuration * speed;
          if (newDuration > 0.6 && newOut <= maxDur) {
            duration = newDuration;
            outPoint = newOut;
          }
        }
      }
      
      let transType = style.transition;
      let transDur = 0.4;
      
      
      const localSegsForAsset = localSegments.get(asset.id);
      let isActionPacked = false;
      if (localSegsForAsset && localSegsForAsset.length > 0) {
        const clipSegs = localSegsForAsset.filter(s => s.endTime > inPoint && s.startTime < outPoint);
        isActionPacked = clipSegs.some(s => s.hasAction || s.motionLevel === "high" || s.motionLevel === "shake");
      }
      
      if (timelineStart === 0 || duration < 1.0 || isBroll) {
         transType = "cut";
         transDur = 0;
      } else {
         if (aiClip.reason && aiClip.reason.includes("Pattern Interrupt")) {
            const flashes = ["pixelize", "hlslice", "hblur"];
            transType = flashes[Math.floor(Math.random() * flashes.length)] as any;
            transDur = 0.2;
            // We will push noise after clip is created
         } else if (isActionPacked && Math.random() > 0.3) {
            // Match on Action
            transType = Math.random() > 0.5 ? "cut" : "hblur";
            transDur = transType === "cut" ? 0 : 0.2;
         } else if (style.pace === "fast" || style.pace === "dynamic") {
            if (Math.random() < 0.7) {
               transType = "cut";
               transDur = 0;
            } else {
               const flashy = ["hblur", "zoom", "fadewhite", "pixelize"];
               transType = flashy[Math.floor(Math.random() * flashy.length)] as any;
               transDur = 0.3;
            }
         } else if (aiClip.emotion === "dramatic" || aiClip.emotion === "energetic") {
            transType = "fadewhite"; 
            transDur = 0.5;
         } else if (aiClip.reason && aiClip.reason.includes("HOOK")) {
            transType = "hblur";
            transDur = 0.3;
         }
      }
      
      if (transDur > duration * 0.4) {
         transDur = duration * 0.4;
      }

      const clip = createVideoClip({
        trackId: track.id,
        asset,
        start: timelineStart,
        duration: duration,
        inPoint,
        outPoint,
        transitionIn: { type: transType, duration: transDur },
      });
      
      clip.effects = activeTemplate.effects ? [...activeTemplate.effects] : [];
      if (aiClip.reason && aiClip.reason.includes("Pattern Interrupt")) {
          clip.effects.push("noise");
      }

      // Nat-sound: в кинематографичных жанрах оставляем атмосферный звук площадки
      // тихим слоем под музыкой — кадр «дышит», а не звучит как GIF.
      const keepNatSound = isBroll && asset.kind === "video"
        && (activeTemplate.id === "cinematic" || activeTemplate.id === "documentary" || activeTemplate.id === "luxury");
      if (keepNatSound) {
         clip.muted = false;
         clip.volume = { value: 0.22, keyframes: [] };
      } else {
         clip.muted = !!aiDecision?.audioEnhancements?.muteOriginalAudio || isBroll;
      }
      
      if (isBroll) {
         const presentation = (aiClip as any).presentation || "fullscreen";
         if (presentation === "pip") {
             clip.fitMode = "contain";
             clip.scale.value = 0.55; // Picture-in-picture size
             clip.y.value = -0.20; // Top half of screen
             
             const startX = Math.random() > 0.5 ? 1.5 : -1.5;
             clip.x.value = startX;
             clip.x.keyframes = [
                 { id: "px1", time: 0, value: startX, easing: "easeOut" },
                 { id: "px2", time: Math.min(0.4, duration/3), value: 0, easing: "easeOut" },
                 { id: "px3", time: Math.max(0.4, duration - 0.4), value: 0, easing: "easeIn" },
                 { id: "px4", time: duration, value: -startX, easing: "easeIn" }
             ];
             
             // Dynamic rotation for aesthetic
             clip.rotation.value = startX > 0 ? 3 : -3;
             
             // Always fully opaque
             clip.opacity.value = 1;
             clip.opacity.keyframes = [];
         } else {
             clip.fitMode = "cover";
             // Native Overlay Transitions via opacity and position
             if (transType.includes("fade") || transType === "hblur") {
                 clip.opacity.value = 0;
                 clip.opacity.keyframes = [
                     { id: "k1", time: 0, value: 0, easing: "linear" },
                     { id: "k2", time: transDur, value: 1, easing: "linear" },
                     { id: "k3", time: duration - transDur, value: 1, easing: "linear" },
                     { id: "k4", time: duration, value: 0, easing: "linear" }
                 ];
             } else if (transType.includes("slide") || transType.includes("smooth") || transType === "wipeleft") {
                 const startY = transType.includes("up") ? 1 : transType.includes("down") ? -1 : 0;
                 const startX = transType.includes("left") ? 1 : transType.includes("right") ? -1 : 0;
                 
                 clip.opacity.value = 0;
                 clip.opacity.keyframes = [
                     { id: "k1", time: 0, value: 0, easing: "linear" },
                     { id: "k2", time: 0.1, value: 1, easing: "linear" },
                     { id: "k3", time: duration - 0.1, value: 1, easing: "linear" },
                     { id: "k4", time: duration, value: 0, easing: "linear" }
                 ];
                 
                 if (startY !== 0) {
                     clip.y.value = startY;
                     clip.y.keyframes = [
                         { id: "y1", time: 0, value: startY, easing: "easeOut" },
                         { id: "y2", time: transDur, value: 0, easing: "easeOut" },
                         { id: "y3", time: duration - transDur, value: 0, easing: "easeIn" },
                         { id: "y4", time: duration, value: -startY, easing: "easeIn" }
                     ];
                 } else if (startX !== 0) {
                     clip.x.value = startX;
                     clip.x.keyframes = [
                         { id: "x1", time: 0, value: startX, easing: "easeOut" },
                         { id: "x2", time: transDur, value: 0, easing: "easeOut" },
                         { id: "x3", time: duration - transDur, value: 0, easing: "easeIn" },
                         { id: "x4", time: duration, value: -startX, easing: "easeIn" }
                     ];
                 }
             } else {
                 // Fallback cut
                 clip.opacity.value = 0;
                 clip.opacity.keyframes = [
                     { id: "k1", time: 0, value: 1, easing: "linear" },
                     { id: "k2", time: duration - 0.1, value: 1, easing: "linear" },
                     { id: "k3", time: duration, value: 0, easing: "linear" }
                 ];
             }
         }
      }
      
      // Auto-framing (Smart Reframe)
      
      if (localSegsForAsset && localSegsForAsset.length > 0) {
        const clipSegs = localSegsForAsset.filter(s => s.endTime > inPoint && s.startTime < outPoint);
        if (clipSegs.some(s => s.hasFaces && s.faceX !== undefined)) {
           clip.focusX = { value: 0.5, keyframes: [] };
           clip.focusY = { value: 0.5, keyframes: [] };

           // 1. Собираем сырые точки трекера (позиции лица внутри исходного клипа)
           const raw = clipSegs
             .filter(s => s.hasFaces && s.faceX !== undefined && s.faceY !== undefined)
             .map(s => ({ t: Math.max(0, s.startTime - inPoint), x: s.faceX!, y: s.faceY! }))
             .filter(p => p.t <= duration);

           // 2. Скользящее среднее (окно 3) — убираем дрожание детектора
           const smoothed = raw.map((p, i) => {
             const win = raw.slice(Math.max(0, i - 1), Math.min(raw.length, i + 2));
             return {
               t: p.t,
               x: win.reduce((a, q) => a + q.x, 0) / win.length,
               y: win.reduce((a, q) => a + q.y, 0) / win.length,
             };
           });

           // 3. Подавляем микродёргание: ставим ключ только при заметном смещении (>5% кадра),
           //    иначе камера будет "прыгать" между близкими точками.
           const kept: typeof smoothed = [];
           for (const p of smoothed) {
             const lastK = kept[kept.length - 1];
             if (!lastK || Math.abs(p.x - lastK.x) > 0.05 || Math.abs(p.y - lastK.y) > 0.05) kept.push(p);
           }
           if (smoothed.length > 0 && kept[kept.length - 1] !== smoothed[smoothed.length - 1]) {
             kept.push(smoothed[smoothed.length - 1]); // гарантируем финальное положение камеры
           }

           for (const p of kept) {
              const kId = Math.random().toString(36).slice(2, 8);
              clip.focusX.keyframes.push({ id: `fx_${kId}`, time: p.t, value: p.x, easing: "easeInOut" });
              clip.focusY.keyframes.push({ id: `fy_${kId}`, time: p.t, value: p.y, easing: "easeInOut" });
           }
           if (clip.focusX.keyframes.length > 0) {
              clip.focusX.value = clip.focusX.keyframes[0].value;
              clip.focusY.value = clip.focusY.keyframes[0].value;
           }
        }
      }
      
      // Audio Enhancements
      if (aiDecision?.audioEnhancements) {
         // Apply to video audio layer if there is audio
         if (clip.volume.value > 0) {
            // Note: Currently denoise/voiceEnhance are in AudioClip, but VideoClip has audio properties too if we extend it, 
            // but in current implementation, audio properties inside VideoClip are limited to `volume`.
            // Wait, filterGraph uses buildAudioChain for VideoClip too! Let's pass denoise!
            (clip as any).denoise = aiDecision.audioEnhancements.denoise;
            if (aiDecision.audioEnhancements.voiceEnhance) {
               (clip as any).eqLow = 2;
               (clip as any).eqMid = 4;
               (clip as any).eqHigh = 2;
               (clip as any).compressor = true;
               (clip as any).normalize = true;
            }
         }
      }
      
      clip.color.lut = style.bw ? "bw" : style.colorGrade;
      
      // Multi-Cam Simulation (Camera Angles) + вертикальный рефрейминг:
      // горизонтальный исходник на 9:16 канвасе получает push-in, чтобы субъект читался на мобильном.
      const portraitBoost = (project.resolution.height > project.resolution.width
        && (asset.width ?? 1) > (asset.height ?? 1)
        && !isBroll) ? 1.18 : 1;
      if ((aiClip as any).cameraAngle === "medium") {
         clip.scale.value = Math.min(1.6, 1.15 * portraitBoost);
         clip.fitMode = "cover";
      } else if ((aiClip as any).cameraAngle === "close") {
         clip.scale.value = Math.min(1.8, 1.30 * portraitBoost);
         clip.fitMode = "cover";
      } else if (portraitBoost > 1 && clip.scale.value === 1) {
         clip.scale.value = portraitBoost;
         clip.fitMode = "cover";
      }

      if (speed !== 1) {
         clip.speed = speed;
      }

      // Dynamic Ken Burns (only if not already heavily cropped by camera angle, or if it's an image)
      if (aiClip.zoom || (asset.kind === "image" && style.kenBurns)) {
        if (!((aiClip as any).cameraAngle === "close")) {
           const motions: import("./types").CameraMotion[] = ["zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down"];
           clip.cameraMotion = motions[Math.floor(Math.random() * motions.length)];
        }
      }

      // Hook Push-In: медленный наезд на самом первом кадре — мгновенное ощущение движения,
      // зритель не успевает свайпнуть (применяем только если кадр ещё не анимирован).
      if (timelineStart === 0 && !isBroll
          && (!clip.cameraMotion || clip.cameraMotion === "none")
          && clip.scale.keyframes.length === 0 && duration > 1.5) {
        const baseScale = clip.scale.value || 1;
        clip.scale.keyframes = [
          { id: `hk1_${Math.random().toString(36).slice(2, 8)}`, time: 0, value: baseScale, easing: "easeOut" },
          { id: `hk2_${Math.random().toString(36).slice(2, 8)}`, time: duration, value: baseScale * 1.12, easing: "linear" },
        ];
      }

      track.clips.push(clip);
      return duration;
    };

    // 1. Сначала выстраиваем основной видеоряд
    const plannedStarts: number[] = []; // плановые старты БЕЗ учёта перекрытий переходов
    for (let i = 0; i < mainClips.length; i++) {
       const mainClip = mainClips[i];
       plannedStarts.push(cursor);
       const durationUsed = placeClip(mainClip, videoTrack, false, cursor);
       if (durationUsed) {
         cursor += durationUsed;
       }
    }

    // Fix start times based on actual transition durations generated:
    // каждый xfade «съедает» свою длительность — ролик короче плана на сумму переходов.
    let actualCursor = 0;
    for (let i = 0; i < videoTrack.clips.length; i++) {
        const c = videoTrack.clips[i] as import("./types").VideoClip;
        if (i > 0 && c.transitionIn && c.transitionIn.duration > 0) {
            actualCursor -= c.transitionIn.duration;
        }
        c.start = actualCursor;
        actualCursor += c.duration;
    }
    cursor = actualCursor; // Now cursor accurately represents the end of the visual track!

    // КАРТА ВРЕМЕНИ: плановое время (из компиляции решения) -> реальное время ролика.
    // B-Roll и AI-титры ниже размещались по плановым временам и накапливали отставание
    // на сумму переходов (к концу ролика — секунды рассинхрона!). Переводим через карту.
    const shiftPlan: { planned: number; shift: number }[] = [];
    for (let i = 0; i < videoTrack.clips.length; i++) {
        const realStart = videoTrack.clips[i].start;
        const shift = plannedStarts[i] - realStart;
        if (shift > 0.001) shiftPlan.push({ planned: plannedStarts[i], shift });
    }
    mapPlannedTime = (t: number) => {
        let s = 0;
        for (const p of shiftPlan) {
            if (p.planned <= t + 0.001) s = p.shift;
        }
        return Math.max(0, t - s);
    };

    // 2. Затем накладываем B-Roll (они должны распределиться по таймлайну поверх длинных кусков)
    // Так как в AIEditDecision B-Rolls могут не иметь абсолютного таймлайна, распределяем их умно:
    let bRollCursor = 0.5; // Начинаем чуть позже первого кадра
    for (const bClip of bRollClips) {
       // Плановые времена компиляции переводим в реальные (после перекрытий переходов)
       let bRollStart = (bClip as any).timeInTimeline !== undefined ? mapPlannedTime((bClip as any).timeInTimeline) : bRollCursor;

       // Не выносим перебивку за пределы основного видеоряда (чёрный хвост под B-Roll — провал).
       if (bRollStart >= cursor - 0.6) continue;

       if (beats.length) {
          const closestStartBeat = beats.find(b => Math.abs(b - bRollStart) < targetClipLen * 0.4);
          if (closestStartBeat !== undefined) {
             bRollStart = closestStartBeat;
          }
       }

       const dur = placeClip(bClip, bRollTrack!, true, bRollStart, Math.min(cursor - bRollStart, 6));
       if (dur) {
          bRollCursor = bRollStart + dur + (Math.random() * 2 + 1); // Следующий б-ролл минимум через пару секунд
       }
    }

  }

  // --- SUBTITLES & AI TEXT OVERLAYS ---
  const textTrack = project.tracks.find((t) => t.type === "text") || project.tracks[project.tracks.push(require("./factories").createTrack("text", "Текст")) - 1];

  // Safe-zone: интерфейс TikTok/Reels перекрывает низ и правый край вертикального кадра —
  // опускаем титры не ниже 72% высоты на портретном канвасе.
  const isPortraitCanvas = project.resolution.height > project.resolution.width;
  const safeTextY = (y: number) => (isPortraitCanvas ? Math.min(y, 0.72) : y);

  if (aiDecision?.textOverlays && aiDecision.textOverlays.length > 0) {
    for (const overlay of aiDecision.textOverlays) {
      const oStart = Math.max(0, mapPlannedTime(overlay.time || 0));
      // Титр за пределами видеоряда или на последних долях секунды — визуальный мусор, пропускаем.
      if (oStart >= cursor - 0.5) continue;
      const oDur = Math.max(0.4, Math.min(overlay.duration || 2, cursor - oStart));
      const clip = createTextClip({
        trackId: textTrack.id,
        start: oStart,
        duration: oDur,
        text: overlay.text,
      });
      clip.y.value = safeTextY(activeTemplate.text.yPosition);
      clip.fontSize = activeTemplate.text.fontSize;
      clip.fontFamily = activeTemplate.text.fontFamily;
      clip.color = activeTemplate.text.color;
      clip.backgroundColor = activeTemplate.text.backgroundColor;
      clip.strokeWidth = activeTemplate.text.strokeWidth;
      clip.strokeColor = activeTemplate.text.strokeColor;
      const anim = (overlay.animation as import("./types").TextAnimation) || activeTemplate.text.animation;
      clip.animationIn = anim;

      applyTextAnimation(clip, anim, clip.y.value, clip.duration);
      textTrack.clips.push(clip);
    }
  } else if (segmentsByAssetId.size > 0) {
    // Generate Hormozi-style subtitles from Whisper words
    for (const track of project.tracks) {
      if (track.type === "video") {
        for (const clip of track.clips as import("./types").VideoClip[]) {
           const segs = segmentsByAssetId.get(clip.assetId);
           if (segs) {
              const clipWords = segs.filter(s => s.start >= clip.inPoint && s.start < clip.outPoint);
              if (clipWords.length === 0) continue;
              
              let wordsPerGroup = 1;
              if (activeTemplate.pace === "slow") wordsPerGroup = 6;
              else if (activeTemplate.pace === "medium") wordsPerGroup = 3;
              
              const groups = [];
              let currentGroup = [];
              
              for (let i = 0; i < clipWords.length; i++) {
                 const w = clipWords[i];
                 currentGroup.push(w);
                 
                 const wText = (w as any).word || (w as any).text;
                 const hasPunctuation = /[.!?]$/.test(wText);
                 
                 if (currentGroup.length >= wordsPerGroup || hasPunctuation || i === clipWords.length - 1) {
                    groups.push({
                       start: currentGroup[0].start,
                       end: currentGroup[currentGroup.length - 1].end,
                       text: currentGroup.map(c => (c as any).word || (c as any).text).join(" "),
                       hasPunctuation,
                       isEmphasized: currentGroup.some(c => {
                          const t = ((c as any).word || (c as any).text).replace(/[^а-яА-Яa-zA-Z0-9]/g, "");
                          return t.length > 6 || /^(не|нет|все|очень|важно|супер|как|что|это)$/i.test(t);
                       })
                    });
                    currentGroup = [];
                 }
              }

              let accumulatedLine = "";
              for (const g of groups) {
                 const timelineStart = clip.start + (g.start - clip.inPoint);
                 const durInAsset = g.end - g.start;
                 const durOnTimeline = Math.min(durInAsset + (wordsPerGroup > 1 ? 0.3 : 0.05), clip.outPoint - g.start);
                 
                 accumulatedLine += (accumulatedLine ? " " : "") + g.text;

                 if (durOnTimeline > 0.1) {
                    const textClip = createTextClip({
                      trackId: textTrack.id,
                      start: timelineStart,
                      duration: durOnTimeline,
                      text: wrapText(accumulatedLine, 22),
                    });
                    
                    if (g.hasPunctuation) {
                        accumulatedLine = ""; // Сбрасываем строку после конца предложения!
                    }
                    
                    textClip.y.value = safeTextY(activeTemplate.text.yPosition);
                    textClip.fontSize = activeTemplate.text.fontSize || 72;
                    textClip.fontFamily = activeTemplate.text.fontFamily || "DejaVu Sans Bold";
                    
                    let tColor = activeTemplate.text.color || "#FFFFFF";
                    if (activeTemplate.id === "hormozi" || activeTemplate.id === "tiktok" || activeTemplate.id === "mrbeast" || activeTemplate.id === "podcast") {
                        const highlight = activeTemplate.id === "mrbeast" ? "#00FF00" : "#FFE81A";
                        tColor = g.isEmphasized ? highlight : "#FFFFFF";
                    }
                    textClip.color = tColor;
                    
                    textClip.backgroundColor = activeTemplate.text.backgroundColor || "transparent";
                    textClip.strokeWidth = activeTemplate.text.strokeWidth || 3;
                    textClip.strokeColor = activeTemplate.text.strokeColor || "#000000";
                    textClip.animationIn = activeTemplate.text.animation || "pop";
                    
                    applyTextAnimation(textClip, textClip.animationIn, textClip.y.value, durOnTimeline);
                    
                    textTrack.clips.push(textClip);
                 }
              }
           }
        }
      }
    }
  }

  // Титульная карточка: у визуальных роликов без речи и титров первые секунды
  // без текста выглядят "голыми" — открываем фильм названием проекта.
  if (textTrack.clips.length === 0 && title.trim().length > 2 && cursor > 3.5) {
    const tClip = createTextClip({
      trackId: textTrack.id,
      start: Math.min(0.6, cursor * 0.1),
      duration: Math.min(3.2, cursor - 1.2),
      text: wrapText(title.trim().toUpperCase(), 16),
    });
    tClip.y.value = safeTextY(activeTemplate.text.yPosition);
    tClip.fontSize = Math.round((activeTemplate.text.fontSize || 60) * 1.15);
    tClip.fontFamily = activeTemplate.text.fontFamily;
    tClip.color = activeTemplate.text.color;
    tClip.backgroundColor = "transparent";
    tClip.strokeWidth = activeTemplate.text.strokeWidth ?? 2;
    tClip.strokeColor = activeTemplate.text.strokeColor || "#000000";
    tClip.animationIn = "blur-in";
    applyTextAnimation(tClip, "blur-in", tClip.y.value, tClip.duration);
    textTrack.clips.push(tClip);
  }

  // Кинематографичный вход/финал: мягкий уход в чёрный читается как завершённость,
  // резкий обрыв выглядит браком экспорта почти в любом жанре.
  if (activeTemplate.pace === "slow") {
    project.openingFadeIn = 0.5;
    project.endingFadeOut = 0.7;
  } else if (activeTemplate.pace === "medium") {
    project.endingFadeOut = 0.4;
  } else {
    project.endingFadeOut = 0.2;
  }

  // --- MICRO-CHOREOGRAPHY ENGINE (PUNCH ZOOMS & BEAT FLASHES) ---
  onProgress?.("Финальная полировка ритма (Micro-Choreography)...");
  
  // 1. Beat Flashes on B-Rolls (Оптическая пульсация под музыку)
  if (beats.length > 0 && (style.pace === "fast" || style.pace === "dynamic")) {
      for (const bClip of bRollTrack!.clips as import("./types").VideoClip[]) {
          const clipStart = bClip.start;
          const clipEnd = bClip.start + bClip.duration;
          // Ищем биты, которые попадают в середину B-Roll клипа
          const rawBeats = beats.filter(b => b > clipStart + 0.3 && b < clipEnd - 0.3);
          // Не чаще одной вспышки в 0.9с: плотная темп-сетка превращает свет в стробоскоп
          const containedBeats: number[] = [];
          for (const b of rawBeats) {
             if (containedBeats.length === 0 || b - containedBeats[containedBeats.length - 1] >= 0.9) containedBeats.push(b);
          }

          for (const beat of containedBeats) {
              const localBeat = beat - clipStart;
              // Добавляем короткую вспышку яркости на каждый бит
              bClip.color.brightness.keyframes.push(
                  { id: `fl_${Date.now()}_${Math.random()}`, time: Math.max(0, localBeat - 0.1), value: 0, easing: "linear" },
                  { id: `fl_${Date.now()}_${Math.random()}`, time: localBeat, value: 0.3, easing: "easeOut" },
                  { id: `fl_${Date.now()}_${Math.random()}`, time: Math.min(bClip.duration, localBeat + 0.3), value: 0, easing: "easeIn" }
              );
          }
      }
  }

  // 2. Semantic Punch Zooms (Резкие наезды камеры на акцентных словах)
  for (const tClip of textTrack.clips as import("./types").TextClip[]) {
      // Ищем выделенные цветом слова (акценты из Hormozi/MrBeast стилей)
      const isHighlight = tClip.color === "#00FF00" || tClip.color === "#FFE81A";
      
      if (isHighlight) {
          // Находим видеоклип, который играет в этот момент
          const activeBroll = bRollTrack!.clips.find(c => c.start <= tClip.start && (c.start + c.duration) >= tClip.start + 0.1) as import("./types").VideoClip;
          const activeMain = videoTrack.clips.find(c => c.start <= tClip.start && (c.start + c.duration) >= tClip.start + 0.1) as import("./types").VideoClip;
          const targetClip = activeBroll || activeMain;

          if (targetClip) {
              const localStart = tClip.start - targetClip.start;
              const localEnd = localStart + tClip.duration;
              
              // Делаем панч только если клип еще не перегружен анимациями
              if (targetClip.scale.keyframes.length <= 2) {
                  const baseV = targetClip.scale.keyframes[0]?.value || targetClip.scale.value;
                  const punchV = baseV * 1.1; // 10% резкий зум
                  
                  targetClip.scale.keyframes.push(
                      { id: `pz_${Date.now()}_${Math.random()}`, time: Math.max(0, localStart - 0.05), value: baseV, easing: "linear" },
                      { id: `pz_${Date.now()}_${Math.random()}`, time: localStart, value: punchV, easing: "easeOut" },
                      { id: `pz_${Date.now()}_${Math.random()}`, time: localEnd, value: punchV, easing: "linear" },
                      { id: `pz_${Date.now()}_${Math.random()}`, time: Math.min(targetClip.duration, localEnd + 0.1), value: baseV, easing: "easeIn" }
                  );
              }
          }
      }
  }

  project.duration = cursor;

  // --- SOUND EFFECTS (SFX) GENERATION ---
  // Create an SFX track
  const { createTrack, createAudioClip } = require("./factories");
  const sfxTrack = createTrack("audio", "Звуковые эффекты");
  project.tracks.push(sfxTrack);

  if (typeof window !== "undefined" && window.OfflineAudioContext) {
    onProgress?.("Синтез саунд-дизайна (SFX)...");
    try {
      const { generateSfx } = await import("./sfx");
      const { saveBlob } = await import("./db");
      
      const addSfxAsset = async (type: import("./sfx").SfxType, name: string) => {
        const blob = await generateSfx(type);
        const assetId = "sfx_" + type + "_" + Date.now();
        const file = new File([blob], name, { type: "audio/wav" });
        await saveBlob(assetId, file);
        const asset: MediaAsset = {
          id: assetId,
          name,
          kind: "audio",
          mime: "audio/wav",
          blobKey: assetId,
          duration: (type === "whoosh" || type === "swoosh") ? 0.5 : (type === "pop" || type === "glitch") ? 0.3 : type === "riser" ? 2.0 : type === "impact" ? 1.0 : type === "ding" ? 0.8 : 0.4,
          createdAt: Date.now()
        };
        project.assets.push(asset);
        filesByAssetId.set(assetId, file);
        return asset;
      };

      const popAsset = await addSfxAsset("pop", "SFX: Pop");
      const whooshAsset = await addSfxAsset("whoosh", "SFX: Whoosh");
      const riserAsset = await addSfxAsset("riser", "SFX: Riser");
      const hitAsset = await addSfxAsset("hit", "SFX: Hit");
      const swooshAsset = await addSfxAsset("swoosh", "SFX: Swoosh");
      const glitchAsset = await addSfxAsset("glitch", "SFX: Glitch");
      const impactAsset = await addSfxAsset("impact", "SFX: Impact");
      const dingAsset = await addSfxAsset("ding", "SFX: Ding");

      // Place SFX based on visual and text events
      let isFirstClip = true;
      for (const track of project.tracks) {
        if (track.type === "text") {
          for (const clip of track.clips as import("./types").TextClip[]) {
            if (clip.animationIn && clip.animationIn !== "none" && clip.animationIn !== "fade") {
              // Не озвучиваем КАЖДОЕ слово субтитров — иначе получаем пулемётную очередь попов.
              // Звук даём только акцентным словам и крупным титрам (Hormozi/Beast так и звучат).
              const isSubtitleWord = clip.duration < 0.9;
              const isEmphasized = clip.color === "#00FF00" || clip.color === "#FFE81A";
              if (isSubtitleWord && !isEmphasized) continue;
              let chosenAsset = popAsset;
              if (clip.animationIn === "typewriter") chosenAsset = dingAsset;
              else if (clip.animationIn === "glitch") chosenAsset = glitchAsset;
              
              const sfx = createAudioClip({ trackId: sfxTrack.id, asset: chosenAsset, start: clip.start, duration: chosenAsset.duration });
              sfxTrack.clips.push(sfx);
            }
          }
        }
        if (track.type === "video") {
          for (const clip of track.clips as import("./types").VideoClip[]) {
            // First clip impact
            if (isFirstClip && track.name === "Видео 1" && clip.start === 0) {
               const sfx = createAudioClip({ trackId: sfxTrack.id, asset: impactAsset, start: 0, duration: impactAsset.duration });
               sfxTrack.clips.push(sfx);
               isFirstClip = false;
            }
            
            // Swoosh or Pop on B-Roll
            if (track.name === "Наложение" && clip.start > 0.5) {
               const isPip = clip.fitMode === "contain";
               const tAsset = isPip ? popAsset : swooshAsset;
               const sfx = createAudioClip({ trackId: sfxTrack.id, asset: tAsset, start: clip.start, duration: tAsset.duration });
               sfxTrack.clips.push(sfx);
            }

            // Transitions
            if (clip.transitionIn.type !== "cut" && clip.transitionIn.type !== "crossfade" && clip.transitionIn.type !== "fadeblack" && clip.transitionIn.duration <= 0.8) {
              let tAsset = whooshAsset;
              if (clip.transitionIn.type === "pixelize" || clip.transitionIn.type === "hlslice") tAsset = glitchAsset;
              
              const sfx = createAudioClip({ trackId: sfxTrack.id, asset: tAsset, start: Math.max(0, clip.start - 0.2), duration: tAsset.duration });
              sfxTrack.clips.push(sfx);
            }
            
            // Riser before Climax, Hit at Climax OR Major Beat Drops
            if (aiDecision && track.name === "Видео 1") {
               const dec = aiDecision.clips.find(c => c.assetId === clip.assetId && Math.abs((c.startTime||0) - clip.inPoint) < 0.5);
               
               let isBeatDrop = false;
               if (beats.length && (style.pace === "fast" || style.pace === "dynamic")) {
                  isBeatDrop = beats.some(b => Math.abs(b - clip.start) < 0.1);
               }

               if (dec && dec.reason && dec.reason.includes("Teaser")) {
                  const hit = createAudioClip({ trackId: sfxTrack.id, asset: hitAsset, start: clip.start, duration: hitAsset.duration });
                  sfxTrack.clips.push(hit);
               } else if ((dec && dec.emotion === "dramatic" && clip.start > 2) || (isBeatDrop && Math.random() > 0.7)) {
                  const sfx = createAudioClip({ trackId: sfxTrack.id, asset: riserAsset, start: Math.max(0, clip.start - riserAsset.duration), duration: riserAsset.duration });
                  sfxTrack.clips.push(sfx);
                  const hit = createAudioClip({ trackId: sfxTrack.id, asset: hitAsset, start: clip.start, duration: hitAsset.duration });
                  sfxTrack.clips.push(hit);
               }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to generate SFX", e);
    }
  }

  // Нормализация громкости SFX: синтезированные эффекты генерируются «в упор»
  // (gain 0.6-1.0), в миксе они должны сидеть чуть НИЖЕ музыкальной кровати.
  for (const s of sfxTrack.clips as import("./types").AudioClip[]) {
     s.volume = { value: 0.55, keyframes: [] };
  }

  // --- MUSIC GENERATION (Fallback to Procedural if no musicAsset) ---
  let finalMusicAsset = musicAsset;
  
  if (!finalMusicAsset && typeof window !== "undefined" && window.OfflineAudioContext && project.duration > 0) {
     onProgress?.("Генерация фоновой музыки...");
     try {
        const { generateProceduralMusic } = await import("./musicGenerator");
        const { saveBlob } = await import("./db");
        
        // Pick style based on template/genre
        let mStyle: "lofi" | "cinematic" | "electronic" = "electronic";
        if (style.templateId === "travel" || style.templateId === "cinematic" || style.templateId === "luxury" || style.templateId === "documentary") mStyle = "cinematic";
        if (style.templateId === "podcast" || style.templateId === "hormozi" || style.templateId === "minimal") mStyle = "lofi";
        
        const mBlob = await generateProceduralMusic(mStyle, project.duration);
        const mId = "bgm_" + Date.now();
        const mFile = new File([mBlob], `AI Music (${mStyle})`, { type: "audio/wav" });
        await saveBlob(mId, mFile);
        
        finalMusicAsset = {
          id: mId,
          name: `AI Music (${mStyle})`,
          kind: "audio",
          mime: "audio/wav",
          blobKey: mId,
          duration: project.duration,
          createdAt: Date.now()
        };
        project.assets.push(finalMusicAsset);
        filesByAssetId.set(mId, mFile);
     } catch(e) {
        console.warn("Failed to generate BGM", e);
     }
  }

  // Add music
  if (finalMusicAsset) {
    const audioTrack = project.tracks.find((t) => t.type === "audio")!;
    const musicAssetDur = finalMusicAsset.duration || project.duration;
    // Если трек короче ролика — зацикливаем бесшовно, иначе хвост видео уходит в тишину.
    const needsLoop = musicAssetDur < project.duration - 0.5;
    // Для сгенерированной музыки сдвиг нулевой, для пользовательского трека — стартуем с дропа.
    const inPoint = finalMusicAsset === musicAsset ? musicInPoint : 0;
    const { createAudioClip } = require("./factories");
    const clip = createAudioClip({
      trackId: audioTrack.id,
      asset: finalMusicAsset,
      start: 0,
      duration: project.duration,
      inPoint,
      outPoint: needsLoop ? inPoint + project.duration : inPoint + Math.min(musicAssetDur - inPoint, project.duration),
    });
    clip.loop = needsLoop;
    // Вход музыки: для динамичных жанров — почти мгновенно (удар в бит), для кино — плавное вхождение.
    clip.fadeIn = activeTemplate.pace === "slow" ? 1.2 : 0.35;
    // Set appropriate volume
    clip.volume = { value: style.templateId === "podcast" || style.templateId === "hormozi" ? 0.15 : 0.6, keyframes: [] };
    clip.fadeOut = Math.min(2, project.duration / 4);
    audioTrack.clips.push(clip);
  }

  // Smart Audio Auto-Ducking
  const audioTrack = project.tracks.find((t) => t.type === "audio");
  if (audioTrack && audioTrack.clips.length > 0 && finalMusicAsset) {
    const musicClip = audioTrack.clips[0] as import("./types").AudioClip;
    
    // Collect all speech intervals
    const speechTimes: { start: number; end: number }[] = [];
    for (const track of project.tracks) {
      if (track.type === "video") {
        for (const clip of track.clips as import("./types").VideoClip[]) {
           const segs = segmentsByAssetId.get(clip.assetId);
           if (segs) {
              for (const s of segs) {
                 const maxStart = Math.max(clip.inPoint, s.start);
                 const minEnd = Math.min(clip.outPoint, s.end);
                 if (minEnd > maxStart) {
                    const gStart = clip.start + (maxStart - clip.inPoint);
                    const gEnd = gStart + (minEnd - maxStart);
                    speechTimes.push({ start: gStart, end: gEnd });
                 }
              }
           }
        }
      }
    }

    if (speechTimes.length > 0) {
      // Sort and merge close speech segments (< 1.5s apart)
      speechTimes.sort((a, b) => a.start - b.start);
      const mergedSpeech: { start: number; end: number }[] = [];
      for (const s of speechTimes) {
         if (mergedSpeech.length === 0) {
           mergedSpeech.push(s);
         } else {
           const last = mergedSpeech[mergedSpeech.length - 1];
           if (s.start - last.end < 1.5) {
             last.end = Math.max(last.end, s.end);
           } else {
             mergedSpeech.push(s);
           }
         }
      }
      
      // Generate keyframes
      const randId = () => Math.random().toString(36).substring(7);

      // Базовый уровень музыки берём из шаблона (подкаст ~0.15, иначе ~0.6),
      // а НЕ из константы — иначе музыка заглушает речь между репликами.
      const baseLevel = musicClip.volume.value;
      const duckLevel = Math.min(0.15, baseLevel * 0.25);

      const kfs: import("./types").Keyframe[] = [];
      let lastTime = 0;
      for (const m of mergedSpeech) {
         kfs.push({ id: randId(), time: Math.max(lastTime, m.start - 0.5), value: baseLevel, easing: "linear" });
         kfs.push({ id: randId(), time: m.start, value: duckLevel, easing: "linear" });
         kfs.push({ id: randId(), time: m.end, value: duckLevel, easing: "linear" });
         kfs.push({ id: randId(), time: m.end + 1.0, value: baseLevel, easing: "linear" });
         lastTime = m.end + 1.0;
      }
      musicClip.volume = { value: baseLevel, keyframes: kfs };
    }
  }

  return project;
}
