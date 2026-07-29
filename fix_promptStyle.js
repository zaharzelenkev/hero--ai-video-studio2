const fs = require('fs');

let code = fs.readFileSync('src/lib/promptStyle.ts', 'utf8');

const oldLogic = `  let colorGrade: LutPreset = "none";
  if (bw) colorGrade = "bw";
  else if (has("тепл", "закат", "warm", "sunset")) colorGrade = "warm";
  else if (has("холод", "cool", "cold", "blue")) colorGrade = "cool";
  else if (has("кино", "cinematic", "фильм")) colorGrade = "cinematic";
  else if (has("ретро", "винтаж", "retro", "vintage")) colorGrade = "vintage";
  else if (has("ярк", "сочн", "vivid", "vibrant")) colorGrade = "vivid";

  const kenBurns = has("фото", "photo", "слайд", "slideshow") || true; // always safe default for images

  const beatSync = has("музык", "бит", "ритм", "music", "beat", "song") || pace === "fast";

  let transition: TransitionType = "crossfade";
  if (pace === "fast") transition = "cut";
  if (has("wipe", "шторк")) transition = "wipeleft";
  if (has("zoom", "зум")) transition = "zoom";
  if (has("плавн", "crossfade", "растворение", "fade")) transition = "crossfade";

  const addCaptions = has("титры", "субтитры", "текст", "caption", "subtitle");

  return { pace, bw, colorGrade, kenBurns, beatSync, transition, addCaptions, rawPrompt: prompt };`;

const newLogic = `  let colorGrade: LutPreset = "none";
  if (bw) colorGrade = "bw";
  else if (has("тепл", "закат", "warm", "sunset")) colorGrade = "warm";
  else if (has("холод", "cool", "cold", "blue")) colorGrade = "cool";
  else if (has("кино", "cinematic", "фильм")) colorGrade = "cinematic";
  else if (has("ретро", "винтаж", "retro", "vintage")) colorGrade = "vintage";
  else if (has("ярк", "сочн", "vivid", "vibrant")) colorGrade = "vivid";

  let contentType: any;
  if (has("горизонтальн", "youtube", "ютуб", "широкоформат", "16:9", "документал", "презентаци")) {
      contentType = "youtube";
  } else if (has("вертикальн", "tiktok", "тикток", "reels", "shorts", "шортс", "9:16")) {
      contentType = "tiktok";
  }

  const kenBurns = has("фото", "photo", "слайд", "slideshow") || true; // always safe default for images

  const beatSync = has("музык", "бит", "ритм", "music", "beat", "song") || pace === "fast";

  let transition: TransitionType = "crossfade";
  if (pace === "fast") transition = "cut";
  if (has("wipe", "шторк")) transition = "wipeleft";
  if (has("zoom", "зум")) transition = "zoom";
  if (has("плавн", "crossfade", "растворение", "fade")) transition = "crossfade";

  const addCaptions = has("титры", "субтитры", "текст", "caption", "subtitle");

  return { pace, bw, colorGrade, kenBurns, beatSync, transition, addCaptions, rawPrompt: prompt, contentType };`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('src/lib/promptStyle.ts', code);
