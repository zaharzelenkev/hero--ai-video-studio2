"use client";

export interface AIAnalysisRequest {
  userPrompt: string;
  assets: Array<{
    id: string;
    name: string;
    type: "video" | "image" | "audio";
    duration?: number;
    transcript?: string;
    width?: number;
    height?: number;
    segments?: import("../localAnalyzer").VideoSegmentMetadata[];
    audioEnergy?: import("../media").AudioEnergySegment[];
  }>;
}

export interface AIEditDecision {
  contentType: "podcast" | "youtube" | "shorts" | "reels" | "tiktok" | "ad" | "travel" | "wedding" | "educational" | "music-video" | "interview" | "presentation" | "tutorial" | "vlog" | "review" | "generic";
  targetDuration: number;
  pace: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;
  
  clips: Array<{
    assetId: string;
    startTime?: number;
    endTime?: number;
    duration: number;
    reason?: string;
    importance: number;
    emotion?: "energetic" | "calm" | "dramatic" | "funny" | "inspiring" | "neutral";
    trackType?: "main" | "b-roll";
    effects?: string[];
    zoom?: boolean;
    speedRamp?: { start: number; end: number; factor: number };
    speed?: number;
  }>;
  
  musicSync: boolean;
  transitions: "cut" | "crossfade" | "slideup" | "slidedown" | "zoom" | "blur" | "wipe";
  
  textOverlays?: Array<{
    text: string;
    time: number;
    duration: number;
    style?: "title" | "subtitle" | "caption" | "callout" | "lower-third";
    animation?: string;
  }>;
  
  bRollSuggestions?: Array<{
    time: number;
    duration: number;
    description: string;
  }>;
  
  audioEnhancements?: {
    normalize: boolean;
    denoise: boolean;
    voiceEnhance: boolean;
    removeSilence: boolean;
    ducking: boolean;
  };
  
  colorCorrection?: {
    global?: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      temperature?: number;
    };
    perClip?: Array<{
      clipId: string;
      adjustments: Record<string, number>;
    }>;
  };
  
  suggestions: string[];
  analysisQuality: "ai" | "rule-based";
}

import { DirectorEngine } from "../brain/engine";

export async function analyzeWithAI(request: AIAnalysisRequest): Promise<AIEditDecision> {
  try {
    const script = await DirectorEngine.formulateScript(request);
    return DirectorEngine.compileToDecision(script);
  } catch (error) {
    console.error("AI analysis failed:", error);
    // Fallback if engine fails completely
    return {
      contentType: "generic", targetDuration: 15, pace: "medium", colorGrade: "none", clips: [], musicSync: true, transitions: "cut", suggestions: [], analysisQuality: "rule-based"
    } as any;
  }
}

export async function transcribeAudio(_audioBlob: Blob, _apiKey?: string): Promise<string> {
  return "";
}

export async function analyzeEmotionalTone(_videoBlob: Blob): Promise<{
  overall: "positive" | "negative" | "neutral";
  timeline: Array<{ time: number; emotion: string; confidence: number }>;
}> {
  return {
    overall: "positive",
    timeline: [],
  };
}
