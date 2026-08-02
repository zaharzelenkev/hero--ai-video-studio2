"use client";

import StageShell, { SectionTitle } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage, RiskItem } from "@/lib/production";
import { uid } from "@/lib/id";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

const SEVERITIES: Array<RiskItem["severity"]> = ["low", "medium", "high", "critical"];
const CATEGORIES: Array<RiskItem["category"]> = ["сценарий", "съёмка", "кастинг", "локация", "техника", "время", "бюджет", "другое"];

const sevColor: Record<RiskItem["severity"], string> = {
  low: "bg-sky-500/20 text-sky-200 border-sky-400/30",
  medium: "bg-amber-500/20 text-amber-200 border-amber-400/30",
  high: "bg-orange-500/20 text-orange-200 border-orange-400/30",
  critical: "bg-rose-500/20 text-rose-200 border-rose-400/30",
};

export default function StageRisks({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const r = preprod.risks;
  const set = (patch: Partial<typeof r>) => updatePreprod((p) => ({ ...p, risks: { ...p.risks, ...patch } }));

  const addRisk = () => set({
    risks: [...r.risks, { id: uid("risk"), severity: "medium", category: "другое", description: "", mitigation: "" }],
  });

  const updateRisk = (id: string, patch: Partial<RiskItem>) =>
    set({ risks: r.risks.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  const removeRisk = (id: string) => set({ risks: r.risks.filter((x) => x.id !== id) });

  return (
    <StageShell
      icon="⚠️"
      title="Production Risks — Риски производства"
      subtitle="AI заранее предупреждает, чего не хватает, какие сцены слабые и какие проблемы могут возникнуть на съёмке — и как их избежать."
      onRegenerate={() => onRegenerate("risks")}
      busy={busy}
      actions={
        <button onClick={addRisk} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]">
          + Риск
        </button>
      }
    >
      <div className="mb-5 rounded-2xl border border-white/10 bg-violet-500/[0.05] p-5">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Общая готовность</div>
            <div className="text-3xl font-black text-slate-100">{r.readiness}%</div>
          </div>
          <div className="h-3 w-48 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full ${r.readiness >= 75 ? "bg-emerald-400" : r.readiness >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${r.readiness}%` }} />
          </div>
        </div>
        <input type="range" min={0} max={100} value={r.readiness} onChange={(e) => set({ readiness: Number(e.target.value) })} className="w-full accent-violet-500" />
      </div>

      <SectionTitle>Чего не хватает</SectionTitle>
      <ul className="mb-4 space-y-1.5">
        {r.missingItems.map((m, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-rose-200">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
            <input
              value={m}
              onChange={(e) => set({ missingItems: r.missingItems.map((x, j) => (j === i ? e.target.value : x)) })}
              className="flex-1 rounded bg-transparent px-2 py-0.5 outline-none focus:bg-black/30"
            />
            <button onClick={() => set({ missingItems: r.missingItems.filter((_, j) => j !== i) })} className="text-[10px] text-slate-500 hover:text-rose-300">✕</button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => set({ missingItems: [...r.missingItems, ""] })}
        className="mb-5 w-full rounded-lg border border-dashed border-white/20 py-1.5 text-[11px] font-semibold text-slate-400 hover:bg-white/[0.04]"
      >+ пункт</button>

      <SectionTitle>Слабые сцены</SectionTitle>
      <div className="mb-5 space-y-2">
        {r.weakScenes.map((w, i) => (
          <div key={i} className="flex gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
            <input
              value={w.sceneId}
              onChange={(e) => set({ weakScenes: r.weakScenes.map((x, j) => (j === i ? { ...x, sceneId: e.target.value } : x)) })}
              placeholder="Сцена"
              className="w-32 rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
            />
            <input
              value={w.reason}
              onChange={(e) => set({ weakScenes: r.weakScenes.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)) })}
              placeholder="Причина"
              className="flex-1 rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
            />
            <button onClick={() => set({ weakScenes: r.weakScenes.filter((_, j) => j !== i) })} className="text-[10px] text-slate-500 hover:text-rose-300">✕</button>
          </div>
        ))}
        <button
          onClick={() => set({ weakScenes: [...r.weakScenes, { sceneId: "", reason: "" }] })}
          className="w-full rounded-lg border border-dashed border-white/20 py-1.5 text-[11px] font-semibold text-slate-400 hover:bg-white/[0.04]"
        >+ сцена</button>
      </div>

      <SectionTitle>Риски и их предотвращение</SectionTitle>
      <div className="space-y-3">
        {r.risks.map((rk) => (
          <div key={rk.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select value={rk.severity} onChange={(e) => updateRisk(rk.id, { severity: e.target.value as RiskItem["severity"] })}
                className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${sevColor[rk.severity]} bg-black/30 outline-none`}>
                {SEVERITIES.map((s) => <option key={s} value={s} className="bg-[#0c0c16] text-slate-200">{s}</option>)}
              </select>
              <select value={rk.category} onChange={(e) => updateRisk(rk.id, { category: e.target.value as RiskItem["category"] })}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-slate-200 outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c} className="bg-[#0c0c16]">{c}</option>)}
              </select>
              <button onClick={() => removeRisk(rk.id)}
                className="ml-auto rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-200 hover:bg-rose-500/20">✕</button>
            </div>
            <textarea value={rk.description} onChange={(e) => updateRisk(rk.id, { description: e.target.value })} rows={2}
              className="mb-2 w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50"
              placeholder="Описание риска" />
            <textarea value={rk.mitigation} onChange={(e) => updateRisk(rk.id, { mitigation: e.target.value })} rows={2}
              className="w-full resize-none rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2 text-[12px] text-emerald-100 outline-none focus:border-emerald-400/40"
              placeholder="Как избежать / что делать" />
          </div>
        ))}
      </div>
    </StageShell>
  );
}
