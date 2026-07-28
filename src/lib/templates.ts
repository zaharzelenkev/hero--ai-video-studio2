export type TemplateId = "auto" | "minimal" | "travel" | "tiktok" | "luxury" | "podcast" | "promo";

export interface VideoTemplate {
  id: TemplateId;
  name: string;
  icon: string;
  description: string;
  pace: "slow" | "medium" | "fast" | "dynamic";
  colorGrade: string;
  transition: "cut" | "crossfade" | "zoom" | "wipeleft";
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
    animation: "fade" | "slide-up" | "slide-left" | "pop";
  };
}

export const TEMPLATES: VideoTemplate[] = [
  {
    id: "auto",
    name: "Умный выбор (AI)",
    icon: "✨",
    description: "AI сам подберет стиль под ваши материалы",
    pace: "medium",
    colorGrade: "none",
    transition: "crossfade",
    kenBurns: true,
    text: { fontFamily: "DejaVu Sans", fontSize: 60, color: "#ffffff", backgroundColor: "transparent", align: "center", yPosition: 0.5, animation: "fade" }
  },
  {
    id: "tiktok",
    name: "TikTok Viral",
    icon: "📱",
    description: "Быстрые склейки, желтые выпрыгивающие субтитры",
    pace: "fast",
    colorGrade: "vivid",
    transition: "cut",
    kenBurns: false,
    text: { fontFamily: "DejaVu Sans Bold", fontSize: 75, color: "#FFE81A", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 8, align: "center", yPosition: 0.2, animation: "pop" }
  },
  {
    id: "travel",
    name: "Cinematic Travel",
    icon: "✈️",
    description: "Киношный цвет, плавные переходы, элегантный текст",
    pace: "slow",
    colorGrade: "cinematic",
    transition: "crossfade",
    kenBurns: true,
    text: { fontFamily: "Liberation Serif", fontSize: 65, color: "#ffffff", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 2, align: "center", yPosition: 0.8, animation: "slide-up" }
  },
  {
    id: "minimal",
    name: "Apple Minimal",
    icon: "🍏",
    description: "Чисто, строго, стильно. Ч/Б или контраст.",
    pace: "dynamic",
    colorGrade: "bw",
    transition: "cut",
    kenBurns: false,
    text: { fontFamily: "Liberation Sans", fontSize: 90, color: "#ffffff", backgroundColor: "transparent", align: "center", yPosition: 0.5, animation: "fade" }
  },
  {
    id: "luxury",
    name: "Luxury Estate",
    icon: "💎",
    description: "Премиально, медленно, золотые оттенки",
    pace: "slow",
    colorGrade: "warm",
    transition: "crossfade",
    kenBurns: true,
    text: { fontFamily: "Liberation Serif", fontSize: 70, color: "#D4AF37", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 3, align: "center", yPosition: 0.5, animation: "slide-up" }
  },
  {
    id: "podcast",
    name: "Smart Podcast",
    icon: "🎙️",
    description: "Удержание внимания на спикере, умные субтитры",
    pace: "medium",
    colorGrade: "none",
    transition: "cut",
    kenBurns: false,
    text: { fontFamily: "DejaVu Sans", fontSize: 55, color: "#ffffff", backgroundColor: "black@0.4", align: "center", yPosition: 0.85, animation: "pop" }
  },
  {
    id: "promo",
    name: "Product Promo",
    icon: "🛍️",
    description: "Динамичная реклама, сочные цвета, выезжающий текст",
    pace: "fast",
    colorGrade: "vivid",
    transition: "zoom",
    kenBurns: true,
    text: { fontFamily: "Liberation Sans", fontSize: 80, color: "#ffffff", backgroundColor: "transparent", strokeColor: "#000000", strokeWidth: 4, align: "center", yPosition: 0.5, animation: "slide-left" }
  }
];

export function getTemplateForContentType(contentType: string): VideoTemplate {
  let id = "minimal";
  if (contentType === "shorts" || contentType === "tiktok" || contentType === "reels") id = "tiktok";
  if (contentType === "travel" || contentType === "wedding") id = "travel";
  if (contentType === "ad") id = "promo";
  if (contentType === "podcast" || contentType === "interview") id = "podcast";
  
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[1]; // fallback to auto/minimal
}
