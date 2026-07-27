"use client";

/**
 * MONTIQ AI Service
 * 
 * Интеллектуальный анализ пользовательских запросов и видеоконтента
 * для создания профессиональных монтажных решений.
 * 
 * Использует Groq API для быстрого анализа и генерации решений.
 */

export interface AIAnalysisRequest {
  userPrompt: string;
  assets: Array<{
    id: string;
    name: string;
    type: "video" | "image" | "audio";
    duration?: number;
    transcript?: string;
  }>;
}

export interface AIEditDecision {
  contentType: "podcast" | "youtube" | "shorts" | "reels" | "tiktok" | "ad" | "travel" | "wedding" | "educational" | "music-video" | "interview" | "presentation" | "generic";
  targetDuration: number;
  pace: "slow" | "medium" | "fast";
  colorGrade: string;
  
  clips: Array<{
    assetId: string;
    startTime: number;
    endTime: number;
    duration: number;
    reason?: string; // Why this moment was chosen
    importance: number; // 0-1 score
  }>;
  
  musicSync: boolean;
  transitions: string;
  textOverlays?: Array<{
    text: string;
    time: number;
    duration: number;
  }>;
  
  suggestions: string[];
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Анализирует запрос пользователя и материалы для создания плана монтажа
 */
export async function analyzeWithAI(request: AIAnalysisRequest, apiKey?: string): Promise<AIEditDecision> {
  // Fallback to rule-based if no API key
  if (!apiKey) {
    return generateRuleBasedDecision(request);
  }

  try {
    const systemPrompt = `Ты — профессиональный видеомонтажер с 15-летним опытом работы в Adobe Premiere Pro и DaVinci Resolve.

Твоя задача — проанализировать запрос пользователя и доступные видеоматериалы, затем составить детальный план монтажа.

Анализируй:
1. Тип контента (подкаст, реклама, shorts, и т.д.)
2. Целевую аудиторию и платформу
3. Настроение и стиль (динамичный, спокойный, драматичный)
4. Оптимальную длительность для формата
5. Лучшие моменты в материале (эмоциональные пики, ключевые фразы)

Ответь в формате JSON со следующей структурой:
{
  "contentType": "podcast|youtube|shorts|reels|tiktok|ad|travel|wedding|educational|music-video|interview|presentation|generic",
  "targetDuration": 30,
  "pace": "slow|medium|fast",
  "colorGrade": "cinematic|warm|cool|bw|vintage|vivid|moody|dramatic",
  "clips": [
    {
      "assetId": "asset_id",
      "startTime": 0,
      "endTime": 10,
      "duration": 10,
      "reason": "Сильное эмоциональное вступление",
      "importance": 0.9
    }
  ],
  "musicSync": true,
  "transitions": "crossfade|cut|slideup",
  "textOverlays": [
    {"text": "Заголовок", "time": 0, "duration": 3}
  ],
  "suggestions": ["Добавь музыку для усиления эмоций", "Используй B-roll на 15 секунде"]
}`;

    const userMessage = `Запрос пользователя: "${request.userPrompt}"

Доступные материалы:
${request.assets.map((a, i) => `${i + 1}. ${a.name} (${a.type}, ${a.duration ? a.duration.toFixed(1) + "с" : "статичное"})${a.transcript ? "\n   Транскрипция: " + a.transcript.slice(0, 200) : ""}`).join("\n")}

Создай профессиональный план монтажа.`;

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn("Groq API error, falling back to rule-based:", response.statusText);
      return generateRuleBasedDecision(request);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      return generateRuleBasedDecision(request);
    }

    const decision: AIEditDecision = JSON.parse(content);
    
    // Validate and ensure all required fields
    return {
      contentType: decision.contentType || "generic",
      targetDuration: decision.targetDuration || 30,
      pace: decision.pace || "medium",
      colorGrade: decision.colorGrade || "none",
      clips: decision.clips || [],
      musicSync: decision.musicSync !== false,
      transitions: decision.transitions || "crossfade",
      textOverlays: decision.textOverlays,
      suggestions: decision.suggestions || [],
    };
  } catch (error) {
    console.warn("AI analysis failed, using rule-based fallback:", error);
    return generateRuleBasedDecision(request);
  }
}

