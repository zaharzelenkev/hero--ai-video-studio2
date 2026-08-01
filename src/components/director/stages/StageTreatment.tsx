"use client";

import StageShell, { SectionTitle, TextArea, BulletList } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage } from "@/lib/production";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StageTreatment({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const t = preprod.treatment;
  const set = (patch: Partial<typeof t>) => updatePreprod((p) => ({ ...p, treatment: { ...p.treatment, ...patch } }));

  return (
    <StageShell
      icon="📖"
      title="Treatment — Тритмент"
      subtitle="Полноценное описание проекта в традициях кино- и рекламной индустрии: жанр, темы, трёхактовая структура, персонажи и ключевые моменты."
      onRegenerate={() => onRegenerate("treatment")}
      busy={busy}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Рабочее название</SectionTitle>
          <input value={t.title} onChange={(e) => set({ title: e.target.value })}
            className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2.5 text-sm font-bold text-slate-100 outline-none focus:border-violet-400/50" />
        </div>
        <div>
          <SectionTitle>Жанр / формат</SectionTitle>
          <input value={t.genre} onChange={(e) => set({ genre: e.target.value })}
            className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400/50" />
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle>Логлайн в тритменте</SectionTitle>
        <TextArea value={t.logline} onChange={(v) => set({ logline: v })} rows={2} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Тон</SectionTitle>
          <input value={t.tone} onChange={(e) => set({ tone: e.target.value })}
            className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400/50" />
        </div>
        <div>
          <SectionTitle>Сквозные темы</SectionTitle>
          <BulletList items={t.themes} onChange={(v) => set({ themes: v })} />
        </div>
      </div>

      <SectionTitle>Развёрнутый синопсис</SectionTitle>
      <TextArea value={t.synopsisLong} onChange={(v) => set({ synopsisLong: v })} rows={6} />

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <SectionTitle>Акт 1 — Завязка</SectionTitle>
          <TextArea value={t.act1} onChange={(v) => set({ act1: v })} rows={7} />
        </div>
        <div>
          <SectionTitle>Акт 2 — Развитие</SectionTitle>
          <TextArea value={t.act2} onChange={(v) => set({ act2: v })} rows={7} />
        </div>
        <div>
          <SectionTitle>Акт 3 — Кульминация и финал</SectionTitle>
          <TextArea value={t.act3} onChange={(v) => set({ act3: v })} rows={7} />
        </div>
      </div>

      <SectionTitle>Персонажи</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {t.characters.map((c, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <input
              value={c.name}
              onChange={(e) => {
                const ch = [...t.characters]; ch[i] = { ...ch[i], name: e.target.value }; set({ characters: ch });
              }}
              className="mb-2 w-full rounded bg-transparent text-sm font-bold text-slate-100 outline-none"
              placeholder="Имя/роль"
            />
            <input
              value={c.role}
              onChange={(e) => {
                const ch = [...t.characters]; ch[i] = { ...ch[i], role: e.target.value }; set({ characters: ch });
              }}
              className="mb-2 w-full rounded bg-black/30 px-2 py-1 text-[12px] text-slate-300 outline-none"
              placeholder="Функция в истории"
            />
            <textarea
              value={c.description}
              onChange={(e) => {
                const ch = [...t.characters]; ch[i] = { ...ch[i], description: e.target.value }; set({ characters: ch });
              }}
              rows={3}
              className="w-full resize-none rounded border border-white/10 bg-black/30 p-2 text-[12px] text-slate-300 outline-none focus:border-violet-400/50"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Ключевые моменты</SectionTitle>
          <BulletList items={t.keyMoments} onChange={(v) => set({ keyMoments: v })} />
        </div>
        <div>
          <SectionTitle>Финал / послевкусие</SectionTitle>
          <TextArea value={t.ending} onChange={(v) => set({ ending: v })} rows={5} />
        </div>
      </div>
    </StageShell>
  );
}
