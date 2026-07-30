const fs = require('fs');

let code = fs.readFileSync('src/lib/autoEdit.ts', 'utf8');

const oldLoop = `    // 1. Сначала выстраиваем основной видеоряд
    for (const mainClip of mainClips) {
       const durationUsed = placeClip(mainClip, videoTrack, false, cursor);
       if (durationUsed) {
         cursor += durationUsed;
       }
    }`;

const newLoop = `    // 1. Сначала выстраиваем основной видеоряд
    for (let i = 0; i < mainClips.length; i++) {
       const mainClip = mainClips[i];
       const durationUsed = placeClip(mainClip, videoTrack, false, cursor);
       if (durationUsed) {
         cursor += durationUsed;
         // Adjust cursor back for transitions to keep global timeline sync correct
         const addedClip = videoTrack.clips[videoTrack.clips.length - 1] as import("./types").VideoClip;
         if (i < mainClips.length - 1 && addedClip && addedClip.transitionIn && addedClip.transitionIn.duration > 0 && i !== 0) {
             cursor -= addedClip.transitionIn.duration; 
         }
       }
    }`;

code = code.replace(oldLoop, newLoop);
fs.writeFileSync('src/lib/autoEdit.ts', code);
