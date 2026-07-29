const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

const target1 = `pastLessons = "
ИЗВЛЕЧЕННЫЙ ОПЫТ (ПРЕДЫДУЩИЕ ОШИБКИ):
" + recent.map(r => "- " + r.lesson).join("
");`;

code = code.replace(target1, 'pastLessons = "\\nИЗВЛЕЧЕННЫЙ ОПЫТ (ПРЕДЫДУЩИЕ ОШИБКИ):\\n" + recent.map(r => "- " + r.lesson).join("\\n");');

const target2 = `return \`БАЗОВЫЕ ПРАВИЛА ЖАНРА (\${base.name}):
\${base.coreDirectives.map(d => "- " + d).join("
")}\${pastLessons}\`;`;

code = code.replace(target2, 'return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`;');

fs.writeFileSync(file, code);
