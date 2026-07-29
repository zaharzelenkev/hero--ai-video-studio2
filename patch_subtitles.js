const fs = require('fs');
let code = fs.readFileSync('src/lib/autoEdit.ts', 'utf8');

const oldSubLogic = `    for (const track of project.tracks) {
      if (track.type === "video") {
        for (const clip of track.clips as import("./types").VideoClip[]) {
           const segs = segmentsByAssetId.get(clip.assetId);
           if (segs) {
              for (const s of segs) {
                 const wordStartInAsset = s.start;
                 const wordEndInAsset = s.end;
                 
                 // Check if the spoken word falls inside the trimmed clip
                 if (wordStartInAsset >= clip.inPoint && wordStartInAsset < clip.outPoint) {
                    const timelineStart = clip.start + (wordStartInAsset - clip.inPoint);
                    const durInAsset = wordEndInAsset - wordStartInAsset;
                    const durOnTimeline = Math.min(durInAsset, clip.outPoint - wordStartInAsset);
                    
                    if (durOnTimeline > 0.1) {
                      const wText = (s as any).word || (s as any).text;
                      const cleanText = wText.replace(/[^а-яА-Яa-zA-Z0-9]/g, "");
                      
                      const textClip = createTextClip({
                        trackId: textTrack.id,
                        start: timelineStart,
                        duration: durOnTimeline,
                        text: wText,
                      });
                      
                      // Template Driven Subtitles & Smart Highlighting
                      textClip.y.value = activeTemplate.text.yPosition;
                      textClip.fontSize = activeTemplate.text.fontSize || 72;
                      textClip.fontFamily = activeTemplate.text.fontFamily || "DejaVu Sans Bold";
                      
                      let tColor = activeTemplate.text.color || "#FFFFFF";
                      if (activeTemplate.id === "hormozi" || activeTemplate.id === "tiktok" || activeTemplate.id === "mrbeast" || activeTemplate.id === "podcast") {
                          const isEmphasized = cleanText.length > 5 || /!(?:\\s|$)/.test(wText) || /^(не|нет|все|очень|важно|супер|как|что|это)$/i.test(cleanText);
                          const highlight = activeTemplate.id === "mrbeast" ? "#00FF00" : "#FFE81A";
                          tColor = isEmphasized ? highlight : "#FFFFFF";
                      }
                      textClip.color = tColor;
                      
                      textClip.backgroundColor = activeTemplate.text.backgroundColor || "transparent";
                      textClip.strokeWidth = activeTemplate.text.strokeWidth || 3;
                      textClip.strokeColor = activeTemplate.text.strokeColor || "#000000";
                      textClip.animationIn = activeTemplate.text.animation || "pop";
                      
                      applyTextAnimation(textClip, textClip.animationIn, textClip.y.value, durOnTimeline);
                      
                      textTrack.clips.push(textClip);
                    }
                 }
              }
           }
        }
      }
    }`;

const newSubLogic = `    for (const track of project.tracks) {
      if (track.type === "video") {
        for (const clip of track.clips as import("./types").VideoClip[]) {
           const segs = segmentsByAssetId.get(clip.assetId);
           if (segs) {
              const clipWords = segs.filter(s => s.start >= clip.inPoint && s.start < clip.outPoint);
              if (clipWords.length === 0) continue;
              
              let wordsPerGroup = 1;
              if (activeTemplate.pace === "slow") wordsPerGroup = 6;
              else if (activeTemplate.pace === "medium") wordsPerGroup = 3;
              
              const groups = [];
              let currentGroup = [];
              
              for (let i = 0; i < clipWords.length; i++) {
                 const w = clipWords[i];
                 currentGroup.push(w);
                 
                 const wText = (w as any).word || (w as any).text;
                 const hasPunctuation = /[.!?]$/.test(wText);
                 
                 if (currentGroup.length >= wordsPerGroup || hasPunctuation || i === clipWords.length - 1) {
                    groups.push({
                       start: currentGroup[0].start,
                       end: currentGroup[currentGroup.length - 1].end,
                       text: currentGroup.map(c => (c as any).word || (c as any).text).join(" "),
                       isEmphasized: currentGroup.some(c => {
                          const t = ((c as any).word || (c as any).text).replace(/[^а-яА-Яa-zA-Z0-9]/g, "");
                          return t.length > 6 || /^(не|нет|все|очень|важно|супер|как|что|это)$/i.test(t);
                       })
                    });
                    currentGroup = [];
                 }
              }

              for (const g of groups) {
                 const timelineStart = clip.start + (g.start - clip.inPoint);
                 const durInAsset = g.end - g.start;
                 const durOnTimeline = Math.min(durInAsset + (wordsPerGroup > 1 ? 0.3 : 0.05), clip.outPoint - g.start);
                 
                 if (durOnTimeline > 0.1) {
                    const textClip = createTextClip({
                      trackId: textTrack.id,
                      start: timelineStart,
                      duration: durOnTimeline,
                      text: g.text,
                    });
                    
                    textClip.y.value = activeTemplate.text.yPosition;
                    textClip.fontSize = activeTemplate.text.fontSize || 72;
                    textClip.fontFamily = activeTemplate.text.fontFamily || "DejaVu Sans Bold";
                    
                    let tColor = activeTemplate.text.color || "#FFFFFF";
                    if (activeTemplate.id === "hormozi" || activeTemplate.id === "tiktok" || activeTemplate.id === "mrbeast" || activeTemplate.id === "podcast") {
                        const highlight = activeTemplate.id === "mrbeast" ? "#00FF00" : "#FFE81A";
                        tColor = g.isEmphasized ? highlight : "#FFFFFF";
                    }
                    textClip.color = tColor;
                    
                    textClip.backgroundColor = activeTemplate.text.backgroundColor || "transparent";
                    textClip.strokeWidth = activeTemplate.text.strokeWidth || 3;
                    textClip.strokeColor = activeTemplate.text.strokeColor || "#000000";
                    textClip.animationIn = activeTemplate.text.animation || "pop";
                    
                    applyTextAnimation(textClip, textClip.animationIn, textClip.y.value, durOnTimeline);
                    
                    textTrack.clips.push(textClip);
                 }
              }
           }
        }
      }
    }`;

code = code.replace(oldSubLogic, newSubLogic);
fs.writeFileSync('src/lib/autoEdit.ts', code);
