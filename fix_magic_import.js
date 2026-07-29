const fs = require('fs');
const file = './src/components/generation/GenerationScreenV2.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const { generateMagicVideo } = await import("@/lib/magicGenerator");',
  'const { generateMagicVideo } = await import("@/lib/generators/magicGenerator");'
);

fs.writeFileSync(file, code);
