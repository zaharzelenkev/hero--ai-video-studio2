const fs = require('fs');
let code = fs.readFileSync('src/lib/templates.ts', 'utf8');
code = code.replace(/animation: "[^"]+" \}\n\s+effects:/g, match => match.replace('}\n', '},\n'));
code = code.replace(/animation: "[^"]+" as any \}\n\s+effects:/g, match => match.replace('}\n', '},\n'));
fs.writeFileSync('src/lib/templates.ts', code);
