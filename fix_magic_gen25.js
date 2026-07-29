const fs = require('fs');
const file = './src/lib/generators/magicGenerator.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /\`https:\/\/image\.pollinations\.ai\/prompt\/\\\$\\{encodeURIComponent\(prompt\)\}\?width=\\\$\\{width\\}&height=\\\$\\{height\\}&nologo=true&seed=\\\$\\{Math\.floor\(Math\.random\(\) \* 100000\)\}\`/,
  '`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 100000)}`'
);

code = code.replace(
  /\`https:\/\/translate\.google\.com\/translate_tts\?ie=UTF-8&client=tw-ob&tl=ru&q=\\\$\\{encodeURIComponent\(text\)\}\`/,
  '`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru&q=${encodeURIComponent(text)}`'
);

code = code.replace(/\\\$\\{AI_CONFIG\.groqApiKey\\}/g, '${AI_CONFIG.groqApiKey}');
code = code.replace(/\\\$\\{i \+ 1\\}/g, '${i + 1}');
code = code.replace(/\\\$\\{scriptData\.scenes\.length\\}/g, '${scriptData.scenes.length}');

fs.writeFileSync(file, code);
