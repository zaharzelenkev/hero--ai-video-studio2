"use client";

import { useProjectStore } from "@/store/projectStore";

export default function ProductionPanelV2() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);

  if (!project) return <div className="text-sm text-slate-400">Нет проекта.</div>;

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-gradient-to-r from-violet-900/30 to-fuchsia-900/30 border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-amber-300 mb-2">Настройки проекта</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div><label className="text-[10px] text-slate-400 block">Ширина</label><input type="number" value={project.resolution.width} onChange={(e) => updateProject(p => ({ ...p, resolution: { ...p.resolution, width: parseInt(e.target.value) || 1920 } }))} className="w-full rounded-lg bg-[#0a0a12] border border-white/10 text-xs p-1 text-slate-100" aria-label="Ширина" /></div>
          <div><label className="text-[10px] text-slate-400 block">Высота</label><input type="number" value={project.resolution.height} onChange={(e) => updateProject(p => ({ ...p, resolution: { ...p.resolution, height: parseInt(e.target.value) || 1080 } }))} className="w-full rounded-lg bg-[#0a0a12] border border-white/10 text-xs p-1 text-slate-100" aria-label="Высота" /></div>
        </div>
        <div><label className="text-[10px] text-slate-400 block">FPS</label><input type="number" value={project.fps} onChange={(e) => updateProject(p => ({ ...p, fps: parseInt(e.target.value) || 30 }))} className="w-full rounded-lg bg-[#0a0a12] border border-white/10 text-xs p-1 text-slate-100" aria-label="FPS" /></div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-amber-300 mb-2">Стиль генерации</h3>
        <div className="text-xs text-slate-400">Параметры AI-стиля применяются при повторной генерации.</div>
        <button onClick={() => updateProject(p => ({ ...p, style: { ...p.style, pace: "medium" } }))} className="mt-2 rounded-lg bg-gradient-to-r from-blue-700 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg">Обновить стиль</button>
      </section>
    </div>
  );
}
