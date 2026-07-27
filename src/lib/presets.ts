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
      return ["curves=preset=medium_contrast", "colorbalance=rs=0.05:bs=-0.05"];
    case "vintage":
      return ["curves=preset=vintage", "colorbalance=rs=0.08:gs=0.02:bs=-0.08"];
    case "vivid":
      return ["eq=saturation=1.4:contrast=1.1"];
    default:
      return [];
  }
}

export const TRANSITIONS: { type: TransitionType; label: string; icon: string }[] = [
  { type: "cut", label: "Резкая склейка", icon: "✂️" },
  { type: "crossfade", label: "Наплыв (Crossfade)", icon: "🌫️" },
  { type: "fadeblack", label: "Через чёрный", icon: "⬛" },
  { type: "wipeleft", label: "Шторка влево", icon: "◀️" },
  { type: "wiperight", label: "Шторка вправо", icon: "▶️" },
  { type: "slideup", label: "Слайд вверх", icon: "🔼" },
  { type: "zoom", label: "Зум", icon: "🔍" },
];

/** Map our transition type to an ffmpeg `xfade` transition name. */
export function transitionToXfade(type: TransitionType): string {
  switch (type) {
    case "crossfade":
      return "fade";
    case "fadeblack":
      return "fadeblack";
    case "wipeleft":
      return "wipeleft";
    case "wiperight":
      return "wiperight";
    case "slideup":
      return "slideup";
    case "zoom":
      return "zoomin";
    default:
      return "fade";
  }
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
  return FONT_FILES[fontFamily] || FONT_FILES["DejaVu Sans"];
}
