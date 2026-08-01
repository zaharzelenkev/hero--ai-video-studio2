"use client";

import StageShell, { SectionTitle, TextArea } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage, ScriptScene } from "@/lib/production";
import { uid } from "@/lib/id";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StageScript({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const s = preprod.script;
  const set = (patch: Partial<typeof s>) => updatePreprod((p) => ({ ...p, script: { ...p.script, ...patch } }));

  const updateScene = (id: string, patch: Partial<ScriptScene>) => {
    set({ scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)) });
  };
  const addScene = () =>
    set({
      scenes: [
        ...s.scenes,
        {
          id: uid("sc"),
          number: s.scenes.length + 1,
          heading: "ИНТ./ЭКСТ. НОВАЯ ЛОКАЦИЯ — ДЕНЬ",
          location: "",
          timeOfDay: "день",
          action: "",
          dialogue: [],
          durationSec: 5,
        },
      ],
    });
  const removeScene = (id: string) =>
    set({ scenes: s.scenes.filter((sc) => sc.id !== id).map((sc, i) => ({ ...sc, number: i + 1 })) });

  return (
    <StageShell
      icon="📜"
      title="Script — Сценарий"
      subtitle="Концепция, синопсис, покадровый сценарий и финальная версия — всё редактируется. При изменении здесь автоматически перестраиваются vision/storyboard/shot-list."
      onRegenerate={() => onRegenerate("script")}
      busy={busy}
      actions={
        <button
          onClick={addScene}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 transition hover:bg-white/[0.08]"
        >
          + Сцена
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Концепция</SectionTitle>
          <TextArea value={s.concept} onChange={(v) => set({ concept: v })} rows={4} />
        </div>
        <div>
          <SectionTitle>Синопсис</SectionTitle>
          <TextArea value={s.synopsis} onChange={(v) => set({ synopsis: v })} rows={4} />
        </div>
      </div>

      <SectionTitle>Сцены</SectionTitle>
      <div className="space-y-4">
        {s.scenes.map((sc) => (
          <div key={sc.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">Сцена {sc.number}</span>
              <input
                value={sc.heading}
                onChange={(e) => updateScene(sc.id, { heading: e.target.value })}
                className="flex-1 rounded bg-transparent text-[13px] font-bold text-slate-100 outline-none"
              />
              <span className="text-[11px] text-slate-500">~</span>
              <input
                type="number"
                value={sc.durationSec}
                min={1}
                max={60}
                onChange={(e) => updateScene(sc.id, { durationSec: Math.max(1, Number(e.target.value) || 1) })}
                className="w-14 rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
              />
              <span className="text-[11px] text-slate-500">сек</span>
              <button
                onClick={() => removeScene(sc.id)}
                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-200 hover:bg-rose-500/20"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <input
                value={sc.location}
                onChange={(e) => updateScene(sc.id, { location: e.target.value })}
                placeholder="Локация"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50"
              />
              <select
                value={sc.timeOfDay}
                onChange={(e) => updateScene(sc.id, { timeOfDay: e.target.value })}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50"
              >
                {["рассвет", "утро", "день", "вечер", "ночь"].map((t) => (
                  <option key={t} value={t} className="bg-[#0c0c16]">{t}</option>
                ))}
              </select>
              <input
                value={sc.notes || ""}
                onChange={(e) => updateScene(sc.id, { notes: e.target.value })}
                placeholder="Примечания"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50"
              />
            </div>

            <div className="mt-2">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Действие / визуал</div>
              <TextArea value={sc.action} onChange={(v) => updateScene(sc.id, { action: v })} rows={3} />
            </div>

            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Диалоги
                <button
                  onClick={() => updateScene(sc.id, { dialogue: [...sc.dialogue, { character: "ГЕРОЙ", line: "" }] })}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-white/[0.08]"
                >
                  + реплика
                </button>
              </div>
              <div className="space-y-2">
                {sc.dialogue.map((d, di) => (
                  <div key={di} className="grid gap-2 md:grid-cols-[140px_1fr_auto]">
                    <input
                      value={d.character}
                      onChange={(e) => {
                        const dl = [...sc.dialogue]; dl[di] = { ...d, character: e.target.value };
                        updateScene(sc.id, { dialogue: dl });
                      }}
                      placeholder="ПЕРСОНАЖ"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[12px] font-bold uppercase text-slate-200 outline-none focus:border-violet-400/50"
                    />
                    <input
                      value={d.line}
                      onChange={(e) => {
                        const dl = [...sc.dialogue]; dl[di] = { ...d, line: e.target.value };
                        updateScene(sc.id, { dialogue: dl });
                      }}
                      placeholder="Реплика"
                      className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-[12px] italic text-slate-200 outline-none focus:border-violet-400/50"
                    />
                    <button
                      onClick={() => updateScene(sc.id, { dialogue: sc.dialogue.filter((_, i) => i !== di) })}
                      className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 text-[11px] text-rose-200 hover:bg-rose-500/20"
                    >✕</button>
                  </div>
                ))}
                {sc.dialogue.length === 0 && <p className="text-[11px] text-slate-600">Реплик нет (визуальная сцена).</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Финальная верстка сценария</SectionTitle>
      <TextArea value={s.finalText} onChange={(v) => set({ finalText: v })} rows={10} />
    </StageShell>
  );
}
