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
export async function autoEditToProject(input: AutoEditInput): Promise<Project> {
  const { title, assets, filesByAssetId, style, onProgress } = input;
  const project = createEmptyProject(title);
  project.style = style;
  project.assets = assets;

  const visualAssets = assets.filter((a) => a.kind === "video" || a.kind === "image");
  const musicAsset = assets.find((a) => a.kind === "audio");

  // Pick project resolution based on content type or dominant orientation
  const portraitVotes = visualAssets.filter((a) => (a.height ?? 0) > (a.width ?? 1)).length;
  
  if (style.contentType === "shorts" || style.contentType === "reels" || style.contentType === "tiktok") {
    project.resolution = { width: 1080, height: 1920 };
  } else if (visualAssets.length && portraitVotes > visualAssets.length / 2) {
    project.resolution = { width: 720, height: 1280 };
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

  
  

  // 0.1 Analyze Audio Energy
  const audioEnergyMap = new Map<string, import("./media").AudioEnergySegment[]>();
  if (style.intelligentCuts && musicAsset) {
    onProgress?.("Слушаем музыку...");
    const file = filesByAssetId.get(musicAsset.id);
    if (file) {
      try {
        const { analyzeAudioEnergy } = await import("./media");
        const energies = await analyzeAudioEnergy(file);
        audioEnergyMap.set(musicAsset.id, energies);
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

  const videoTrack = project.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;
  // Ensure we have a B-roll overlay track
  let bRollTrack = project.tracks.find((t) => t.type === "video" && t.name === "Наложение");
  if (!bRollTrack) {
    const { createTrack } = require("./factories");
    bRollTrack = createTrack("video", "Наложение");
    project.tracks.push(bRollTrack!);
  }

  let cursor = 0;
  
  // Use AI-suggested clips if available, otherwise use rule-based approach
  if (aiDecision && aiDecision.clips.length > 0) {
    const mainClips = aiDecision.clips.filter(c => c.trackType !== "b-roll");
    const bRollClips = aiDecision.clips.filter(c => c.trackType === "b-roll");
    
    // Вспомогательная функция для размещения
    const placeClip = (aiClip: any, track: import("./types").Track, isBroll: boolean, timelineStart: number) => {
      const asset = assets.find((a) => a.id === aiClip.assetId);
      if (!asset || (asset.kind !== "video" && asset.kind !== "image")) return null;
      
      const maxDur = asset.kind === "video" ? (asset.duration || 10) : 10;
      const providedStart = aiClip.startTime !== undefined ? aiClip.startTime : Math.random() * Math.max(0, maxDur - aiClip.duration);
      const inPoint = Math.max(0, Math.min(providedStart, maxDur - 0.5));
      const outPoint = Math.max(inPoint + 0.5, Math.min(aiClip.endTime !== undefined ? aiClip.endTime : (inPoint + aiClip.duration), maxDur));
      let duration = outPoint - inPoint;
      
      if (!isBroll && beats.length) {
        const rawEnd = timelineStart + duration;
        const closeBeat = beats.find(b => Math.abs(b - rawEnd) < targetClipLen * 0.6);
        const snappedEnd = closeBeat !== undefined ? closeBeat : rawEnd;
        const adjusted = Math.min(snappedEnd - timelineStart, duration);
        if (adjusted > 0.5) duration = adjusted;
      }
      
      let transType = style.transition;
      let transDur = 0.4;
      
      if (timelineStart === 0 || duration < 1.0 || isBroll) {
         transType = "cut";
         transDur = 0;
      } else {
         if (style.pace === "fast" || style.pace === "dynamic") {
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
        outPoint: inPoint + duration,
        transitionIn: { type: transType, duration: transDur },
      });
      
      clip.effects = activeTemplate.effects ? [...activeTemplate.effects] : [];
      
      // Auto-framing (Smart Reframe)
      const segs = localSegments.get(asset.id);
      if (segs && segs.length > 0) {
        // Find segment overlapping with this clip's inPoint
        const relevantSeg = segs.find(s => s.startTime <= inPoint && s.endTime > inPoint) || segs[0];
        if (relevantSeg.hasFaces && relevantSeg.faceX !== undefined && relevantSeg.faceY !== undefined) {
           clip.focusX = relevantSeg.faceX;
           clip.focusY = relevantSeg.faceY;
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
      
      if (aiClip.speed && aiClip.speed !== 1) {
         clip.speed = aiClip.speed;
      }

      if (aiClip.zoom || (asset.kind === "image" && style.kenBurns)) {
        clip.scale = {
          value: 1,
          keyframes: [
            { id: `${clip.id}_kb0`, time: 0, value: 1, easing: "linear" },
            { id: `${clip.id}_kb1`, time: duration, value: 1.15, easing: "linear" },
          ],
        };
      }
      
      track.clips.push(clip);
      return duration;
    };

    // 1. Сначала выстраиваем основной видеоряд
    for (const mainClip of mainClips) {
       const durationUsed = placeClip(mainClip, videoTrack, false, cursor);
       if (durationUsed) {
         cursor += durationUsed;
       }
    }

    // 2. Затем накладываем B-Roll (они должны распределиться по таймлайну поверх длинных кусков)
    // Так как в AIEditDecision B-Rolls могут не иметь абсолютного таймлайна, распределяем их умно:
    let bRollCursor = 0.5; // Начинаем чуть позже первого кадра
    for (const bClip of bRollClips) {
       // Размещаем где-то поверх основного таймлайна
       const bRollStart = (bClip as any).timeInTimeline !== undefined ? (bClip as any).timeInTimeline : bRollCursor;
       const dur = placeClip(bClip, bRollTrack!, true, bRollStart);
       if (dur) {
          bRollCursor = bRollStart + dur + (Math.random() * 2 + 1); // Следующий б-ролл минимум через пару секунд
       }
    }

  } else {
    const textTrack = project.tracks.find((t) => t.type === "text")!;
    // Fallback: simple caption from prompt
    const captionText = style.rawPrompt.trim().slice(0, 60);
    if (captionText) {
      const caption = createTextClip({
        trackId: textTrack.id,
        start: 0.2,
        duration: Math.min(3, project.duration - 0.4 > 0 ? project.duration - 0.4 : project.duration),
        text: captionText,
      });
      
      caption.y.value = activeTemplate.text.yPosition;
      caption.fontSize = activeTemplate.text.fontSize;
      caption.fontFamily = activeTemplate.text.fontFamily;
      caption.color = activeTemplate.text.color;
      caption.backgroundColor = activeTemplate.text.backgroundColor;
      caption.strokeWidth = activeTemplate.text.strokeWidth || 0;
      caption.strokeColor = activeTemplate.text.strokeColor || "#000000";
      caption.animationIn = activeTemplate.text.animation;
      
      textTrack.clips.push(caption);
    }
  }

  // --- SUBTITLES & AI TEXT OVERLAYS ---
  const textTrack = project.tracks.find((t) => t.type === "text") || project.tracks[project.tracks.push(require("./factories").createTrack("text", "Текст")) - 1];

  if (aiDecision?.textOverlays && aiDecision.textOverlays.length > 0) {
    for (const overlay of aiDecision.textOverlays) {
      const clip = createTextClip({
        trackId: textTrack.id,
        start: overlay.time || 0,
        duration: overlay.duration || 2,
        text: overlay.text,
      });
      clip.y.value = activeTemplate.text.yPosition;
      clip.fontSize = activeTemplate.text.fontSize;
      clip.fontFamily = activeTemplate.text.fontFamily;
      clip.color = activeTemplate.text.color;
      clip.backgroundColor = activeTemplate.text.backgroundColor;
      clip.strokeWidth = activeTemplate.text.strokeWidth;
      clip.strokeColor = activeTemplate.text.strokeColor;
      const anim = (overlay.animation as import("./types").TextAnimation) || activeTemplate.text.animation;
      clip.animationIn = anim;
      
      applyTextAnimation(clip, anim, activeTemplate.text.yPosition, clip.duration);
      textTrack.clips.push(clip);
    }
  } else if (segmentsByAssetId.size > 0) {
    // Generate Hormozi-style subtitles from Whisper words
    for (const track of project.tracks) {
      if (track.type === "video") {
        for (const clip of track.clips as import("./types").VideoClip[]) {
           const segs = segmentsByAssetId.get(clip.assetId);
           if (segs) {
              for (const s of segs) {
                 const wordStartInAsset = s.start;
                 const wordEndInAsset = s.end;
                 
                 // Check if the spoken word falls inside the trimmed clip
                 if (wordStartInAsset >= clip.inPoint && wordStartInAsset < clip.outPoint) {
                    const timelineStart = clip.start + (wordStartInAsset - clip.inPoint);
                    const durInAsset = wordEndInAsset - wordStartInAsset;
                    const durOnTimeline = Math.min(durInAsset, clip.outPoint - wordStartInAsset);
                    
                    if (durOnTimeline > 0.1) {
                      const wText = (s as any).word || (s as any).text;
                      const cleanText = wText.replace(/[^а-яА-Яa-zA-Z0-9]/g, "");
                      
                      const textClip = createTextClip({
                        trackId: textTrack.id,
                        start: timelineStart,
                        duration: durOnTimeline,
                        text: wText,
                      });
                      
                      // Template Driven Subtitles & Smart Highlighting
                      textClip.y.value = activeTemplate.text.yPosition;
                      textClip.fontSize = activeTemplate.text.fontSize || 72;
                      textClip.fontFamily = activeTemplate.text.fontFamily || "DejaVu Sans Bold";
                      
                      let tColor = activeTemplate.text.color || "#FFFFFF";
                      if (activeTemplate.id === "hormozi" || activeTemplate.id === "tiktok" || activeTemplate.id === "mrbeast" || activeTemplate.id === "podcast") {
                          const isEmphasized = cleanText.length > 5 || /!(?:\s|$)/.test(wText) || /^(не|нет|все|очень|важно|супер|как|что|это)$/i.test(cleanText);
                          const highlight = activeTemplate.id === "mrbeast" ? "#00FF00" : "#FFE81A";
                          tColor = isEmphasized ? highlight : "#FFFFFF";
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
  }

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
          duration: type === "whoosh" ? 0.5 : type === "pop" ? 0.15 : type === "riser" ? 2.0 : 0.4,
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

      // Place SFX based on visual and text events
      for (const track of project.tracks) {
        if (track.type === "text") {
          for (const clip of track.clips as import("./types").TextClip[]) {
            if (clip.animationIn && clip.animationIn !== "none" && clip.animationIn !== "fade") {
              const sfx = createAudioClip({ trackId: sfxTrack.id, asset: popAsset, start: clip.start, duration: popAsset.duration });
              sfxTrack.clips.push(sfx);
            }
          }
        }
        if (track.type === "video") {
          for (const clip of track.clips as import("./types").VideoClip[]) {
            // Whoosh on fast transitions
            if (clip.transitionIn.type !== "cut" && clip.transitionIn.type !== "crossfade" && clip.transitionIn.type !== "fadeblack" && clip.transitionIn.duration <= 0.8) {
              const sfx = createAudioClip({ trackId: sfxTrack.id, asset: whooshAsset, start: Math.max(0, clip.start - 0.2), duration: whooshAsset.duration });
              sfxTrack.clips.push(sfx);
            }
            // Riser before Climax, Hit at Climax
            if (aiDecision && track.name === "Видео 1") {
               const dec = aiDecision.clips.find(c => c.assetId === clip.assetId && Math.abs((c.startTime||0) - clip.inPoint) < 0.5);
               if (dec && dec.emotion === "dramatic" && clip.start > 2) {
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
    const musicDuration = Math.min(finalMusicAsset.duration || project.duration, project.duration);
    const { createAudioClip } = require("./factories");
    const clip = createAudioClip({
      trackId: audioTrack.id,
      asset: finalMusicAsset,
      start: 0,
      duration: project.duration,
      inPoint: 0,
      outPoint: musicDuration,
    });
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
      
      const kfs: import("./types").Keyframe[] = [];
      let lastTime = 0;
      for (const m of mergedSpeech) {
         kfs.push({ id: randId(), time: Math.max(lastTime, m.start - 0.5), value: 0.9, easing: "linear" });
         kfs.push({ id: randId(), time: m.start, value: 0.15, easing: "linear" });
         kfs.push({ id: randId(), time: m.end, value: 0.15, easing: "linear" });
         kfs.push({ id: randId(), time: m.end + 1.0, value: 0.9, easing: "linear" });
         lastTime = m.end + 1.0;
      }
      musicClip.volume = { value: 0.9, keyframes: kfs };
    }
  }

  return project;
}
