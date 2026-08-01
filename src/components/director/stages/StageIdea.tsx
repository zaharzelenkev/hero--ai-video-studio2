"use client";

import StageShell, { SectionTitle, TextArea, NumberSlider, ScoreBadge, BulletList } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage, IdeaVariant } from "@/lib/production";
import { uid } from "@/lib/id";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StageIdea({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const idea = preprod.idea;

  const set = (patch: Partial<typeof idea>) => updatePreprod((p) => ({ ...p, idea: { ...p.idea, ...patch } }));

  const selectVariant = (v: IdeaVariant) => {
    updatePreprod((p) => ({
      ...p,
      idea: { ...p.idea, refined: v.concept, potential: v.potential },
    }));
  };

  const addVariant = () =>
    updatePreprod((p) => ({
      ...p,
      idea: {
        ...p.idea,
        variants: [...p.idea.variants, { id: uid("iv"), title: "Новый вариант", concept: "", audience: "", hook: "", potential: 5, reasoning: "" }],
      },
    }));

  return (
    <StageShell
      icon="💡"
      title="Idea — Замысел"
      subtitle="AI помогает сформулировать тему, определить целевую аудиторию, предложить варианты, улучшить идею и оценить её потенциал."
      onRegenerate={() => onRegenerate("idea")}
      busy={busy}
      actions={
        <button
          onClick={addVariant}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 transition hover:bg-white/[0.08]"
        >
          + Вариант
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Уточнённая идея</SectionTitle>
          <TextArea value={idea.refined} onChange={(v) => set({ refined: v })} rows={5} />
        </div>
        <div>
          <SectionTitle>Целевая аудитория</SectionTitle>
          <TextArea value={idea.audience} onChange={(v) => set({ audience: v })} rows={5} />
          <div className="mt-4">
            <NumberSlider label="Потенциал" value={idea.potential} onChange={(v) => set({ potential: v })} min={1} max={10} />
            <div className="mt-1 text-right">
              <ScoreBadge value={idea.potential} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Сильные стороны</SectionTitle>
          <BulletList items={idea.pros} onChange={(v) => set({ pros: v })} />
        </div>
        <div>
          <SectionTitle>Слабые стороны</SectionTitle>
          <BulletList items={idea.cons} onChange={(v) => set({ cons: v })} />
        </div>
      </div>

      <SectionTitle>Варианты идеи (выберите или отредактируйте)</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">
        {idea.variants.map((v) => (
          <div key={v.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-violet-400/40">
            <div className="mb-2 flex items-start justify-between gap-2">
              <input
                value={v.title}
                onChange={(e) => {
                  const variants = idea.variants.map((x) => x.id === v.id ? { ...x, title: e.target.value } : x);
                  set({ variants });
                }}
                className="w-full rounded bg-transparent text-sm font-bold text-slate-100 outline-none"
              />
              <ScoreBadge value={v.potential} />
            </div>
            <textarea
              value={v.concept}
              onChange={(e) => {
                const variants = idea.variants.map((x) => x.id === v.id ? { ...x, concept: e.target.value } : x);
                set({ variants });
              }}
              rows={3}
              className="w-full resize-none rounded border border-white/10 bg-black/30 p-2 text-[12px] text-slate-300 outline-none focus:border-violet-400/50"
              placeholder="Концепция"
            />
            <div className="mt-2 text-[11px] text-slate-400">
              <b className="text-slate-300">Аудитория:</b>{" "}
              <input
                value={v.audience}
                onChange={(e) => {
                  const variants = idea.variants.map((x) => x.id === v.id ? { ...x, audience: e.target.value } : x);
                  set({ variants });
                }}
                className="w-full rounded bg-transparent text-[12px] text-slate-300 outline-none"
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              <b className="text-slate-300">Хук:</b>{" "}
              <input
                value={v.hook}
                onChange={(e) => {
                  const variants = idea.variants.map((x) => x.id === v.id ? { ...x, hook: e.target.value } : x);
                  set({ variants });
                }}
                className="w-full rounded bg-transparent text-[12px] text-slate-300 outline-none"
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <input
                type="range"
                min={1}
                max={10}
                value={v.potential}
                onChange={(e) => {
                  const variants = idea.variants.map((x) => x.id === v.id ? { ...x, potential: Number(e.target.value) } : x);
                  set({ variants });
                }}
                className="flex-1 accent-violet-500"
              />
              <button onClick={() => selectVariant(v)} className="ml-2 rounded-full bg-violet-500/20 px-2 py-1 text-[10px] font-bold text-violet-100 hover:bg-violet-500/30">
                Взять за основу
              </button>
            </div>
          </div>
        ))}
      </div>
    </StageShell>
  );
}
