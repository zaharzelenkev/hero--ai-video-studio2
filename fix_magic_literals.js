const fs = require('fs');
const file = './src/lib/generators/magicGenerator.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/\$\\{encodeURIComponent\(prompt\)\\}/g, '${encodeURIComponent(prompt)}');
code = code.replace(/\$\\{width\\}/g, '${width}');
code = code.replace(/\$\\{height\\}/g, '${height}');
code = code.replace(/\$\\{Math\.floor\(Math\.random\(\) \* 100000\)\\}/g, '${Math.floor(Math.random() * 100000)}');

code = code.replace(/\$\\{encodeURIComponent\(text\)\\}/g, '${encodeURIComponent(text)}');

code = code.replace(/\$\\{AI_CONFIG\.groqApiKey\\}/g, '${AI_CONFIG.groqApiKey}');
code = code.replace(/\$\\{i \+ 1\\}/g, '${i + 1}');
code = code.replace(/\$\\{scriptData\.scenes\.length\\}/g, '${scriptData.scenes.length}');

fs.writeFileSync(file, code);
