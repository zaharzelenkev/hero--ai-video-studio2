"use client";

import { useRef, useState } from "react";
import StageShell from "./StageShell";
import type { DirectorBrief, LocationItem, PreProduction, PreprodStage } from "@/lib/production";
import { uid } from "@/lib/id";
import { analyzeLocationPhoto } from "@/lib/imageAnalysis";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StageLocations({ preprod, updatePreprod }: Props) {
  const locs = preprod.locations;
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const set = (list: LocationItem[]) =>
    updatePreprod((p) => ({ ...p, locations: list, planning: { ...p.planning, locations: list } }));

  const add = () =>
    set([...locs, { id: uid("loc"), name: "Новая локация", description: "", mood: "", lighting: "", pros: [], cons: [], suitable: true }]);
  const update = (id: string, patch: Partial<LocationItem>) =>
    set(locs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => set(locs.filter((l) => l.id !== id));

  const handleFile = async (id: string, file: File) => {
    setAnalyzing(id);
    setMsg("");
    try {
      const l = locs.find((x) => x.id === id);
      if (!l) return;
      const r = await analyzeLocationPhoto(file, { name: l.name, description: l.description, mood: l.mood });
      update(id, {
        photoDataUrl: r.dataUrl,
        score: r.score,
        mood: l.mood || r.mood,
        lighting: l.lighting || r.lighting,
        pros: Array.from(new Set([...l.pros, ...r.pros])),
        cons: Array.from(new Set([...l.cons, ...r.cons])),
        suitable: r.suitable,
        analysis:
          `Оценка локации: ${r.score}/100\nАтмосфера: ${r.mood}\nСвет: ${r.lighting}\n${r.suitable ? "Локация выглядит подходящей." : "Локация требует доработки по свету/композиции."}`,
      });
    } catch (e: any) {
      setMsg("Не удалось проанализировать фото, попробуйте другой снимок.");
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <StageShell
      icon="📍"
      title="Локации"
      subtitle="Опишите места съёмок и загрузите фото — AI оценит свет, атмосферу и подскажет сильные и слабые стороны каждой локации."
    >
      {msg && <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-[11px] text-rose-200">{msg}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {locs.map((l) => (
          <div key={l.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="relative h-28 w-40 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                {l.photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.photoDataUrl} alt={l.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-500">Нет фото</div>
                )}
                {analyzing === l.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] text-white">Анализ…</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <input value={l.name} onChange={(e) => update(l.id, { name: e.target.value })}
                  className="mb-1 w-full rounded bg-transparent text-sm font-bold text-slate-100 outline-none" />
                {typeof l.score === "number" && (
                  <div className="mb-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400"><span>Оценка</span><span>{l.score}/100</span></div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full ${l.score >= 70 ? "bg-emerald-400" : l.score >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${l.score}%` }} />
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => fileInputs.current[l.id]?.click()}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]">
                    {l.photoDataUrl ? "Заменить" : "Загрузить фото"}
                  </button>
                  <input ref={(el) => { fileInputs.current[l.id] = el; }} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(l.id, f); e.target.value = ""; }} />
                  <label className="flex items-center gap-1 text-[10px] font-bold text-slate-300">
                    <input type="checkbox" checked={l.suitable} onChange={(e) => update(l.id, { suitable: e.target.checked })} className="accent-emerald-400" />
                    Подходит
                  </label>
                  <button onClick={() => remove(l.id)}
                    className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-200 hover:bg-rose-500/20">✕</button>
                </div>
              </div>
            </div>
            <label className="block">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Описание</div>
              <textarea value={l.description} onChange={(e) => update(l.id, { description: e.target.value })} rows={2} className={taCls} />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Атмосфера</div>
                <input value={l.mood} onChange={(e) => update(l.id, { mood: e.target.value })} className={inpCls} />
              </label>
              <label className="block">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Свет</div>
                <input value={l.lighting} onChange={(e) => update(l.id, { lighting: e.target.value })} className={inpCls} />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-emerald-300">Плюсы</div>
                <textarea
                  value={l.pros.join("\n")}
                  onChange={(e) => update(l.id, { pros: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                  rows={3}
                  className={taCls}
                />
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-widest text-rose-300">Минусы</div>
                <textarea
                  value={l.cons.join("\n")}
                  onChange={(e) => update(l.id, { cons: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                  rows={3}
                  className={taCls}
                />
              </div>
            </div>
            {l.analysis && (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-2 text-[11px] leading-relaxed text-slate-300">
                <pre className="whitespace-pre-wrap font-sans">{l.analysis}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={add}
        className="mt-4 w-full rounded-xl border border-dashed border-white/20 bg-white/[0.02] py-2 text-[11px] font-semibold text-slate-400 hover:bg-white/[0.05]">
        + Добавить локацию
      </button>
    </StageShell>
  );
}

const taCls = "w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50";
const inpCls = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50";
