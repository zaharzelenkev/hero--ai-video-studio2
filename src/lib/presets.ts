import type { ColorGrade, LutPreset, TransitionType } from "./types";

/** Extra eq/curves nudges applied on top of the manual grade for each LUT preset. */
export const LUT_PRESETS: Record<LutPreset, Partial<ColorGrade> & { css: string }> = {
  none: { css: "" },
  cinematic: {
    css: "contrast(1.08) saturate(0.92) sepia(0.08)",
  },
  warm: {
    css: "sepia(0.18) saturate(1.15) contrast(1.03)",
  },
  cool: {
    css: "hue-rotate(-8deg) saturate(1.05) contrast(1.02) brightness(1.02)",
  },
  bw: {
    css: "grayscale(1) contrast(1.1)",
  },
  vintage: {
    css: "sepia(0.35) saturate(0.8) contrast(0.95) brightness(1.05)",
  },
  vivid: {
    css: "saturate(1.45) contrast(1.1)",
  },
  moody: { css: "" },
  dramatic: { css: "" },
  neutral: { css: "" },
  "teal-orange": { css: "" },
  "film-noir": { css: "" },
  luxury: { css: "" }
};

/** FFmpeg filter fragment applied for a LUT preset (chained after manual eq/hue). */
/** Чистка глифов, отсутствующих в DejaVu (шрифт экспорта): эмодзи/флаги/ZWJ/PUA.
 *  Применяйте при СОЗДАНИИ текста — тогда превью (DOM) и экспорт (drawtext) совпадут. */
export function sanitizeGlyphs(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u200D\uFE00-\uFE0F\uE000-\uF8FF]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n");
}

export function lutToFfmpeg(lut: LutPreset): string[] {
  switch (lut) {
    case "bw":
      return ["hue=s=0"];
    case "warm":
      return ["colorbalance=rs=0.12:gs=0.02:bs=-0.1"];
    case "cool":
      return ["colorbalance=rs=-0.1:gs=0:bs=0.12"];
    case "cinematic":
    case "teal-orange":
      return [
        "curves=preset=medium_contrast", 
        "colorbalance=rs=-0.05:gs=0.02:bs=0.05:rm=0.02:gm=0.02:bm=-0.02:rh=0.05:gh=0.02:bh=-0.05"
      ];
    case "vintage":
      return [
        "curves=preset=vintage", 
        "colorchannelmixer=rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131",
        "eq=contrast=0.9"
      ];
    case "luxury":
      return [
        "eq=saturation=1.2:contrast=1.1",
        "colorbalance=rs=0.1:gs=0.05:bs=-0.1:rm=0.05:gm=0.02:bm=-0.05:rh=0.1:gh=0.05:bh=-0.1"
      ];
    case "vivid":
      return ["eq=saturation=1.4:contrast=1.1"];
    case "dramatic":
      return ["curves=preset=strong_contrast", "eq=saturation=0.8"];
    case "moody":
      return ["curves=preset=darker", "eq=saturation=0.85:brightness=-0.03", "colorbalance=bs=0.06:bm=0.04:bh=0.08"];
    case "film-noir":
      return ["hue=s=0", "curves=preset=strong_contrast", "eq=brightness=-0.02:gamma=1.05"];
    case "neutral":
      return ["eq=contrast=1.03:saturation=1.02"];
    default:
      return [];
  }
}

