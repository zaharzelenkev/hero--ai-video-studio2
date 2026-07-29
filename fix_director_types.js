const fs = require('fs');
const file = './src/lib/brain/director.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /c\.outPoint = \(c as any\)\.inPoint \+ 3 \* \(c\.speed \|\| 1\);/g,
  '(c as any).outPoint = (c as any).inPoint + 3 * ((c as any).speed || 1);'
);

fs.writeFileSync(file, code);
