"use client";

import { useRouter } from "next/navigation";
import { useProjectStore } from "@/store/projectStore";

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
      <div className="overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-900/40 via-[#0d0d16] to-fuchsia-900/30 p-5 shadow-2xl shadow-violet-900/20">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-2xl shadow-xl shadow-violet-900/40">
            🎬
          </div>
          <div>
            <h3 className="text-sm font-bold text-violet-100">AI Director — отдельный этап</h3>
            <p className="text-[10px] text-slate-400">Пре-продакшен до монтажа</p>
          </div>
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-slate-300">
          AI Director теперь работает как самостоятельный этап создания проекта. Заполните
          production brief — и он подготовит логлайн, сценарий, режиссёрскую концепцию,
          раскадровку, shot list и рекомендации по музыке, цвету, монтажу, титрам и переходам.
        </p>
        <button
          onClick={() => id && router.push(`/director/${id}`)}
          disabled={!id}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-xs font-extrabold text-white shadow-lg shadow-violet-900/40 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
        >
          Открыть AI Director →
        </button>
        {project?.director && (
          <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-300">
            ✓ Производственный план уже сохранён для этого проекта.
          </div>
        )}
      </div>
    </div>
  );
}
