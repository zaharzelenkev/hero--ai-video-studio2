"use client";

/**
 * MONTIQ AI Service - Professional Video Analysis & Montage Planning
 * 
 * Использует передовые AI-модели для интеллектуального анализа видеоконтента
 * и создания профессиональных монтажных решений на уровне опытного монтажера.
 */

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
  }>;
}

export interface AIEditDecision {
  contentType: "podcast" | "youtube" | "shorts" | "reels" | "tiktok" | "ad" | "travel" | "wedding" | "educational" | "music-video" | "interview" | "presentation" | "tutorial" | "vlog" | "review" | "generic";
  targetDuration: number;
  pace: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;
  
  clips: Array<{
    assetId: string;
    startTime: number;
    endTime: number;
    duration: number;
    reason?: string;
    importance: number;
    emotion?: "energetic" | "calm" | "dramatic" | "funny" | "inspiring" | "neutral";
    effects?: string[];
    zoom?: boolean;
    speedRamp?: { start: number; end: number; factor: number };
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

import { AI_CONFIG } from "@/config/ai";

export async function analyzeWithAI(request: AIAnalysisRequest): Promise<AIEditDecision> {
  const apiKey = AI_CONFIG.groqApiKey;
  if (!apiKey) {
    return generateRuleBasedDecision(request);
  }

  try {
    
    const hasTranscript = request.assets.some(a => !!a.transcript);
    
    const systemPrompt = `Ты — опытный видеомонтажер. Твоя задача — составить план монтажа в формате JSON.
${hasTranscript 
  ? "В материалах есть транскрипция с таймкодами. ВЫБЕРИ самые интересные фразы и укажи их точные startTime и endTime. Вырезай тишину!" 
  : "В материалах НЕТ речи. НЕ ПЫТАЙСЯ угадывать startTime и endTime. Просто укажи 'assetId' и желаемую 'duration' (в секундах) для каждого клипа, а также эффекты."}
ОБЯЗАТЕЛЬНО используй только те assetId, которые есть в списке материалов.
`;

    const exampleResponse = hasTranscript ? {
      contentType: "podcast",
      targetDuration: 30,
      pace: "medium",
      colorGrade: "cinematic",
      clips: [
        { assetId: request.assets[0]?.id || "v1", startTime: 12.5, endTime: 16.0, duration: 3.5, reason: "Важная мысль", importance: 0.9 }
      ],
      musicSync: true,
      transitions: "cut",
      textOverlays: [{ text: "Главная мысль", time: 0, duration: 3, style: "title" }],
      audioEnhancements: { normalize: true, denoise: true, voiceEnhance: true, removeSilence: true, ducking: true },
      suggestions: ["Удалена тишина"],
      analysisQuality: "ai"
    } : {
      contentType: "youtube",
      targetDuration: 15,
      pace: "dynamic",
      colorGrade: "vivid",
      clips: [
        { assetId: request.assets[0]?.id || "v1", duration: 2.5, reason: "Вступление", importance: 0.9, zoom: true },
        { assetId: request.assets[0]?.id || "v1", duration: 1.5, reason: "Динамика", importance: 0.8, zoom: false }
      ],
      musicSync: true,
      transitions: "crossfade",
      textOverlays: [{ text: "Летний вайб", time: 0, duration: 2, style: "title" }],
      audioEnhancements: { normalize: true, denoise: false, voiceEnhance: false, removeSilence: false, ducking: true },
      suggestions: ["Синхрон под музыку"],
      analysisQuality: "ai"
    };

    const userMessage = `Запрос: "${request.userPrompt}"

Материалы:
${request.assets.map((a, i) => {
  return [
    `${i + 1}. ${a.name}`,
    `   assetId: "${a.id}"`,
    `   Тип: ${a.type}`,
    a.duration ? `   Длительность: ${a.duration.toFixed(1)}с` : "   Статичное",
    a.transcript ? `   Речь:\n${a.transcript.slice(0, 3500)}` : ""
  ].filter(Boolean).join("\n");
}).join("\n\n")}

Верни ТОЛЬКО валидный JSON по примеру: ${JSON.stringify(exampleResponse, null, 2)}`;

    const response = await fetch(AI_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 3000,
        top_p: 0.95,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn("Groq API error:", response.status);
      return generateRuleBasedDecision(request);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      return generateRuleBasedDecision(request);
    }

    const decision: AIEditDecision = JSON.parse(content);
    
    return {
      contentType: decision.contentType || "generic",
      targetDuration: Math.max(5, Math.min(decision.targetDuration || 30, 600)),
      pace: decision.pace || "medium",
      colorGrade: decision.colorGrade || "cinematic",
      clips: (decision.clips || []).map(clip => ({
        ...clip,
        importance: Math.max(0, Math.min(1, clip.importance || 0.5)),
        startTime: Math.max(0, clip.startTime || 0),
        endTime: clip.endTime || clip.startTime + clip.duration,
      })),
      musicSync: decision.musicSync !== false,
      transitions: decision.transitions || "crossfade",
      textOverlays: decision.textOverlays,
      bRollSuggestions: decision.bRollSuggestions,
      audioEnhancements: decision.audioEnhancements || {
        normalize: true,
        denoise: false,
        voiceEnhance: false,
        removeSilence: false,
        ducking: true,
      },
      colorCorrection: decision.colorCorrection,
      suggestions: decision.suggestions || [],
      analysisQuality: "ai",
    };
  } catch (error) {
    console.error("AI analysis failed:", error);
    return generateRuleBasedDecision(request);
  }
}

function generateRuleBasedDecision(request: AIAnalysisRequest): AIEditDecision {
  const prompt = request.userPrompt.toLowerCase();
  
  let contentType: AIEditDecision["contentType"] = "generic";
  const typeMatchers: Array<[AIEditDecision["contentType"], string[]]> = [
    ["podcast", ["подкаст", "podcast", "интервью", "interview"]],
    ["ad", ["реклам", "ad", "промо", "promo", "коммерц"]],
    ["shorts", ["shorts", "шортс"]],
    ["reels", ["reels", "рилс"]],
    ["tiktok", ["tiktok", "тикток"]],
    ["wedding", ["свадьб", "wedding", "love"]],
    ["travel", ["тревел", "travel", "путешеств", "влог", "vlog"]],
    ["tutorial", ["урок", "tutorial", "обучен", "how to"]],
    ["youtube", ["youtube", "ютуб", "ролик"]],
  ];
  
  for (const [type, keywords] of typeMatchers) {
    if (keywords.some(kw => prompt.includes(kw))) {
      contentType = type;
      break;
    }
  }
  
  const durationMap: Record<string, number> = {
    shorts: 30, reels: 30, tiktok: 15, ad: 15,
    youtube: 120, podcast: 300, tutorial: 180, wedding: 60, travel: 45, generic: 30,
  };
  let targetDuration = durationMap[contentType] || 30;
  
  const durationMatch = prompt.match(/(\d+)\s*(сек|мин)/);
  if (durationMatch) {
    const num = parseInt(durationMatch[1]);
    targetDuration = durationMatch[2].startsWith("мин") ? num * 60 : num;
  }
  
  let pace: AIEditDecision["pace"] = "medium";
  if (prompt.match(/(динамич|быстр|энергич|экшен|action|fast)/)) pace = "fast";
  else if (prompt.match(/(спокойн|медленн|расслабл|плавн|slow|chill)/)) pace = "slow";
  else if (prompt.match(/(dynamic|меняющ)/) || contentType === "travel") pace = "dynamic";
  
  let colorGrade = "cinematic";
  const gradeMatchers: Array<[string, string[]]> = [
    ["bw", ["черн", "бел", "b&w", "ч/б", "чб"]],
    ["vintage", ["винтаж", "ретро", "старый", "retro"]],
    ["warm", ["тепл", "warm", "уют", "закат"]],
    ["cool", ["холодн", "cool", "мрачн"]],
    ["dramatic", ["драматич", "темн", "dramatic"]],
    ["vivid", ["ярк", "vivid", "сочн", "красочн"]],
  ];
  
  for (const [grade, keywords] of gradeMatchers) {
    if (keywords.some(kw => prompt.includes(kw))) {
      colorGrade = grade;
      break;
    }
  }
  
  const allVisuals = request.assets.filter(a => a.type === "video" || a.type === "image");
  const clips: AIEditDecision["clips"] = [];
  
  // Base duration per clip based on pace
  const paceSeconds = pace === "fast" ? 2.5 : pace === "slow" ? 6 : 4;
  
  if (allVisuals.length === 0) {
    return {
      contentType, targetDuration, pace, colorGrade, clips: [], musicSync: true, transitions: "crossfade", suggestions: [], analysisQuality: "rule-based"
    };
  }

  // Calculate total available media duration
  const totalAvailable = allVisuals.reduce((acc, a) => acc + (a.duration || 5), 0);
  
  // If we have less media than requested, cap the target duration
  if (totalAvailable < targetDuration * 0.8 && allVisuals.every(a => a.type !== "image")) {
     targetDuration = totalAvailable;
  }

  let currentTime = 0;
  let assetIndex = 0;
  
  // Track how much of each video we've used to spread cuts across the whole video
  const assetProgress = new Map<string, number>();
  
  // We want to loop until we hit targetDuration
  let panic = 0;
  while (currentTime < targetDuration && panic < 1000) {
    panic++;
    // Pick the next asset (round-robin)
    const asset = allVisuals[assetIndex % allVisuals.length];
    assetIndex++;
    
    let clipDuration = paceSeconds;
    if (pace === "dynamic") {
      // mix of short and medium clips
      clipDuration = Math.random() > 0.6 ? 1.5 : 4 + Math.random() * 3;
    }
    
    // Don't exceed target duration
    clipDuration = Math.min(clipDuration, targetDuration - currentTime);
    
    if (clipDuration < 0.5) break;

    let startTime = 0;
    
    if (asset.type === "video" && asset.duration) {
      // Ensure we don't request more than the video has
      clipDuration = Math.min(clipDuration, asset.duration);
      clipDuration = Math.min(clipDuration, asset.duration);
      
      // Calculate where to take this chunk from
      const lastUsedEnd = assetProgress.get(asset.id) || 0;
      
      if (lastUsedEnd + clipDuration <= asset.duration) {
         // Continue from last point, maybe jump ahead slightly
         startTime = lastUsedEnd + (Math.random() > 0.5 ? 0 : Math.random() * 2);
         if (startTime + clipDuration > asset.duration) startTime = Math.max(0, asset.duration - clipDuration);
      } else {
         // We reached the end of this video. 
         // If we only have 1 video, we loop back to start.
         if (allVisuals.length === 1) {
            startTime = Math.random() * Math.max(0, asset.duration - clipDuration);
         } else {
            // Skip this asset and try the next one
            continue;
         }
      }
      assetProgress.set(asset.id, startTime + clipDuration);
    }
    
    clips.push({
      assetId: asset.id,
      startTime,
      endTime: startTime + clipDuration,
      duration: clipDuration,
      importance: 0.7 + Math.random() * 0.3,
      emotion: pace === "fast" ? "energetic" : pace === "slow" ? "calm" : "neutral",
      zoom: asset.type === "image" || (Math.random() > 0.8), // Sometimes add subtle zoom to videos too
    });
    
    currentTime += clipDuration;
  }
  
  let transitions: AIEditDecision["transitions"] = "crossfade";
  if (pace === "fast" || contentType === "shorts" || contentType === "tiktok") {
    transitions = "cut";
  }
  
  const textOverlays: AIEditDecision["textOverlays"] = [];
  const titleText = request.userPrompt.trim().slice(0, 50);
  if (titleText && titleText.length > 5 && !titleText.toLowerCase().includes("сделай")) {
    textOverlays.push({
      text: titleText,
      time: 0.5,
      duration: Math.min(4, targetDuration * 0.3),
      style: "title",
      animation: "fade",
    });
  }
  
  const audioEnhancements: AIEditDecision["audioEnhancements"] = {
    normalize: true,
    denoise: contentType === "podcast" || contentType === "interview",
    voiceEnhance: contentType === "podcast" || contentType === "interview",
    removeSilence: pace === "fast",
    ducking: request.assets.some(a => a.type === "audio"),
  };
  
  return {
    contentType,
    targetDuration,
    pace,
    colorGrade,
    clips,
    musicSync: true,
    transitions,
    textOverlays,
    audioEnhancements,
    suggestions: [
      `Создан ${contentType} монтаж в ${pace} темпе.`,
    ],
    analysisQuality: "rule-based",
  };
}

export async function transcribeAudio(_audioBlob: Blob, _apiKey?: string): Promise<string> {
  // TODO: Integrate Whisper API
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
