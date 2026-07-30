const fs = require('fs');
let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

code = code.replace(/if \(s\.bRollNeeded && visualAssets\.length > 1\) \{/g, 
'if (s.bRollNeeded && _visualAssets.length > 1) {');

code = code.replace(/const bRollPool = visualAssets\.filter\(a => a\.id !== mainAsset\.id\);/g, 
'const bRollPool = _visualAssets.filter((a: any) => a.id !== mainAsset.id);');

fs.writeFileSync('src/lib/brain/engine.ts', code);
