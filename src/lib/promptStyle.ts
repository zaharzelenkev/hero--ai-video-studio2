import type { GenerationStyle, LutPreset, TransitionType } from "./types";

/**
 * There is no paid generative-video API involved here. Instead we run a
 * rule-based "director" that reads the free-text prompt (RU/EN keywords)
 * and turns it into a concrete editing style used by the algorithmic
 * auto-editor (`autoEdit.ts`). This is the honest, 100%-free substitute for
 * a real text-to-video model: keyword heuristics + classic DSP (scene
 * detection / beat detection) instead of a neural generator.
 */
export function parsePromptToStyle(prompt: string): GenerationStyle {
  const p = prompt.toLowerCase();

  const has = (...words: string[]) => words.some((w) => p.includes(w));

  let pace: GenerationStyle["pace"] = "medium";
  if (has("динамич", "быстр", "энергич", "клип", "fast", "energetic", "dynamic")) pace = "fast";
  if (has("медлен", "плавн", "спокой", "лирич", "slow", "calm", "cinematic")) pace = "slow";

  const bw = has("черно-бел", "чёрно-бел", "ч/б", "black and white", "monochrome");

  let colorGrade: LutPreset = "none";
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

  return { pace, bw, colorGrade, kenBurns, beatSync, transition, addCaptions, rawPrompt: prompt, contentType };
}

export const PACE_CLIP_SECONDS: Record<GenerationStyle["pace"] | "dynamic", number> = {
  fast: 2.2,
  medium: 3.6,
  slow: 5.5,
  dynamic: 2.8,
};

export const STYLE_CHIPS: { label: string; hint: string }[] = [
  { label: "⚡ Динамично", hint: "динамичный энергичный ролик с быстрыми склейками" },
  { label: "📺 YouTube (16:9)", hint: "горизонтальное видео для youtube 16:9" },
  { label: "📱 TikTok (9:16)", hint: "вертикальное видео для tiktok 9:16" },
  { label: "🎬 Кинематографично", hint: "кинематографично, плавные переходы, тёплая цветокоррекция" },
  { label: "⚪⚫ Чёрно-белое", hint: "чёрно-белый стиль" },
  { label: "📝 С титрами", hint: "добавь титры с текстом" }
];
