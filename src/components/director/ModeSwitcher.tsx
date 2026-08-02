"use client";

import { Icon } from "@/components/ui/Icon";

export type DirectorMode = "basic" | "pro";

interface Props {
  mode: DirectorMode;
  onChange: (mode: DirectorMode) => void;
}

/**
 * Переключатель режимов AI Director (слева сверху).
 *
 * - Базовый режим — режиссёр ведёт пользователя вопросами в чате,
 *   внутренняя структура препродакшена скрыта.
 * - Профессиональный режим — полный Production Workspace со всеми
 *   разделами (Logline, Treatment, Storyboard, Shot List и т.д.).
 */
export default function ModeSwitcher({ mode, onChange }: Props) {
  return (
    <div
      className="flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-1 shadow-lg shadow-black/20 backdrop-blur-xl"
      role="group"
      aria-label="Режим AI Director"
    >
      <button
        type="button"
        onClick={() => onChange("basic")}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-all ${
          mode === "basic"
            ? "bg-violet-500/20 text-white ring-1 ring-violet-400/50 shadow-[0_4px_20px_-6px_rgba(124,108,246,0.6)]"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title="Режиссёр сам ведёт вас вопросами в чате — без форм и вкладок"
      >
        <Icon name="compass" size={14} className={mode === "basic" ? "text-violet-200" : ""} />
        <span className="hidden sm:inline">Базовый</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("pro")}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-all ${
          mode === "pro"
            ? "bg-violet-500/20 text-white ring-1 ring-violet-400/50 shadow-[0_4px_20px_-6px_rgba(124,108,246,0.6)]"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title="Полный Production Workspace: все разделы можно редактировать вручную"
      >
        <Icon name="layout" size={14} className={mode === "pro" ? "text-violet-200" : ""} />
        <span className="hidden sm:inline">Профессиональный</span>
      </button>
    </div>
  );
}
