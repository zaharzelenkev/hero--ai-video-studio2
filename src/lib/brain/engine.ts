import type { AIAnalysisRequest, AIEditDecision } from "../ai/aiService";
import { DirectorBrain } from "./director";
import { AI_CONFIG } from "../../config/ai";

export interface DirectorScene {
  id: string;
  phase: "hook" | "buildup" | "climax" | "outro";
  intent: string;
  duration: number;
  emotion: "energetic" | "calm" | "dramatic" | "funny" | "inspiring" | "neutral";
  
  mainClip: {
    assetId: string;
    sourceStart: number; 
    sourceEnd: number;
    speed: number;
    zoom: boolean;
  };
  
  bRolls: Array<{
    assetId: string;
    sourceStart: number;
    sourceEnd: number;
    offsetInScene: number; 
  }>;
  
  captions: Array<{
    text: string;
    offsetInScene: number;
    duration: number;
    animation: string;
  }>;
}

export interface DirectorScript {
  concept: string;
  genre: string;
  targetDuration: number;
  scenes: DirectorScene[];
  audioStrategy: {
    musicStyle: string;
    duckingEnabled: boolean;
    denoiseSpeech: boolean;
    removeSilence: boolean;
    muteOriginalAudio: boolean;
  };
}

export class DirectorEngine {

