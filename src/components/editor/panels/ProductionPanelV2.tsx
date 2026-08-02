"use client";

import { useProjectStore } from "@/store/projectStore";

export default function ProductionPanelV2() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);

  if (!project) return <div className="text-sm text-slate-400">Нет проекта.</div>;

  return (
    <div className="space-y-3">
      <section className="surface-card p-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300 mb-2">Настройки проекта</h3>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div><label className="field-label !mb-1">Ширина</label><input type="number" value={project.resolution.width} onChange={(e) => updateProject(p => ({ ...p, resolution: { ...p.resolution, width: parseInt(e.target.value) || 1920 } }))} className="input !px-2 !py-1.5 !text-xs" aria-label="Ширина" /></div>
          <div><label className="field-label !mb-1">Высота</label><input type="number" value={project.resolution.height} onChange={(e) => updateProject(p => ({ ...p, resolution: { ...p.resolution, height: parseInt(e.target.value) || 1080 } }))} className="input !px-2 !py-1.5 !text-xs" aria-label="Высота" /></div>
        </div>
        <div><label className="field-label !mb-1">FPS</label><input type="number" value={project.fps} onChange={(e) => updateProject(p => ({ ...p, fps: parseInt(e.target.value) || 30 }))} className="input !px-2 !py-1.5 !text-xs" aria-label="FPS" /></div>
      </section>

      <section className="surface-card p-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300 mb-2">Стиль генерации</h3>
        <div className="text-xs text-slate-400">Параметры AI-стиля применяются при повторной генерации.</div>
        <button onClick={() => updateProject(p => ({ ...p, style: { ...p.style, pace: "medium" } }))} className="btn btn-soft mt-2 px-3 py-1.5 text-xs">Обновить стиль</button>
      </section>
    </div>
  );
}
