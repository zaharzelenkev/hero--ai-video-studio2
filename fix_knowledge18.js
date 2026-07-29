const fs = require('fs');
const file = './src/lib/brain/knowledge.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /return \`БАЗОВЫЕ ПРАВИЛА ЖАНРА \(\\\$\\{base\.name\\}\):\\\n\\\$\\{base\.coreDirectives\.map\(d => "- " \+ d\)\.join\("\\\n"\)\}\\\$\\{pastLessons\\}\`;/;
code = code.replace(regex, 'return `БАЗОВЫЕ ПРАВИЛА ЖАНРА (${base.name}):\\n${base.coreDirectives.map(d => "- " + d).join("\\n")}${pastLessons}`;');

// The file got completely broken with weird backslash escaping. I will just rewrite the function.
const oldFuncRegex = /export async function getKnowledgeForGenre\(genreId: string\): Promise<string> \{[\s\S]*?\}\n\nexport async function/m;

const newFunc = `export async function getKnowledgeForGenre(genreId: string): Promise<string> {
  const base = BASE_KNOWLEDGE.find(k => k.genreId === genreId) || BASE_KNOWLEDGE.find(k => k.genreId === "tiktok")!;
  
  let pastLessons = "";
  try {
    const lessons = await loadLessonsByGenre(genreId);
    if (lessons.length > 0) {
      const recent = lessons.sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
      pastLessons = "\\nИЗВЛЕЧЕННЫЙ ОПЫТ (ПРЕДЫДУЩИЕ ОШИБКИ):\\n" + recent.map(r => "- " + r.lesson).join("\\n");
    }
  } catch(e) {
    console.warn("Could not load experience", e);
  }

  return \`БАЗОВЫЕ ПРАВИЛА ЖАНРА (\${base.name}):\\n\${base.coreDirectives.map(d => "- " + d).join("\\n")}\${pastLessons}\`;
}

export async function`;

code = code.replace(oldFuncRegex, newFunc);
fs.writeFileSync(file, code);
