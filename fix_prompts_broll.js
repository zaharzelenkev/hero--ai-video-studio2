const fs = require('fs');
let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

const oldBRollLogic = `            isZoomed = s.zoom !== undefined ? s.zoom : !isZoomed;
            
            scenes.push({
                id: \`scene_\${Date.now()}_\${s.phraseId}\`,
                phase: s.phase === "setup" || s.phase === "development" ? "buildup" : s.phase === "payoff" ? "outro" : s.phase,
                intent: s.intent || "Jump Cut",
                duration: p.end - p.start,
                emotion: s.phase === "climax" || s.phase === "hook" ? "energetic" : "neutral",
                mainClip: { assetId: mainAsset.id, sourceStart: p.start, sourceEnd: p.end, speed: 1, zoom: isZoomed },
                bRolls: [], captions: []
            });
        }

        return {`;

const newBRollLogic = `            isZoomed = s.zoom !== undefined ? s.zoom : !isZoomed;
            
            const scene: DirectorScene = {
                id: \`scene_\${Date.now()}_\${s.phraseId}\`,
                phase: s.phase === "setup" || s.phase === "development" ? "buildup" : s.phase === "payoff" ? "outro" : s.phase,
                intent: s.intent || "Jump Cut",
                duration: p.end - p.start,
                emotion: s.phase === "climax" || s.phase === "hook" ? "energetic" : "neutral",
                mainClip: { assetId: mainAsset.id, sourceStart: p.start, sourceEnd: p.end, speed: 1, zoom: isZoomed },
                bRolls: [], captions: []
            };

            // Process LLM bRollNeeded request
            if (s.bRollNeeded && visualAssets.length > 1) {
                const bRollPool = visualAssets.filter(a => a.id !== mainAsset.id);
                // Simple random selection for now, could be improved with semantic matching
                const bAsset = bRollPool[Math.floor(Math.random() * bRollPool.length)];
                
                let bStart = 0;
                if (bAsset.segments && bAsset.segments.length > 0) {
                    const bestSeg = bAsset.segments.sort((a:any, b:any) => (b.aestheticScore || 0) - (a.aestheticScore || 0))[0];
                    bStart = bestSeg.startTime;
                } else if (bAsset.type === "video") {
                    bStart = Math.max(0, Math.random() * ((bAsset.duration || 10) - scene.duration));
                }

                scene.bRolls.push({
                    assetId: bAsset.id,
                    sourceStart: bStart,
                    sourceEnd: bStart + Math.min(scene.duration, bAsset.duration || 5),
                    offsetInScene: Math.random() > 0.5 ? -0.3 : 0.2 // J-Cut / L-Cut
                });
            }

            scenes.push(scene);
        }

        return {`;

code = code.replace(oldBRollLogic, newBRollLogic);
fs.writeFileSync('src/lib/brain/engine.ts', code);
