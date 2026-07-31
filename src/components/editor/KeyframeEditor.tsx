"use client";

import { useProjectStore } from "@/store/projectStore";
import type { Keyframe } from "@/lib/types";

export default function KeyframeEditor() {
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);
  const project = useProjectStore((s) => s.project);

  if (!project || !selectedClipId) return <div className="text-xs text-slate-500">Выберите клип с анимацией.</div>;
  const clip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);
  if (!clip || clip.type !== "video") return <div className="text-xs text-slate-500">Видео-клип необходим для keyframes.</div>;

  const v = clip as any;
  const params = [
    { key: "scale", label: "Масштаб", min: 0.1, max: 3, current: v.scale?.value ?? 1 },
    { key: "x", label: "X", min: -1, max: 1, current: v.x?.value ?? 0 },
    { key: "y", label: "Y", min: -1, max: 1, current: v.y?.value ?? 0 },
    { key: "opacity", label: "Прозрачность", min: 0, max: 1, current: v.opacity?.value ?? 1 },
  ];

  return (
    <div className="space-y-3 p-2">
      <h3 className="text-xs font-bold text-violet-300">Keyframes</h3>
      {params.map(p => (
        <div key={p.key} className="rounded-lg bg-[#0a0a12] border border-white/10 p-2">
          <div className="text-[10px] font-bold text-slate-200 mb-1">{p.label} (= {p.current})</div>
          <div className="flex gap-1 mb-1">
            {(v[p.key]?.keyframes || []).map((kf: Keyframe) => (
              <button key={kf.id} onClick={() => {}} className="text-[10px] bg-violet-700 text-white rounded px-1" title={`t=${kf.time.toFixed(2)} v=${kf.value}`}>{kf.time.toFixed(1)}</button>
            ))}
          </div>
          <button onClick={() => {
            const newKf: Keyframe = { id: Math.random().toString(36).slice(2), time: 1, value: p.current, easing: "linear" };
            updateClip(selectedClipId, (c: any) => {
              const param = c[p.key] || { value: p.current, keyframes: [] };
              return { ...c, [p.key]: { ...param, keyframes: [...param.keyframes, newKf] } };
            });
          }} className="text-[10px] bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded px-2 py-0.5 shadow">+ Keyframe</button>
        </div>
      ))}
    </div>
  );
}
