const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/\\`/g, '`');
code = code.replace(/\\n/g, '\n');

fs.writeFileSync(file, code);
