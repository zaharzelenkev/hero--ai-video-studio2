import type { GenerationStyle, MediaAsset, Project } from "./types";
import { PACE_CLIP_SECONDS } from "./promptStyle";
import { createAudioClip, createTextClip, createVideoClip, createEmptyProject } from "./factories";
import { detectBeats, snapToBeat } from "./beatDetection";
import { analyzeWithAI, transcribeAudio, type AIAnalysisRequest } from "./ai/aiService";

export interface AutoEditInput {
  title: string;
  assets: MediaAsset[];
  filesByAssetId: Map<string, File>;
  style: GenerationStyle;
  groqApiKey?: string; // Optional AI API key for intelligent analysis
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
  const { title, assets, filesByAssetId, style, groqApiKey } = input;
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

  // AI-powered analysis (if API key provided and intelligent cuts enabled)
  let aiDecision: Awaited<ReturnType<typeof analyzeWithAI>> | null = null;
  
  if (style.intelligentCuts && groqApiKey) {
    try {
      const analysisRequest: AIAnalysisRequest = {
        userPrompt: style.rawPrompt,
        assets: assets.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.kind,
          duration: a.duration,
          // In production, add transcript from speech recognition here
        })),
      };
      
      aiDecision = await analyzeWithAI(analysisRequest, groqApiKey);
      
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
      
      const duration = aiClip.duration;
      const inPoint = aiClip.startTime;
      
      if (beats.length) {
        const rawEnd = cursor + duration;
        const snappedEnd = snapToBeat(rawEnd, beats, targetClipLen * 0.6);
        const adjusted = Math.min(snappedEnd - cursor, aiClip.endTime - aiClip.startTime);
        if (adjusted > 0.5) {
          const clip = createVideoClip({
            trackId: videoTrack.id,
            asset,
            start: cursor,
            duration: adjusted,
            inPoint,
            outPoint: inPoint + adjusted,
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
        outPoint: aiClip.endTime,
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
  } else {
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
