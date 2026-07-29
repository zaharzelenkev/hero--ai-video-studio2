const fs = require('fs');

let code = fs.readFileSync('src/lib/filterGraph.ts', 'utf8');
code = code.replace(/alimiter=limit=-1\.0/g, 'alimiter=limit=0.9'); // Set limit below 1.0, not negative
fs.writeFileSync('src/lib/filterGraph.ts', code);
