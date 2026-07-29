const fs = require('fs');

let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

const oldVisualPool = `    const hookBeat = beats.find(b => b.hasFaces || b.hasAction) || beats[0];
    const hookDur = Math.min(hookBeat.duration, 2.5);
    script.scenes.push({
      id: "scene_hook", phase: "hook", intent: "Capture Attention", duration: hookDur, emotion: "energetic",
      mainClip: { assetId: hookBeat.assetId, sourceStart: hookBeat.start, sourceEnd: hookBeat.start + hookDur, speed: 1, zoom: true },
      bRolls: [], captions: []
    });
    currentTime += hookDur;
    
    const pool = beats.filter(b => b !== hookBeat);

    let lastAssetId = hookBeat.assetId;
    
    while (currentTime < target && pool.length > 0) {
      const progress = currentTime / target;
      const phase = progress < 0.7 ? "buildup" : progress < 0.9 ? "climax" : "outro";
      
      // Enforce diversity: try to find a beat from a DIFFERENT asset than the last one
      let beatIndex = -1;
      
      for (let i = 0; i < pool.length; i++) {
         const b = pool[i];
         if (b.assetId !== lastAssetId) {
             if (phase === "climax" && !b.isEpic && !b.hasAction) continue;
             beatIndex = i;
             break;
         }
      }
      
      // Fallback if we must reuse the same asset
      if (beatIndex === -1) {
          beatIndex = phase === "climax" ? Math.max(0, pool.findIndex(b => b.isEpic || b.hasAction)) : 0;
      }
      
      const beat = pool[beatIndex];
      pool.splice(beatIndex, 1);
      lastAssetId = beat.assetId;`;

const newVisualPool = `    const hookBeat = beats.find(b => b.hasFaces || b.hasAction) || beats[0];
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
      usageCount.set(beat.assetId, (usageCount.get(beat.assetId) || 0) + 1);`;

code = code.replace(oldVisualPool, newVisualPool);

fs.writeFileSync('src/lib/brain/engine.ts', code);
