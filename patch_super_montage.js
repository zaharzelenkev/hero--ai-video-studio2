const fs = require('fs');

// 1. Patch filterGraph.ts (Anti-Click Microfades & Master Limiter)
let fg = fs.readFileSync('src/lib/filterGraph.ts', 'utf8');

const oldAudioFade = `  if (fadeIn > 0) {
    const n = id(\`a\${tag}_\`);
    lines.push(\`[\${current}]afade=t=in:st=0:d=\${fadeIn}[\${n}]\`);
    current = n;
  }
  if (fadeOut > 0) {
    const n = id(\`a\${tag}_\`);
    lines.push(\`[\${current}]afade=t=out:st=\${Math.max(0, duration - fadeOut)}:d=\${fadeOut}[\${n}]\`);
    current = n;
  }`;

const newAudioFade = `  if (fadeIn > 0) {
    const n = id(\`a\${tag}_\`);
    lines.push(\`[\${current}]afade=t=in:st=0:d=\${fadeIn}[\${n}]\`);
    current = n;
  } else {
    const n = id(\`a\${tag}_\`);
    lines.push(\`[\${current}]afade=t=in:st=0:d=0.02[\${n}]\`); // Anti-click
    current = n;
  }
  if (fadeOut > 0) {
    const n = id(\`a\${tag}_\`);
    lines.push(\`[\${current}]afade=t=out:st=\${Math.max(0, duration - fadeOut)}:d=\${fadeOut}[\${n}]\`);
    current = n;
  } else {
    const n = id(\`a\${tag}_\`);
    lines.push(\`[\${current}]afade=t=out:st=\${Math.max(0, duration - 0.02)}:d=0.02[\${n}]\`); // Anti-click
    current = n;
  }`;

fg = fg.replace(oldAudioFade, newAudioFade);

const oldAmix = `\${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0[\${finalAudio}]\``;
const newAmix = `\${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0[amix_out];[amix_out]alimiter=limit=-1.0[\${finalAudio}]\``;
fg = fg.replace(oldAmix, newAmix);

fs.writeFileSync('src/lib/filterGraph.ts', fg);

// 2. Patch autoEdit.ts (Text Wrapping)
let ae = fs.readFileSync('src/lib/autoEdit.ts', 'utf8');

const wrapFn = `function wrapText(text: string, max: number): string {
  const words = text.split(" ");
  let lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + w).length > max) {
      if (cur) lines.push(cur.trim());
      cur = w + " ";
    } else {
      cur += w + " ";
    }
  }
  if (cur) lines.push(cur.trim());
  return lines.join("\\n");
}

export async function`;

ae = ae.replace('export async function', wrapFn);

ae = ae.replace(/text: g\.text,/g, 'text: wrapText(g.text, 22),');

fs.writeFileSync('src/lib/autoEdit.ts', ae);

// 3. Patch engine.ts (J-Cuts / L-Cuts offsets)
let eng = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

eng = eng.replace(/offsetInScene: 0\.2 \/\/ J-cut effect: b-roll appears slightly after the cut/g, 
  'offsetInScene: Math.random() > 0.5 ? -0.3 : 0.2 // Randomly select J-Cut (audio before video) or L-Cut (video before audio)');

eng = eng.replace(/timeInTimeline: currentTimelineTime \+ broll\.offsetInScene,/g, 
  'timeInTimeline: Math.max(0, currentTimelineTime + broll.offsetInScene),');

fs.writeFileSync('src/lib/brain/engine.ts', eng);

