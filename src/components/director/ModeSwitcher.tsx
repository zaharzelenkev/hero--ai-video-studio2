"use client";

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
      className="flex shrink-0 items-center rounded-full border border-white/[0.09] bg-white/[0.03] p-1 shadow-lg shadow-black/20 backdrop-blur-xl"
      role="group"
      aria-label="Режим AI Director"
    >
      <button
        type="button"
        onClick={() => onChange("basic")}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold transition-all ${
          mode === "basic"
            ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/40"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title="Режиссёр сам ведёт вас вопросами в чате — без форм и вкладок"
      >
        <span className="text-sm leading-none">🧭</span>
        <span className="hidden sm:inline">Базовый</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("pro")}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold transition-all ${
          mode === "pro"
            ? "bg-gradient-to-r from-amber-500 to-orange-400 text-black shadow-lg shadow-amber-900/40"
            : "text-slate-400 hover:text-slate-200"
        }`}
        title="Полный Production Workspace: все разделы можно редактировать вручную"
      >
        <span className="text-sm leading-none">🎬</span>
        <span className="hidden sm:inline">Профессиональный</span>
      </button>
    </div>
  );
}
