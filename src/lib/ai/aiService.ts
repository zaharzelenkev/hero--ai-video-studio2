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
    
    const systemPrompt = `Ты — элитный режиссер монтажа (Senior Video Editor). Твоя задача — создать идеальный сценарий монтажа в JSON.
Твоя главная цель — ДРАМАТУРГИЯ и РИТМ. Ты не просто склеиваешь кадры, ты рассказываешь ИСТОРИЮ.

ПРАВИЛА ПОСТРОЕНИЯ ИСТОРИИ (STORY ARC):
1. Вступление (Hook): Первые 2-4 секунды. Захват внимания. Используй самый качественный и эстетичный кадр (Эстетика 8+, Quality 8+), интригующее действие или крупный план лица.
2. J-Cut / L-Cut Эффект: Обязательно вставляй "перебивки" (B-roll). Если человек говорит длинную мысль, переключи визуальный ряд на связанный видеоряд, не прерывая его голос!
3. Развитие (Build-up): Раскрытие темы. Чередование крупных планов с общими. 
4. Кульминация (Climax): Самый эстетичный и эмоциональный визуальный фрагмент. Быстрая смена кадров.
5. Финал (Outro): Главная мысль или Call to Action. Спокойный, красивый кадр.

КАК ВЫБИРАТЬ КАДРЫ (используя Визуальную раскадровку):
- ИГНОРИРУЙ БРАК: Избегай фрагментов с качеством ниже 5, пометками РАЗМЫТО, ТЕМНО или тряской (shake).
- ВЫБИРАЙ ЛУЧШЕЕ: Отдавай высший приоритет кадрам с пометкой "ИНТЕРЕСНОЕ ДЕЙСТВИЕ В КАДРЕ" и "ЕСТЬ ЛЮДИ/ЛИЦА".
- ЧЕРЕДУЙ: Старайся не ставить подряд кадры с одной и той же камеры без смены ракурса.

${hasTranscript 
  ? "В материалах есть Речь (с таймкодами). ВЫБИРАЙ самые смысловые фразы и строй историю вокруг них. Указывай точные startTime и endTime. Вырезай тишину!" 
  : "В материалах НЕТ речи. Работай только с визуальным рядом, выбирая лучшие моменты."}

ОБЯЗАТЕЛЬНО используй только те assetId, которые есть в списке материалов. СУММАРНАЯ ДЛИТЕЛЬНОСТЬ всех клипов в массиве должна быть примерно равна targetDuration!
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
    a.transcript ? `   Речь:\n${a.transcript.slice(0, 3500)}` : "",
    a.segments && a.segments.length > 0 ? `   Визуальная раскадровка:\n${a.segments.map(s => `[${s.startTime.toFixed(1)}s - ${s.endTime.toFixed(1)}s] Качество: ${s.qualityScore}/10, Движение: ${s.motionLevel}${s.hasAction ? ", ИНТЕРЕСНОЕ ДЕЙСТВИЕ В КАДРЕ" : ""}${s.isSceneChange ? ", СМЕНА РАКУРСА" : ""}${s.isDark ? ", ТЕМНО" : ""}${s.isBlurry ? ", РАЗМЫТО" : ""}${s.hasFaces ? ", ЕСТЬ ЛИЦА" : ""}`).join("\n")}` : "",
    a.audioEnergy && a.audioEnergy.length > 0 ? `   Энергия аудио (ритм):\n${a.audioEnergy.map(s => `[${s.startTime.toFixed(1)}s - ${s.endTime.toFixed(1)}s] Уровень: ${s.energyLevel}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
}).join("\n\n")}`;

    // Agent 1: The Creative Director
    // Let's ask the LLM to write a treatment first (Chain of Thought)
    let treatment = "";
    try {
      const directorPrompt = `Ты креативный директор. Твоя задача — проанализировать запрос и сырые метаданные видео/аудио, и написать подробный режиссерский сценарий (treatment).
Опиши, как будет строиться история (Вступление, Развитие, Кульминация, Финал).
Опиши, как видеоряд будет реагировать на изменения "Энергии аудио". Если есть дроп (уровень: drop), что мы там покажем?
Не пиши JSON. Напиши текст на 3-4 абзаца с таймкодами из исходников, которые стоит взять.`;
      
      const dirResponse = await fetch(AI_CONFIG.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            { role: "system", content: directorPrompt },
            { role: "user", content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 1500
        })
      });
      if (dirResponse.ok) {
        const dirData = await dirResponse.json();
        treatment = dirData.choices[0]?.message?.content || "";
        console.log("🎬 Режиссерский сценарий готов:", treatment.slice(0, 150) + "...");
      }
    } catch(e) {
      console.warn("Director agent failed, falling back to one-shot", e);
    }

    // Agent 2: The Technical Editor
    const finalUserMessage = `${userMessage}
    
${treatment ? `\nРЕЖИССЕРСКИЙ ПЛАН (TREATMENT):\n${treatment}\n\nОпираясь на этот план, ` : ""}Верни ТОЛЬКО валидный JSON по примеру: ${JSON.stringify(exampleResponse, null, 2)}`;

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
          { role: "user", content: finalUserMessage },
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
      clips: (decision.clips || []).map(clip => {
        const dur = typeof clip.duration === "number" ? clip.duration : 3;
        const st = typeof clip.startTime === "number" ? Math.max(0, clip.startTime) : undefined;
        const et = typeof clip.endTime === "number" ? clip.endTime : (st !== undefined ? st + dur : undefined);
        return {
          ...clip,
          importance: Math.max(0, Math.min(1, clip.importance || 0.5)),
          startTime: st,
          duration: dur,
          endTime: et,
        };
      }),
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
    if (keywords.some(kw => prompt.includes(kw))) { colorGrade = grade; break; }
  }
  
  const allVisuals = request.assets.filter(a => a.type === "video" || a.type === "image");
  if (allVisuals.length === 0) {
    return { contentType, targetDuration, pace, colorGrade, clips: [], musicSync: true, transitions: "crossfade", suggestions: [], analysisQuality: "rule-based" };
  }

  // Pre-process segments into a searchable pool
  interface PoolItem {
    assetId: string;
    startTime: number;
    duration: number;
    quality: number;
    motion: string;
    hasFaces: boolean;
    isImage: boolean;
    hasAction: boolean;
  }
  const pool: PoolItem[] = [];

  for (const asset of allVisuals) {
    if (asset.type === "image") {
      pool.push({ assetId: asset.id, startTime: 0, duration: asset.duration || 5, quality: 10, motion: "static", hasFaces: false, isImage: true, hasAction: false });
    } else if (asset.segments && asset.segments.length > 0) {
      for (const seg of asset.segments) {
        if (seg.isDark || seg.isBlurry || seg.motionLevel === "shake" || seg.qualityScore < 4) continue;
        const dur = seg.endTime - seg.startTime;
        if (dur < 0.5) continue;
        pool.push({ assetId: asset.id, startTime: seg.startTime, duration: dur, quality: seg.qualityScore, motion: seg.motionLevel, hasFaces: seg.hasFaces, isImage: false, hasAction: seg.hasAction || false });
      }
    } else {
      pool.push({ assetId: asset.id, startTime: 0, duration: asset.duration || 5, quality: 5, motion: "medium", hasFaces: false, isImage: false, hasAction: false });
    }
  }

  // Fallback if strict filtering removed everything
  if (pool.length === 0) {
    for (const asset of allVisuals) {
      pool.push({ assetId: asset.id, startTime: 0, duration: asset.duration || 5, quality: 5, motion: "medium", hasFaces: false, isImage: asset.type === "image", hasAction: false });
    }
  }

  // Determine total available playable duration
  let availableDur = pool.reduce((sum, p) => sum + p.duration, 0);
  if (availableDur < targetDuration && allVisuals.every(a => a.type === "video")) {
    targetDuration = availableDur;
  }

  const clips: AIEditDecision["clips"] = [];
  let currentTime = 0;
  let phase = "hook"; // hook -> buildup -> climax -> outro

  const getCandidates = (phase: string) => {
    return [...pool].sort((a, b) => {
      // Base score is quality
      let scoreA = a.quality * 10;
      let scoreB = b.quality * 10;
      
      // Phase modifiers
      if (phase === "hook") {
        if (a.hasFaces) scoreA += 50;
        if (a.hasAction) scoreA += 30;
        if (a.motion === "medium" || a.motion === "high") scoreA += 20;
        if (b.hasFaces) scoreB += 50;
        if (b.hasAction) scoreB += 30;
        if (b.motion === "medium" || b.motion === "high") scoreB += 20;
      } else if (phase === "climax") {
        if (a.hasAction) scoreA += 40;
        if (a.motion === "high") scoreA += 50;
        if (b.hasAction) scoreB += 40;
        if (b.motion === "high") scoreB += 50;
      } else if (phase === "outro") {
        if (a.motion === "static" || a.motion === "low") scoreA += 30;
        if (b.motion === "static" || b.motion === "low") scoreB += 30;
      }
      // Add random jitter to avoid taking the exact same clip over and over if it's top scored
      scoreA += Math.random() * 15;
      scoreB += Math.random() * 15;
      return scoreB - scoreA;
    });
  };

  let usedClipCount = 0;

  while (currentTime < targetDuration) {
    const progress = currentTime / targetDuration;
    
    // Determine current story phase
    if (progress < 0.15) phase = "hook";
    else if (progress < 0.70) phase = "buildup";
    else if (progress < 0.90) phase = "climax";
    else phase = "outro";

    const candidates = getCandidates(phase);
    // Pick the best candidate that isn't the EXACT same as the previous one (to force a cut)
    let best = candidates[0];
    if (usedClipCount > 0 && clips[clips.length - 1].assetId === best.assetId && candidates.length > 1) {
       best = candidates[1];
    }

    // Determine duration for this shot based on phase and overall pace
    let shotDur = 3;
    if (phase === "hook") shotDur = pace === "slow" ? 4 : 2;
    else if (phase === "buildup") shotDur = pace === "fast" ? 3 : 5;
    else if (phase === "climax") shotDur = pace === "slow" ? 2.5 : 1.2;
    else if (phase === "outro") shotDur = 4;
    
    // Add dynamic jitter
    shotDur += (Math.random() - 0.5) * 1.5;
    shotDur = Math.max(0.8, Math.min(shotDur, targetDuration - currentTime, best.duration));

    // Calculate a random start time within the available segment
    const maxStart = best.duration - shotDur;
    const actualStart = best.startTime + (maxStart > 0 ? Math.random() * maxStart : 0);

    clips.push({
      assetId: best.assetId,
      startTime: actualStart,
      endTime: actualStart + shotDur,
      duration: shotDur,
      importance: (phase === "climax" || phase === "hook") ? 0.9 : 0.6,
      emotion: phase === "climax" ? "energetic" : phase === "outro" ? "calm" : "neutral",
      zoom: best.isImage || (!best.hasAction && Math.random() > 0.4),
      reason: `[${phase.toUpperCase()}] Качество: ${best.quality}, Лица: ${best.hasFaces ? "Да" : "Нет"}`
    });

    currentTime += shotDur;
    usedClipCount++;
    
    if (shotDur < 0.5) break; // safeguard
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
  
  return {
    contentType, targetDuration, pace, colorGrade, clips, musicSync: true, transitions, textOverlays,
    audioEnhancements: { normalize: true, denoise: contentType === "podcast", voiceEnhance: contentType === "podcast", removeSilence: pace === "fast", ducking: true },
    suggestions: [`Создана профессиональная драматургия (${usedClipCount} сцен)`],
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
