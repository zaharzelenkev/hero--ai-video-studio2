const fs = require('fs');
let code = fs.readFileSync('src/lib/filterGraph.ts', 'utf8');
code = code.replace(/`text='${text}'`,/g, "`text='${text}'`,");
fs.writeFileSync('src/lib/filterGraph.ts', code);
