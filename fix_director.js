const fs = require('fs');
const file = './src/lib/brain/director.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/, Clip/g, '');
code = code.replace(/import \{ AI_CONFIG \} from "@\/config\/ai";\n/g, '');

fs.writeFileSync(file, code);
