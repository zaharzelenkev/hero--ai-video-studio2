"use client";

import StageShell, { SectionTitle, TextArea, BulletList } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage } from "@/lib/production";
import { uid } from "@/lib/id";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StageLogline({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const ll = preprod.logline;
  const set = (patch: Partial<typeof ll>) => updatePreprod((p) => ({ ...p, logline: { ...p.logline, ...patch } }));

  const selectVariant = (text: string) => set({ primary: text });

  return (
    <StageShell
      icon="🎯"
      title="Logline — Логлайн"
      subtitle="Одна фраза: герой, желание, препятствие и ставки. AI предлагает несколько вариантов с указанием сильных и слабых сторон."
      onRegenerate={() => onRegenerate("logline")}
      busy={busy}
    >
      <SectionTitle>Основной логлайн</SectionTitle>
      <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 to-amber-500/5 p-4">
        <TextArea value={ll.primary} onChange={(v) => set({ primary: v })} rows={3} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {[
          { key: "hero", label: "Герой" },
          { key: "goal", label: "Желание / цель" },
          { key: "conflict", label: "Препятствие" },
          { key: "stakes", label: "Ставки / результат" },
        ].map((f) => (
          <div key={f.key}>
            <SectionTitle>{f.label}</SectionTitle>
            <TextArea
              value={(ll as any)[f.key]}
              onChange={(v) => set({ [f.key]: v } as any)}
              rows={2}
            />
          </div>
        ))}
      </div>

      <SectionTitle>Варианты логлайна</SectionTitle>
      <div className="space-y-3">
        {ll.variants.map((v, idx) => (
          <div key={v.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Вариант {idx + 1}</span>
              <button onClick={() => selectVariant(v.text)} className="rounded-full bg-violet-500/20 px-3 py-1 text-[10px] font-bold text-violet-100 hover:bg-violet-500/30">
                Сделать основным
              </button>
            </div>
            <TextArea value={v.text} onChange={(t) => {
              const variants = ll.variants.map((x) => x.id === v.id ? { ...x, text: t } : x);
              set({ variants });
            }} rows={2} />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Сильные стороны</div>
                <BulletList items={v.strengths} onChange={(items) => {
                  const variants = ll.variants.map((x) => x.id === v.id ? { ...x, strengths: items } : x);
                  set({ variants });
                }} />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-rose-300">Слабые стороны</div>
                <BulletList items={v.weaknesses} onChange={(items) => {
                  const variants = ll.variants.map((x) => x.id === v.id ? { ...x, weaknesses: items } : x);
                  set({ variants });
                }} />
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={() => set({ variants: [...ll.variants, { id: uid("lv"), text: "", strengths: [], weaknesses: [] }] })}
          className="w-full rounded-xl border border-dashed border-white/20 bg-white/[0.02] py-2 text-[11px] font-semibold text-slate-400 hover:bg-white/[0.05]"
        >
          + Добавить вариант
        </button>
      </div>
    </StageShell>
  );
}
