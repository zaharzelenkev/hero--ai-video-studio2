const fs = require('fs');
let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

const oldBrollPrompt = `4. ОЦЕНКА КАДРОВ: Оценивай каждую фразу по шкале 1-10. Выкидывай всё, что ниже 7. Мертвые паузы и вода убивают удержание.
5. ИСПОЛЬЗУЙ J-Cuts и L-Cuts для переходов между мыслями.`;

const newBrollPrompt = `4. ОЦЕНКА КАДРОВ: Оценивай каждую фразу по шкале 1-10. Выкидывай всё, что ниже 7. Мертвые паузы и вода убивают удержание.
5. ИСПОЛЬЗУЙ J-Cuts и L-Cuts для переходов между мыслями.
6. ВЫБОР B-ROLL: Если ставишь bRollNeeded=true, ОБЯЗАТЕЛЬНО заполни поле bRollKeyword на английском языке (1-2 слова, описывающих, что должно быть показано, например: "money", "nature", "happy people").`;

code = code.replace(oldBrollPrompt, newBrollPrompt);

const oldBrollJson = `"intent": "Захватить внимание вопросом (показывай, а не рассказывай)",
      "bRollNeeded": false,
      "zoom": true
    }`;

const newBrollJson = `"intent": "Захватить внимание вопросом (показывай, а не рассказывай)",
      "bRollNeeded": true,
      "bRollKeyword": "shocked face",
      "zoom": true
    }`;

code = code.replace(oldBrollJson, newBrollJson);


const oldBrollLogic = `            // Process LLM bRollNeeded request
            if (s.bRollNeeded && visualAssets.length > 1) {
                const bRollPool = visualAssets.filter((a: any) => a.id !== mainAsset.id);
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
            }`;

const newBrollLogic = `            // Process LLM bRollNeeded request
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
                        if (kw.split(" ").some(w => bName.includes(w))) score += 20;
                        
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
            }`;

code = code.replace(oldBrollLogic, newBrollLogic);
fs.writeFileSync('src/lib/brain/engine.ts', code);
