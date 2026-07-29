const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /\`БАЗОВЫЕ ПРАВИЛА ЖАНРА \(\\\$\\{base\.name\\}\):\\\\n\\\$\\{base\.coreDirectives\.map\(d => "- " \+ d\)\.join\("\\\\n"\)\}\\\$\\{pastLessons\\}\`/,
  '`БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`'
);

fs.writeFileSync(file, code);
