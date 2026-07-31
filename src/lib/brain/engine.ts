import type { AIAnalysisRequest, AIEditDecision } from "../ai/aiService";
import { DirectorBrain } from "./director";
import { AI_CONFIG } from "../../config/ai";

/** Жанровые семейства: единая точка правды для ветвлений темпа/приёмов.
 *  Новые жанры (gaming, fitness, wedding...) наследуют правильную механику,
 *  а не проваливаются в дефолтный medium. */
export const FAST_GENRES = new Set(["tiktok", "ad", "gaming", "fitness", "musicvideo"]);
export const SLOW_GENRES = new Set(["travel", "cinematic", "documentary", "luxury", "wedding", "realestate"]);
/** Жанры «говорящей головы»: обязательный B-Roll, PIP-перебивки, teaser-хук. */
export const TALKING_GENRES = new Set(["podcast", "interview", "vlog", "education", "youtube"]);

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
    cameraAngle?: "wide" | "medium" | "close";
  };
  
  bRolls: Array<{
    assetId: string;
    sourceStart: number;
    sourceEnd: number;
    offsetInScene: number;
    presentation?: "fullscreen" | "pip";
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

// Фильтр речевых фраз — ЕДИНЫЙ для эвристического и LLM-пути.
// Стоп-слова-паразиты и чистые приветствия — это то, что монтажёр режет
// на первом проходе: вход LLM тоже должен быть очищен, иначе он тратит
// «внимание» и контекст на мусор и хуже строит арку.
const SPEECH_FILLERS = new Set([
  "ну", "э", "ээ", "эээ", "м", "мм", "ммм", "аа", "эх",
  "типа", "какбы", "вот", "короче", "значит", "угу", "ага",
]);
const SPEECH_GREETING_RE = /^(привет|всем|здравствуйте|здорово|добрый|доброе|день|вечер|утро|друзья|ребята|hello|hi|hey|guys)$/i;

export function filterSpeechPhrases<T extends { start: number; end: number; text: string; isPause?: boolean }>(phrases: T[]): T[] {
  return phrases.filter(p => {
    if (p.isPause) return true;
    const toks = p.text.toLowerCase().split(/\s+/)
      .map((w: string) => w.replace(/[^а-яa-zё]/g, ""))
      .filter(Boolean);
    if (toks.length === 0) return false;
    if (toks.every((w: string) => SPEECH_FILLERS.has(w))) return false;
    const realToks = toks.filter((w: string) => !SPEECH_FILLERS.has(w));
    if (realToks.length > 0 && realToks.every((w: string) => SPEECH_GREETING_RE.test(w)) && (p.end - p.start) < 2.2) return false;
    if (toks.length <= 3 && realToks.length <= 1 && (p.end - p.start) < 1.0) return false;
    if (p.end - p.start < 0.2) return false;
    return true;
  });
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
                     // >= 0.35: строгое «> 0.4» втаскивало хвостовые филлеры внутрь
                     // фразы при паузе ровно-в-узел (фильтр их тогда уже не видел).
                     if (gap >= 0.35 || (curr.end - curr.start > 4.0)) {
                         phrases.push(curr);
                         curr = { start: w.start, end: w.end, text: w.text };
                     } else {
                         curr.end = w.end;
                         curr.text += " " + w.text;
                     }
                 }
                 phrases.push(curr);
             }
             const validPhrases = filterSpeechPhrases(phrases);
             
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
                duration: p.end - p.start + 0.14,
                emotion: s.phase === "climax" || s.phase === "hook" ? "energetic" : "neutral",
                // «Воздух» вокруг фразы: 50мс до и 90мс после — иначе Whisper-таймкоды
                // обгладывают первый/последний звук слова, речь звучит обрубленной.
                mainClip: { assetId: mainAsset.id, sourceStart: Math.max(0, p.start - 0.05), sourceEnd: p.end + 0.09, speed: 1, zoom: isZoomed },
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

                const isPip = (TALKING_GENRES.has(strategy.genre) || strategy.genre === "tiktok" || strategy.genre === "ad") && Math.random() > 0.5;
                scene.bRolls.push({
                    assetId: bestAsset.id,
                    sourceStart: bStart,
                    sourceEnd: bStart + Math.min(scene.duration, bestAsset.duration || 5),
                    offsetInScene: Math.random() > 0.5 ? -0.3 : 0.2, // J-Cut / L-Cut
                    presentation: isPip ? "pip" : "fullscreen"
                });
            }

            scenes.push(scene);
        }

        // LLM часто переоценивает хронометраж — принудительно подрезаем по целевой длительности,
        // иначе ролик расползается и темп проседает.
        let accDur = 0;
        const trimmedScenes: DirectorScene[] = [];
        for (const s of scenes) {
            if (trimmedScenes.length > 0 && accDur + s.duration > strategy.targetDuration) break;
            trimmedScenes.push(s);
            accDur += s.duration;
        }
        if (trimmedScenes.length > 0) trimmedScenes[trimmedScenes.length - 1].phase = "outro";

        return {
            concept: parsed.concept || "Pro LLM Edit",
            genre: strategy.genre,
            targetDuration: strategy.targetDuration,
            scenes: trimmedScenes,
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
        
        // Разрываем фразу на слышимой паузе (>= 0.35s: пауза 0.4 «в узел» раньше
        // втаскивала хвостовой филлер внутрь соседней фразы) или при перегрузе.
        if (gap >= 0.35 || (curr.end - curr.start > 4.0)) {
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

    // 3. Фильтрация "мусорных" фраз (слова-паразиты, эканья, чистые приветствия),
    // с защитой драматических пауз. Единый фильтр движка (см. filterSpeechPhrases).
    const validPhrases = filterSpeechPhrases(phrases);

    if (validPhrases.length === 0) validPhrases.push(phrases[0]);

    // Склейка ультракоротких фраз (<0.45с): рубленая обрывочная речь даёт
    // стробоскоп планов и субтитров. Обрывок вливаем в следующую фразу —
    // смысл там, как правило, и продолжается.
    const merged: typeof validPhrases = [];
    for (const p of validPhrases) {
        const last = merged[merged.length - 1];
        if (last && !last.isPause && !p.isPause && (last.end - last.start) < 0.45) {
            last.end = p.end;
            last.text += " " + p.text;
        } else {
            merged.push({ ...p });
        }
    }
    validPhrases.length = 0;
    validPhrases.push(...merged);

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
        id: `hook_${Date.now()}`, phase: "hook", intent: "Cold Open", duration: hookPhrase.end - hookPhrase.start + 0.14, emotion: "energetic",
        mainClip: { assetId: mainAsset.id, sourceStart: Math.max(0, hookPhrase.start - 0.05), sourceEnd: hookPhrase.end + 0.09, speed: 1, zoom: true },
        bRolls: [], captions: []
    });

    // 5. Построение основной истории (Body)
    let isZoomed = false;
    let bRollIndex = 0;
    const bRollPool = visualAssets.filter((a: any) => a.id !== mainAsset.id);

    for (let i = 0; i < validPhrases.length; i++) {
        const p = validPhrases[i];

        // Cold-open: если хук взят из самого начала истории, НЕ повторяем его сразу второй раз —
        // зритель слышит дубль и теряет доверие. (Хук из середины намеренно повторяется как payoff.)
        if (i === hookIndex && hookIndex <= 1) continue;

        // Динамическое чередование зума для имитации работы двух камер (Punch Zoom)
        isZoomed = !isZoomed;
        
        const scene: DirectorScene = {
            id: `body_${p.start}_${Date.now()}`, phase: "buildup", intent: "Dialogue Cut", duration: p.end - p.start + (p.isPause ? 0 : 0.14), emotion: "neutral",
            // Паузы не подрубаем (это и есть воздух), фразы — с 50/90мс полями.
            mainClip: { assetId: mainAsset.id, sourceStart: p.isPause ? p.start : Math.max(0, p.start - 0.05), sourceEnd: p.isPause ? p.end : p.end + 0.09, speed: 1, zoom: isZoomed },
            bRolls: [], captions: []
        };

        // B-Roll Overlay Logic (Pattern Interrupt)
        if (bRollPool.length > 0) {
            // Перекрываем скучные длинные фразы или специфические слова.
            // Расширенный словарь «визуальных» существительных: то, что зритель
            // ожидает УВИДЕТЬ, когда слышит (показ не рассказ — ретеншн-триггер).
            const VISUAL_NOUNS = /(например|посмотри|смотри|представь|город|улиц|люди|человек|деньги|бюджет|работа|офис|проблема|машин|дорог|море|океан|пляж|горы|лес|парк|еда|ресторан|кофе|спорт|трениров|дом|квартир|семь|друз|телефон|компьютер|сайт|экран|бизнес|клиент|продаж|магазин|путешеств|отпуск|самолет|отель|школ|книга|фильм|музык|собак|кошк|кот|природ|закат|ночь|утро)/i;
            const isLong = (p.end - p.start > 2.5);
            const hasVisualKeyword = p.text.match(VISUAL_NOUNS);
            // Либо каждые N фраз принудительно (чтобы не заскучать)
            const isNthPhrase = (i % 4 === 0 && i !== 0);

            if (isLong || hasVisualKeyword || isNthPhrase) {
                // Find a B-Roll asset avoiding consecutive repeats
                let bAsset = bRollPool[bRollIndex % bRollPool.length];
                if (bRollPool.length > 1 && bAsset.id === (scenes[scenes.length-1]?.bRolls[0]?.assetId)) {
                   bRollIndex++;
                   bAsset = bRollPool[bRollIndex % bRollPool.length];
                }

                // СЕМАНТИКА БЕЗ LLM: если спикер назвал предмет, а имя одного из
                // ассетов содержит тот же корень — показываем ИМЕННО его
                // («…мы поехали на море» поверх sea.mp4, а не случайного офиса).
                if (hasVisualKeyword && bRollPool.length > 1) {
                   const stem = String(hasVisualKeyword[0]).toLowerCase();
                   if (stem.length >= 3) {
                      const named = bRollPool.find((a: any) => (a.name || "").toLowerCase().includes(stem));
                      const prevB = scenes[scenes.length-1]?.bRolls[0]?.assetId;
                      if (named && named.id !== prevB) bAsset = named;
                   }
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

    // 7. ЭМОЦИОНАЛЬНАЯ КУЛЬМИНАЦИЯ РЕЧИ.
    // Раньше эвристический тракт был «плоским»: кульминации не существовало,
    // поэтому applyProfessionalTechniques (акцентный зум) и flash-forward
    // teaser («смотри до конца») молча не срабатывали для говорящих голов —
    // а это самый массовый контент платформы. Пик ищем по двум каналам:
    // энергия камерного звука (крик/смех/аплодисменты) и смысловые маркеры
    // («главное», «итог», «секрет» — классические payoff-фразы).
    {
        const energyOf = (lvl?: string) =>
            lvl === "drop" ? 1 : lvl === "high" ? 0.7 : lvl === "medium" ? 0.35 : 0.1;
        let acc = 0;
        let bestClimaxIdx = -1;
        let bestClimaxScore = 0;
        for (let i = 0; i < finalScenes.length; i++) {
            const s = finalScenes[i];
            const mid = acc + s.duration / 2;
            acc += s.duration;
            // Пик не ставим в завязку (первые 30%) и не в самый финал — там аутро.
            if (mid < strategy.targetDuration * 0.3 || mid > strategy.targetDuration * 0.95) continue;
            if (s.phase === "hook") continue;
            const src0 = s.mainClip.sourceStart;
            const src1 = s.mainClip.sourceEnd;
            let score = 0.3;
            if (mainAsset.audioEnergy) {
                for (const e of mainAsset.audioEnergy) {
                    const ov = Math.min(src1, e.endTime) - Math.max(src0, e.startTime);
                    if (ov > 0) score = Math.max(score, energyOf((e as any).energyLevel));
                }
            }
            const ph = validPhrases.find(p => p.start >= src0 - 0.3 && p.start < src1);
            if (ph && /(главное|самое важное|итог|вывод|секрет|поэтому|запомни|вот почему)/i.test(ph.text)) {
                score += 0.5;
            }
            if (score > bestClimaxScore) { bestClimaxScore = score; bestClimaxIdx = i; }
        }
        if (bestClimaxIdx > 0) {
            const cs = finalScenes[bestClimaxIdx];
            cs.phase = "climax";
            cs.emotion = "dramatic";
            cs.mainClip.zoom = true; // punch-in на пиковой фразе
        }
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
        musicStyle: SLOW_GENRES.has(strategy.genre) ? "cinematic"
                    : FAST_GENRES.has(strategy.genre) ? "electronic" : "lofi",
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
      /** Площадь крупнейшего лица (0..1) — если крупно, движение камеры срежет лицо. */
      faceSize?: number;
    }

    // Жёсткий фильтр брака + мягкий фоллбэк: если после отсева НЕЧЕГО монтировать,
    // снимаем требования — ролик из «так себе» кадров всегда лучше пустого ролика.
    // Раньше строгий фильтр мог вернуть пустой план (пустой ролик на выходе!).
    const collectBeats = (relaxed: boolean): VisualBeat[] => {
      const out: VisualBeat[] = [];
      for (const asset of visualAssets) {
        if (asset.segments) {
          for (const seg of asset.segments) {
            const cinematicDark = seg.isDark && (seg.contrast ?? 0) >= 150;
            if (seg.isDark && !cinematicDark) continue;
            if (seg.motionLevel === "shake") continue;
            if (!relaxed) {
              if (seg.isBlurry || seg.qualityScore < 4) continue;
            } else {
              if (seg.isBlurry && (seg.contrast ?? 0) < 70) continue; // мыло + плоскость = совсем брак
              if (seg.qualityScore < 2) continue;
            }
            const dur = seg.endTime - seg.startTime;
            if (dur < 0.5) continue;

            let score = seg.qualityScore * 10 + (seg.aestheticScore || 5) * 5;
            if (seg.hasFaces) score += 20;
            if (seg.hasAction) score += 30;
            // Колоритность Hasler–Süsstrunk: сочные кадры (закаты, неон, природа)
            // читаются «дороже» — отдаём им приоритет без завышения блёклых.
            score += Math.min(18, (seg.colorfulness ?? 0) * 0.4);

            let energyMultiplier = 1;
            if (asset.audioEnergy) {
                const relevantEnergy = asset.audioEnergy.filter((e: any) => e.startTime <= seg.endTime && e.endTime >= seg.startTime);
                if (relevantEnergy.length > 0) {
                    const avgEnergy = relevantEnergy.reduce((s: number, e: any) => s + e.energyLevel, 0) / relevantEnergy.length;
                    energyMultiplier = 1 + (avgEnergy * 0.5);
                    if (avgEnergy < 0.2 && !seg.hasFaces && !seg.hasAction) {
                        score -= 20;
                    }
                }
            }
            score *= energyMultiplier;
            if (relaxed) score *= 0.7; // лучший «плохой» кадр всё равно уступает любому «хорошему»

            // Принудительно отдаем максимальный приоритет кадру, совпадающему с пиком аудио-энергии.
            // ВНИМАНИЕ: только если у ассетов реально есть энергетика камерного звука
            // (maxOverallEnergy > -1). Без неё детект «залипал» на t=0 первого ассета —
            // лучший action-кадр терялся среди фальшивых эпиков.
            let isAbsoluteClimax = false;
            if (maxOverallEnergy > -1 && asset.id === climaxAssetId && Math.abs(seg.startTime - climaxTime) < 2.0) {
                score += 200; // Гарантированно попадет в монтаж
                isAbsoluteClimax = true;
            }

            out.push({
              assetId: asset.id,
              start: seg.startTime,
              duration: dur,
              score,
              hasFaces: seg.hasFaces,
              hasAction: seg.hasAction || false,
              faceSize: seg.faceSize,
              isEpic: isAbsoluteClimax || (seg.motionLevel === "high" && seg.aestheticScore > 7)
            });
          }
        } else {
          out.push({ assetId: asset.id, start: 0, duration: asset.duration || 5, score: 50, hasFaces: false, hasAction: false, isEpic: false });
        }
      }
      return out;
    };

    let beats = collectBeats(false);
    if (beats.length === 0) beats = collectBeats(true);
    beats.sort((a, b) => b.score - a.score);
    if (beats.length === 0) return script;

    const target = strategy.targetDuration;
    const isFastGenre = FAST_GENRES.has(strategy.genre);
    const isSlowGenre = SLOW_GENRES.has(strategy.genre);

    // --- МУЗЫКАЛЬНАЯ СЕТКА ---
    // Длительности планов квантуются КРАТНО медианному периоду бита: монтаж
    // дышит в ритме трека «по построению», а не благодаря пост-фактум снаппингу.
    const musicGrid = (_request.beats ?? []).filter(b => b >= 0 && b <= target + 5).slice().sort((a, b) => a - b);
    let beatDur = 0;
    if (musicGrid.length >= 5) {
      const deltas: number[] = [];
      for (let i = 1; i < musicGrid.length; i++) {
        const d = musicGrid[i] - musicGrid[i - 1];
        if (d > 0.2 && d < 1.5) deltas.push(d);
      }
      deltas.sort((a, b) => a - b);
      if (deltas.length >= 4) beatDur = deltas[Math.floor(deltas.length / 2)];
    }
    /** Квантование длительности к ближайшему целому числу битов (с коридором). */
    const qBeats = (seconds: number, minBeats: number, maxBeats: number): number => {
      if (!beatDur) return seconds;
      const k = Math.round(seconds / beatDur);
      const clampedK = Math.max(minBeats, Math.min(maxBeats, k));
      return +(clampedK * beatDur).toFixed(3);
    };

    // --- КУЛЬМИНАЦИЯ НА ДРОПЕ МУЗЫКИ ---
    // Главный кадр ролика ставим не «где-то на 70%», а точно на первый мощный
    // дроп трека в окне 45–85% таймлайна (в координатах таймлайна: минус inPoint).
    // Без пользовательской музыки — классика: 75% таймлайна.
    let wantClimaxAt = target * 0.75;
    {
      const musicAsset = _request.assets.find((a: any) => a.type === "audio" && a.audioEnergy && a.audioEnergy.length > 0);
      const musicEnergy = musicAsset?.audioEnergy as import("../media").AudioEnergySegment[] | undefined;
      if (musicEnergy && musicEnergy.length > 0) {
        const mp = _request.musicInPointSec ?? 0;
        const windowSegs = musicEnergy
          .map((e) => ({ t: e.startTime - mp, level: e.energyLevel }))
          .filter((e) => e.t >= target * 0.45 && e.t <= target * 0.85);
        const drop = windowSegs.find((e) => e.level === "drop") ?? windowSegs[0];
        if (drop) wantClimaxAt = drop.t;
      }
      // Снап к ближайшему биту: удар кульминации совпадает с долей.
      if (musicGrid.length) {
        let best = wantClimaxAt;
        let bestDist = Infinity;
        for (const b of musicGrid) {
          const d = Math.abs(b - wantClimaxAt);
          if (d < bestDist) { bestDist = d; best = b; }
        }
        if (bestDist <= 0.7) wantClimaxAt = best;
      }
      wantClimaxAt = Math.max(target * 0.4, Math.min(target * 0.9, wantClimaxAt));
    }

    let currentTime = 0;

    // Хук: лицо или действие; у быстрых жанров — ультракороткий (1.4-1.8с),
    // зритель решает «смотреть ли» за первые ~1.5с, длинный хук = свайп.
    // Длительность квантуется на бит-сетку, иначе смещение хука ломало бы
    // выравнивание ВСЕХ последующих склеек (накопительный сдвиг фазы).
    const hookBeat = beats.find(b => b.hasFaces || b.hasAction) || beats[0];
    const hookMax = isFastGenre ? 1.7 : isSlowGenre ? 2.4 : 2.0;
    const hookDur = Math.min(hookBeat.duration, beatDur ? qBeats(hookMax, 2, 6) : hookMax);
    script.scenes.push({
      id: "scene_hook", phase: "hook", intent: "Capture Attention", duration: hookDur, emotion: "energetic",
      mainClip: { assetId: hookBeat.assetId, sourceStart: hookBeat.start, sourceEnd: hookBeat.start + hookDur, speed: 1, zoom: true },
      bRolls: [], captions: []
    });
    currentTime += hookDur;

    // Правило пика: самый эпичный кадр резервируется под кульминацию —
    // иначе fair-usage тратит лучший момент на середину и финал проседает.
    // TEASE→PAYOFF: если эпик-окно уже открыло ролик хуком (тизер на 1.6-2.4с),
    // кульминация берёт ПРОДОЛЖЕНИЕ того же окна — зритель получает развязку
    // того момента, которым его зацепили (кинематографический приём, не дубль).
    let climaxReserve: VisualBeat | null = null;
    {
      const epic = beats.find(b => b.isEpic) ?? null;
      if (epic) {
        if (epic === hookBeat && epic.duration > hookDur + 1.8) {
          climaxReserve = { ...epic, start: epic.start + hookDur, duration: epic.duration - hookDur };
        } else if (epic !== hookBeat) {
          climaxReserve = epic;
        }
      }
    }
    let reserveUsed = false;

    // --- ПЕРЕИСПОЛЬЗУЕМЫЙ ПУЛ ПЛАНОВ ---
    // СТАРЫЙ БАГ: pool.splice делал каждое окно одноразовым — при дефиците
    // исходников ролик обрывался задолго до цели, а кульминация и аутро
    // просто исчезали (драматургическая арка ломалась). Теперь окна
    // переиспользуемы с анти-повторной памятью: то же окно не раньше, чем
    // через 2 сцены, тот же ассет — не подряд; неиспользованные окна и
    // «свежие» ассеты всегда выигрывают у повторов.
    const usageCount = new Map<string, number>();
    for (const a of visualAssets) usageCount.set(a.id, 0);
    usageCount.set(hookBeat.assetId, 1);
    const beatUseCount = new Map<VisualBeat, number>();
    beatUseCount.set(hookBeat, 1);
    const recentBeats: VisualBeat[] = [hookBeat];
    /** До какой исходной секунды каждое окно уже показано (для свежих повторов). */
    const beatCoveredTo = new Map<VisualBeat, number>();
    beatCoveredTo.set(hookBeat, hookBeat.start + hookDur);

    let lastAssetId = hookBeat.assetId;
    let lastBeat: VisualBeat = hookBeat;
    let waveIdx = 0;

    // КРУПНОСТЬ ПЛАНОВ: «никогда два общих плана подряд» (Зэткин/Мёрч).
    // Из сигналов анализатора: faceSize>=5% кадра → крупный; есть лицо → средний;
    // без лиц → общий/экшн-широкий. Кинематографичный монтаж дышит чередованием
    // масштаба: общий (контекст) → средний → крупный (деталь/эмоция).
    type PlanSize = "close" | "medium" | "wide";
    const sizeOf = (b: VisualBeat): PlanSize => {
      if (b.faceSize !== undefined && b.faceSize >= 0.05) return "close";
      if (b.hasFaces) return "medium";
      return "wide";
    };
    let lastPlanSize: PlanSize = sizeOf(hookBeat);

    let guard = 0;
    while (currentTime < target - 0.3 && guard++ < 400) {
      const progress = currentTime / target;
      // Драматургия: buildup → ЕДИНСТВЕННАЯ кульминация (резерв на дропе) → outro.
      // Раньше фаза "climax" назначалась целой полосе 62–88% таймлайна — получался
      // конвейер одинаковых slow-mo микроклипов вместо одного удара.
      const phase: DirectorScene["phase"] =
        reserveUsed ? "outro" : (!climaxReserve && progress > 0.88) ? "outro" : "buildup";

      let beat: VisualBeat | null = null;

      // Кульминация: резерв встаёт максимально близко к дропу музыки.
      if (climaxReserve && !reserveUsed && (currentTime >= wantClimaxAt - 0.15 || currentTime >= target - 1.6)) {
        beat = climaxReserve;
        reserveUsed = true;
      } else {
        // Выбор: свежесть окна (1000) > разнообразие ассетов (60) > качество кадра.
        let bestScore = Infinity;
        for (const b of beats) {
          if (b === lastBeat) continue;
          if (recentBeats.includes(b)) continue;
          if (b === climaxReserve && !reserveUsed) continue; // эпик — только на дроп
          if (b.assetId === lastAssetId && beats.length > 1) continue;
          const bu = beatUseCount.get(b) || 0;
          const au = usageCount.get(b.assetId) || 0;
          let rank = bu * 1000 + au * 60 - b.score;
          // В аутро — спокойные красивые планы, не экшен: эмоция «выдох».
          if (phase === "outro" && b.hasAction) rank += 150;
          // Чередование крупности: два одинаковых масштаба подряд плоско ложатся
          // на плёнку; для медленных жанров штраф жёстче (это их «язык»).
          if (sizeOf(b) === lastPlanSize) rank += isSlowGenre ? 130 : 45;
          if (rank < bestScore) { bestScore = rank; beat = b; }
        }
        // Память могла исключить всё — ослабляем: разрешаем окна из recent, но кроме последнего.
        if (!beat) {
          let fb: VisualBeat | null = null;
          let fbRank = Infinity;
          for (const b of beats) {
            if (b === lastBeat) continue;
            if (b === climaxReserve && !reserveUsed) continue;
            const bu = beatUseCount.get(b) || 0;
            const rank = bu * 1000 + (usageCount.get(b.assetId) || 0) * 60 - b.score;
            if (rank < fbRank) { fbRank = rank; fb = b; }
          }
          beat = fb;
        }
        if (!beat) break;
      }

      lastAssetId = beat.assetId;
      lastBeat = beat;
      lastPlanSize = sizeOf(beat);
      usageCount.set(beat.assetId, (usageCount.get(beat.assetId) || 0) + 1);
      beatUseCount.set(beat, (beatUseCount.get(beat) || 0) + 1);
      recentBeats.push(beat);
      if (recentBeats.length > 2) recentBeats.shift();

      // Длительности: номинал по жанру/фазе, затем квантование под бит-сетку.
      const sceneIsClimax = beat === climaxReserve && reserveUsed;
      let dur: number;
      if (phase === "buildup" && !sceneIsClimax && isFastGenre) {
         const RHYTHM_WAVE = [3.6, 3.0, 1.1, 0.9, 1.2, 2.6];
         dur = RHYTHM_WAVE[waveIdx++ % RHYTHM_WAVE.length];
      } else if (sceneIsClimax) {
         dur = 1.6; // плотный удар на дропе — не растекаться
      } else if (phase === "buildup") {
         dur = isSlowGenre ? 4.4 : 3.8;
      } else {
         dur = isFastGenre ? 2.4 : 3.2; // outro
      }
      if (beatDur) {
        dur = qBeats(dur, isSlowGenre && phase === "buildup" ? 5 : 2, phase === "outro" ? 8 : 12);
      }

      dur = Math.min(dur, beat.duration, target - currentTime);
      // Обрезка по окну исходника сбила бы фазу сетки для ВСЕХ дальнейших
      // склеек (накопительный сдвиг): опускаемся до влезающего целого числа битов.
      if (beatDur) {
        const k = Math.floor(dur / beatDur + 1e-6);
        if (k >= 2) dur = +(k * beatDur).toFixed(3);
      }
      if (dur < 0.5) {
        // Ассетов с нужным запасом длительности может не найтись — мягкий выход.
        break;
      }

      // Подход к кульминации: если дроп близко, КОРРЕКТИРУЕМ предшествующий план
      // так, чтобы его стык пришёлся ровно на дроп: чуть растягиваем (дохватить)
      // или чуть сжимаем (не перешагнуть) — субсекундное попадание в долю
      // вместо случайного зазора.
      if (!sceneIsClimax && climaxReserve && !reserveUsed) {
        const gap = wantClimaxAt - currentTime;
        const diff = gap - dur;
        if (diff > 0.6 && diff <= 2.2 && beat.duration >= gap) {
          dur = gap; // дохват
        } else if (diff < -0.6 && diff >= -1.8 && gap >= 1.4) {
          dur = gap; // сжатие, чтобы не перешагнуть дроп
        }
      }

      // Автоматическое ускорение (Speed Ramping) скучных сегментов
      let speed = 1;
      if (beat.score < 40 && !beat.hasFaces && phase === "buildup" && !sceneIsClimax) {
         speed = 2.0;
         dur = Math.min(dur * 2, beat.duration, (target - currentTime) * 2);
      }

      // Повторное использование окна: если сегмент длиннее уже показанной части,
      // повтор берёт СВЕЖИЙ хвост — зритель не видит один и тот же кусок дважды.
      let srcStart = beat.start;
      {
        const coveredTo = beatCoveredTo.get(beat);
        if (coveredTo !== undefined && coveredTo > beat.start + 0.2
            && beat.start + beat.duration - coveredTo >= dur) {
          srcStart = coveredTo;
        }
        beatCoveredTo.set(beat, Math.max(coveredTo ?? 0, srcStart + dur));
      }

      script.scenes.push({
        id: `scene_${Date.now()}_${Math.round(currentTime * 1000)}`,
        phase: sceneIsClimax ? "climax" : phase,
        intent: sceneIsClimax ? "Climax on Drop" : "Flow",
        duration: dur / speed,
        emotion: sceneIsClimax ? "dramatic" : "calm",
        // Зум запрещён для крупных планов лиц (срезает подбородок/лоб) и экшена (склейка режется в движении).
        mainClip: { assetId: beat.assetId, sourceStart: srcStart, sourceEnd: srcStart + dur, speed, zoom: !beat.hasAction && !(beat.faceSize !== undefined && beat.faceSize >= 0.08) },
        bRolls: [], captions: []
      });
      // Таймлайн продвигается на длительность ВОСПРОИЗВЕДЕНИЯ сцены
      // (при speed-ramp исходный спан шире таймлайн-окна).
      currentTime += dur / speed;
    }

    // Финальный обрубок: последний план короче ~1.3с выглядит дёрганой
    // «заглушкой» перед концом (зритель считывает её как технический сбой).
    // Чистое завершение на полноценном кадре + endingFadeOut лучше, чем
    // дотягивание целевой длительности любой ценой.
    while (script.scenes.length >= 2) {
      const last = script.scenes[script.scenes.length - 1];
      if (last.duration >= 1.3 || last.phase === "climax") break;
      script.scenes.pop();
    }

    return script;
  }

  private static applyProfessionalTechniques(script: DirectorScript, genre: string): DirectorScript {
    for (const scene of script.scenes) {
      if (scene.phase === "climax") {
         // zoom=false от визуального билдера — ЗАЩИТНЫЙ (крупный план лица/экшен),
         // не «разнообразие»: принудительный зум кульминации срежет лицо.
         if (scene.mainClip.zoom !== false) scene.mainClip.zoom = true;
         if (genre === "travel") {
            // Slow-mo на кульминации: растягиваем ЦЕНТРАЛЬНУЮ часть исходного фрагмента
            // на тот же таймлайн-интервал (таймлайн НЕ удлиняется — склейки и титры не съезжают).
            const srcSpan = scene.mainClip.sourceEnd - scene.mainClip.sourceStart;
            const mid = scene.mainClip.sourceStart + srcSpan / 2;
            const neededSpan = scene.duration * 0.5; // исходные секунды = timeline * speed
            scene.mainClip.sourceStart = Math.max(0, mid - neededSpan / 2);
            scene.mainClip.sourceEnd = scene.mainClip.sourceStart + neededSpan;
            scene.mainClip.speed = 0.5;
         }
      }
    }
    
    // Flash-Forward Teaser Hook (The "MrBeast/TikTok" Secret)
    if (FAST_GENRES.has(genre) && genre !== "musicvideo" || TALKING_GENRES.has(genre)) {
         const climaxScene = script.scenes.find(s => s.phase === "climax");
         const hookScene = script.scenes.find(s => s.phase === "hook");

         // Однокамерный монолог: раньше teaser был запрещён условием «разные ассеты»
         // и говорящая голова лишалась приёма «смотри до конца». Дубль — это когда
         // тизер повторяет ТО ЖЕ окно источника; разные окна одного видео — законный
         // flash-forward (зрителю показывают БУДУЩУЮ фразу, а не дубль хука).
         const sameWindow = !!climaxScene && !!hookScene
            && climaxScene.mainClip.assetId === hookScene.mainClip.assetId
            && Math.abs(climaxScene.mainClip.sourceStart - hookScene.mainClip.sourceStart) < 1.5;

         if (climaxScene && hookScene && !sameWindow && script.scenes.length > 3) {
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
                     // та же защита, что и в кульминации: не зумим крупные лица
                     zoom: climaxScene.mainClip.zoom !== false 
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
      if (FAST_GENRES.has(script.genre)) {
          for (const scene of script.scenes) {
              if (scene.duration > 3.5 && scene.phase !== "outro") {
                  
                  newLessons.push(`В жанре ${script.genre} обнаружена слишком длинная сцена (${scene.duration.toFixed(1)}с). Внимание зрителя падает после 3 секунд. Сцена принудительно сокращена.`);
                  scene.duration = 3.0;
                  scene.mainClip.sourceEnd = scene.mainClip.sourceStart + 3.0;
              }
          }
      }

      // 2. Проверка кинематографичности (воздух в монтаже)
      if (SLOW_GENRES.has(script.genre)) {
          const fastCuts = script.scenes.filter(s => s.duration < 1.5).length;
          if (fastCuts > script.scenes.length * 0.4) {
              newLessons.push(`ОШИБКА РИТМА: В кинематографичном жанре слишком много быстрых склеек (< 1.5с). Зритель не успевает насладиться эстетикой. В следующий раз давай кадру 'подышать' 4-6 секунд.`);
          }
      }
      
      // 3. Проверка перебивок для подкастов
      if (TALKING_GENRES.has(script.genre)) {
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
         cameraAngle: scene.mainClip.cameraAngle,
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
           presentation: broll.presentation,
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
      pace: FAST_GENRES.has(script.genre) ? "fast" : SLOW_GENRES.has(script.genre) ? "slow" : "medium",
      colorGrade: "cinematic",
      clips,
      musicSync: true,
      transitions: FAST_GENRES.has(script.genre) ? "cut" : "crossfade",
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
