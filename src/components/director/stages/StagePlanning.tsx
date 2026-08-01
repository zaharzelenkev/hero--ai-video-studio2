"use client";

import StageShell, { SectionTitle, BulletList, TextArea } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage } from "@/lib/production";
import { uid } from "@/lib/id";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StagePlanning({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const pl = preprod.planning;
  const set = (patch: Partial<typeof pl>) =>
    updatePreprod((p) => ({ ...p, planning: { ...p.planning, ...patch } }));

  const addDay = () =>
    set({
      schedule: [
        ...pl.schedule,
        { day: pl.schedule.length + 1, location: "", scenes: [], shots: [], callTime: "09:00", wrapTime: "19:00", notes: [] },
      ],
    });

  const addChecklist = () =>
    set({
      checklists: [
        ...pl.checklists,
        { id: uid("chk"), category: "Новый список", items: [] },
      ],
    });

  const addTask = () =>
    set({
      teamTasks: [
        ...pl.teamTasks,
        { assignee: "Команда", task: "", dueBy: "", done: false },
      ],
    });

  return (
    <StageShell
      icon="🗓"
      title="Production Planning — План съёмок"
      subtitle="График съёмочных дней, очередность сцен, чек-листы, реквизит, техника, команда, заметки режиссёра и задачи."
      onRegenerate={() => onRegenerate("planning")}
      busy={busy}
      actions={
        <div className="flex gap-2">
          <button onClick={addDay} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]">+ День</button>
          <button onClick={addChecklist} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]">+ Чек-лист</button>
          <button onClick={addTask} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]">+ Задача</button>
        </div>
      }
    >
      <SectionTitle>График съёмочных дней</SectionTitle>
      <div className="space-y-3">
        {pl.schedule.map((d, idx) => (
          <div key={idx} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">ДЕНЬ {d.day}</span>
              <input
                value={d.location}
                onChange={(e) => set({ schedule: pl.schedule.map((x, i) => i === idx ? { ...x, location: e.target.value } : x) })}
                placeholder="Локация"
                className="flex-1 rounded bg-black/30 px-3 py-1 text-[13px] font-bold text-slate-100 outline-none"
              />
              <label className="text-[10px] text-slate-500">Call</label>
              <input
                value={d.callTime}
                onChange={(e) => set({ schedule: pl.schedule.map((x, i) => i === idx ? { ...x, callTime: e.target.value } : x) })}
                className="w-20 rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
              />
              <label className="text-[10px] text-slate-500">Wrap</label>
              <input
                value={d.wrapTime}
                onChange={(e) => set({ schedule: pl.schedule.map((x, i) => i === idx ? { ...x, wrapTime: e.target.value } : x) })}
                className="w-20 rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Сцены</div>
                <TextArea
                  value={d.scenes.join("\n")}
                  onChange={(v) => set({ schedule: pl.schedule.map((x, i) => i === idx ? { ...x, scenes: v.split("\n").map((s) => s.trim()).filter(Boolean) } : x) })}
                  rows={3}
                />
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Заметки дня</div>
                <TextArea
                  value={d.notes.join("\n")}
                  onChange={(v) => set({ schedule: pl.schedule.map((x, i) => i === idx ? { ...x, notes: v.split("\n").map((s) => s.trim()).filter(Boolean) } : x) })}
                  rows={3}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Очерёдность сцен (хронология истории)</SectionTitle>
          <BulletList items={pl.sceneOrder} onChange={(v) => set({ sceneOrder: v })} />
        </div>
        <div>
          <SectionTitle>Заметки режиссёра</SectionTitle>
          <TextArea value={pl.directorNotes.join("\n")} onChange={(v) => set({ directorNotes: v.split("\n").map((x) => x.trim()).filter(Boolean) })} rows={8} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Реквизит</SectionTitle>
          <BulletList items={pl.props} onChange={(v) => set({ props: v })} />
        </div>
        <div>
          <SectionTitle>Техника и оборудование</SectionTitle>
          <BulletList items={pl.equipment} onChange={(v) => set({ equipment: v })} />
        </div>
      </div>

      <SectionTitle>Чек-листы</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {pl.checklists.map((cl) => (
          <div key={cl.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <input
              value={cl.category}
              onChange={(e) => set({ checklists: pl.checklists.map((x) => x.id === cl.id ? { ...x, category: e.target.value } : x) })}
              className="mb-2 w-full rounded bg-transparent text-sm font-bold text-slate-100 outline-none"
            />
            {cl.items.map((it, i) => (
              <label key={i} className="flex items-start gap-2 py-1 text-[12px] text-slate-300">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={(e) => set({ checklists: pl.checklists.map((x) => x.id === cl.id ? { ...x, items: x.items.map((y, j) => j === i ? { ...y, done: e.target.checked } : y) } : x) })}
                  className="mt-1 accent-violet-500"
                />
                <input
                  value={it.text}
                  onChange={(e) => set({ checklists: pl.checklists.map((x) => x.id === cl.id ? { ...x, items: x.items.map((y, j) => j === i ? { ...y, text: e.target.value } : y) } : x) })}
                  className="flex-1 rounded bg-transparent outline-none focus:bg-black/30"
                />
              </label>
            ))}
            <button
              onClick={() => set({ checklists: pl.checklists.map((x) => x.id === cl.id ? { ...x, items: [...x.items, { text: "", done: false }] } : x) })}
              className="mt-2 w-full rounded-lg border border-dashed border-white/20 py-1 text-[10px] font-semibold text-slate-400 hover:bg-white/[0.04]"
            >+ пункт</button>
          </div>
        ))}
      </div>

      <SectionTitle>Задачи команде</SectionTitle>
      <div className="space-y-2">
        {pl.teamTasks.map((t, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
            <input
              type="checkbox"
              checked={t.done}
              onChange={(e) => set({ teamTasks: pl.teamTasks.map((x, j) => j === i ? { ...x, done: e.target.checked } : x) })}
              className="accent-violet-500"
            />
            <input
              value={t.assignee}
              onChange={(e) => set({ teamTasks: pl.teamTasks.map((x, j) => j === i ? { ...x, assignee: e.target.value } : x) })}
              className="w-32 rounded bg-black/30 px-2 py-1 text-[12px] font-bold text-slate-200 outline-none"
              placeholder="Кто"
            />
            <input
              value={t.task}
              onChange={(e) => set({ teamTasks: pl.teamTasks.map((x, j) => j === i ? { ...x, task: e.target.value } : x) })}
              className="flex-1 rounded bg-black/30 px-3 py-1 text-[12px] text-slate-200 outline-none"
              placeholder="Задача"
            />
            <input
              value={t.dueBy}
              onChange={(e) => set({ teamTasks: pl.teamTasks.map((x, j) => j === i ? { ...x, dueBy: e.target.value } : x) })}
              className="w-32 rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
              placeholder="Срок"
            />
          </div>
        ))}
      </div>
    </StageShell>
  );
}
