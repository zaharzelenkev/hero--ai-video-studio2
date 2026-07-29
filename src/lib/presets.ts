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
  if (FONT_FILES[fontFamily]) {
    return FONT_FILES[fontFamily];
  }
  // If it's not a local file, assume it's a Google Font
  return `GFONT:${fontFamily}:700`; // Default to Bold (700) for video text
}
