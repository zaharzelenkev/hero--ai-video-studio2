import type { IconName } from "@/components/ui/Icon";
import type { PreprodStage } from "@/lib/production";

/** Профессиональные иконки для этапов препродакшена (вместо эмодзи). */
export const STAGE_ICONS: Record<PreprodStage, IconName> = {
  idea: "lightbulb",
  logline: "target",
  treatment: "book",
  script: "script",
  vision: "vision",
  storyboard: "storyboard",
  shotlist: "clipboard",
  planning: "calendar",
  casting: "casting",
  locations: "map-pin",
  risks: "alert",
  chat: "chat",
};

export const STAGE_LABELS: Record<PreprodStage, string> = {
  idea: "Идея",
  logline: "Логлайн",
  treatment: "Тритмент",
  script: "Сценарий",
  vision: "Видение",
  storyboard: "Раскадровка",
  shotlist: "Шот-лист",
  planning: "План съёмок",
  casting: "Кастинг",
  locations: "Локации",
  risks: "Риски",
  chat: "Режиссёр",
};
