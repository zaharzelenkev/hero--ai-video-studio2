const fs = require('fs');
let code = fs.readFileSync('src/lib/brain/engine.ts', 'utf8');

// The local function signature is:
// private static async buildNarrativeScript(_request: AIAnalysisRequest, strategy: any, speechAssets: any[], visualAssets: any[])
// But it was changed to _visualAssets in an earlier step! Let's check signature.

code = code.replace(/private static async buildNarrativeScript\(\n    _request: AIAnalysisRequest, \n    strategy: any, \n    speechAssets: any\[\], \n    _visualAssets: any\[\]\n  \)/g, 
'private static async buildNarrativeScript(\n    _request: AIAnalysisRequest, \n    strategy: any, \n    speechAssets: any[], \n    visualAssets: any[]\n  )');

code = code.replace(/const bRollPool = _visualAssets\.filter/g, 'const bRollPool = visualAssets.filter');

fs.writeFileSync('src/lib/brain/engine.ts', code);
