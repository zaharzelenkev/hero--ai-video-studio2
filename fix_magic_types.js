const fs = require('fs');
const file = './src/lib/generators/magicGenerator.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/import type \{ Project, MediaAsset, VideoClip, TextClip \} from "\.\.\/types";/, 'import type { Project, MediaAsset } from "../types";');

fs.writeFileSync(file, code);