/**
 * Rule-based fallback when AI is not available
 */
function generateRuleBasedDecision(request: AIAnalysisRequest): AIEditDecision {
  const prompt = request.userPrompt.toLowerCase();
  
  // Detect content type
  let contentType: AIEditDecision["contentType"] = "generic";
  if (prompt.includes("подкаст") || prompt.includes("podcast")) contentType = "podcast";
  else if (prompt.includes("реклам") || prompt.includes("ad")) contentType = "ad";
  else if (prompt.includes("shorts") || prompt.includes("шортс")) contentType = "shorts";
  else if (prompt.includes("reels") || prompt.includes("рилс")) contentType = "reels";
  else if (prompt.includes("tiktok") || prompt.includes("тикток")) contentType = "tiktok";
  else if (prompt.includes("свадьб") || prompt.includes("wedding")) contentType = "wedding";
  else if (prompt.includes("тревел") || prompt.includes("travel")) contentType = "travel";
  else if (prompt.includes("интервью") || prompt.includes("interview")) contentType = "interview";
  else if (prompt.includes("youtube")) contentType = "youtube";
  
  // Determine target duration
  let targetDuration = 30;
  if (contentType === "shorts" || contentType === "reels" || contentType === "tiktok") {
    targetDuration = 45;
  } else if (contentType === "ad") {
    targetDuration = 20;
  } else if (contentType === "youtube" || contentType === "podcast") {
    targetDuration = 180; // 3 minutes
  }
  
  // Determine pace
  let pace: "slow" | "medium" | "fast" = "medium";
  if (prompt.includes("динамич") || prompt.includes("быстр") || prompt.includes("энергич")) {
    pace = "fast";
  } else if (prompt.includes("спокойн") || prompt.includes("медленн") || prompt.includes("расслабл")) {
    pace = "slow";
  }
  
  // Determine color grade
  let colorGrade = "cinematic";
  if (prompt.includes("черн") && prompt.includes("бел")) colorGrade = "bw";
  else if (prompt.includes("винтаж") || prompt.includes("ретро")) colorGrade = "vintage";
  else if (prompt.includes("тепл") || prompt.includes("уютн")) colorGrade = "warm";
  else if (prompt.includes("холодн") || prompt.includes("северн")) colorGrade = "cool";
  else if (prompt.includes("драматич")) colorGrade = "dramatic";
  else if (prompt.includes("ярк") || prompt.includes("насыщ")) colorGrade = "vivid";
  
  // Select clips intelligently
  const videoAssets = request.assets.filter(a => a.type === "video");
  const clips: AIEditDecision["clips"] = [];
  
  const paceSeconds = pace === "fast" ? 3 : pace === "slow" ? 8 : 5;
  let currentTime = 0;
  
  videoAssets.forEach((asset, index) => {
    if (currentTime >= targetDuration) return;
    
    const clipDuration = Math.min(
      paceSeconds,
      targetDuration - currentTime,
      asset.duration || paceSeconds
    );
    
    clips.push({
      assetId: asset.id,
      startTime: 0,
      endTime: clipDuration,
      duration: clipDuration,
      importance: 0.7,
    });
    
    currentTime += clipDuration;
  });
  
  return {
    contentType,
    targetDuration,
    pace,
    colorGrade,
    clips,
    musicSync: true,
    transitions: pace === "fast" ? "cut" : "crossfade",
    suggestions: [
      "Монтаж создан на основе базовых правил",
      "Для более интеллектуального анализа добавьте Groq API ключ",
    ],
  };
}

/**
 * Извлекает транскрипцию из аудио/видео файла через Web Speech API
 * (только для демонстрации, в production лучше использовать Whisper API)
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  // В реальном приложении здесь был бы вызов Whisper API или подобного сервиса
  // Для прототипа возвращаем пустую строку
  return "";
}
