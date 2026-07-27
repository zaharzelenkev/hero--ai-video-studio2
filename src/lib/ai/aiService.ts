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

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export async function analyzeWithAI(request: AIAnalysisRequest, apiKey?: string): Promise<AIEditDecision> {
  if (!apiKey) {
    return generateRuleBasedDecision(request);
  }

  try {
    const systemPrompt = `Ты — опытный профессиональный видеомонтажер с 15-летним стажем работы в ведущих продакшн-студиях.
Твоя экспертиза: Adobe Premiere Pro, DaVinci Resolve, Final Cut Pro.

Ты специализируешься на:
- Анализе контента и поиске лучших моментов
- Эмоциональном storytelling
- Адаптации видео под различные платформы
- Профессиональной цветокоррекции
- Синхронизации с музыкальными битами

Задача: проанализируй запрос пользователя и материалы, создай детальный профессиональный план монтажа.

Анализируй:
1. Тип контента и платформу (YouTube, Shorts, Reels, Podcast)
2. Целевую аудиторию
3. Эмоциональную дугу
4. Оптимальную длительность
5. Визуальный стиль
6. Темп и ритм
7. Лучшие моменты (action, эмоции, ключевые фразы)

При выборе клипов:
- Избегай скучных моментов
- Выбирай эмоционально сильные фрагменты
- Создавай логическое повествование
- Для коротких форматов - хватай внимание в первые 3 секунды
- Для длинных форматов - строй постепенное вовлечение

Ответь ТОЛЬКО в формате JSON:`;

    const exampleResponse = {
      contentType: "youtube",
      targetDuration: 120,
      pace: "dynamic",
      colorGrade: "cinematic",
      clips: [
        {
          assetId: "asset_123",
          startTime: 5.2,
          endTime: 18.5,
          duration: 13.3,
          reason: "Сильное эмоциональное вступление",
          importance: 0.95,
          emotion: "energetic",
          zoom: true
        }
      ],
      musicSync: true,
      transitions: "crossfade",
      textOverlays: [
        { text: "Главная идея видео", time: 2, duration: 4, style: "title" }
      ],
      audioEnhancements: {
        normalize: true,
        denoise: true,
        voiceEnhance: true,
        removeSilence: false,
        ducking: true
      },
      colorCorrection: {
        global: { brightness: 5, contrast: 10, saturation: 5 }
      },
      suggestions: ["Используй кат-ы на beat drops"],
      analysisQuality: "ai"
    };

    const userMessage = `Запрос: "${request.userPrompt}"

Материалы:
${request.assets.map((a, i) => {
  const info = [
    `${i + 1}. ${a.name}`,
    `   Тип: ${a.type}`,
    a.duration ? `   Длительность: ${a.duration.toFixed(1)}с` : "   Статичное",
    a.width && a.height ? `   Размер: ${a.width}×${a.height}` : "",
    a.transcript ? `   Текст: "${a.transcript.slice(0, 300)}"` : ""
  ];
  return info.filter(Boolean).join("\n");
}).join("\n\n")}

Создай профессиональный план монтажа.
Пример: ${JSON.stringify(exampleResponse, null, 2)}

Верни ТОЛЬКО JSON.`;

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
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
    ["podcast", ["подкаст", "podcast"]],
    ["ad", ["реклам", "ad", "промо"]],
    ["shorts", ["shorts", "шортс"]],
    ["reels", ["reels", "рилс"]],
    ["tiktok", ["tiktok", "тикток"]],
    ["wedding", ["свадьб", "wedding"]],
    ["travel", ["тревел", "travel", "путешеств"]],
    ["tutorial", ["урок", "tutorial", "обучен"]],
    ["youtube", ["youtube", "ютуб"]],
  ];
  
  for (const [type, keywords] of typeMatchers) {
    if (keywords.some(kw => prompt.includes(kw))) {
      contentType = type;
      break;
    }
  }
  
  const durationMap: Record<string, number> = {
    shorts: 45, reels: 45, tiktok: 30, ad: 20,
    youtube: 180, podcast: 300, tutorial: 240, generic: 60,
  };
  let targetDuration = durationMap[contentType] || 60;
  
  const durationMatch = prompt.match(/(\d+)\s*(сек|мин)/);
  if (durationMatch) {
    const num = parseInt(durationMatch[1]);
    targetDuration = durationMatch[2].startsWith("мин") ? num * 60 : num;
  }
  
  let pace: AIEditDecision["pace"] = "medium";
  if (prompt.match(/(динамич|быстр|энергич)/)) pace = "fast";
  else if (prompt.match(/(спокойн|медленн|расслабл)/)) pace = "slow";
  else if (prompt.match(/(dynamic|меняющ)/)) pace = "dynamic";
  
  let colorGrade = "cinematic";
  const gradeMatchers: Array<[string, string[]]> = [
    ["bw", ["черн", "бел", "b&w"]],
    ["vintage", ["винтаж", "ретро"]],
    ["warm", ["тепл", "warm"]],
    ["cool", ["холодн", "cool"]],
    ["dramatic", ["драматич", "темн"]],
    ["vivid", ["ярк", "vivid"]],
  ];
  
  for (const [grade, keywords] of gradeMatchers) {
    if (keywords.some(kw => prompt.includes(kw))) {
      colorGrade = grade;
      break;
    }
  }
  
  const allVisuals = request.assets.filter(a => a.type === "video" || a.type === "image");
  const clips: AIEditDecision["clips"] = [];
  const paceSeconds = pace === "fast" ? 3 : pace === "slow" ? 8 : 5;
  
  let currentTime = 0;
  let clipIndex = 0;
  
  while (currentTime < targetDuration && clipIndex < allVisuals.length) {
    const asset = allVisuals[clipIndex];
    
    let clipDuration = paceSeconds;
    if (pace === "dynamic") {
      clipDuration = 2 + Math.random() * 6;
    }
    
    clipDuration = Math.min(
      clipDuration,
      targetDuration - currentTime,
      asset.type === "video" ? (asset.duration || clipDuration) : clipDuration
    );
    
    if (clipDuration < 1) {
      clipIndex++;
      continue;
    }
    
    let startTime = 0;
    if (asset.type === "video" && asset.duration) {
      const safeZoneStart = Math.min(2, asset.duration * 0.1);
      const safeZoneEnd = Math.max(0, asset.duration - clipDuration - 2);
      
      if (safeZoneEnd > safeZoneStart) {
        const midStart = safeZoneStart + (safeZoneEnd - safeZoneStart) * 0.3;
        const midEnd = safeZoneStart + (safeZoneEnd - safeZoneStart) * 0.7;
        startTime = midStart + Math.random() * (midEnd - midStart);
      }
    }
    
    clips.push({
      assetId: asset.id,
      startTime,
      endTime: startTime + clipDuration,
      duration: clipDuration,
      importance: 0.7 + Math.random() * 0.3,
      emotion: pace === "fast" ? "energetic" : pace === "slow" ? "calm" : "neutral",
      zoom: asset.type === "image" || (Math.random() > 0.7),
    });
    
    currentTime += clipDuration;
    clipIndex++;
  }
  
  let transitions: AIEditDecision["transitions"] = "crossfade";
  if (pace === "fast" || contentType === "shorts" || contentType === "reels") {
    transitions = "cut";
  }
  
  const textOverlays: AIEditDecision["textOverlays"] = [];
  const titleText = request.userPrompt.trim().slice(0, 60);
  if (titleText) {
    textOverlays.push({
      text: titleText,
      time: 0.5,
      duration: Math.min(4, targetDuration * 0.2),
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
      `Создан ${contentType} в ${pace} темпе`,
      "Для AI-анализа добавьте Groq API ключ",
    ],
    analysisQuality: "rule-based",
  };
}

export async function transcribeAudio(audioBlob: Blob, apiKey?: string): Promise<string> {
  // TODO: Integrate Whisper API
  return "";
}

export async function analyzeEmotionalTone(videoBlob: Blob): Promise<{
  overall: "positive" | "negative" | "neutral";
  timeline: Array<{ time: number; emotion: string; confidence: number }>;
}> {
  return {
    overall: "positive",
    timeline: [],
  };
}
