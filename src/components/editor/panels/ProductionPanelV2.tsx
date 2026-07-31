"use client";

import { useProjectStore } from "@/store/projectStore";
import { createProductionPlan } from "@/lib/production";

export default function ProductionPanelV2() {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  if (!project) return null;
  const plan = project.production ?? createProductionPlan({ idea: project.style.rawPrompt || project.title, assets: project.assets });
  const dPlan = project.directorPlan;

  const update = (key: "workingTitle" | "keyMessage" | "callToAction", value: string) => {
    updateProject((current) => ({ ...current, production: { ...plan, [key]: value, updatedAt: Date.now() } }));
  };
  const approve = () => updateProject((current) => ({ ...current, production: { ...plan, status: "approved", updatedAt: Date.now() } }));

  return <div className="space-y-5 p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-400">Production room</p><h2 className="mt-1 text-lg font-bold">Режиссёрский план</h2></div>
      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${plan.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{plan.status === "approved" ? "Согласован" : "Черновик"}</span>
    </div>

    {dPlan && (
      <div className="space-y-3 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-fuchsia-300">AI Director · план монтажа</p>
          <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold text-fuchsia-200">{dPlan.genre}</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-200">{dPlan.concept}</p>

        {/* Драматургическая арка */}
        <div className="space-y-1.5">
          {dPlan.dramaturgy.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-slate-400" title={s.note}>
              <span className="w-16 shrink-0 font-semibold capitalize text-slate-300">{s.phase}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded bg-white/5">
                <div className="h-full rounded bg-gradient-to-r from-fuchsia-500 to-violet-500" style={{ width: `${Math.round(Math.min(1, s.intensity) * 100)}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right tabular-nums">{s.start.toFixed(1)}–{s.end.toFixed(1)}с</span>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-[11px] text-slate-400">
          <p>Кульминация: <span className="text-slate-200">{dPlan.climaxAt.toFixed(1)}с</span>{dPlan.music.climaxAlignedToDrop ? " · на дропе музыки 🎯" : ""}</p>
          <p>Музыка: {dPlan.music.strategy}</p>
          <p>Сцен: {dPlan.scenes.length} · перебивок: {dPlan.scenes.reduce((a, s) => a + s.bRolls.length, 0)} · слабых мест обработано: {dPlan.weakMomentsHandled.length}</p>
        </div>

        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer font-semibold text-fuchsia-300">Заметки режиссёра ({dPlan.directorNotes.length})</summary>
          <ul className="mt-1.5 space-y-1">{dPlan.directorNotes.map((n, i) => <li key={i} className="leading-relaxed">• {n}</li>)}</ul>
        </details>

        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer font-semibold text-fuchsia-300">Сцены плана ({dPlan.scenes.length})</summary>
          <div className="mt-1.5 space-y-1.5">
            {dPlan.scenes.map((sc, i) => (
              <div key={sc.id} className="rounded-lg border border-white/10 bg-white/[.02] p-2">
                <p className="text-slate-200">
                  {String(i + 1).padStart(2, "0")} · <span className="font-semibold">{sc.phase}</span> · {sc.duration.toFixed(1)}с
                  {sc.source.speed !== 1 && <span className="text-amber-300"> · ×{sc.source.speed}</span>}
                  {sc.transitionIn && sc.transitionIn.type !== "cut" && <span className="text-violet-300"> · {sc.transitionIn.type}</span>}
                  {sc.bRolls.length > 0 && <span className="text-emerald-300"> · B-Roll ×{sc.bRolls.length}</span>}
                </p>
                <p className="mt-0.5 text-slate-500">{sc.why}</p>
              </div>
            ))}
          </div>
        </details>
      </div>
    )}

    <label className="block text-xs text-slate-400">Рабочее название<input value={plan.workingTitle} onChange={(e) => update("workingTitle", e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400" /></label>
    <label className="block text-xs text-slate-400">Главное сообщение<textarea value={plan.keyMessage} onChange={(e) => update("keyMessage", e.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400" /></label>
    <label className="block text-xs text-slate-400">CTA<input value={plan.callToAction} onChange={(e) => update("callToAction", e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400" /></label>
    <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-slate-300"><p className="font-semibold text-white">Формат: {plan.aspectRatio} · {plan.targetDurationSec} сек.</p><p className="mt-1 text-slate-400">Аудитория: {plan.audience}</p></div>
    <div className="space-y-2">{plan.scenes.map((scene, index) => <details key={scene.id} className="rounded-xl border border-white/10 bg-white/[.02] p-3"><summary className="cursor-pointer list-none text-xs font-semibold text-white"><span className="mr-2 text-violet-400">{String(index + 1).padStart(2, "0")}</span>{scene.title} <span className="float-right text-slate-500">{scene.durationSec}с</span></summary><p className="mt-2 text-xs leading-relaxed text-slate-400">{scene.narration}</p><p className="mt-2 text-[11px] text-slate-500">Кадры: {scene.shots.join(" · ")}</p><p className="mt-1 text-[11px] text-slate-500">Монтаж: {scene.editNote}</p></details>)}</div>
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-[11px] text-slate-400">{plan.productionNotes.map((note) => <p key={note} className="mb-1 last:mb-0">• {note}</p>)}</div>
    <button onClick={approve} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2.5 text-xs font-bold text-white">Утвердить план для монтажа</button>
  </div>;
}
