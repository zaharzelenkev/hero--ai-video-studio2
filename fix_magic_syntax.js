const fs = require('fs');
let code = fs.readFileSync('src/lib/generators/magicGenerator.ts', 'utf8');

code = code.replace(/hasAudio: true, \`\[0\.0s - \$\{audioDuration\.toFixed\(1\)\}s\] \$\{scene\.voiceover\}\`/g, 'hasAudio: true');
code = code.replace(/hasAudio: true \? aAsset\.transcript : ""/g, 'hasAudio: true');
code = code.replace(/hasAudio: true \/\/ Give image the transcript so it triggers narrative engine!/g, '');
fs.writeFileSync('src/lib/generators/magicGenerator.ts', code);
