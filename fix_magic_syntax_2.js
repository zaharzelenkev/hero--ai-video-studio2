const fs = require('fs');
let code = fs.readFileSync('src/lib/generators/magicGenerator.ts', 'utf8');

code = code.replace(/hasAudio: true, aAsset \? aAsset\.transcript : "" \/\/ Give image the transcript so it triggers narrative engine!/g, 'hasAudio: true');

fs.writeFileSync('src/lib/generators/magicGenerator.ts', code);