export const TRANSITIONS: { type: TransitionType; label: string; icon: string }[] = [
  { type: "cut", label: "Резкая склейка (Cut)", icon: "✂️" },
  { type: "crossfade", label: "Наплыв (Crossfade)", icon: "🌫️" },
  { type: "fadeblack", label: "Через чёрный (Fade to Black)", icon: "⬛" },
  { type: "fadewhite", label: "Вспышка (Flash / Light Leak)", icon: "⚡" },
  { type: "wipeleft", label: "Шторка влево (Wipe)", icon: "◀️" },
  { type: "slideup", label: "Слайд вверх (Slide)", icon: "🔼" },
  { type: "squeezeh", label: "Сдвиг (Push)", icon: "🫸" },
  { type: "zoom", label: "Зум (Punch Zoom)", icon: "🔍" },
  { type: "smoothleft", label: "Мягкий сдвиг (Smooth Slide)", icon: "💨" },
  { type: "hblur", label: "Хлыст (Whip Pan / Speed Blur)", icon: "🌪️" },
  { type: "pixelize", label: "Глитч (Glitch)", icon: "👾" },
  { type: "dissolve", label: "Морфинг (Morph / Match Cut)", icon: "🧬" },
  { type: "radial", label: "Вращение (Spin / Parallax)", icon: "🌀" },
  { type: "circleopen", label: "Маска: Круг (Mask Transition)", icon: "⭕" },
  { type: "rectcrop", label: "Динамичный кроп (Dynamic Crop)", icon: "🔲" },
  { type: "fadegrays", label: "Плёнка (Film Burn)", icon: "🎞️" },
  { type: "hlslice", label: "RGB Сплит (Split)", icon: "✂️" },
];

/** Map our transition type to an ffmpeg `xfade` transition name. */
export function transitionToXfade(type: TransitionType): string {
  if (type === "cut" || type === "crossfade") return "fade";
  if (type === "zoom") return "zoomin";
  return type; // All other types map 1:1 to xfade natively
}

export const EFFECT_PRESETS: { id: string; label: string; ffmpeg: string; css: string }[] = [
  { id: "blur", label: "Размытие", ffmpeg: "gblur=sigma=6", css: "blur(3px)" },
  { id: "glow", label: "Свечение", ffmpeg: "gblur=sigma=3,eq=brightness=0.05", css: "brightness(1.1) blur(0.5px)" },
  { id: "vignette", label: "Виньетка", ffmpeg: "vignette=PI/4", css: "" },
  { id: "mirror", label: "Зеркало", ffmpeg: "hflip", css: "" },
  { id: "sharpen", label: "Резкость", ffmpeg: "unsharp=5:5:1.0", css: "contrast(1.05)" },
  { id: "noise", label: "Плёночное зерно", ffmpeg: "noise=alls=8:allf=t", css: "" },
  { id: "letterbox", label: "Кино-полосы", ffmpeg: "drawbox=y=0:color=black:width=iw:height=ih*0.12:t=max,drawbox=y=ih-ih*0.12:color=black:width=iw:height=ih*0.12:t=max", css: "" },
];

export const TEXT_FONTS = [
  "DejaVu Sans",
  "DejaVu Sans Bold",
  "Liberation Sans",
  "Liberation Serif",
  "Liberation Mono",
];

/** Maps a selectable font name to the .ttf file bundled under /public/fonts. */
export const FONT_FILES: Record<string, string> = {
  "DejaVu Sans": "DejaVuSans.ttf",
  "DejaVu Sans Bold": "DejaVuSans-Bold.ttf",
  "Liberation Sans": "LiberationSans-Regular.ttf",
  "Liberation Serif": "LiberationSerif-Regular.ttf",
  "Liberation Mono": "LiberationMono-Regular.ttf",
};

export function fontFileFor(fontFamily: string): string {
  let cleanFamily = fontFamily;
  
  // Clean up legacy cached font families that contain colons
  if (cleanFamily.startsWith("GFONT:")) {
    const parts = cleanFamily.split(":");
    cleanFamily = parts[1]; 
  } else if (cleanFamily.startsWith("GFONT_")) {
    const parts = cleanFamily.split("_");
    cleanFamily = parts[1].replace(/\+/g, ' '); 
  }
  
  if (FONT_FILES[cleanFamily]) {
    return FONT_FILES[cleanFamily];
  }
  
  // Safe filename without colons (colons break FFmpeg filter parsing)
  return `GFONT_${cleanFamily.replace(/ /g, '+')}_700.ttf`;
}
