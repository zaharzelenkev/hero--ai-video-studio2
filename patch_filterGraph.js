const fs = require('fs');
let code = fs.readFileSync('src/lib/filterGraph.ts', 'utf8');
code = code.replace(/\(clip as any\)\.denoise \|\| false,\n\s*clip\.duration,/g, 
  "(clip as any).denoise || false,\n          (clip as any).compressor || false,\n          (clip as any).normalize || false,\n          clip.duration,");
code = code.replace(/clip\.denoise,\n\s*clip\.duration,/g,
  "clip.denoise,\n          (clip.compressor as any)?.enabled || false,\n          clip.normalize || false,\n          clip.duration,");
fs.writeFileSync('src/lib/filterGraph.ts', code);
