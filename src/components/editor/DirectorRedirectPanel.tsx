"use client";

import { useRouter } from "next/navigation";
import { useProjectStore } from "@/store/projectStore";
import { Icon } from "@/components/ui/Icon";

/**
 * The full AI Director now lives in its own stage of project creation at
 * /director/[id]. Inside the editor we surface a clean hand-off card instead
 * of an in-editor assistant, so AI Director stays a separate product step.
 */
export default function DirectorRedirectPanel() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const id = project?.id;

  return (
    <div className="space-y-3">
      <div className="surface-card relative overflow-hidden rounded-[18px] p-5">
        <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-violet-600/20 blur-[70px]" />
        <div className="relative mb-3 flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(180deg,#8b7cff,#5c4bd8)", boxShadow: "0 12px 30px -8px rgba(124,108,246,0.5)" }}
          >
            <Icon name="clapper" size={24} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <h3 className="title text-sm text-slate-100">AI Director — отдельный этап</h3>
            <p className="text-[10px] text-slate-400">Пре-продакшен до монтажа</p>
          </div>
        </div>
        <p className="relative mb-4 text-[11px] leading-relaxed text-slate-400">
          AI Director теперь работает как самостоятельный этап создания проекта. Заполните
          production brief — и он подготовит логлайн, сценарий, режиссёрскую концепцию,
          раскадровку, shot list и рекомендации по музыке, цвету, монтажу, титрам и переходам.
        </p>
        <button
          onClick={() => id && router.push(`/director/${id}`)}
          disabled={!id}
          className="btn btn-primary w-full px-4 py-3 text-xs"
        >
          Открыть AI Director
          <Icon name="arrow-right" size={14} />
        </button>
        {project?.director && (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.08] px-3 py-2 text-[10px] text-emerald-300">
            <Icon name="check" size={12} />
            Производственный план уже сохранён для этого проекта.
          </div>
        )}
      </div>
    </div>
  );
}
