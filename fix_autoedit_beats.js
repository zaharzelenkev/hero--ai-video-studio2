const fs = require('fs');
let code = fs.readFileSync('src/lib/autoEdit.ts', 'utf8');

const oldBrollSync = `       const bRollStart = (bClip as any).timeInTimeline !== undefined ? (bClip as any).timeInTimeline : bRollCursor;
       const dur = placeClip(bClip, bRollTrack!, true, bRollStart);
       if (dur) {
          bRollCursor = bRollStart + dur + (Math.random() * 2 + 1); // Следующий б-ролл минимум через пару секунд
       }`;

const newBrollSync = `       // Align B-Rolls to music beats if beats exist
       let bRollStart = (bClip as any).timeInTimeline !== undefined ? (bClip as any).timeInTimeline : bRollCursor;
       
       if (beats.length) {
          const closestStartBeat = beats.find(b => Math.abs(b - bRollStart) < targetClipLen * 0.4);
          if (closestStartBeat !== undefined) {
             bRollStart = closestStartBeat;
          }
       }

       const dur = placeClip(bClip, bRollTrack!, true, bRollStart);
       if (dur) {
          bRollCursor = bRollStart + dur + (Math.random() * 2 + 1); // Следующий б-ролл минимум через пару секунд
       }`;

code = code.replace(oldBrollSync, newBrollSync);

// Fix audio hit on beat drops
const oldBeatHit = `            // Riser before Climax, Hit at Climax
            if (aiDecision && track.name === "Видео 1") {
               const dec = aiDecision.clips.find(c => c.assetId === clip.assetId && Math.abs((c.startTime||0) - clip.inPoint) < 0.5);
               if (dec && dec.emotion === "dramatic" && clip.start > 2) {`;

const newBeatHit = `            // Riser before Climax, Hit at Climax OR Major Beat Drops
            if (aiDecision && track.name === "Видео 1") {
               const dec = aiDecision.clips.find(c => c.assetId === clip.assetId && Math.abs((c.startTime||0) - clip.inPoint) < 0.5);
               
               // Inject Hit SFX on strict beat sync boundaries if it's a fast/dynamic edit
               let isBeatDrop = false;
               if (beats.length && (style.pace === "fast" || style.pace === "dynamic")) {
                  isBeatDrop = beats.some(b => Math.abs(b - clip.start) < 0.1);
               }

               if ((dec && dec.emotion === "dramatic" && clip.start > 2) || (isBeatDrop && Math.random() > 0.7)) {`;

code = code.replace(oldBeatHit, newBeatHit);

fs.writeFileSync('src/lib/autoEdit.ts', code);
