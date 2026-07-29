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
  };
}

export class DirectorEngine {

  static async formulateScript(request: AIAnalysisRequest): Promise<DirectorScript> {
    const strategy = await DirectorBrain.defineStrategy(request.userPrompt);
    
    const speechAssets = request.assets.filter(a => !!a.transcript && a.transcript.length > 10);
    const visualAssets = request.assets.filter(a => a.type === "video" || a.type === "image");

    let script: DirectorScript;
    
    if (speechAssets.length > 0) {
      // Исключительно алгоритмическая нарезка Jump-Cuts + опциональный LLM-поиск хука
      script = await this.buildNarrativeScript(request, strategy, speechAssets, visualAssets);
    } else {
      script = this.buildVisualScript(request, strategy, visualAssets);
    }
    
    script = this.applyProfessionalTechniques(script, strategy.genre);
    
    return script;
  }

  /**
   * Полностью переписанный алгоритм работы с речью (Jump-Cuts / AutoPod Style)
   */
  private static async buildNarrativeScript(
    _request: AIAnalysisRequest, 
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
        return this.buildVisualScript(_request, strategy, [mainAsset, ...visualAssets]);
    }

    // 2. Объединяем слова во фразы, автоматически вырезая тишину > 0.4s
    const phrases: {start: number, end: number, text: string}[] = [];
    let curr = { start: words[0].start, end: words[0].end, text: words[0].text };

    for (let i = 1; i < words.length; i++) {
        const w = words[i];
        const gap = w.start - curr.end;
        
        // Разрываем фразу, если тишина слишком долгая (dead air) или фраза уже длиннее 4-х секунд
        if (gap > 0.4 || (curr.end - curr.start > 4.0)) {
            phrases.push(curr);
            curr = { start: w.start, end: w.end, text: w.text };
        } else {
            curr.end = w.end;
            curr.text += " " + w.text;
        }
    }
    phrases.push(curr);

    // 3. Фильтрация "мусорных" фраз (слова-паразиты, эканья)
    const validPhrases = phrases.filter(p => {
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
    const bRollPool = visualAssets.filter(a => a.id !== mainAsset.id);

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
                const bAsset = bRollPool[bRollIndex % bRollPool.length];
                const bStart = (bAsset.segments && bAsset.segments.length > 0) ? bAsset.segments[0].startTime : 0;
                const bDur = Math.min(scene.duration, bAsset.duration || 5);
                
                scene.bRolls.push({
                    assetId: bAsset.id,
                    sourceStart: bStart,
                    sourceEnd: bStart + bDur,
                    offsetInScene: 0
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
            musicStyle: "lofi",
            duckingEnabled: true,
            denoiseSpeech: true,
            removeSilence: true
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
        musicStyle: strategy.genre === "travel" ? "cinematic" : "electronic",
        duckingEnabled: false,
        denoiseSpeech: false,
        removeSilence: false
      }
    };

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
           
           beats.push({
             assetId: asset.id,
             start: seg.startTime,
             duration: dur,
             score,
             hasFaces: seg.hasFaces,
             hasAction: seg.hasAction || false,
             isEpic: seg.motionLevel === "high" && seg.aestheticScore > 7
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
    
    const pool = beats.filter(b => b !== hookBeat);

    while (currentTime < target && pool.length > 0) {
      const progress = currentTime / target;
      const phase = progress < 0.7 ? "buildup" : progress < 0.9 ? "climax" : "outro";
      
      let beatIndex = phase === "climax" ? Math.max(0, pool.findIndex(b => b.isEpic || b.hasAction)) : 0;
      const beat = pool[beatIndex];
      pool.splice(beatIndex, 1);
      
      let dur = phase === "buildup" ? 4 : phase === "climax" ? 1.5 : 5;
      dur = Math.min(dur, beat.duration, target - currentTime);
      if (dur < 0.5) break;
      
      script.scenes.push({
        id: `scene_${Date.now()}_${currentTime}`, phase, intent: "Flow", duration: dur, emotion: phase === "climax" ? "dramatic" : "calm",
        mainClip: { assetId: beat.assetId, sourceStart: beat.start, sourceEnd: beat.start + dur, speed: 1, zoom: !beat.hasAction },
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
    return script;
  }

  static compileToDecision(script: DirectorScript): AIEditDecision {
    const clips: AIEditDecision["clips"] = [];
    let currentTimelineTime = 0;
    
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
           timeInTimeline: currentTimelineTime + broll.offsetInScene,
           reason: "B-Roll overlay",
           importance: 0.5
         } as any);
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
      textOverlays: script.scenes.flatMap(s => s.captions.map(c => ({
         text: c.text,
         time: c.offsetInScene,
         duration: c.duration,
         animation: c.animation
      }))),
      audioEnhancements: {
        normalize: true,
        denoise: script.audioStrategy.denoiseSpeech,
        voiceEnhance: script.audioStrategy.denoiseSpeech,
        removeSilence: script.audioStrategy.removeSilence,
        ducking: script.audioStrategy.duckingEnabled
      },
      suggestions: [script.concept],
      analysisQuality: "ai"
    };
  }
}
