const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /\`БАЗОВЫЕ ПРАВИЛА ЖАНРА \(\\\$\\{base\.name\\}\):\\\\n\\\$\\{base\.coreDirectives\.map\(d => "- " \+ d\)\.join\("\\\\n"\)\}\\\$\\{pastLessons\\}\`/,
  '`БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`'
);

// If the regex above fails, we do a direct replace
code = code.replace(/return \`БАЗОВЫЕ ПРАВИЛА ЖАНРА \(\\\$\\{base\.name\\}\):\\\\n\\\$\\{base\.coreDirectives\.map\(d => "- " \+ d\)\.join\("\\\\n"\)\}\\\$\\{pastLessons\\}\`;/g, 'return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`;');

fs.writeFileSync(file, code);
