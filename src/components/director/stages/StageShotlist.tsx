"use client";

import StageShell, { SectionTitle } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage, ShotItem } from "@/lib/production";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

const PRIORITIES: Array<ShotItem["priority"]> = ["critical", "high", "medium", "low"];

export default function StageShotlist({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const sl = preprod.shotlist;
  const set = (patch: Partial<typeof sl>) =>
    updatePreprod((p) => ({ ...p, shotlist: { ...p.shotlist, ...patch } }));
  const addShot = () =>
    set({
      totalShots: sl.shots.length + 1,
      shots: [
        ...sl.shots,
        {
          number: sl.shots.length + 1,
          description: "",
          shotType: "MS",
          camera: "Камера",
          lens: "35mm f/2.0",
          movement: "static",
          equipment: [],
          props: [],
          duration: "3 сек",
          priority: "medium",
          location: "",
        },
      ],
    });
  const removeShot = (n: number) => {
    const shots = sl.shots.filter((s) => s.number !== n).map((s, i) => ({ ...s, number: i + 1 }));
    set({ shots, totalShots: shots.length });
  };
  const updateShot = (n: number, patch: Partial<ShotItem>) => {
    set({ shots: sl.shots.map((s) => (s.number === n ? { ...s, ...patch } : s)) });
  };

  const priorityColor = (p: ShotItem["priority"]) =>
    p === "critical" ? "bg-rose-500/20 text-rose-200 border-rose-400/30" :
    p === "high" ? "bg-amber-500/20 text-amber-200 border-amber-400/30" :
    p === "medium" ? "bg-sky-500/20 text-sky-200 border-sky-400/30" :
    "bg-slate-500/20 text-slate-300 border-slate-400/30";

  return (
    <StageShell
      icon="📋"
      title="Shot List — Шот-лист"
      subtitle="Профессиональный список всех планов с номером, описанием, типом, камерой, движением, оборудованием, реквизитом, длительностью и приоритетом."
      onRegenerate={() => onRegenerate("shotlist")}
      busy={busy}
      actions={
        <button onClick={addShot} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]">
          + План
        </button>
      }
    >
      <div className="mb-3 grid gap-3 md:grid-cols-2">
        <div>
          <SectionTitle>Всего планов</SectionTitle>
          <input
            type="number"
            value={sl.totalShots}
            onChange={(e) => set({ totalShots: Number(e.target.value) || 0 })}
            className="w-32 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400/50"
          />
        </div>
        <div>
          <SectionTitle>Оценка времени съёмок</SectionTitle>
          <input
            value={sl.estimatedTime}
            onChange={(e) => set({ estimatedTime: e.target.value })}
            className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400/50"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-[11px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">План</th>
              <th className="py-2 pr-2">Тип</th>
              <th className="py-2 pr-2">Камера</th>
              <th className="py-2 pr-2">Объектив</th>
              <th className="py-2 pr-2">Движение</th>
              <th className="py-2 pr-2">Оборудование</th>
              <th className="py-2 pr-2">Реквизит</th>
              <th className="py-2 pr-2">Длит.</th>
              <th className="py-2 pr-2">Приоритет</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {sl.shots.map((s) => (
              <tr key={s.number} className="align-top">
                <td className="py-2 pr-2 font-bold text-slate-300">{s.number}</td>
                <td className="py-2 pr-2"><textarea value={s.description} onChange={(e) => updateShot(s.number, { description: e.target.value })} rows={2} className={cell} /></td>
                <td className="py-2 pr-2"><input value={s.shotType} onChange={(e) => updateShot(s.number, { shotType: e.target.value })} className={cell} /></td>
                <td className="py-2 pr-2"><input value={s.camera} onChange={(e) => updateShot(s.number, { camera: e.target.value })} className={cell} /></td>
                <td className="py-2 pr-2"><input value={s.lens} onChange={(e) => updateShot(s.number, { lens: e.target.value })} className={cell} /></td>
                <td className="py-2 pr-2"><input value={s.movement} onChange={(e) => updateShot(s.number, { movement: e.target.value })} className={cell} /></td>
                <td className="py-2 pr-2"><input value={s.equipment.join(", ")} onChange={(e) => updateShot(s.number, { equipment: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className={cell} placeholder="через запятую" /></td>
                <td className="py-2 pr-2"><input value={s.props.join(", ")} onChange={(e) => updateShot(s.number, { props: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className={cell} placeholder="через запятую" /></td>
                <td className="py-2 pr-2"><input value={s.duration} onChange={(e) => updateShot(s.number, { duration: e.target.value })} className={`${cell} w-20`} /></td>
                <td className="py-2 pr-2">
                  <select value={s.priority} onChange={(e) => updateShot(s.number, { priority: e.target.value as ShotItem["priority"] })} className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${priorityColor(s.priority)} bg-black/30 outline-none`}>
                    {PRIORITIES.map((p) => <option key={p} value={p} className="bg-[#0c0c16] text-slate-200">{p}</option>)}
                  </select>
                </td>
                <td className="py-2 pl-2">
                  <button onClick={() => removeShot(s.number)} className="rounded border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/20">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StageShell>
  );
}

const cell = "w-full rounded-md border border-white/10 bg-black/30 p-1.5 text-[11px] text-slate-200 outline-none focus:border-violet-400/50";
