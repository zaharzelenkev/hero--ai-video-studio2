const fs = require('fs');
let code = fs.readFileSync('src/lib/filterGraph.ts', 'utf8');
code = code.replace(/clip\.volume,\n\s*0,\n\s*0,\n\s*0,\n\s*0,\n\s*0,\n\s*false,/g, 
  "clip.volume,\n          0,\n          0,\n          (clip as any).eqLow || 0,\n          (clip as any).eqMid || 0,\n          (clip as any).eqHigh || 0,\n          (clip as any).denoise || false,");
fs.writeFileSync('src/lib/filterGraph.ts', code);
