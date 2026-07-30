const fs = require('fs');

let code = fs.readFileSync('src/lib/generators/magicGenerator.ts', 'utf8');

const oldMusic = `     const mClip = createAudioClip({ trackId: audioTrack.id, asset: mAsset as any, start: 0, duration: 30 });
     
     // Build ducking keyframes
     const kfs: any[] = [];
     let totalDur = 0;
     for (const scene of scriptData.scenes) {
         // Assuming text speed roughly matches 12 chars/sec
         const sDur = Math.max(2, scene.voiceover.length / 12);
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: Math.max(0, totalDur - 0.2), value: 0.8, easing: "linear" });
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: totalDur, value: 0.1, easing: "linear" });
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: totalDur + sDur, value: 0.1, easing: "linear" });
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: totalDur + sDur + 0.5, value: 0.8, easing: "linear" });
         totalDur += sDur + 0.5;
     }

     mClip.volume = { value: 0.8, keyframes: kfs };
     audioTrack.clips.push(mClip);`;

const newMusic = `     const mClip = createAudioClip({ trackId: audioTrack.id, asset: mAsset as any, start: 0, duration: 30 });
     
     // Build ducking keyframes
     const kfs: any[] = [];
     let totalDur = 0;
     for (const scene of scriptData.scenes) {
         // Assuming text speed roughly matches 12 chars/sec
         const sDur = Math.max(2, scene.voiceover.length / 12);
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: Math.max(0, totalDur - 0.2), value: 0.4, easing: "linear" }); // lowered master volume of generator music
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: totalDur, value: 0.05, easing: "linear" }); // dip deeper to 0.05 for clarity
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: totalDur + sDur, value: 0.05, easing: "linear" });
         kfs.push({ id: "k_"+Date.now()+Math.random(), time: totalDur + sDur + 0.5, value: 0.4, easing: "linear" });
         totalDur += sDur + 0.5;
     }

     mClip.volume = { value: 0.4, keyframes: kfs };
     audioTrack.clips.push(mClip);`;

code = code.replace(oldMusic, newMusic);
fs.writeFileSync('src/lib/generators/magicGenerator.ts', code);
