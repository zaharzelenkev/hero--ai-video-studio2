"use client";

import type { ProductionPlan } from "@/lib/production";

const phaseLabel: Record<ProductionPlan["scenes"][number]["phase"], string> = {
  hook: "Хук", problem: "Контекст", solution: "Развитие", proof: "Доказательство", cta: "CTA",
};

export default function ProductionBlueprint({ plan }: { plan: ProductionPlan }) {
  return (
    <section className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/[0.045] p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">01 · Production blueprint</p>
          <h2 className="mt-1 text-sm font-bold text-white">{plan.workingTitle}</h2>
          <p className="mt-1 text-xs text-slate-400">{plan.aspectRatio} · до {plan.targetDurationSec} сек. · {plan.tone}</p>
        </div>
        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">Черновик режиссуры</span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-slate-300">{plan.keyMessage}</p>
      <div className="grid gap-2 sm:grid-cols-5">
        {plan.scenes.map((scene) => (
          <div key={scene.id} className="rounded-xl border border-white/10 bg-black/15 p-2.5">
            <div className="flex justify-between gap-2 text-[10px] font-bold text-violet-300"><span>{phaseLabel[scene.phase]}</span><span>{scene.durationSec}с</span></div>
            <p className="mt-1 text-[11px] font-semibold text-slate-200">{scene.title}</p>
            <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-slate-500">{scene.purpose}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-slate-500">План сохранится в проекте: в редакторе доступны сценарий, shot list и постановочные заметки.</p>
    </section>
  );
}
