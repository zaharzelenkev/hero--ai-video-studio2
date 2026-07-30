const fs = require('fs');

// 1. ENGINE.TS
let engine = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');
const oldProf = `  private static applyProfessionalTechniques(script: DirectorScript, genre: string): DirectorScript {
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
  }`;

const newProf = `  private static applyProfessionalTechniques(script: DirectorScript, genre: string): DirectorScript {
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
  }`;
engine = engine.replace(oldProf, newProf);
fs.writeFileSync('src/lib/brain/engine.ts', engine);

// 2. PRESETS.TS
let presets = fs.readFileSync('src/lib/presets.ts', 'utf8');
presets = presets.replace(/\{ id: "noise", label: "Плёночное зерно", ffmpeg: "noise=alls=8:allf=t", css: "" \},\n\];/g, 
  '{ id: "noise", label: "Плёночное зерно", ffmpeg: "noise=alls=8:allf=t", css: "" },\n  { id: "letterbox", label: "Кино-полосы", ffmpeg: "drawbox=y=0:color=black:width=iw:height=ih*0.12:t=max,drawbox=y=ih-ih*0.12:color=black:width=iw:height=ih*0.12:t=max", css: "" },\n];');
fs.writeFileSync('src/lib/presets.ts', presets);

// 3. TEMPLATES.TS
let templates = fs.readFileSync('src/lib/templates.ts', 'utf8');
templates = templates.replace(/effects: \["glow", "vignette"\]/g, 'effects: ["glow", "vignette", "letterbox"]');
templates = templates.replace(/effects: \["noise", "vignette"\]/g, 'effects: ["noise", "vignette", "letterbox"]');
fs.writeFileSync('src/lib/templates.ts', templates);

// 4. AUTOEDIT.TS
let autoEdit = fs.readFileSync('src/lib/autoEdit.ts', 'utf8');
autoEdit = autoEdit.replace(/if \(\(dec && dec\.emotion === "dramatic" && clip\.start > 2\) \|\| \(isBeatDrop && Math\.random\(\) > 0\.7\)\) \{/,
  `if (dec && dec.reason && dec.reason.includes("Teaser")) {
                  const hit = createAudioClip({ trackId: sfxTrack.id, asset: hitAsset, start: clip.start, duration: hitAsset.duration });
                  sfxTrack.clips.push(hit);
               } else if ((dec && dec.emotion === "dramatic" && clip.start > 2) || (isBeatDrop && Math.random() > 0.7)) {`);
fs.writeFileSync('src/lib/autoEdit.ts', autoEdit);

