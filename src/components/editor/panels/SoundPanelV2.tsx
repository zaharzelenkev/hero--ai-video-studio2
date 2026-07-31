"use client";

import { useProjectStore } from "@/store/projectStore";
import type { AudioClip } from "@/lib/types";

export default function SoundPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) return <div className="text-sm text-slate-400">Выберите аудиоклип для работы со звуком.</div>;
  const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
  if (!clip || clip.type !== "audio") return <div className="text-sm text-slate-400">Выберите аудиоклип.</div>;
  const a = clip as AudioClip;

  const setAudio = (fn: (c: AudioClip) => AudioClip) => updateClip(selectedClipId, (c: any) => fn({ ...(c as AudioClip) }));

  const Slider = ({ label, value, min, max, step, onChange }: any) => (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] font-medium text-slate-300 mb-0.5"><span>{label}</span><span className="text-violet-300">{value}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full bg-gradient-to-r from-violet-800 to-fuchsia-800 appearance-none cursor-pointer accent-violet-400" aria-label={label} />
    </div>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Громкость и Фейды</h3>
        <Slider label="Громкость" value={a.volume?.value ?? 1} min={0} max={2} step={0.01} onChange={(v: number) => setAudio(c => ({ ...c, volume: { value: v, keyframes: [] } }))} />
        <Slider label="Fade In (сек)" value={a.fadeIn ?? 0} min={0} max={3} step={0.05} onChange={(v: number) => setAudio(c => ({ ...c, fadeIn: v }))} />
        <Slider label="Fade Out (сек)" value={a.fadeOut ?? 0} min={0} max={3} step={0.05} onChange={(v: number) => setAudio(c => ({ ...c, fadeOut: v }))} />
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Эквалайзер</h3>
        <Slider label="Low (Низкие)" value={a.eqLow ?? 0} min={-15} max={15} step={0.5} onChange={(v: number) => setAudio(c => ({ ...c, eqLow: v }))} />
        <Slider label="Mid (Средние)" value={a.eqMid ?? 0} min={-15} max={15} step={0.5} onChange={(v: number) => setAudio(c => ({ ...c, eqMid: v }))} />
        <Slider label="High (Высокие)" value={a.eqHigh ?? 0} min={-15} max={15} step={0.5} onChange={(v: number) => setAudio(c => ({ ...c, eqHigh: v }))} />
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Профессиональные инструменты</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          <button onClick={() => setAudio(c => ({ ...c, denoise: !c.denoise }))} className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition ${a.denoise ? "bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-500/30" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>Шумоподавление</button>
          <button onClick={() => setAudio(c => ({ ...c, normalize: !c.normalize }))} className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition ${a.normalize ? "bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-500/30" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>Нормализация</button>
          <button onClick={() => setAudio(c => ({ ...c, loop: !c.loop }))} className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition ${a.loop ? "bg-emerald-600 text-white border-emerald-400 shadow-lg" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>Зациклить</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={a.muted} onChange={() => setAudio(c => ({ ...c, muted: !c.muted }))} aria-label="Mute" /> Приглушить</label>
        <div className="text-[10px] text-slate-500 mt-1">Нормализация громкости автоматически подстраивает пики под -1 dBTP.</div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Компрессор</h3>
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!a.compressor?.enabled} onChange={() => setAudio(c => ({ ...c, compressor: { ...(c.compressor || { enabled: false, threshold: -20, ratio: 4, attack: 5, release: 50 }), enabled: !(c.compressor?.enabled ?? false) } }))} aria-label="Компрессор" /> Включить компрессор</label>
        <div className="flex gap-2 mt-2">
          <Slider label="Threshold dB" value={a.compressor?.threshold ?? -20} min={-60} max={0} step={1} onChange={(v: number) => setAudio(c => ({ ...c, compressor: { ...(c.compressor || { enabled: true, threshold: -20, ratio: 4, attack: 5, release: 50 }), threshold: v } }))} />
          <Slider label="Ratio" value={a.compressor?.ratio ?? 4} min={1} max={20} step={0.5} onChange={(v: number) => setAudio(c => ({ ...c, compressor: { ...(c.compressor || { enabled: true, threshold: -20, ratio: 4, attack: 5, release: 50 }), ratio: v } }))} />
        </div>
      </section>
    </div>
  );
}
