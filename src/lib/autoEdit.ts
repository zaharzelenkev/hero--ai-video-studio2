import type { GenerationStyle, MediaAsset, Project } from "./types";
import { PACE_CLIP_SECONDS } from "./promptStyle";
import { createTextClip, createVideoClip, createEmptyProject } from "./factories";
import { detectBeats } from "./beatDetection";
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
    // Determine if clips are sequential (main track) or overlapping (b-roll)
    const mainClips: any[] = [];
    const bRollClips: any[] = [];
    
    // Sort clips by startTime
    const sorted = [...aiDecision.clips].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    
    for (const aiClip of sorted) {
      if (mainClips.length > 0) {
        const lastMain = mainClips[mainClips.length - 1];
        // If this clip starts before the last one ends, it's a B-Roll!
        if (aiClip.startTime !== undefined && aiClip.startTime < (lastMain.startTime + lastMain.duration)) {
          bRollClips.push({ ...aiClip, isBRoll: true });
          continue;
        }
      }
      mainClips.push(aiClip);
    }
    
    const placeClip = (aiClip: any, track: import("./types").Track, isBroll: boolean) => {
      const asset = assets.find((a) => a.id === aiClip.assetId);
      if (!asset || (asset.kind !== "video" && asset.kind !== "image")) return;
      
      const maxDur = asset.kind === "video" ? (asset.duration || 10) : 10;
      const providedStart = aiClip.startTime !== undefined ? aiClip.startTime : Math.random() * Math.max(0, maxDur - aiClip.duration);
      const inPoint = Math.max(0, Math.min(providedStart, maxDur - 0.5));
      const outPoint = Math.max(inPoint + 0.5, Math.min(aiClip.endTime !== undefined ? aiClip.endTime : (inPoint + aiClip.duration), maxDur));
      const duration = outPoint - inPoint;
      
      // Calculate start time on timeline
      let start = cursor;
      if (isBroll && aiClip.startTime !== undefined) {
         // Place b-roll relatively
         start = aiClip.startTime;
      }

      if (!isBroll && beats.length) {
        const rawEnd = cursor + duration;
        const closeBeat = beats.find(b => Math.abs(b - rawEnd) < targetClipLen * 0.6);
        const snappedEnd = closeBeat !== undefined ? closeBeat : rawEnd;
        const adjusted = Math.min(snappedEnd - cursor, duration);
        if (adjusted > 0.5) {
          const clip = createVideoClip({
            trackId: track.id,
            asset,
            start: cursor,
            duration: adjusted,
            inPoint,
            outPoint: Math.min(inPoint + adjusted, maxDur),
            transitionIn: cursor === 0 ? { type: "cut", duration: 0 } : { type: style.transition, duration: 0.6 },
          });
          
          clip.color.lut = style.bw ? "bw" : style.colorGrade;
          track.clips.push(clip);
          if (!isBroll) cursor += adjusted;
          return;
        }
      }
      
      const clip = createVideoClip({
        trackId: track.id,
        asset,
        start,
        duration,
        inPoint,
        outPoint,
        transitionIn: start === 0 ? { type: "cut", duration: 0 } : { type: style.transition, duration: 0.6 },
      });
      
      clip.color.lut = style.bw ? "bw" : style.colorGrade;
      
      if (asset.kind === "image" && style.kenBurns) {
        clip.scale = {
          value: 1,
          keyframes: [
            { id: `${clip.id}_kb0`, time: 0, value: 1, easing: "linear" },
            { id: `${clip.id}_kb1`, time: duration, value: 1.15, easing: "linear" },
          ],
        };
      }
      
      track.clips.push(clip);
      if (!isBroll) cursor += duration;
    };

    mainClips.forEach(c => placeClip(c, videoTrack, false));
    // Since B-roll relies on absolute timeline placement based on main clips, we approximate it:
    // Right now B-roll start times are raw asset times. We need to map them to the timeline.
    // To keep it robust without overcomplicating mapping, we simply put B-roll clips in the middle of long main clips.
    bRollClips.forEach(c => {
       // Place it randomly in the second half of the timeline
       c.startTime = (cursor * 0.3) + Math.random() * (cursor * 0.5);
       placeClip(c, bRollTrack!, true);
    });

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

  
    // Add music
  if (musicAsset) {
    const audioTrack = project.tracks.find((t) => t.type === "audio")!;
    const musicDuration = Math.min(musicAsset.duration || project.duration, project.duration);
    const { createAudioClip } = require("./factories");
    const clip = createAudioClip({
      trackId: audioTrack.id,
      asset: musicAsset,
      start: 0,
      duration: project.duration,
      inPoint: 0,
      outPoint: musicDuration,
    });
    clip.fadeOut = Math.min(2, project.duration / 4);
    audioTrack.clips.push(clip);
  }

  // Smart Audio Auto-Ducking
  const audioTrack = project.tracks.find((t) => t.type === "audio");
  if (audioTrack && audioTrack.clips.length > 0) {
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
