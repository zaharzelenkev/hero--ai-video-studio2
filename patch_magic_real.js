const fs = require('fs');

let code = fs.readFileSync('src/lib/generators/magicGenerator.ts', 'utf8');

const oldPrompt = `  const systemPrompt = \`Ты — профессиональный креативный директор и сценарист.
Твоя задача написать сценарий для короткого динамичного видео по запросу пользователя.
Сделай от 4 до 6 сцен. Каждая сцена должна быть 3-6 секунд.
Для каждой сцены напиши:
- voiceover: текст озвучки (на русском)
- imagePrompt: промпт для нейросети генерации картинок (ОБЯЗАТЕЛЬНО НА АНГЛИЙСКОМ, детальное описание, cinematic, photorealistic, 8k). Без текста на картинке!
Ответь строго в JSON формате:
{
  "title": "Название видео",
  "scenes": [
    { "voiceover": "Текст озвучки", "imagePrompt": "A cyberpunk city at night, neon lights, 8k resolution, photorealistic" }
  ]
}\`;`;

const newPrompt = `  const systemPrompt = \`Ты — профессиональный креативный директор и сценарист.
Твоя задача написать сценарий для короткого динамичного видео по запросу пользователя.
Сделай от 4 до 6 сцен. Каждая сцена должна быть 3-6 секунд.
Для каждой сцены реши, какая нужна картинка: сгенерированная ИИ (для абстракций, арта, киберпанка) или РЕАЛЬНОЕ ФОТО из интернета (для достопримечательностей, известных личностей, реальных городов, исторических событий).

Для каждой сцены верни:
- voiceover: текст озвучки (на русском)
- imageType: "ai" или "real"
- imagePrompt: 
   - Если imageType="ai", напиши детальный промпт для нейросети на АНГЛИЙСКОМ (например: "A cyberpunk city at night, neon lights, 8k resolution").
   - Если imageType="real", напиши точный короткий поисковый запрос на АНГЛИЙСКОМ (например: "Eiffel Tower", "Elon Musk", "Mount Everest").

Ответь строго в JSON формате:
{
  "title": "Название видео",
  "scenes": [
    { "voiceover": "Эйфелева башня — самая известная достопримечательность...", "imageType": "real", "imagePrompt": "Eiffel Tower" },
    { "voiceover": "Представьте себе город будущего...", "imageType": "ai", "imagePrompt": "Futuristic flying cars, sci-fi city, 8k" }
  ]
}\`;`;

code = code.replace(oldPrompt, newPrompt);

const oldFallback = `    scriptData = {
      title: "Генерация",
      scenes: [
        { voiceover: prompt.slice(0, 50), imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" },
        { voiceover: "Продолжение...", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" },
        { voiceover: "Финал.", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" }
      ]
    };`;

const newFallback = `    scriptData = {
      title: "Генерация",
      scenes: [
        { voiceover: prompt.slice(0, 50), imageType: "ai", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" },
        { voiceover: "Продолжение...", imageType: "ai", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" },
        { voiceover: "Финал.", imageType: "ai", imagePrompt: "beautiful cinematic landscape, epic lighting, 8k" }
      ]
    };`;

code = code.replace(oldFallback, newFallback);

const oldFetchImage = `    // 2. Fetch Image
    try {
      const isLandscape = style.contentType === "youtube" || style.contentType === "presentation" || style.contentType === "documentary";
      const w = isLandscape ? 1920 : 1080;
      const h = isLandscape ? 1080 : 1920;
      const imgUrl = \`https://image.pollinations.ai/prompt/\${encodeURIComponent(scene.imagePrompt)}?width=\${w}&height=\${h}&nologo=true&seed=\${Math.floor(Math.random()*10000)}\`;
      const imgRes = await fetch(imgUrl);`;

const newFetchImage = `    // 2. Fetch Image
    try {
      const isLandscape = style.contentType === "youtube" || style.contentType === "presentation" || style.contentType === "documentary";
      const w = isLandscape ? 1920 : 1080;
      const h = isLandscape ? 1080 : 1920;
      
      let imgUrl = "";

      if (scene.imageType === "real") {
         onProgress?.(\`🔍 Поиск фото: \${scene.imagePrompt}...\`);
         try {
            const wikiUrl = \`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=\${encodeURIComponent(scene.imagePrompt)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&format=json&origin=*\`;
            const wikiRes = await fetch(wikiUrl);
            if (wikiRes.ok) {
               const wikiData = await wikiRes.json();
               const pages = wikiData.query?.pages;
               if (pages) {
                  imgUrl = Object.values(pages)[0].imageinfo[0].url;
               }
            }
         } catch(e) {
            console.warn("Wiki search failed", e);
         }
      }

      if (!imgUrl) {
         onProgress?.(\`🎨 Генерация AI-иллюстрации: \${scene.imagePrompt.slice(0,20)}...\`);
         imgUrl = \`https://image.pollinations.ai/prompt/\${encodeURIComponent(scene.imagePrompt)}?width=\${w}&height=\${h}&nologo=true&seed=\${Math.floor(Math.random()*10000)}\`;
      }
      
      const imgRes = await fetch(imgUrl);`;

code = code.replace(oldFetchImage, newFetchImage);

fs.writeFileSync('src/lib/generators/magicGenerator.ts', code);
