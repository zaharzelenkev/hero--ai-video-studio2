const fs = require('fs');

let code = fs.readFileSync('src/lib/autoEdit.ts', 'utf8');

const oldLoop = `    // 1. Сначала выстраиваем основной видеоряд
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

const newLoop = `    // 1. Сначала выстраиваем основной видеоряд
    for (let i = 0; i < mainClips.length; i++) {
       const mainClip = mainClips[i];
       const durationUsed = placeClip(mainClip, videoTrack, false, cursor);
       if (durationUsed) {
         cursor += durationUsed;
         // Wait, the NEXT clip will transition IN, overlapping with the current clip.
         // So we must subtract the NEXT clip's transition duration from the cursor before placing it.
         // Since placeClip determines the transition duration internally based on random rules,
         // we need placeClip to return the generated transition duration so we can overlap correctly.
         // Actually, let's just make a fast pass and fix the start times sequentially.
       }
    }
    
    // Fix start times based on actual transition durations generated
    let actualCursor = 0;
    for (let i = 0; i < videoTrack.clips.length; i++) {
        const c = videoTrack.clips[i] as import("./types").VideoClip;
        if (i > 0 && c.transitionIn && c.transitionIn.duration > 0) {
            actualCursor -= c.transitionIn.duration;
        }
        c.start = actualCursor;
        actualCursor += c.duration;
    }
    cursor = actualCursor; // Now cursor accurately represents the end of the visual track!`;

code = code.replace(oldLoop, newLoop);
fs.writeFileSync('src/lib/autoEdit.ts', code);
