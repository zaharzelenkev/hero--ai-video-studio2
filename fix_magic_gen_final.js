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

code = code.replace(/import \{ createAudioClip, createTextClip, createVideoClip, createEmptyProject \} from "\.\/factories";/g, 'import { createAudioClip, createTextClip, createVideoClip, createEmptyProject } from "../factories";');
code = code.replace(/import type \{ Project, MediaAsset, VideoClip \} from "\.\/types";/g, 'import type { Project, MediaAsset, VideoClip } from "../types";');
code = code.replace(/import \{ uid \} from "\.\/id";/g, 'import { uid } from "../id";');
code = code.replace(/import \{ saveBlob \} from "\.\/db";/g, 'import { saveBlob } from "../db";');

fs.writeFileSync(file, code);
