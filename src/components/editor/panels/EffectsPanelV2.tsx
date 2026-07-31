"use client";

import { useProjectStore } from "@/store/projectStore";
import type { VideoClip } from "@/lib/types";

export default function EffectsPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) return <div className="text-sm text-slate-400">Выберите клип для эффектов.</div>;
  const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
  if (!clip || (clip.type !== "video" && clip.type !== "image")) return <div className="text-sm text-slate-400">Клип не поддерживает эффекты.</div>;
  const v = clip as VideoClip;

  const setVideo = (fn: (c: VideoClip) => VideoClip) => updateClip(selectedClipId, (c: any) => fn({ ...(c as VideoClip) }));

  const Slider = ({ label, value, min, max, step, unit, onChange }: any) => (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] font-medium text-slate-300 mb-0.5"><span>{label}</span><span className="text-amber-300">{value}{unit || ""}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full bg-gradient-to-r from-slate-700 to-slate-600 appearance-none cursor-pointer accent-violet-400" aria-label={label} />
    </div>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-amber-300 mb-2">Маски и Размытие</h3>
        <div className="flex gap-2 mb-2">
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={v.mask?.enabled} onChange={() => setVideo(c => ({ ...c, mask: { ...c.mask!, enabled: !c.mask!.enabled } }))} aria-label="Включить маску" /> Маска</label>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={v.chroma?.enabled} onChange={() => setVideo(c => ({ ...c, chroma: { ...c.chroma!, enabled: !c.chroma!.enabled } }))} aria-label="Хромакей" /> Хромакей</label>
        </div>
        <Slider label="Мягкость маски (Feather)" value={v.mask?.feather ?? 0} min={0} max={1} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, mask: { ...c.mask!, feather: v } }))} />
        <Slider label="Хрома Similarity" value={v.chroma?.similarity ?? 0.3} min={0} max={1} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, chroma: { ...c.chroma!, similarity: v } }))} />
        <Slider label="Хрома Blend" value={v.chroma?.blend ?? 0.5} min={0} max={1} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, chroma: { ...c.chroma!, blend: v } }))} />
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-amber-300 mb-2">Трансформ и Движение</h3>
        <Slider label="X (смещение)" value={v.x?.value ?? 0} min={-1} max={1} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, x: { value: v, keyframes: [] } }))} pct />
        <Slider label="Y (смещение)" value={v.y?.value ?? 0} min={-1} max={1} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, y: { value: v, keyframes: [] } }))} pct />
        <Slider label="Масштаб" value={v.scale?.value ?? 1} min={0.1} max={3} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, scale: { value: v, keyframes: [] } }))} />
        <Slider label="Поворот (°)" value={v.rotation?.value ?? 0} min={-180} max={180} step={1} onChange={(v: number) => setVideo(c => ({ ...c, rotation: { value: v, keyframes: [] } }))} />
        <Slider label="Прозрачность" value={v.opacity?.value ?? 1} min={0} max={1} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, opacity: { value: v, keyframes: [] } }))} />
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-amber-300 mb-2">Crop (Кадрирование)</h3>
        <div className="grid grid-cols-2 gap-2">
          <Slider label="Слева" value={v.cropLeft?.value ?? 0} min={0} max={0.5} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, cropLeft: { value: v, keyframes: [] } }))} pct />
          <Slider label="Справа" value={v.cropRight?.value ?? 0} min={0} max={0.5} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, cropRight: { value: v, keyframes: [] } }))} pct />
          <Slider label="Сверху" value={v.cropTop?.value ?? 0} min={0} max={0.5} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, cropTop: { value: v, keyframes: [] } }))} pct />
          <Slider label="Снизу" value={v.cropBottom?.value ?? 0} min={0} max={0.5} step={0.01} onChange={(v: number) => setVideo(c => ({ ...c, cropBottom: { value: v, keyframes: [] } }))} pct />
        </div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-amber-300 mb-2">Blur / Sharpen / Motion</h3>
        <Slider label="Размытие" value={(v as any).blurAmount ?? 0} min={0} max={10} step={0.1} onChange={() => {}} />
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={v.motionBlur?.enabled} onChange={() => setVideo(c => ({ ...c, motionBlur: { ...c.motionBlur!, enabled: !c.motionBlur!.enabled } }))} aria-label="Motion Blur" /> Движение (Motion Blur)</label>
        <Slider label="Shutter Angle" value={v.motionBlur?.shutterAngle ?? 180} min={0} max={360} step={1} onChange={(v: number) => setVideo(c => ({ ...c, motionBlur: { ...c.motionBlur!, shutterAngle: v } }))} />
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-amber-300 mb-2">Blend Mode и Переходы</h3>
        <div className="flex flex-wrap gap-1 mb-2">
          {["normal","multiply","screen","overlay","darken","lighten","hardLight","softLight","difference","hue","color"].map(b => (
            <button key={b} onClick={() => setVideo(c => ({ ...c, blendMode: b as any }))} className={`rounded-lg px-2 py-0.5 text-[10px] border transition ${v.blendMode === b ? "bg-blue-600 text-white border-violet-400" : "bg-white/5 text-slate-300 border-white/10"}`}>{b}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!v.transitionIn?.duration} onChange={() => setVideo(c => ({ ...c, transitionIn: { type: "crossfade", duration: 0.3 } }))} aria-label="Переход" /> Переход на вход (Crossfade 0.3с)</label>
      </section>
    </div>
  );
}
