import type { AIAnalysisRequest, AIEditDecision } from "../ai/aiService";
import { DirectorBrain } from "./director";
import { AI_CONFIG } from "@/config/ai";

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

  /**
   * Главная точка входа. 
   * Оркестрирует весь процесс создания видео от анализа до сценария.
   */
  static async formulateScript(request: AIAnalysisRequest): Promise<DirectorScript> {
    const strategy = await DirectorBrain.defineStrategy(request.userPrompt);
    
    const speechAssets = request.assets.filter(a => !!a.transcript && a.transcript.length > 10);
    const visualAssets = request.assets.filter(a => a.type === "video" || a.type === "image");

    let script: DirectorScript;
    
    if (speechAssets.length > 0) {
      if (AI_CONFIG.groqApiKey) {
        script = await this.buildNarrativeScriptWithLLM(request, strategy, speechAssets, visualAssets);
      } else {
        script = this.buildNarrativeScriptLocal(request, strategy, speechAssets, visualAssets);
      }
    } else {
      script = this.buildVisualScript(request, strategy, visualAssets);
    }
    
    // Apply Masterclass Editing Techniques
    script = this.applyProfessionalTechniques(script, strategy.genre);
    
    return script;
  }

  /**
   * LLM-driven Narrative (Подкасты, Интервью, Говорящая голова)
   * Использует LLM исключительно для выявления смысла и структуры истории, 
   * а монтажные решения (b-roll, j-cuts) принимает локальный движок.
   */
  private static async buildNarrativeScriptWithLLM(
    request: AIAnalysisRequest, 
    strategy: any, 
    speechAssets: any[], 
    visualAssets: any[]
  ): Promise<DirectorScript> {
    const prompt = `Ты - Главный Редактор Сценария. Выбери лучшие таймкоды из речи для построения истории.
    Жанр: ${strategy.genre}. Лимит: ${strategy.targetDuration} секунд.
    
    Верни JSON:
    {
      "concept": "Краткое описание идеи",
      "hook": { "assetId": "...", "start": 0.0, "end": 3.0, "intent": "Зацепить внимание" },
      "buildup": [ { "assetId": "...", "start": 3.0, "end": 10.0, "intent": "Раскрытие" } ],
      "climax": { "assetId": "...", "start": 10.0, "end": 15.0, "intent": "Кульминация" },
      "outro": { "assetId": "...", "start": 15.0, "end": 18.0, "intent": "Призыв к действию" }
    }
    
    Транскрипты:
    ${speechAssets.map(a => `ASSET ${a.id}:\n${a.transcript}`).join("\n\n")}
    `;

    try {
      const response = await fetch(AI_CONFIG.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_CONFIG.groqApiKey}` },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [{ role: "system", content: prompt }],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });

      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      
      const scenes: DirectorScene[] = [];
      const addScene = (phase: any, block: any, emotion: any) => {
        if (!block || !block.assetId) return;
        scenes.push({
          id: `scene_${phase}_${Date.now()}`,
          phase,
          intent: block.intent || "",
          duration: block.end - block.start,
          emotion,
          mainClip: { assetId: block.assetId, sourceStart: block.start, sourceEnd: block.end, speed: 1, zoom: phase === "hook" },
          bRolls: [], captions: []
        });
      };

      addScene("hook", parsed.hook, "energetic");
      (parsed.buildup || []).forEach((b: any) => addScene("buildup", b, "neutral"));
      addScene("climax", parsed.climax, "dramatic");
      addScene("outro", parsed.outro, "calm");

      return {
        concept: parsed.concept || "LLM Narrative",
        genre: strategy.genre,
        targetDuration: strategy.targetDuration,
        scenes,
        audioStrategy: {
          musicStyle: strategy.genre === "podcast" ? "lofi" : "cinematic",
          duckingEnabled: true,
          denoiseSpeech: true,
          removeSilence: true
        }
      };

    } catch (e) {
      console.warn("LLM script formulation failed, falling back to local", e);
      return this.buildNarrativeScriptLocal(request, strategy, speechAssets, visualAssets);
    }
  }

  /**
   * Локальная эвристика для речи: ищет куски с высокой громкостью для Хука.
   */
  private static buildNarrativeScriptLocal(
    _request: AIAnalysisRequest, 
    strategy: any, 
    speechAssets: any[], 
    _visualAssets: any[]
  ): DirectorScript {
    const scenes: DirectorScene[] = [];
    const mainAsset = speechAssets[0];
    
    // Ищем отрезки речи (в транскрипте строки вида [0.0s - 2.5s] Текст)
    const lines = (mainAsset.transcript || "").split("\n").filter((l: string) => l.includes("]"));
    
    let hookLine = lines[0];
    let climaxLine = lines[Math.floor(lines.length / 2)];
    
    const parseTime = (line: string) => {
      const match = line.match(/\[([\d\.]+)s - ([\d\.]+)s\]/);
      if (match) return { start: parseFloat(match[1]), end: parseFloat(match[2]) };
      return null;
    };

    const addLocalScene = (line: string, phase: any) => {
      const t = parseTime(line);
      if (t && t.end > t.start) {
        scenes.push({
          id: `local_${phase}_${Date.now()}`,
          phase,
          intent: "Auto-extracted speech",
          duration: t.end - t.start,
          emotion: "neutral",
          mainClip: { assetId: mainAsset.id, sourceStart: t.start, sourceEnd: t.end, speed: 1, zoom: phase === "hook" },
          bRolls: [], captions: []
        });
      }
    };

    if (hookLine) addLocalScene(hookLine, "hook");
    if (climaxLine) addLocalScene(climaxLine, "climax");

    return {
      concept: "Local Heuristic Narrative",
      genre: strategy.genre,
      targetDuration: strategy.targetDuration,
      scenes,
      audioStrategy: {
        musicStyle: "lofi",
        duckingEnabled: true,
        denoiseSpeech: true,
        removeSilence: true
      }
    };
  }

  /**
   * Сценарий на основе ВИЗУАЛА (Travel, Реклама, Music Video)
   */
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

  /**
   * Шаг 3: Магия режиссуры (Masterclass Techniques)
   * Здесь мы добавляем B-Rolls, Speed Ramps, J-Cuts в готовый скрипт.
   */
  private static applyProfessionalTechniques(script: DirectorScript, genre: string): DirectorScript {
    // 1. Удержание внимания (Pattern Interrupt & B-Rolls)
    // Если сцена длиннее 4 секунд, и это подкаст/разговор, добавляем B-Roll перебивку
    for (const scene of script.scenes) {
      if (scene.duration > 4 && genre === "podcast") {
        // Мы не знаем здесь конкретных b-roll ассетов (их подберет autoEdit или LLM),
        // но мы даем жесткую инструкцию: "Сцена требует B-Roll"
        scene.intent += " | REQUIRE B-ROLL (Pattern Interrupt)";
      }

      // 2. Punch Zoom (Динамический масштаб на смысловых акцентах)
      // Если сцена - Climax, делаем резкий наезд
      if (scene.phase === "climax") {
         scene.mainClip.zoom = true;
         // Speed ramp для эпичных моментов
         if (genre === "travel") {
            scene.mainClip.speed = 0.5; // Слоу-мо
            scene.duration *= 2; // Увеличиваем длительность сцены из-за слоу-мо
         }
      }
    }
    return script;
  }

  /**
   * Шаг 4: Конвертация сценария в AIEditDecision для пайплайна
   */
  static compileToDecision(script: DirectorScript): AIEditDecision {
    const clips: AIEditDecision["clips"] = [];
    
    for (const scene of script.scenes) {
       clips.push({
         assetId: scene.mainClip.assetId,
         trackType: "main",
         duration: scene.duration,
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
           reason: "B-Roll overlay",
           importance: 0.5
         });
       }
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
