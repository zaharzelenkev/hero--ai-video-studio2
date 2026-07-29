const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/\\`/g, '`');

fs.writeFileSync(file, code);
