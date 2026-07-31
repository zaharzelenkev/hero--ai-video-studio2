"use client";

import { useProjectStore } from "@/store/projectStore";
import { uid } from "@/lib/id";
import type { Track, Clip } from "@/lib/types";

export default function MontagePanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const addTrack = useProjectStore((s) => s.addTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const detachAudio = useProjectStore((s) => s.detachAudio);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);
  const selectClip = useProjectStore((s) => s.selectClip);
  const playhead = useProjectStore((s) => s.playhead);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);

  if (!project) return <div className="text-sm text-slate-400">Нет проекта.</div>;

  const selectedClip = project.tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId);

  const handleAddVideoTrack = () => {
    addTrack({ id: uid("track"), type: "video", name: `Видео ${project.tracks.filter(t => t.type === "video").length + 1}`, clips: [], hidden: false, muted: false, locked: false });
  };
  const handleAddAudioTrack = () => {
    addTrack({ id: uid("track"), type: "audio", name: `Аудио ${project.tracks.filter(t => t.type === "audio").length + 1}`, clips: [], hidden: false, muted: false, locked: false });
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-gradient-to-r from-violet-900/30 to-fuchsia-900/30 border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Монтаж</h3>
        <div className="flex gap-2 mb-2">
          <button onClick={handleAddVideoTrack} className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg">+ Видео трек</button>
          <button onClick={handleAddAudioTrack} className="rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg">+ Аудио трек</button>
        </div>
        <div className="flex gap-2">
          {selectedClipId ? (
            <>
              <button onClick={() => duplicateClip(selectedClipId)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10">Дублировать</button>
              <button onClick={() => detachAudio(selectedClipId)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10">Отделить звук</button>
              <button onClick={() => splitClipAt(selectedClipId, playhead)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-white/10">Разделить (S)</button>
            </>
          ) : (
            <span className="text-xs text-slate-500">Выберите клип для действий.</span>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Треки</h3>
        <div className="space-y-2">
          {project.tracks.map((track: Track) => (
            <div key={track.id} className={`rounded-lg border p-2 ${track.hidden ? "opacity-50" : "border-white/10 bg-[#0a0a12]"} ${track.muted ? "border-amber-500/30" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-slate-200">{track.type === "video" ? "🎥" : track.type === "audio" ? "🎵" : "•"} {track.name}</div>
                <div className="flex gap-1">
                  <button onClick={() => useProjectStore.getState().toggleTrackProp(track.id, "hidden")} className="text-[10px] bg-white/5 rounded px-1 hover:bg-white/10">{track.hidden ? "Показать" : "Скрыть"}</button>
                  <button onClick={() => useProjectStore.getState().toggleTrackProp(track.id, "muted")} className="text-[10px] bg-white/5 rounded px-1 hover:bg-white/10">{track.muted ? "Включить" : "Заглушить"}</button>
                  <button onClick={() => removeTrack(track.id)} className="text-[10px] bg-rose-900/40 text-rose-300 rounded px-1 hover:bg-rose-900/60">Удалить</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {track.clips.map((c: Clip) => (
                  <button key={c.id} onClick={() => { selectClip(c.id); setPlayhead(c.start); }} className={`text-[10px] rounded-md px-2 py-0.5 border transition ${selectedClipId === c.id ? "bg-violet-600 text-white border-violet-400" : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"}`}>{c.name}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-[#0d0d16] border border-white/10 p-3 shadow-inner">
        <h3 className="text-xs font-bold text-violet-300 mb-2">Информация о клипе</h3>
        {selectedClip ? (
          <div className="text-xs text-slate-300 space-y-1">
            <div><span className="text-slate-500">Имя:</span> {selectedClip.name}</div>
            <div><span className="text-slate-500">Старт:</span> {selectedClip.start.toFixed(2)}с</div>
            <div><span className="text-slate-500">Длительность:</span> {selectedClip.duration.toFixed(2)}с</div>
            <div><span className="text-slate-500">Тип:</span> {selectedClip.type}</div>
            <div><span className="text-slate-500">Трек:</span> {project.tracks.find(t => t.clips.some(c => c.id === selectedClip.id))?.name}</div>
            <div><span className="text-slate-500">Скорость:</span> {(selectedClip as any).speed ?? 1}x</div>
            <div><span className="text-slate-500">Перевернут:</span> {(selectedClip as any).reversed ? "Да" : "Нет"}</div>
          </div>
        ) : (
          <div className="text-xs text-slate-500">Клип не выбран.</div>
        )}
      </section>
    </div>
  );
}
