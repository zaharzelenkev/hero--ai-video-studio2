const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /return \`БАЗОВЫЕ ПРАВИЛА ЖАНРА \(\\\$\\{base\.name\\}\):\\\\n\\\$\\{base\.coreDirectives\.map\(d => "- " \+ d\)\.join\("\\\\n"\)\}\\\$\\{pastLessons\\}\`;/,
  'return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`;'
);
code = code.replace(
  /return \`БАЗОВЫЕ ПРАВИЛА ЖАНРА \(\$\{base\.name\}\):\\\\n\$\{base\.coreDirectives\.map\(d => "- " \+ d\)\.join\("\\\\n"\)\}\$\{pastLessons\}\`;/,
  'return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`;'
);

fs.writeFileSync(file, code);
