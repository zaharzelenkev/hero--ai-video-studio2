const fs = require('fs');
let code = fs.readFileSync('src/lib/templates.ts', 'utf8');

code = code.replace(/id: "hormozi",[\s\S]*?animation: "pop" \},/g, 
  match => match.replace('animation: "pop"', 'animation: "elastic"'));

code = code.replace(/id: "mrbeast",[\s\S]*?animation: "bounce" \},/g, 
  match => match.replace('animation: "bounce"', 'animation: "stomp"'));

code = code.replace(/id: "tiktok",[\s\S]*?animation: "pop" \},/g, 
  match => match.replace('animation: "pop"', 'animation: "elastic"'));

code = code.replace(/id: "tech",[\s\S]*?animation: "typewriter" \},/g, 
  match => match.replace('animation: "typewriter"', 'animation: "glitch"'));

fs.writeFileSync('src/lib/templates.ts', code);
