const fs = require('fs');

let code = fs.readFileSync('src/lib/generators/magicGenerator.ts', 'utf8');
code = code.replace(/const project = createEmptyProject\(scriptData\.title\);/g, 
  'const project = createEmptyProject(scriptData.title);\n  project.assets = [...assets];');
fs.writeFileSync('src/lib/generators/magicGenerator.ts', code);
