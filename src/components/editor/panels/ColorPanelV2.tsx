"use client";

import { useProjectStore } from "@/store/projectStore";
import type { ColorGrade, LutPreset } from "@/lib/types";

const Luts: LutPreset[] = ["none","cinematic","teal-orange","warm","cool","bw","vintage","vivid","luxury","dramatic","moody","film-noir","neutral"];

export default function ColorPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) {
    return <div className="text-sm text-slate-400">Выберите клип для цветокоррекции.</div>;
  }

  const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
  if (!clip || (clip.type !== "video" && clip.type !== "image")) return <div className="text-sm text-slate-400">Клип не поддерживает цветокоррекцию.</div>;

  const color = (clip as any).color || { lut: "none" };
  const setColor = (fn: (c: ColorGrade) => ColorGrade) => updateClip(selectedClipId, (c: any) => ({ ...c, color: fn(c.color || { lut: "none" }) }));

  const Slider = ({ label, value, min, max, step, onChange, pct }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; pct?: boolean }) => (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] font-medium text-slate-300 mb-0.5"><span>{label}</span><span className="text-violet-300">{pct ? `${Math.round(value * 100)}%` : value.toFixed(2)}</span></div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full bg-gradient-to-r from-violet-800 to-fuchsia-800 appearance-none cursor-pointer accent-violet-400"
        aria-label={label}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-violet-900/40 to-fuchsia-900/40 border border-white/10 px-3 py-2">
        <h3 className="text-xs font-bold text-violet-300 mb-2">LUT Пресеты</h3>
        <div className="flex flex-wrap gap-1.5">
          {Luts.map((l) => (
            <button
              key={l}
              onClick={() => setColor((c) => ({ ...c, lut: l }))}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border transition ${color.lut === l ? "bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-500/30" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}
              aria-label={`Применить LUT ${l}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Базовая коррекция</h3>
        <Slider label="Яркость" value={color.brightness?.value ?? 0} min={-1} max={1} step={0.01} onChange={(v) => setColor(c => ({ ...c, brightness: { value: v, keyframes: [] } }))} pct />
        <Slider label="Контраст" value={color.contrast?.value ?? 0} min={-1} max={1} step={0.01} onChange={(v) => setColor(c => ({ ...c, contrast: { value: v, keyframes: [] } }))} pct />
        <Slider label="Насыщенность" value={color.saturation?.value ?? 0} min={-1} max={1} step={0.01} onChange={(v) => setColor(c => ({ ...c, saturation: { value: v, keyframes: [] } }))} pct />
        <Slider label="Экспозиция" value={color.exposure?.value ?? 0} min={-3} max={3} step={0.1} onChange={(v) => setColor(c => ({ ...c, exposure: { value: v, keyframes: [] } }))} />
        <Slider label="Температура" value={color.temperature?.value ?? 0} min={-1} max={1} step={0.01} onChange={(v) => setColor(c => ({ ...c, temperature: { value: v, keyframes: [] } }))} pct />
      </div>

      <div className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Color Wheels (Lift / Gamma / Gain)</h3>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { k: "lift" as const, label: "Lift (Тени)", desc: "Тени" },
            { k: "gamma" as const, label: "Gamma (Средние)", desc: "Средние" },
            { k: "gain" as const, label: "Gain (Свет)", desc: "Свет" },
          ].map(({ k, label }) => (
            <div key={k} className="rounded-lg bg-gradient-to-b from-[#111] to-[#0a0a12] border border-white/5 p-2 text-center">
              <div className="text-[10px] text-slate-300 font-bold mb-1">{label}</div>
              <WheelInput label="R" value={(color.colorWheels?.[k]?.r ?? 0)} min={-1} max={1} step={0.01} onChange={(v) => setColor(c => { const w = c.colorWheels || { lift:{r:0,g:0,b:0}, gamma:{r:0,g:0,b:0}, gain:{r:0,g:0,b:0} }; w[k] = { ...w[k], r: v }; return { ...c, colorWheels: w }; })} />
              <WheelInput label="G" value={(color.colorWheels?.[k]?.g ?? 0)} min={-1} max={1} step={0.01} onChange={(v) => setColor(c => { const w = c.colorWheels || { lift:{r:0,g:0,b:0}, gamma:{r:0,g:0,b:0}, gain:{r:0,g:0,b:0} }; w[k] = { ...w[k], g: v }; return { ...c, colorWheels: w }; })} />
              <WheelInput label="B" value={(color.colorWheels?.[k]?.b ?? 0)} min={-1} max={1} step={0.01} onChange={(v) => setColor(c => { const w = c.colorWheels || { lift:{r:0,g:0,b:0}, gamma:{r:0,g:0,b:0}, gain:{r:0,g:0,b:0} }; w[k] = { ...w[k], b: v }; return { ...c, colorWheels: w }; })} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Curves (RGB Channels)</h3>
        <div className="flex gap-2 mb-2">
          {["master","red","green","blue"].map((ch) => (
            <button key={ch} onClick={() => setColor(c => { const cur = c.curves || { master: { points: [{x:0,y:0},{x:1,y:1}] }, red:{points:[{x:0,y:0},{x:1,y:1}]}, green:{points:[{x:0,y:0},{x:1,y:1}]}, blue:{points:[{x:0,y:0},{x:1,y:1}]} }; const pts = cur[ch as "master"|"red"|"green"|"blue"].points; pts.push({x:0.5,y:0.5}); return { ...c, curves: cur }; })} className="text-[10px] bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 text-slate-300">{ch} +pt</button>
          ))}
        </div>
        <div className="text-[10px] text-slate-400">Настройте кривые RGB вручную или примените авто-коррекцию.</div>
      </div>

      <div className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">HSL (Оттенок / Насыщенность / Яркость)</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gradient-to-b from-[#111] to-[#0a0a12] rounded-lg p-2 border border-white/5">
            <div className="text-[10px] text-slate-300 font-bold mb-1">Оттенок (Hue)</div>
            <input type="range" min={-180} max={180} step={1} value={color.hue?.value ?? 0} onChange={(e) => setColor(c => ({ ...c, hue: { value: parseFloat(e.target.value), keyframes: [] } }))} className="w-full" aria-label="Hue" />
          </div>
          <div className="bg-gradient-to-b from-[#111] to-[#0a0a12] rounded-lg p-2 border border-white/5">
            <div className="text-[10px] text-slate-300 font-bold mb-1">Вибрация (Vibrance)</div>
            <input type="range" min={-1} max={1} step={0.01} value={color.vibrance?.value ?? 0} onChange={(e) => setColor(c => ({ ...c, vibrance: { value: parseFloat(e.target.value), keyframes: [] } }))} className="w-full" aria-label="Vibrance" />
          </div>
        </div>
      </div>
    </div>
  );
}

function WheelInput({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 mb-0.5">
      <span className="text-[9px] text-slate-500 w-3">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="flex-1 h-1 rounded-full bg-gradient-to-r from-violet-800 to-fuchsia-800 accent-violet-400" aria-label={`${label} wheel`} />
    </div>
  );
}
