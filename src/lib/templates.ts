export type TemplateId = "auto" | "hormozi" | "mrbeast" | "apple" | "minimal" | "cinematic" | "documentary" | "tiktok" | "podcast" | "luxury" | "tech" | "reels" | "youtube";

export interface VideoTemplate {
  id: TemplateId;
  name: string;
  icon: string;
  description: string;
  pace: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;
  transition: import("./types").TransitionType;
  kenBurns: boolean;
  text: {
    fontFamily: string;
    fontSize: number;
    color: string;
    backgroundColor: string;
    strokeColor?: string;
    strokeWidth?: number;
    align: "center" | "left" | "right";
    yPosition: number; // 0 (top) to 1 (bottom), typically 0.5 is center
    animation: import("./types").TextAnimation;
  };
  effects?: string[];
}

export const TEMPLATES: VideoTemplate[] = [
  {
    id: "auto",
    name: "Умный выбор (AI)",
    icon: "✨",
    description: "Нейросеть сама выберет стиль",
    pace: "medium",
    colorGrade: "none",
    transition: "crossfade",
    kenBurns: true,
    text: { fontFamily: "Inter", fontSize: 60, color: "#ffffff", backgroundColor: "transparent", align: "center", yPosition: 0.5, animation: "fade" }
  },
  {
    id: "hormozi",
    name: "Hormozi Style",
    icon: "💪",
    description: "Желтый шрифт, поп-анимация",
    pace: "dynamic",
    colorGrade: "vivid",
    transition: "cut",
    kenBurns: false,
    text: { fontFamily: "Montserrat", fontSize: 85, color: "#FFE81A", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 8, align: "center", yPosition: 0.5, animation: "elastic" },
    effects: ["sharpen"]
  },
  {
    id: "mrbeast",
    name: "MrBeast Style",
    icon: "🤑",
    description: "Ультрадинамика, глитчи, зумы",
    pace: "fast",
    colorGrade: "vivid",
    transition: "hblur",
    kenBurns: false,
    text: { fontFamily: "Bangers", fontSize: 95, color: "#00FF00", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 10, align: "center", yPosition: 0.8, animation: "stomp" },
    effects: ["sharpen", "vignette"]
  },
  {
    id: "apple",
    name: "Apple Style",
    icon: "🍏",
    description: "Минимализм, строгие переходы",
    pace: "medium",
    colorGrade: "bw",
    transition: "smoothleft",
    kenBurns: true,
    text: { fontFamily: "SF Pro Display", fontSize: 75, color: "#ffffff", backgroundColor: "transparent", align: "center", yPosition: 0.5, animation: "blur-in" },
    effects: ["glow"]
  },
  {
    id: "cinematic",
    name: "Cinematic",
    icon: "🍿",
    description: "Киношный цвет и кроссфейды",
    pace: "slow",
    colorGrade: "cinematic",
    transition: "crossfade",
    kenBurns: true,
    text: { fontFamily: "Playfair Display", fontSize: 50, color: "#F0F0F0", backgroundColor: "transparent", align: "center", yPosition: 0.85, animation: "fade" },
    effects: ["glow", "vignette", "letterbox"]
  },
  {
    id: "documentary",
    name: "Documentary",
    icon: "🌍",
    description: "Эффект пленки, аккуратные титры",
    pace: "slow",
    colorGrade: "vintage",
    transition: "fadegrays",
    kenBurns: true,
    text: { fontFamily: "Playfair Display", fontSize: 45, color: "#ffffff", backgroundColor: "black@0.5", align: "center", yPosition: 0.9, animation: "slide-up" },
    effects: ["noise", "vignette", "letterbox"]
  },
  {
    id: "tiktok",
    name: "TikTok / Reels",
    icon: "📱",
    description: "Максимальное удержание и зумы",
    pace: "dynamic",
    colorGrade: "vivid",
    transition: "zoom",
    kenBurns: false,
    text: { fontFamily: "Montserrat", fontSize: 75, color: "#ffffff", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 6, align: "center", yPosition: 0.2, animation: "elastic" },
    effects: []
  },
  {
    id: "podcast",
    name: "Podcast",
    icon: "🎙️",
    description: "Умные перебивки и субтитры",
    pace: "medium",
    colorGrade: "none",
    transition: "cut",
    kenBurns: false,
    text: { fontFamily: "Inter", fontSize: 65, color: "#ffffff", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 4, align: "center", yPosition: 0.8, animation: "word-highlight" as any },
    effects: ["vignette"]
  },
  {
    id: "minimal",
    name: "Minimal",
    icon: "◻️",
    description: "Чистый монтаж без лишних эффектов",
    pace: "medium",
    colorGrade: "neutral",
    transition: "crossfade",
    kenBurns: true,
    text: { fontFamily: "Inter", fontSize: 58, color: "#ffffff", backgroundColor: "black@0.45", align: "center", yPosition: 0.8, animation: "fade" },
    effects: []
  },
  {
    id: "luxury",
    name: "Luxury",
    icon: "💎",
    description: "Премиальные тона, золотой свет",
    pace: "slow",
    colorGrade: "luxury",
    transition: "smoothleft",
    kenBurns: true,
    text: { fontFamily: "Playfair Display", fontSize: 55, color: "#E8D5A3", backgroundColor: "transparent", strokeColor: "black", strokeWidth: 1, align: "center", yPosition: 0.82, animation: "blur-in" },
    effects: ["glow", "vignette"]
  },
  {
    id: "tech",
    name: "Tech Review",
    icon: "💻",
    description: "Холодные тона, эффект печати",
    pace: "medium",
    colorGrade: "cool",
    transition: "pixelize",
    kenBurns: true,
    text: { fontFamily: "Space Mono", fontSize: 60, color: "#00FFFF", backgroundColor: "black@0.8", align: "left", yPosition: 0.8, animation: "glitch" },
    effects: ["sharpen", "glow"]
  }
];

export function getTemplateForContentType(contentType: string): VideoTemplate {
  let id = "minimal";
  if (contentType === "shorts" || contentType === "tiktok" || contentType === "reels") id = "tiktok";
  if (contentType === "travel" || contentType === "wedding") id = "cinematic";
  if (contentType === "ad") id = "apple";
  if (contentType === "podcast" || contentType === "interview") id = "hormozi";
  if (contentType === "educational" || contentType === "tutorial") id = "tech";
  if (contentType === "documentary") id = "documentary";
  if (contentType === "youtube" || contentType === "vlog") id = "mrbeast";
  
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[1];
}
