const fs = require('fs');

let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

// 1. FIX NARRATIVE B-ROLL DIVERSITY
const oldBRollLogic = `            if (isLong || hasVisualKeyword || isNthPhrase) {
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
            }`;

const newBRollLogic = `            if (isLong || hasVisualKeyword || isNthPhrase) {
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
            }`;

code = code.replace(oldBRollLogic, newBRollLogic);

// 2. FIX VISUAL DIVERSITY
const oldVisualLoop = `    while (currentTime < target && pool.length > 0) {
      const progress = currentTime / target;
      const phase = progress < 0.7 ? "buildup" : progress < 0.9 ? "climax" : "outro";
      
      let beatIndex = phase === "climax" ? Math.max(0, pool.findIndex(b => b.isEpic || b.hasAction)) : 0;
      const beat = pool[beatIndex];
      pool.splice(beatIndex, 1);
      
      let dur = phase === "buildup" ? 4 : phase === "climax" ? 1.5 : 5;
      dur = Math.min(dur, beat.duration, target - currentTime);
      if (dur < 0.5) break;
      
      // Автоматическое ускорение (Speed Ramping) скучных сегментов без лиц и экшена, если их рейтинг низок
      let speed = 1;
      if (beat.score < 40 && !beat.hasFaces && phase === "buildup") {
         speed = 2.0; // Ускоряем в 2 раза проходные кадры
         dur *= 2; // Берем больше исходника
         dur = Math.min(dur, beat.duration, (target - currentTime) * 2);
      }

      script.scenes.push({
        id: \`scene_\${Date.now()}_\${currentTime}\`, phase, intent: "Flow", duration: dur / speed, emotion: phase === "climax" ? "dramatic" : "calm",
        mainClip: { assetId: beat.assetId, sourceStart: beat.start, sourceEnd: beat.start + dur, speed: speed, zoom: !beat.hasAction },
        bRolls: [], captions: []
      });
      currentTime += dur;
    }`;

const newVisualLoop = `    let lastAssetId = hookBeat.assetId;
    
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
      lastAssetId = beat.assetId;
      
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
        id: \`scene_\${Date.now()}_\${currentTime}\`, phase, intent: "Flow", duration: dur / speed, emotion: phase === "climax" ? "dramatic" : "calm",
        mainClip: { assetId: beat.assetId, sourceStart: beat.start, sourceEnd: beat.start + dur, speed: speed, zoom: !beat.hasAction },
        bRolls: [], captions: []
      });
      currentTime += dur;
    }`;

code = code.replace(oldVisualLoop, newVisualLoop);

fs.writeFileSync('src/lib/brain/engine.ts', code);
