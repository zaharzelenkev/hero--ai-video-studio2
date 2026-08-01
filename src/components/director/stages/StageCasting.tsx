"use client";

import { useRef, useState } from "react";
import StageShell from "./StageShell";
import type { CastMember, DirectorBrief, PreProduction, PreprodStage } from "@/lib/production";
import { uid } from "@/lib/id";
import { analyzeCastingPhoto } from "@/lib/imageAnalysis";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StageCasting({ preprod, updatePreprod }: Props) {
  const cast = preprod.casting;
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const set = (list: CastMember[]) =>
    updatePreprod((p) => {
      // sync planning.cast as well
      return { ...p, casting: list, planning: { ...p.planning, cast: list } };
    });

  const addRole = () =>
    set([...cast, { id: uid("cast"), role: "Новая роль", description: "", look: "", notes: "" }]);

  const update = (id: string, patch: Partial<CastMember>) =>
    set(cast.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const remove = (id: string) => set(cast.filter((c) => c.id !== id));

  const handleFile = async (id: string, file: File) => {
    setAnalyzing(id);
    setMsg("");
    try {
      const member = cast.find((c) => c.id === id);
      if (!member) return;
      const result = await analyzeCastingPhoto(file, { role: member.role, description: member.description, look: member.look });
      update(id, {
        photoDataUrl: result.dataUrl,
        suitability: result.score,
        analysis:
          `Оценка соответствия: ${result.score}/100\n\n` +
          (result.positives.length ? "Сильные стороны:\n- " + result.positives.join("\n- ") + "\n\n" : "") +
          (result.negatives.length ? "На что обратить внимание:\n- " + result.negatives.join("\n- ") + "\n\n" : "") +
          result.notes,
      });
    } catch (e: any) {
      // Swallow technical errors — the user can still upload and try again.
      setMsg("Не удалось проанализировать фото, попробуйте другой снимок.");
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <StageShell
      icon="🎭"
      title="Кастинг"
      subtitle="Рекомендации по ролям и внешнему виду актёров. Загрузите фотографию претендента — AI оценит экспозицию, контраст, цвет и наличие лица в кадре и даст короткое заключение. Финальное решение всегда за вами."
    >
      {msg && <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-[11px] text-rose-200">{msg}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {cast.map((c) => (
          <div key={c.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                {c.photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photoDataUrl} alt={c.role} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-500 text-center px-1">Нет фото</div>
                )}
                {analyzing === c.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] text-white">Анализ…</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <input
                  value={c.role}
                  onChange={(e) => update(c.id, { role: e.target.value })}
                  className="mb-1 w-full rounded bg-transparent text-sm font-bold text-slate-100 outline-none"
                />
                <input
                  value={c.name || ""}
                  onChange={(e) => update(c.id, { name: e.target.value })}
                  placeholder="Имя (после кастинга)"
                  className="mb-2 w-full rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
                />
                {typeof c.suitability === "number" && (
                  <div className="mb-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-slate-400">
                      <span>Авто-оценка</span>
                      <span>{c.suitability}/100</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full ${c.suitability >= 70 ? "bg-emerald-400" : c.suitability >= 50 ? "bg-amber-400" : "bg-rose-400"}`}
                        style={{ width: `${c.suitability}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputs.current[c.id]?.click()}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]"
                  >
                    {c.photoDataUrl ? "Заменить фото" : "Загрузить фото"}
                  </button>
                  <input
                    ref={(el) => { fileInputs.current[c.id] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(c.id, f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => remove(c.id)}
                    className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-200 hover:bg-rose-500/20"
                  >Удалить</button>
                </div>
              </div>
            </div>
            <label className="block">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Описание роли</div>
              <textarea value={c.description} onChange={(e) => update(c.id, { description: e.target.value })} rows={2} className={taCls} />
            </label>
            <label className="mt-2 block">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Типаж / внешние данные</div>
              <input value={c.look} onChange={(e) => update(c.id, { look: e.target.value })} className={inpCls} />
            </label>
            <label className="mt-2 block">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Заметки по кастингу</div>
              <textarea value={c.notes || ""} onChange={(e) => update(c.id, { notes: e.target.value })} rows={2} className={taCls} />
            </label>
            {c.analysis && (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-violet-300">AI-анализ</div>
                <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-300">{c.analysis}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={addRole}
        className="mt-4 w-full rounded-xl border border-dashed border-white/20 bg-white/[0.02] py-2 text-[11px] font-semibold text-slate-400 hover:bg-white/[0.05]"
      >
        + Добавить роль
      </button>
    </StageShell>
  );
}

const taCls = "w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50";
const inpCls = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50";
