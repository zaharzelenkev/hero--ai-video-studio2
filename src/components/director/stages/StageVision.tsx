"use client";

import StageShell, { SectionTitle, TextArea } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage } from "@/lib/production";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

const SHOT_FIELDS: Array<{ key: keyof import("@/lib/production").VisionShot; label: string; rows?: number }> = [
  { key: "goal", label: "Цель сцены", rows: 2 },
  { key: "emotion", label: "Эмоция" },
  { key: "composition", label: "Композиция", rows: 2 },
  { key: "cameraMovement", label: "Движение камеры", rows: 2 },
  { key: "duration", label: "Длительность" },
  { key: "transition", label: "Переход" },
  { key: "pacing", label: "Темп" },
  { key: "sound", label: "Звук", rows: 2 },
  { key: "atmosphere", label: "Атмосфера" },
  { key: "lighting", label: "Свет", rows: 2 },
  { key: "vfx", label: "Спецэффекты" },
  { key: "dpNotes", label: "Рекомендации оператору", rows: 2 },
];

export default function StageVision({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const v = preprod.vision;
  const set = (patch: Partial<typeof v>) => updatePreprod((p) => ({ ...p, vision: { ...p.vision, ...patch } }));

  const updateScene = (sceneId: string, patch: Partial<import("@/lib/production").VisionShot>) => {
    set({
      scenes: v.scenes.map((s) =>
        s.sceneId === sceneId ? { ...s, shot: { ...s.shot, ...patch } } : s
      ),
    });
  };

  const updatePalette = (sceneId: string, value: string) => {
    updateScene(sceneId, { colorPalette: value.split(",").map((x) => x.trim()).filter(Boolean) });
  };

  return (
    <StageShell
      icon="🎬"
      title="Director's Vision — Режиссёрская экспликация"
      subtitle="Ключевой блок: для каждой сцены — цель, эмоция, композиция, движение камеры, свет, цвет, звук, атмосфера и рекомендации оператору."
      onRegenerate={() => onRegenerate("vision")}
      busy={busy}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <SectionTitle>Общий стиль</SectionTitle>
          <TextArea value={v.overallStyle} onChange={(val) => set({ overallStyle: val })} rows={4} />
        </div>
        <div>
          <SectionTitle>Визуальный язык (камера, оптика, ракурсы)</SectionTitle>
          <TextArea value={v.visualLanguage} onChange={(val) => set({ visualLanguage: val })} rows={4} />
        </div>
      </div>

      <SectionTitle>Референсы (фильмы, клипы, реклама)</SectionTitle>
      <TextArea
        value={v.referenceFilms.join("\n")}
        onChange={(val) => set({ referenceFilms: val.split("\n").map((x) => x.trim()).filter(Boolean) })}
        rows={3}
      />

      <SectionTitle>Экспликация по сценам</SectionTitle>
      <div className="space-y-4">
        {v.scenes.map((sc, i) => (
          <div key={sc.sceneId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">СЦЕНА {i + 1}</span>
              <span className="text-sm font-bold text-slate-100">{sc.sceneTitle}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {SHOT_FIELDS.map((f) => (
                <div key={f.key}>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{f.label}</div>
                  {f.rows && f.rows > 1 ? (
                    <textarea
                      value={(sc.shot as any)[f.key] || ""}
                      onChange={(e) => updateScene(sc.sceneId, { [f.key]: e.target.value } as any)}
                      rows={f.rows}
                      className="w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50"
                    />
                  ) : (
                    <input
                      value={(sc.shot as any)[f.key] || ""}
                      onChange={(e) => updateScene(sc.sceneId, { [f.key]: e.target.value } as any)}
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50"
                    />
                  )}
                </div>
              ))}
              <div className="md:col-span-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Цветовая палитра (hex через запятую)</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={sc.shot.colorPalette.join(", ")}
                    onChange={(e) => updatePalette(sc.sceneId, e.target.value)}
                    className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50"
                  />
                  <div className="flex gap-1">
                    {sc.shot.colorPalette.map((c, ci) => (
                      <div key={ci} className="h-8 w-8 rounded-lg border border-white/20" style={{ background: c }} title={c} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </StageShell>
  );
}
