const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /pastLessons = "[\s\S]*?";/m,
  'pastLessons = "\\nИЗВЛЕЧЕННЫЙ ОПЫТ (ПРЕДЫДУЩИЕ ОШИБКИ):\\n" + recent.map(r => "- " + r.lesson).join("\\n");'
);

code = code.replace(
  /return \`БАЗОВЫЕ ПРАВИЛА ЖАНРА \(\$\{base\.name\}\):\n\$\{base\.coreDirectives\.map\(d => "- " \+ d\)\.join\("\n"\)\}\$\{pastLessons\}\`;/m,
  'return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`;'
);


fs.writeFileSync(file, code);
