"use client";

import { useProjectStore } from "@/store/projectStore";
import type { TextClip } from "@/lib/types";

const fonts = ["Inter","Arial","Georgia","Courier New","Impact","Roboto","Playfair Display"];
const animations = ["none","fade","slide-up","slide-down","slide-left","slide-right","pop","typewriter","blur-in","scale-in","rotate-in","elastic","stomp","glitch","bounce"];

export default function TextPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) return <div className="text-sm text-slate-400">Выберите текстовый клип.</div>;
  const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
  // Текстовые клипы И автосубтитры (subtitle) можно редактировать здесь.
  // Спрейд-обновление сохраняет реальный тип клипа (text/subtitle) на рантайме.
  if (!clip || (clip.type !== "text" && clip.type !== "subtitle")) return <div className="text-sm text-slate-400">Выберите текстовый клип для анимации.</div>;
  const t = clip as TextClip;

  const setText = (fn: (c: TextClip) => TextClip) => updateClip(selectedClipId, (c: any) => fn({ ...(c as TextClip) }));

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Текст</h3>
        <textarea
          value={t.text || ""}
          onChange={(e) => setText(c => ({ ...c, text: e.target.value }))}
          className="w-full h-20 rounded-lg bg-[#0a0a12] border border-white/10 text-sm text-slate-100 p-2 resize-none focus:outline-none focus:border-violet-400 transition font-sans"
          placeholder="Введите текст..."
          aria-label="Текст клипа"
        />
        <div className="flex flex-wrap gap-1 mt-2">
          {fonts.map(f => (
            <button key={f} onClick={() => setText(c => ({ ...c, fontFamily: f }))} className={`rounded-md px-2 py-0.5 text-[10px] font-bold border transition ${t.fontFamily === f ? "bg-violet-600 text-white border-violet-400" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>{f}</button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input type="number" value={t.fontSize || 48} min={10} max={200} step={1} onChange={(e) => setText(c => ({ ...c, fontSize: parseInt(e.target.value) || 48 }))} className="w-20 rounded-lg bg-[#0a0a12] border border-white/10 text-xs p-1 text-slate-100" aria-label="Размер шрифта" />
          <input type="color" value={t.color || "#ffffff"} onChange={(e) => setText(c => ({ ...c, color: e.target.value }))} className="w-8 h-8 rounded-lg bg-transparent border-0 p-0" aria-label="Цвет текста" />
        </div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Анимация текста</h3>
        <label className="text-[10px] text-slate-400">Вход (Animation In)</label>
        <div className="flex flex-wrap gap-1 mt-1 mb-2">
          {animations.map(a => (
            <button key={a} onClick={() => setText(c => ({ ...c, animationIn: a as any }))} className={`rounded-lg px-2 py-0.5 text-[10px] font-bold border transition ${t.animationIn === a ? "bg-violet-600 text-white border-violet-400" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>{a}</button>
          ))}
        </div>
        <label className="text-[10px] text-slate-400">Выход (Animation Out)</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {animations.map(a => (
            <button key={a} onClick={() => setText(c => ({ ...c, animationOut: a as any }))} className={`rounded-lg px-2 py-0.5 text-[10px] font-bold border transition ${t.animationOut === a ? "bg-fuchsia-600 text-white border-fuchsia-400" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>{a}</button>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Трансформ текста</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          <div><label className="text-[10px] text-slate-400 block">X</label><input type="range" min={-1} max={1} step={0.01} value={t.x?.value ?? 0} onChange={(e) => setText(c => ({ ...c, x: { value: parseFloat(e.target.value), keyframes: [] } }))} className="w-28" aria-label="Text X" /></div>
          <div><label className="text-[10px] text-slate-400 block">Y</label><input type="range" min={-1} max={1} step={0.01} value={t.y?.value ?? 0} onChange={(e) => setText(c => ({ ...c, y: { value: parseFloat(e.target.value), keyframes: [] } }))} className="w-28" aria-label="Text Y" /></div>
          <div><label className="text-[10px] text-slate-400 block">Scale</label><input type="range" min={0.1} max={3} step={0.01} value={t.scale?.value ?? 1} onChange={(e) => setText(c => ({ ...c, scale: { value: parseFloat(e.target.value), keyframes: [] } }))} className="w-28" aria-label="Text Scale" /></div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!t.rotation?.value} onChange={() => setText(c => ({ ...c, rotation: { value: (c.rotation?.value ?? 0) ? 0 : 10, keyframes: [] } }))} aria-label="Поворот" /> Поворот</label>
      </section>
    </div>
  );
}
