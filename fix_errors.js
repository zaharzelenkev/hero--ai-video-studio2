const fs = require('fs');

function patch(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/const friendly = "Ошибка: " \+ raw \+ \(err\.stack \? " " \+ err\.stack : ""\);/g, 'const friendly = "Ошибка: " + raw;');
  fs.writeFileSync(file, code);
}

patch('src/components/generation/GenerationScreenV2.tsx');
patch('src/components/editor/panels/ExportPanelV2.tsx');
