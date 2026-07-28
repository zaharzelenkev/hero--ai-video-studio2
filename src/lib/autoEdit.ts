import type { GenerationStyle, MediaAsset, Project } from "./types";
import { PACE_CLIP_SECONDS } from "./promptStyle";
import { createAudioClip, createTextClip, createVideoClip, createEmptyProject } from "./factories";
import { detectBeats, snapToBeat } from "./beatDetection";
import { analyzeWithAI, type AIAnalysisRequest } from "./ai/aiService";
import { analyzeVideoLocally, type VideoSegmentMetadata } from "./localAnalyzer";
import { AI_CONFIG } from "@/config/ai";
import { extractAudioForTranscription, transcribeAudio } from "./transcribe";

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

  let aiDecision: Awaited<ReturnType<typeof analyzeWithAI>> | null = null;
  
    if (style.intelligentCuts && AI_CONFIG.groqApiKey) {
    try {
      const analysisRequest: AIAnalysisRequest = {
        userPrompt: style.rawPrompt,
        assets: assets.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.kind,
          duration: a.duration,
          transcript: transcripts.get(a.id),
          segments: localSegments.get(a.id),
        })),
      };
      
      aiDecision = await analyzeWithAI(analysisRequest);
      
      // Apply AI recommendations
      if (aiDecision.pace) style.pace = aiDecision.pace as any;
      if (aiDecision.colorGrade && aiDecision.colorGrade !== "none") {
        style.colorGrade = aiDecision.colorGrade as any;
      }
    } catch (error) {
      console.warn("AI analysis failed, using rule-based approach:", error);
    }
  }

  const targetClipLen = PACE_CLIP_SECONDS[style.pace];
  const videoTrack = project.tracks.find((t) => t.type === "video" && t.name === "Видео 1")!;

  let cursor = 0;
  
  // Use AI-suggested clips if available, otherwise use rule-based approach
  if (aiDecision && aiDecision.clips.length > 0) {
    // AI-driven clip selection
    aiDecision.clips.forEach((aiClip, i) => {
      const asset = assets.find((a) => a.id === aiClip.assetId);
      if (!asset || (asset.kind !== "video" && asset.kind !== "image")) return;
      
      const maxDur = asset.kind === "video" ? (asset.duration || 10) : 10;
      // If AI didn't provide startTime, we randomize it based on available duration
      const providedStart = aiClip.startTime !== undefined ? aiClip.startTime : Math.random() * Math.max(0, maxDur - aiClip.duration);
      const inPoint = Math.max(0, Math.min(providedStart, maxDur - 0.5));
      const outPoint = Math.max(inPoint + 0.5, Math.min(aiClip.endTime !== undefined ? aiClip.endTime : (inPoint + aiClip.duration), maxDur));
      const duration = outPoint - inPoint;
      
      if (beats.length) {
        const rawEnd = cursor + duration;
        const snappedEnd = snapToBeat(rawEnd, beats, targetClipLen * 0.6);
        const adjusted = Math.min(snappedEnd - cursor, duration);
        if (adjusted > 0.5) {
          const clip = createVideoClip({
            trackId: videoTrack.id,
            asset,
            start: cursor,
            duration: adjusted,
            inPoint,
            outPoint: Math.min(inPoint + adjusted, maxDur),
            transitionIn: i === 0 ? { type: "cut", duration: 0 } : { type: style.transition, duration: 0.6 },
          });
          
          clip.color.lut = style.bw ? "bw" : style.colorGrade;
          videoTrack.clips.push(clip);
          cursor += adjusted;
          return;
        }
      }
      
      const clip = createVideoClip({
        trackId: videoTrack.id,
        asset,
        start: cursor,
        duration,
        inPoint,
        outPoint,
        transitionIn: i === 0 ? { type: "cut", duration: 0 } : { type: style.transition, duration: 0.6 },
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
      
      videoTrack.clips.push(clip);
      cursor += duration;
    });
  }
  
  if (videoTrack.clips.length === 0) {

    // Rule-based clip selection (original logic)
    // Rule-based clip selection (original logic)
    visualAssets.forEach((asset, i) => {
      const maxLen = asset.kind === "image" ? targetClipLen * 1.4 : Math.max(0.8, Math.min(asset.duration || targetClipLen, targetClipLen * 1.6));
      let duration = Math.min(targetClipLen, Math.max(0.6, maxLen));

      if (beats.length) {
        const rawEnd = cursor + targetClipLen;
        const snappedEnd = snapToBeat(rawEnd, beats, targetClipLen * 0.6);
        const candidate = snappedEnd - cursor;
        if (candidate > 0.5 && candidate < targetClipLen * 2.2) duration = Math.min(candidate, maxLen * 1.3);
      }

      const inPoint = asset.kind === "video" ? Math.max(0, ((asset.duration || duration) - duration) / 2) : 0;
      const clip = createVideoClip({
        trackId: videoTrack.id,
        asset,
        start: cursor,
        duration,
        inPoint,
        outPoint: inPoint + duration,
        transitionIn: i === 0 ? { type: "cut", duration: 0 } : { type: style.transition, duration: 0.6 },
      });
      clip.color.lut = style.bw ? "bw" : style.colorGrade;
      if (asset.kind === "image" && style.kenBurns) {
        // Slow drifting zoom-in, purely CSS/FFmpeg keyframes - no AI needed.
        clip.scale = {
          value: 1,
          keyframes: [
            { id: `${clip.id}_kb0`, time: 0, value: 1, easing: "linear" },
            { id: `${clip.id}_kb1`, time: duration, value: 1.12, easing: "linear" },
          ],
        };
      }
      videoTrack.clips.push(clip);
      cursor += duration;
    });
  }

  const totalDuration = style.targetDuration || Math.max(cursor, 1);
  project.duration = totalDuration;

  // Add auto-subtitles mapped to the final video cuts
  if (style.autoSubtitles) {
    const textTrack = project.tracks.find((t) => t.type === "text")!;
    for (const clip of videoTrack.clips) {
      if (clip.type !== "video") continue;
      const vClip = clip as import("./types").VideoClip;
      const segs = segmentsByAssetId.get(vClip.assetId);
      if (!segs) continue;
      
      let i = 0;
      while (i < segs.length) {
        const seg1 = segs[i] as any;
        let text = seg1.text || seg1.word;
        let segEnd = seg1.end;
        let step = 1;
        
        // Group up to 2 short words
        if (i + 1 < segs.length && text.length < 6 && (segs[i+1] as any).text?.length < 6 || (segs[i+1] as any).word?.length < 6) {
           text += " " + ((segs[i+1] as any).text || (segs[i+1] as any).word);
           segEnd = segs[i+1].end;
           step = 2;
        }

        // Check overlap
        const maxStart = Math.max(vClip.inPoint, seg1.start);
        const minEnd = Math.min(vClip.outPoint, segEnd);
        
        if (minEnd > maxStart) {
          const globalStart = vClip.start + (maxStart - vClip.inPoint);
          const globalDuration = minEnd - maxStart;
          
          if (globalDuration > 0.05) {
            const txtClip = createTextClip({
              trackId: textTrack.id,
              start: globalStart,
              duration: globalDuration,
              text: text.toUpperCase(),
            });
            
            txtClip.y.value = 0.15;
            txtClip.fontSize = 75;
            txtClip.fontFamily = "DejaVu Sans Bold";
            txtClip.color = text.length > 7 || Math.random() > 0.7 ? "#FFE81A" : "#FFFFFF";
            txtClip.backgroundColor = "transparent";
            txtClip.strokeWidth = 6;
            txtClip.strokeColor = "#000000";
            
            txtClip.animationIn = "pop";
            txtClip.animationOut = "none";
            txtClip.rotation = { value: (Math.random() - 0.5) * 6, keyframes: [] };
            
            textTrack.clips.push(txtClip);
          }
        }
        i += step;
      }
    }
  }

  // Add music
  if (musicAsset) {
    const audioTrack = project.tracks.find((t) => t.type === "audio")!;
    const musicDuration = Math.min(musicAsset.duration || totalDuration, totalDuration);
    const clip = createAudioClip({
      trackId: audioTrack.id,
      asset: musicAsset,
      start: 0,
      duration: totalDuration,
      inPoint: 0,
      outPoint: musicDuration,
    });
    clip.fadeOut = Math.min(2, totalDuration / 4);
    audioTrack.clips.push(clip);
  }

  // Add captions/text overlays from AI or user prompt
  if (style.addCaptions || style.autoSubtitles) {
    const textTrack = project.tracks.find((t) => t.type === "text")!;
    
    if (aiDecision?.textOverlays && aiDecision.textOverlays.length > 0) {
      // AI-generated text overlays
      aiDecision.textOverlays.forEach((overlay) => {
        const caption = createTextClip({
          trackId: textTrack.id,
          start: overlay.time,
          duration: overlay.duration,
          text: overlay.text,
        });
        caption.animationIn = "fade";
        caption.animationOut = "fade";
        textTrack.clips.push(caption);
      });
    } else {
      // Fallback: simple caption from prompt
      const captionText = style.rawPrompt.trim().slice(0, 60);
      if (captionText) {
        const caption = createTextClip({
          trackId: textTrack.id,
          start: 0.2,
          duration: Math.min(3, totalDuration - 0.4 > 0 ? totalDuration - 0.4 : totalDuration),
          text: captionText,
        });
        textTrack.clips.push(caption);
      }
    }
  }

  return project;
}
