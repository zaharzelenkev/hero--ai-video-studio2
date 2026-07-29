const fs = require('fs');

let code = fs.readFileSync('src/lib/promptStyle.ts', 'utf8');

const oldChips = `export const STYLE_CHIPS: { label: string; hint: string }[] = [
  { label: "⚡ Динамично", hint: "динамичный энергичный ролик с быстрыми склейками" },
  { label: "🎬 Кинематографично", hint: "кинематографично, плавные переходы, тёплая цветокоррекция" },
  { label: "🎵 Синхрон с музыкой", hint: "смонтируй под ритм музыки, синхронизируй склейки с битом" },
  { label: "⚪⚫ Чёрно-белое", hint: "чёрно-белый стиль" },
  { label: "🌅 Тёплые тона", hint: "тёплая атмосфера заката" },
  { label: "❄️ Холодные тона", hint: "холодные синие тона" },
  { label: "📝 С титрами", hint: "добавь титры с текстом" },
  { label: "🖼️ Ken Burns для фото", hint: "плавное увеличение фотографий" },
];`;

const newChips = `export const STYLE_CHIPS: { label: string; hint: string }[] = [
  { label: "⚡ Динамично", hint: "динамичный энергичный ролик с быстрыми склейками" },
  { label: "📺 YouTube (16:9)", hint: "горизонтальное видео для youtube 16:9" },
  { label: "📱 TikTok (9:16)", hint: "вертикальное видео для tiktok 9:16" },
  { label: "🎬 Кинематографично", hint: "кинематографично, плавные переходы, тёплая цветокоррекция" },
  { label: "⚪⚫ Чёрно-белое", hint: "чёрно-белый стиль" },
  { label: "📝 С титрами", hint: "добавь титры с текстом" }
];`;

code = code.replace(oldChips, newChips);
fs.writeFileSync('src/lib/promptStyle.ts', code);
