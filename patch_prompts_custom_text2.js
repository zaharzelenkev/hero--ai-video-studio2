const fs = require('fs');
let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

// 1. We must inject __request.userPrompt into the LLM logic so the LLM reads user constraints.
const oldPromptBuild = '    const prompt = `Ты — элитный режиссер монтажа уровня MrBeast, Kurzgesagt и Veritasium с 15-летним опытом.';
const newPromptBuild = `    const prompt = \`Ты — элитный режиссер монтажа уровня MrBeast, Kurzgesagt и Veritasium с 15-летним опытом.
Твоя задача — проанализировать исходные фразы спикера, ПРОЧИТАТЬ ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ и создать гениальный, удерживающий внимание сценарий (Script).

ОСОБОЕ ПОЖЕЛАНИЕ ПОЛЬЗОВАТЕЛЯ (Игнорируй, если пусто или не имеет смысла):
"\${__request.userPrompt}"

Если пользователь просит "напиши такой-то текст" или "поставь заголовок" — ОБЯЗАТЕЛЬНО добавь его в поле customText в сцене "hook" или там, где просит пользователь.`;

code = code.replace(oldPromptBuild, newPromptBuild);

const oldJsonRule = `"bRollKeyword": "shocked face",
      "zoom": true
    }`;

const newJsonRule = `"bRollKeyword": "shocked face",
      "zoom": true,
      "customText": "Крутой заголовок из промпта пользователя" // Заполни только если пользователь явно попросил текст!
    }`;

code = code.replace(oldJsonRule, newJsonRule);

const oldCaptions = `bRolls: [], captions: []`;
const newCaptions = `bRolls: [], captions: s.customText ? [{text: s.customText, offsetInScene: 0.2, duration: Math.max(1, p.end - p.start - 0.2), animation: "elastic"}] : []`;

code = code.replace(oldCaptions, newCaptions);

// 2. Fix the visual logic to mute audio AND apply user text correctly
const oldVisual = `private static buildVisualScript(
    _request: AIAnalysisRequest, 
    strategy: any, 
    visualAssets: any[]
  ): DirectorScript {`;

const newVisual = `private static buildVisualScript(
    _request: AIAnalysisRequest, 
    strategy: any, 
    visualAssets: any[]
  ): DirectorScript {`;

code = code.replace(oldVisual, newVisual);

// In buildVisualScript:
const oldVisEnd = `      script.scenes.push({
        id: \`scene_\${Date.now()}_\${currentTime}\`, phase, intent: "Flow", duration: dur / speed, emotion: phase === "climax" ? "dramatic" : "calm",
        mainClip: { assetId: beat.assetId, sourceStart: beat.start, sourceEnd: beat.start + dur, speed: speed, zoom: !beat.hasAction },
        bRolls: [], captions: []
      });
      currentTime += dur;
    }

    return script;`;

const newVisEnd = `      script.scenes.push({
        id: \`scene_\${Date.now()}_\${currentTime}\`, phase, intent: "Flow", duration: dur / speed, emotion: phase === "climax" ? "dramatic" : "calm",
        mainClip: { assetId: beat.assetId, sourceStart: beat.start, sourceEnd: beat.start + dur, speed: speed, zoom: !beat.hasAction },
        bRolls: [], captions: []
      });
      currentTime += dur;
    }

    // Extract text requested by user
    let customRequestedText = null;
    const pLower = (_request.userPrompt || "").toLowerCase();
    if (pLower.includes("напиши") || pLower.includes("текст") || pLower.includes("заголовок")) {
        // Simple extraction: Take the user's prompt as the actual title
        customRequestedText = _request.userPrompt;
        // Clean up commands from the string
        customRequestedText = customRequestedText.replace(/напиши вначале (видео )?(такой-то )?текст/i, "")
                                                 .replace(/добавь текст/i, "")
                                                 .replace(/напиши/i, "")
                                                 .trim()
                                                 .replace(/^:/, "")
                                                 .replace(/^"|"$/g, "")
                                                 .trim();
    }

    if (customRequestedText && customRequestedText.length > 0 && script.scenes.length > 0) {
        script.scenes[0].captions.push({
            text: customRequestedText,
            offsetInScene: 0.2,
            duration: Math.min(3, script.scenes[0].duration - 0.2),
            animation: "elastic"
        });
    }

    return script;`;

code = code.replace(oldVisEnd, newVisEnd);

// Music Style Semantic Extraction
const oldDefineStrat = `const durMatch = prompt.match(/(\\d+)\\s*(сек|мин)/);`;
const newDefineStrat = `// Определяем настроение музыки
    let musicStyle = "lofi";
    if (prompt.match(/(грустн|sad|драм|dramatic|меланхол|эмоц)/)) musicStyle = "cinematic";
    else if (prompt.match(/(счастл|весел|happy|радостн|позитив)/)) musicStyle = "lofi";
    else if (prompt.match(/(энергичн|мощн|эпич|epic|кач|крут)/)) musicStyle = "electronic";
    else if (detectedGenre === "travel" || detectedGenre === "documentary") musicStyle = "cinematic";
    else if (detectedGenre === "ad" || detectedGenre === "tiktok") musicStyle = "electronic";
    
    // Save to instructions to be parsed
    instructions += \`\\n\\nMUSIC_STYLE:\${musicStyle}\`;

    const durMatch = prompt.match(/(\\d+)\\s*(сек|мин)/);`;

code = code.replace(oldDefineStrat, newDefineStrat);

const oldAudioStratLLM = `            audioStrategy: {
                musicStyle: "lofi",
                duckingEnabled: true,`;

const newAudioStratLLM = `            audioStrategy: {
                musicStyle: (strategy.instructions.match(/MUSIC_STYLE:(\\w+)/) || [])[1] || "lofi",
                duckingEnabled: true,`;

code = code.replace(oldAudioStratLLM, newAudioStratLLM);

const oldAudioStratVis = `      audioStrategy: {
        musicStyle: strategy.genre === "travel" ? "cinematic" : "electronic",
        duckingEnabled: false,`;

const newAudioStratVis = `      audioStrategy: {
        musicStyle: (strategy.instructions.match(/MUSIC_STYLE:(\\w+)/) || [])[1] || (strategy.genre === "travel" ? "cinematic" : "electronic"),
        duckingEnabled: false,`;

code = code.replace(oldAudioStratVis, newAudioStratVis);


fs.writeFileSync('src/lib/brain/engine.ts', code);
