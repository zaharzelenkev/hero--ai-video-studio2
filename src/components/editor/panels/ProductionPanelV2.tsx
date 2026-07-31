"use client";

import { useProjectStore } from "@/store/projectStore";
import { createProductionPlan } from "@/lib/production";

export default function ProductionPanelV2() {
  const project = useProjectStore((state) => state.project);
  const updateProject = useProjectStore((state) => state.updateProject);
  if (!project) return null;
  const plan = project.production ?? createProductionPlan({ idea: project.style.rawPrompt || project.title, assets: project.assets });

  const update = (key: "workingTitle" | "keyMessage" | "callToAction", value: string) => {
    updateProject((current) => ({ ...current, production: { ...plan, [key]: value, updatedAt: Date.now() } }));
  };
  const approve = () => updateProject((current) => ({ ...current, production: { ...plan, status: "approved", updatedAt: Date.now() } }));

  return <div className="space-y-5 p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-400">Production room</p><h2 className="mt-1 text-lg font-bold">Режиссёрский план</h2></div>
      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${plan.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{plan.status === "approved" ? "Согласован" : "Черновик"}</span>
    </div>
    <label className="block text-xs text-slate-400">Рабочее название<input value={plan.workingTitle} onChange={(e) => update("workingTitle", e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400" /></label>
    <label className="block text-xs text-slate-400">Главное сообщение<textarea value={plan.keyMessage} onChange={(e) => update("keyMessage", e.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400" /></label>
    <label className="block text-xs text-slate-400">CTA<input value={plan.callToAction} onChange={(e) => update("callToAction", e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400" /></label>
    <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-slate-300"><p className="font-semibold text-white">Формат: {plan.aspectRatio} · {plan.targetDurationSec} сек.</p><p className="mt-1 text-slate-400">Аудитория: {plan.audience}</p></div>
    <div className="space-y-2">{plan.scenes.map((scene, index) => <details key={scene.id} className="rounded-xl border border-white/10 bg-white/[.02] p-3"><summary className="cursor-pointer list-none text-xs font-semibold text-white"><span className="mr-2 text-violet-400">{String(index + 1).padStart(2, "0")}</span>{scene.title} <span className="float-right text-slate-500">{scene.durationSec}с</span></summary><p className="mt-2 text-xs leading-relaxed text-slate-400">{scene.narration}</p><p className="mt-2 text-[11px] text-slate-500">Кадры: {scene.shots.join(" · ")}</p><p className="mt-1 text-[11px] text-slate-500">Монтаж: {scene.editNote}</p></details>)}</div>
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-[11px] text-slate-400">{plan.productionNotes.map((note) => <p key={note} className="mb-1 last:mb-0">• {note}</p>)}</div>
    <button onClick={approve} className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2.5 text-xs font-bold text-white">Утвердить план для монтажа</button>
  </div>;
}