  static async formulateScript(request: AIAnalysisRequest): Promise<DirectorScript> {
    const strategy = await DirectorBrain.defineStrategy(request);
    
    const speechAssets = request.assets.filter(a => !!a.transcript && a.transcript.length > 10);
    const visualAssets = request.assets.filter(a => a.type === "video" || a.type === "image");

    let script: DirectorScript;
    
    if (speechAssets.length > 0) {
      if (AI_CONFIG.groqApiKey) {
         try {
             // 1. Prepare phrases for LLM
             const lines = (speechAssets[0].transcript || "").split("\n").filter((l: string) => l.includes("]"));
             const words = [];
             for (const l of lines) {
                 const m = l.match(/\[([\d\.]+)s - ([\d\.]+)s\] (.+)/);
                 if (m) words.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), text: m[3].trim() });
             }
             const phrases = [];
             if (words.length > 0) {
                 let curr = { start: words[0].start, end: words[0].end, text: words[0].text };
                 for (let i = 1; i < words.length; i++) {
                     const w = words[i];
                     const gap = w.start - curr.end;
                     if (gap > 0.4 || (curr.end - curr.start > 4.0)) {
                         phrases.push(curr);
                         curr = { start: w.start, end: w.end, text: w.text };
                     } else {
                         curr.end = w.end;
                         curr.text += " " + w.text;
                     }
                 }
                 phrases.push(curr);
             }
             const validPhrases = phrases.filter(p => p.end - p.start >= 0.2);
             
             if (validPhrases.length > 0) {
                 script = await this.buildNarrativeScriptWithLLM(request, strategy, speechAssets, visualAssets, validPhrases);
             } else {
                 script = await this.buildNarrativeScript(request, strategy, speechAssets, visualAssets);
             }
         } catch(e) {
             script = await this.buildNarrativeScript(request, strategy, speechAssets, visualAssets);
         }
      } else {
         script = await this.buildNarrativeScript(request, strategy, speechAssets, visualAssets);
      }
    } else {
      script = this.buildVisualScript(request, strategy, visualAssets);
    }
    
    script = this.applyProfessionalTechniques(script, strategy.genre);
    
    // Самоанализ, извлечение уроков (RAG Engine)
    script = await this.critiqueAndLearn(script, strategy);
    
    // Глобальное извлечение текста из промпта пользователя
    if (request.userPrompt && script.scenes.length > 0) {
        const p = request.userPrompt;
        let customText = null;
        
        // Match quotes
        const quoteMatch = p.match(/(?:текст|заголовок|надпись|напиши).*?["'«]([^"'»]+)["'»]/i);
        if (quoteMatch && quoteMatch[1]) {
            customText = quoteMatch[1];
        } else {
            // Match keywords and take the rest of the string
            const keywordMatch = p.match(/(?:напиши|добавь текст|заголовок)[:\s]+(.+)/i);
            if (keywordMatch && keywordMatch[1]) {
                customText = keywordMatch[1].trim();
            }
        }
        
        if (customText && customText.length > 0) {
            // Check if not already added by visual fallback
            const alreadyHas = script.scenes[0].captions.some(c => c.text === customText);
            if (!alreadyHas) {
                script.scenes[0].captions.push({
                    text: customText,
                    offsetInScene: 0.1,
                    duration: Math.max(2, script.scenes[0].duration - 0.2),
                    animation: "elastic"
                });
            }
        }
    }

    return script;
  }

  /**
   * Полностью переписанный алгоритм работы с речью (Jump-Cuts / AutoPod Style)
   */
  
  /**
   * Advanced LLM-driven Narrative (Подкасты, Интервью, Говорящая голова)
   * Использует мощный промпт (Chain of Thought + 1-10 Scoring + Few Shot) 
   * для создания профессиональной структуры видео.
   */
  private static async buildNarrativeScriptWithLLM(
    __request: AIAnalysisRequest, 
    strategy: any, 
    speechAssets: any[], 
    visualAssets: any[],
    validPhrases: any[]
  ): Promise<DirectorScript> {
    const prompt = `Ты — Lead Video AI Architect и элитный режиссер монтажа уровня MrBeast, Kurzgesagt и Veritasium с 15-летним опытом.
Твоя задача — проанализировать исходные фразы спикера, ПРОЧИТАТЬ ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ и создать гениальный, вирусный сценарий (Script).

ОСОБОЕ ПОЖЕЛАНИЕ ПОЛЬЗОВАТЕЛЯ: "${__request.userPrompt}"
(Если пользователь явно просит написать какой-то КОНКРЕТНЫЙ текст на экране, извлеки этот текст и передай в поле customText в нужной сцене. Не выводи на экран команды пользователя!).

ПРАВИЛА ПРОФЕССИОНАЛЬНОГО МОНТАЖА (СТРОГО СОБЛЮДАТЬ):
1. АРКА И СТРУКТУРА: Hook (0-3 сек) -> Setup (Контекст) -> Development -> Climax (Кульминация) -> Payoff. Хук должен вызывать мгновенный выброс дофамина или жесткую интригу.
2. ПРАВИЛО 5 СЕКУНД: Зритель уходит, если ничего не происходит. Чередуй быстрые склейки (Jump Cuts) по 1-2 секунды и смысловые блоки по 3-5 секунд.
3. PATTERN INTERRUPT: Каждые 7-10 секунд взламывай паттерн восприятия. Используй intent: "Pattern Interrupt" и bRollNeeded: true, чтобы наложить перебивку.
4. УДАЛЕНИЕ ВОДЫ: Оценивай фразы от 1 до 10. БЕЗЖАЛОСТНО ВЫРЕЗАЙ всё, что ниже 7. Убирай слова-паразиты, неудачные дубли, долгие подводки. Оставь только "мясо".
5. ПОКАЗЫВАЙ, А НЕ РАССКАЗЫВАЙ: Как только спикер называет объект, эмоцию или место — ставь bRollNeeded: true и точный bRollKeyword на английском.
6. ПРАВИЛО ТРЕТЕЙ ВО ВРЕМЕНИ: Распредели самую важную информацию на 33% и 66% таймлайна.

МАТЕРИАЛЫ (ID: Текст [Старт - Конец]):
${validPhrases.map((p, i) => `[${i}] ${p.text} (${p.start.toFixed(1)}s - ${p.end.toFixed(1)}s)`).join('\n')}

ЗАДАЧА:
СНАЧАЛА напиши рассуждение (Chain-of-Thought) о том, как ты будешь строить драматургию, какие эмоции вызывает текст и почему ты вырезаешь воду.
ПОТОМ верни строго JSON объект с выбранными фразами в хронологическом порядке.

ОЖИДАЕМЫЙ ФОРМАТ JSON:
{
  "reasoning": "Я выбрал фразу X как хук, потому что... Фраза Y удалена, так как это вода...",
  "concept": "Главная идея ролика",
  "scenes": [
    {
      "phase": "hook", // Строго: hook | setup | buildup | climax | outro
      "phraseId": 0, 
      "score": 9, 
      "intent": "Pattern Interrupt", 
      "bRollNeeded": true,
      "bRollKeyword": "shocked face",
      "zoom": true,
      "customText": "ТЕКСТ, ЕСЛИ ПРОСИЛ ПОЛЬЗОВАТЕЛЬ"
    }
  ]
}

Суммарная длительность должна быть около ${strategy.targetDuration} секунд.`;

    try {
        const resp = await fetch(AI_CONFIG.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_CONFIG.groqApiKey}` },
            body: JSON.stringify({
              model: AI_CONFIG.model,
              messages: [{ role: "system", content: prompt }],
              temperature: 0.4,
              response_format: { type: "json_object" },
            }),
        });
        const data = await resp.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        
        console.log("LLM Editor Reasoning:", parsed.reasoning);

        const scenes: DirectorScene[] = [];
        const mainAsset = speechAssets[0];
        
        let isZoomed = false;
        
        for (const s of parsed.scenes) {
            const p = validPhrases[s.phraseId];
            if (!p) continue;
            
            isZoomed = s.zoom !== undefined ? s.zoom : !isZoomed;
            
            const scene: DirectorScene = {
                id: `scene_${Date.now()}_${s.phraseId}`,
                phase: s.phase === "setup" || s.phase === "development" ? "buildup" : s.phase === "payoff" ? "outro" : s.phase,
                intent: s.intent || "Jump Cut",
                duration: p.end - p.start,
                emotion: s.phase === "climax" || s.phase === "hook" ? "energetic" : "neutral",
                mainClip: { assetId: mainAsset.id, sourceStart: p.start, sourceEnd: p.end, speed: 1, zoom: isZoomed },
                bRolls: [], captions: s.customText ? [{text: s.customText, offsetInScene: 0.2, duration: Math.max(1, p.end - p.start - 0.2), animation: "elastic"}] : []
            };

            // Process LLM bRollNeeded request
            if (s.bRollNeeded && visualAssets.length > 1) {
                const bRollPool = visualAssets.filter((a: any) => a.id !== mainAsset.id);
                
                // Умный семантический поиск: ищем B-Roll, имя которого совпадает с bRollKeyword от ИИ
                let bestAsset = bRollPool[0];
                let highestScore = -1;
                
                const kw = (s.bRollKeyword || "").toLowerCase();
                if (kw.length > 2) {
                    for (const b of bRollPool) {
                        let score = 0;
                        const bName = (b.name || "").toLowerCase();
                        if (bName.includes(kw)) score += 50;
                        if (kw.split(" ").some((w: string) => bName.includes(w))) score += 20;
                        
                        // Если запрашивают людей - ищем лица
                        if (kw.includes("person") || kw.includes("face") || kw.includes("people")) {
                            if (b.segments && b.segments.some((seg: any) => seg.hasFaces)) score += 30;
                        }
                        // Если запрашивают экшен - ищем движение
                        if (kw.includes("action") || kw.includes("fast") || kw.includes("move")) {
                            if (b.segments && b.segments.some((seg: any) => seg.hasAction || seg.motionLevel === "high")) score += 30;
                        }
                        
                        if (score > highestScore) {
                            highestScore = score;
                            bestAsset = b;
                        }
                    }
                }
                
                // Fallback, если ничего умного не нашли
                if (highestScore <= 0) {
                    bestAsset = bRollPool[Math.floor(Math.random() * bRollPool.length)];
                }
                
                let bStart = 0;
                if (bestAsset.segments && bestAsset.segments.length > 0) {
                    // Берем фрагмент с лучшей эстетикой и качеством
                    const bestSeg = bestAsset.segments.sort((a:any, b:any) => ((b.aestheticScore||0) + (b.qualityScore||0)) - ((a.aestheticScore||0) + (a.qualityScore||0)))[0];
                    bStart = bestSeg.startTime;
                } else if (bestAsset.type === "video") {
                    bStart = Math.max(0, Math.random() * ((bestAsset.duration || 10) - scene.duration));
                }

                scene.bRolls.push({
                    assetId: bestAsset.id,
                    sourceStart: bStart,
                    sourceEnd: bStart + Math.min(scene.duration, bestAsset.duration || 5),
                    offsetInScene: Math.random() > 0.5 ? -0.3 : 0.2 // J-Cut / L-Cut
                });
            }

            scenes.push(scene);
        }

        return {
            concept: parsed.concept || "Pro LLM Edit",
            genre: strategy.genre,
            targetDuration: strategy.targetDuration,
            scenes,
            audioStrategy: {
                musicStyle: (strategy.instructions.match(/MUSIC_STYLE:(\w+)/) || [])[1] || "lofi",
                duckingEnabled: true,
                denoiseSpeech: true,
                removeSilence: true,
                muteOriginalAudio: false
            }
        };

    } catch (e) {
        console.warn("LLM full script formulation failed, falling back to heuristic engine", e);
        throw e;
    }
  }


  private static async buildNarrativeScript(
    __request: AIAnalysisRequest, 
    strategy: any, 
    speechAssets: any[], 
    visualAssets: any[]
  ): Promise<DirectorScript> {
    const scenes: DirectorScene[] = [];
    const mainAsset = speechAssets[0]; // Берем первый длинный разговорный ассет
    
    // 1. Парсим транскрипт (если Whisper не отработал, берем хоть что-то, но мы предполагаем что есть [0.0s - 1.0s])
    const lines = (mainAsset.transcript || "").split("\n").filter((l: string) => l.includes("]"));
    const words: {start: number, end: number, text: string}[] = [];
    for (const l of lines) {
        const m = l.match(/\[([\d\.]+)s - ([\d\.]+)s\] (.+)/);
        if (m) words.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), text: m[3].trim() });
    }

    if (words.length === 0) {
        // Fallback если нет таймкодов
        return this.buildVisualScript(__request, strategy, [mainAsset, ...visualAssets]);
    }

    // 2. Умное объединение во фразы с сохранением ДРАМАТИЧЕСКИХ ПАУЗ
    const phrases: {start: number, end: number, text: string, isPause?: boolean}[] = [];
    let curr = { start: words[0].start, end: words[0].end, text: words[0].text, isPause: false };

    for (let i = 1; i < words.length; i++) {
        const w = words[i];
        const gap = w.start - curr.end;
        
        // Разрываем фразу на паузе > 0.4s или если она стала слишком длинной
        if (gap > 0.4 || (curr.end - curr.start > 4.0)) {
            phrases.push(curr);
            
            // Эвристика топовых монтажеров: если пауза от 0.7 до 2.5 секунд, это эмоциональный момент (Reaction). Сохраняем его!
            if (gap >= 0.7 && gap <= 2.5) {
                phrases.push({ start: curr.end, end: w.start, text: "[ПАУЗА]", isPause: true });
            }
            
            curr = { start: w.start, end: w.end, text: w.text, isPause: false };
        } else {
            curr.end = w.end;
            curr.text += " " + w.text;
        }
    }
    phrases.push(curr);

    // 3. Фильтрация "мусорных" фраз (слова-паразиты, эканья), но защита пауз
    const validPhrases = phrases.filter(p => {
        if (p.isPause) return true;
        const t = p.text.toLowerCase().replace(/[^а-яa-z]/g, "");
        if (/^(ну|э|ээ|м|мм|типа|какбы|вот|короче|значит)$/i.test(t)) return false;
        if (p.end - p.start < 0.2) return false;
        return true;
    });

    if (validPhrases.length === 0) validPhrases.push(phrases[0]);

    // 4. Поиск Хука (Cold Open) с помощью LLM (или фоллбэка)
    let hookIndex = -1;
    if (AI_CONFIG.groqApiKey) {
        try {
            const prompt = `Ты — элитный продюсер TikTok и YouTube Shorts. Твоя задача — выбрать идеальный "Хук" (Cold Open) из предложенного текста.
Хук должен интриговать, задавать вопрос, обещать ценность или вызывать эмоцию. Он будет поставлен в самую первую секунду видео!
Доступные фразы (ID: Текст):
${validPhrases.slice(0, 30).map((p, i) => `[${i}] ${p.text}`).join('\n')}

Выбери ТОЛЬКО ОДИН ID фразы, которая лучше всего подходит для хука. Верни строго JSON: {"bestHookId": 5}`;

            const resp = await fetch(AI_CONFIG.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_CONFIG.groqApiKey}` },
                body: JSON.stringify({
                  model: AI_CONFIG.model,
                  messages: [{ role: "system", content: prompt }],
                  temperature: 0.3,
                  response_format: { type: "json_object" },
                }),
            });
            const data = await resp.json();
            const parsed = JSON.parse(data.choices[0].message.content);
            if (typeof parsed.bestHookId === "number" && parsed.bestHookId >= 0 && parsed.bestHookId < validPhrases.length) {
                hookIndex = parsed.bestHookId;
                console.log("LLM selected Hook ID:", hookIndex, validPhrases[hookIndex].text);
            }
        } catch (e) {
            console.warn("LLM hook selection failed", e);
        }
    }

    if (hookIndex === -1) {
       hookIndex = validPhrases.findIndex(p => p.text.match(/(внимание|секрет|главное|почему|как|смотри|важно|\?|!)/i));
       if (hookIndex === -1) hookIndex = 0;
    }

    const hookPhrase = validPhrases[hookIndex];

    // Добавляем Хук (он будет перемещен в самое начало)
    scenes.push({
        id: `hook_${Date.now()}`, phase: "hook", intent: "Cold Open", duration: hookPhrase.end - hookPhrase.start, emotion: "energetic",
        mainClip: { assetId: mainAsset.id, sourceStart: hookPhrase.start, sourceEnd: hookPhrase.end, speed: 1, zoom: true },
        bRolls: [], captions: []
    });

    // 5. Построение основной истории (Body)
    let isZoomed = false;
    let bRollIndex = 0;
    const bRollPool = visualAssets.filter((a: any) => a.id !== mainAsset.id);

    for (let i = 0; i < validPhrases.length; i++) {
        const p = validPhrases[i];
        
        // Динамическое чередование зума для имитации работы двух камер (Punch Zoom)
        isZoomed = !isZoomed;
        
        const scene: DirectorScene = {
            id: `body_${p.start}_${Date.now()}`, phase: "buildup", intent: "Dialogue Cut", duration: p.end - p.start, emotion: "neutral",
            mainClip: { assetId: mainAsset.id, sourceStart: p.start, sourceEnd: p.end, speed: 1, zoom: isZoomed },
            bRolls: [], captions: []
        };

        // B-Roll Overlay Logic (Pattern Interrupt)
        if (bRollPool.length > 0) {
            // Перекрываем скучные длинные фразы или специфические слова
            const isLong = (p.end - p.start > 2.5);
            const hasVisualKeyword = p.text.match(/(например|посмотри|представь|город|люди|мир|деньги|работа|проблема)/i);
            // Либо каждые N фраз принудительно (чтобы не заскучать)
            const isNthPhrase = (i % 4 === 0 && i !== 0);

            if (isLong || hasVisualKeyword || isNthPhrase) {
                // Find a B-Roll asset avoiding consecutive repeats
                let bAsset = bRollPool[bRollIndex % bRollPool.length];
                if (bRollPool.length > 1 && bAsset.id === (scenes[scenes.length-1]?.bRolls[0]?.assetId)) {
                   bRollIndex++;
                   bAsset = bRollPool[bRollIndex % bRollPool.length];
                }
                
                // Pick a random good segment, not always the 0th
                let bStart = 0;
                if (bAsset.segments && bAsset.segments.length > 0) {
                    const validSegs = bAsset.segments.filter((s:any) => s.qualityScore > 4 && s.endTime - s.startTime > 0.5);
                    if (validSegs.length > 0) {
                        const randomSeg = validSegs[Math.floor(Math.random() * validSegs.length)];
                        bStart = randomSeg.startTime;
                    }
                } else if (bAsset.type === "video") {
                    bStart = Math.max(0, Math.random() * ((bAsset.duration || 10) - scene.duration));
                }

                const bDur = Math.min(scene.duration, bAsset.duration || 5);
                
                scene.bRolls.push({
                    assetId: bAsset.id,
                    sourceStart: bStart,
                    sourceEnd: bStart + bDur,
                    offsetInScene: 0.1 // Slight L-Cut feel
                });
                bRollIndex++;
            }
        }

        scenes.push(scene);
    }

    // 6. Подрезка по целевой длительности
    let totalDur = 0;
    const finalScenes: DirectorScene[] = [];
    for (const s of scenes) {
        if (totalDur + s.duration > strategy.targetDuration) {
            s.duration = strategy.targetDuration - totalDur;
            s.mainClip.sourceEnd = s.mainClip.sourceStart + s.duration;
            finalScenes.push(s);
            break;
        }
        finalScenes.push(s);
        totalDur += s.duration;
    }

    if (finalScenes.length > 0) {
        finalScenes[finalScenes.length - 1].phase = "outro";
    }

    return {
        concept: "Smart Dialogue Jump-Cut (AutoPod Style)",
        genre: strategy.genre,
        targetDuration: strategy.targetDuration,
        scenes: finalScenes,
        audioStrategy: {
            musicStyle: strategy.genre === "podcast" ? "lofi" : "electronic",
            duckingEnabled: true,
            denoiseSpeech: true,
            removeSilence: true,
            muteOriginalAudio: false // Оставляем звук, так как это нарратив (речь)
        }
    };
  }

  private static buildVisualScript(
    _request: AIAnalysisRequest, 
    strategy: any, 
    visualAssets: any[]
  ): DirectorScript {
    const script: DirectorScript = {
      concept: "Visual Aesthetic Driven",
      genre: strategy.genre,
      targetDuration: strategy.targetDuration,
      scenes: [],
      audioStrategy: {
        // Выбираем жанр музыки исходя из жанра видео и эмоции
        musicStyle: strategy.genre === "travel" || strategy.genre === "luxury" ? "cinematic" 
                    : strategy.genre === "tiktok" || strategy.genre === "ad" ? "electronic" : "lofi",
        duckingEnabled: false,
        denoiseSpeech: false,
        removeSilence: false,
        muteOriginalAudio: true // В визуальных скриптах мы ВСЕГДА мьютим оригинальный звук с камеры
      }
    };

    // ПРОДВИНУТЫЙ АНАЛИЗ АУДИО: Поиск абсолютного пика (Climax) по энергии
    let climaxAssetId = visualAssets[0]?.id;
    let climaxTime = 0;
    let maxOverallEnergy = -1;

    for (const a of visualAssets) {
        if (a.audioEnergy) {
            for (const e of a.audioEnergy) {
                if (e.energyLevel > maxOverallEnergy) {
                    maxOverallEnergy = e.energyLevel;
                    climaxAssetId = a.id;
                    climaxTime = e.startTime;
                }
            }
        }
    }

    interface VisualBeat {
      assetId: string;
      start: number;
      duration: number;
      score: number;
      hasFaces: boolean;
      hasAction: boolean;
      isEpic: boolean;
    }
    
    const beats: VisualBeat[] = [];
    for (const asset of visualAssets) {
      if (asset.segments) {
        for (const seg of asset.segments) {
           if (seg.isDark || seg.isBlurry || seg.motionLevel === "shake" || seg.qualityScore < 4) continue;
           const dur = seg.endTime - seg.startTime;
           if (dur < 0.5) continue;
           
           let score = seg.qualityScore * 10 + (seg.aestheticScore || 5) * 5;
           if (seg.hasFaces) score += 20;
           if (seg.hasAction) score += 30;
           
           // Heuristic: If there is audio energy data, boost segments that correspond to high energy
           // We map the visual segment to the audio energy timeline.
           let energyMultiplier = 1;
           if (asset.audioEnergy) {
               const relevantEnergy = asset.audioEnergy.filter((e: any) => e.startTime <= seg.endTime && e.endTime >= seg.startTime);
               if (relevantEnergy.length > 0) {
                   const avgEnergy = relevantEnergy.reduce((s: number, e: any) => s + e.energyLevel, 0) / relevantEnergy.length;
                   energyMultiplier = 1 + (avgEnergy * 0.5); // Boost up to 50% based on audio loudness/intensity
                   
                   // Speed up boring low-energy segments
                   if (avgEnergy < 0.2 && !seg.hasFaces && !seg.hasAction) {
                       score -= 20; // Penalize boring silent B-roll
                   }
               }
           }
           score *= energyMultiplier;
           
           // Принудительно отдаем максимальный приоритет кадру, совпадающему с пиком аудио-энергии
           let isAbsoluteClimax = false;
           if (asset.id === climaxAssetId && Math.abs(seg.startTime - climaxTime) < 2.0) {
               score += 200; // Гарантированно попадет в монтаж
               isAbsoluteClimax = true;
           }
           
           beats.push({
             assetId: asset.id,
             start: seg.startTime,
             duration: dur,
             score,
             hasFaces: seg.hasFaces,
             hasAction: seg.hasAction || false,
             isEpic: isAbsoluteClimax || (seg.motionLevel === "high" && seg.aestheticScore > 7)
           });
        }
      } else {
        beats.push({ assetId: asset.id, start: 0, duration: asset.duration || 5, score: 50, hasFaces: false, hasAction: false, isEpic: false });
      }
    }

    beats.sort((a,b) => b.score - a.score);
    if (beats.length === 0) return script;

    let currentTime = 0;
    const target = strategy.targetDuration;
    
    const hookBeat = beats.find(b => b.hasFaces || b.hasAction) || beats[0];
    const hookDur = Math.min(hookBeat.duration, 2.5);
    script.scenes.push({
      id: "scene_hook", phase: "hook", intent: "Capture Attention", duration: hookDur, emotion: "energetic",
      mainClip: { assetId: hookBeat.assetId, sourceStart: hookBeat.start, sourceEnd: hookBeat.start + hookDur, speed: 1, zoom: true },
      bRolls: [], captions: []
    });
    currentTime += hookDur;
    
    let pool = beats.filter(b => b !== hookBeat);

    // Track usage per asset to ensure absolute fairness across all files
    const usageCount = new Map<string, number>();
    for (const a of visualAssets) usageCount.set(a.id, 0);
    usageCount.set(hookBeat.assetId, 1);
    
    let lastAssetId = hookBeat.assetId;
    
    while (currentTime < target && pool.length > 0) {
      const progress = currentTime / target;
      const phase = progress < 0.7 ? "buildup" : progress < 0.9 ? "climax" : "outro";
      
      // We want an asset that has been used the LEAST number of times, and is NOT the last asset used
      let bestBeatIndex = -1;
      let lowestUsage = Infinity;
      
      for (let i = 0; i < pool.length; i++) {
         const b = pool[i];
         if (b.assetId === lastAssetId && pool.length > 1) continue; // Don't repeat consecutively if possible
         
         const usage = usageCount.get(b.assetId) || 0;
         if (usage < lowestUsage) {
             if (phase === "climax" && !b.isEpic && !b.hasAction && pool.some(p => p.isEpic || p.hasAction)) continue;
             lowestUsage = usage;
             bestBeatIndex = i;
         }
      }
      
      // Fallback
      if (bestBeatIndex === -1) bestBeatIndex = 0;
      
      const beat = pool[bestBeatIndex];
      pool.splice(bestBeatIndex, 1);
      
      lastAssetId = beat.assetId;
      usageCount.set(beat.assetId, (usageCount.get(beat.assetId) || 0) + 1);
      
      let dur = phase === "buildup" ? 4 : phase === "climax" ? 1.5 : 5;
      dur = Math.min(dur, beat.duration, target - currentTime);
      if (dur < 0.5) break;
      
      // Автоматическое ускорение (Speed Ramping) скучных сегментов
      let speed = 1;
      if (beat.score < 40 && !beat.hasFaces && phase === "buildup") {
         speed = 2.0; 
         dur *= 2; 
         dur = Math.min(dur, beat.duration, (target - currentTime) * 2);
      }

      script.scenes.push({
        id: `scene_${Date.now()}_${currentTime}`, phase, intent: "Flow", duration: dur / speed, emotion: phase === "climax" ? "dramatic" : "calm",
        mainClip: { assetId: beat.assetId, sourceStart: beat.start, sourceEnd: beat.start + dur, speed: speed, zoom: !beat.hasAction },
        bRolls: [], captions: []
      });
      currentTime += dur;
    }



    return script;
  }

  private static applyProfessionalTechniques(script: DirectorScript, genre: string): DirectorScript {
    for (const scene of script.scenes) {
      if (scene.phase === "climax") {
         scene.mainClip.zoom = true;
         if (genre === "travel") {
            scene.mainClip.speed = 0.5;
            scene.duration *= 2; 
         }
      }
    }
    
    // Flash-Forward Teaser Hook (The "MrBeast/TikTok" Secret)
    if (genre === "tiktok" || genre === "ad" || genre === "youtube" || genre === "podcast") {
         const climaxScene = script.scenes.find(s => s.phase === "climax");
         const hookScene = script.scenes.find(s => s.phase === "hook");
         
         if (climaxScene && hookScene && climaxScene.mainClip.assetId !== hookScene.mainClip.assetId && script.scenes.length > 3) {
             const teaserDur = Math.min(1.0, climaxScene.duration);
             const teaserScene = {
                 id: "scene_teaser_" + Date.now(),
                 phase: "hook" as const,
                 intent: "Flash-forward Teaser",
                 duration: teaserDur,
                 emotion: "dramatic" as const,
                 mainClip: { 
                     assetId: climaxScene.mainClip.assetId, 
                     sourceStart: climaxScene.mainClip.sourceStart + (climaxScene.duration / 2) - (teaserDur / 2),
                     sourceEnd: climaxScene.mainClip.sourceStart + (climaxScene.duration / 2) + (teaserDur / 2), 
                     speed: 1, 
                     zoom: true 
                 },
                 bRolls: [],
                 captions: [{
                     text: "СМОТРИ ДО КОНЦА...",
                     offsetInScene: 0,
                     duration: teaserDur,
                     animation: "glitch"
                 }]
             };
             script.scenes.unshift(teaserScene);
         }
    }

    return script;
  }

  /**
   * RAG Critique Engine: Анализирует получившийся сценарий на предмет ошибок (темп, перебивки)
   * Исправляет их на лету и сохраняет новые правила в базу знаний для будущих генераций.
   */
  private static async critiqueAndLearn(script: DirectorScript, strategy: any): Promise<DirectorScript> {
      
      let newLessons: string[] = [];

      // 1. Проверка темпа для быстрых форматов
      if (script.genre === "tiktok" || script.genre === "ad") {
          for (const scene of script.scenes) {
              if (scene.duration > 3.5 && scene.phase !== "outro") {
                  
                  newLessons.push(`В жанре ${script.genre} обнаружена слишком длинная сцена (${scene.duration.toFixed(1)}с). Внимание зрителя падает после 3 секунд. Сцена принудительно сокращена.`);
                  scene.duration = 3.0;
                  scene.mainClip.sourceEnd = scene.mainClip.sourceStart + 3.0;
              }
          }
      }

      // 2. Проверка кинематографичности (воздух в монтаже)
      if (script.genre === "travel" || script.genre === "cinematic" || script.genre === "documentary") {
          const fastCuts = script.scenes.filter(s => s.duration < 1.5).length;
          if (fastCuts > script.scenes.length * 0.4) {
              newLessons.push(`ОШИБКА РИТМА: В кинематографичном жанре слишком много быстрых склеек (< 1.5с). Зритель не успевает насладиться эстетикой. В следующий раз давай кадру 'подышать' 4-6 секунд.`);
          }
      }
      
      // 3. Проверка перебивок для подкастов
      if (script.genre === "podcast" || script.genre === "interview") {
          const totalBRolls = script.scenes.reduce((acc, s) => acc + s.bRolls.length, 0);
          if (totalBRolls === 0 && script.targetDuration > 10) {
              newLessons.push(`ОШИБКА УДЕРЖАНИЯ: Подкаст без B-Roll (перебивок). Говорящая голова наскучит зрителю. Обязательно перекрывай лицо визуальным рядом каждые несколько секунд.`);
          }
      }

      // Если в RAG-базе (strategy.instructions) уже было указание на эту ошибку, но движок все равно ее совершил,
      // мы можем записать урок с повышенным приоритетом (в верхний регистр).
      for (const lesson of newLessons) {
          const isRepeatOffense = strategy.instructions.includes("ОШИБКА") && strategy.instructions.toLowerCase().includes("b-roll");
          let finalLesson = lesson;
          if (isRepeatOffense) finalLesson = "КРИТИЧЕСКОЕ ПРАВИЛО: " + lesson;
          
          try {
             const { saveLearnedLesson } = await import("./knowledge");
             await saveLearnedLesson(script.genre, finalLesson);
          } catch(e) {
             console.warn("Could not save RAG lesson", e);
          }
      }

      return script;
  }

  static compileToDecision(script: DirectorScript): AIEditDecision {
    const clips: AIEditDecision["clips"] = [];
    let currentTimelineTime = 0;
    
    // First calculate duration of all main clips to map absolute timeline time accurately
    let totalMainDuration = 0;
    for (const scene of script.scenes) {
       totalMainDuration += scene.duration / (scene.mainClip.speed || 1);
    }
    
    for (const scene of script.scenes) {
       const sceneDuration = scene.duration / (scene.mainClip.speed || 1);

       clips.push({
         assetId: scene.mainClip.assetId,
         trackType: "main",
         duration: sceneDuration,
         startTime: scene.mainClip.sourceStart,
         endTime: scene.mainClip.sourceEnd,
         speed: scene.mainClip.speed,
         zoom: scene.mainClip.zoom,
         emotion: scene.emotion,
         reason: `[${scene.phase.toUpperCase()}] ${scene.intent}`,
         importance: scene.phase === "hook" || scene.phase === "climax" ? 0.9 : 0.6
       });
       
       for (const broll of scene.bRolls) {
         clips.push({
           assetId: broll.assetId,
           trackType: "b-roll",
           duration: (broll.sourceEnd - broll.sourceStart),
           startTime: broll.sourceStart,
           endTime: broll.sourceEnd,
           timeInTimeline: Math.max(0, currentTimelineTime + broll.offsetInScene),
           reason: "B-Roll overlay",
           importance: 0.5
         } as any);
       }
       
       currentTimelineTime += sceneDuration;
    }

    // Now process captions knowing exact timings
    const textOverlays: any[] = [];
    currentTimelineTime = 0;
    for (const scene of script.scenes) {
        const sceneDuration = scene.duration / (scene.mainClip.speed || 1);
        for (const caption of scene.captions) {
            textOverlays.push({
                text: caption.text,
                time: currentTimelineTime + caption.offsetInScene,
                duration: caption.duration,
                animation: caption.animation
            });
        }
        currentTimelineTime += sceneDuration;
    }

    return {
      contentType: script.genre as any,
      targetDuration: script.targetDuration,
      pace: script.genre === "tiktok" || script.genre === "ad" ? "fast" : "medium",
      colorGrade: "cinematic",
      clips,
      musicSync: true,
      transitions: script.genre === "tiktok" || script.genre === "ad" ? "cut" : "crossfade",
      textOverlays,
      audioEnhancements: {
        normalize: true,
        denoise: script.audioStrategy.denoiseSpeech,
        voiceEnhance: script.audioStrategy.denoiseSpeech,
        removeSilence: script.audioStrategy.removeSilence,
        ducking: script.audioStrategy.duckingEnabled,
        muteOriginalAudio: script.audioStrategy.muteOriginalAudio
      },
      suggestions: [script.concept],
      analysisQuality: "ai"
    };
  }
}
