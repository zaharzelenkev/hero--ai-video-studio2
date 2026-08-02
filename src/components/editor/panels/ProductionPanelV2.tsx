"use client";

import { useProjectStore } from "@/store/projectStore";
import { PanelSection, NumberField, TextField } from "./ui";

export default function ProductionPanelV2() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);

  if (!project) return <div className="text-sm text-slate-400">Нет проекта.</div>;

  return (
    <div className="space-y-1">
      <PanelSection title="Настройки проекта" icon="layout">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Ширина, px"
            value={project.resolution.width}
            onChange={(v) => updateProject((p) => ({ ...p, resolution: { ...p.resolution, width: v || 1920 } }))}
          />
          <NumberField
            label="Высота, px"
            value={project.resolution.height}
            onChange={(v) => updateProject((p) => ({ ...p, resolution: { ...p.resolution, height: v || 1080 } }))}
          />
        </div>
        <div className="mt-2">
          <NumberField
            label="FPS"
            value={project.fps}
            onChange={(v) => updateProject((p) => ({ ...p, fps: v || 30 }))}
          />
        </div>
      </PanelSection>

      <PanelSection title="Стиль генерации" icon="sparkles">
        <div className="mb-2 text-[11px] leading-relaxed text-slate-500">
          Параметры AI-стиля применяются при повторной генерации.
        </div>
        <button
          onClick={() => updateProject((p) => ({ ...p, style: { ...p.style, pace: "medium" } }))}
          className="btn btn-soft px-3 py-1.5 text-xs"
        >
          Обновить стиль
        </button>
      </PanelSection>

      <PanelSection title="Название" icon="type">
        <TextField
          label="Название проекта"
          value={project.title}
          onChange={(v) => updateProject((p) => ({ ...p, title: v }))}
        />
      </PanelSection>
    </div>
  );
}
