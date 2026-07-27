"use client";

import { useState } from "react";
import { useSelectedClip } from "./common";
import ParamControl from "../ParamControl";
import { useProjectStore } from "@/store/projectStore";
import { createTextClip, createTrack } from "@/lib/factories";
import { applyAnimationPreset } from "@/lib/textAnimation";
import { TEXT_FONTS } from "@/lib/presets";
import { loadBlob } from "@/lib/db";
import { extractAudioForTranscription, transcribeAudio } from "@/lib/transcribe";
import type { TextAnimation, TextClip } from "@/lib/types";

export default function TextPanel() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const updateClip = useProjectStore((s) => s.updateClip);
  const selectClip = useProjectStore((s) => s.selectClip);
  const playhead = useProjectStore((s) => s.playhead);
  const { clip, textClip, localTime } = useSelectedClip();

  const speechAssets = (project?.assets ?? []).filter((a) => a.kind === "video" || a.kind === "audio");
  const [transcribeAssetId, setTranscribeAssetId] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");

  const addTitle = () => {
    updateProject((p) => {
      const textTrack = p.tracks.find((t) => t.type === "text") ?? createTrack("text", "Титры");
      const exists = p.tracks.some((t) => t.id === textTrack.id);
      const newClip = createTextClip({ trackId: textTrack.id, start: playhead, duration: 3 });
      const tracks = exists
        ? p.tracks.map((t) => (t.id === textTrack.id ? { ...t, clips: [...t.clips, newClip] } : t))
        : [...p.tracks, { ...textTrack, clips: [newClip] }];
      setTimeout(() => selectClip(newClip.id), 0);
      return { ...p, tracks };
    });
  };

  const applyPreset = (which: "animationIn" | "animationOut", value: TextAnimation) => {
    if (!textClip) return;
    updateClip(textClip.id, (c) => applyAnimationPreset({ ...(c as TextClip), [which]: value }));
  };

  const runTranscription = async () => {
    const asset = speechAssets.find((a) => a.id === transcribeAssetId);
    if (!asset) return;
    setTranscribing(true);
    setTranscribeError("");
    try {
      const sourceBlob = await loadBlob(asset.blobKey);
      if (!sourceBlob) throw new Error("Не нашли исходный файл в браузере.");
      const audio = await extractAudioForTranscription(sourceBlob, asset);
      const segments = await transcribeAudio(audio);
      if (!segments.length) throw new Error("Не удалось распознать речь в этом файле.");
      updateProject((p) => {
        const textTrack = p.tracks.find((t) => t.type === "text") ?? createTrack("text", "Титры");
        const exists = p.tracks.some((t) => t.id === textTrack.id);
        const newClips = segments.map((seg) =>
          createTextClip({
            trackId: textTrack.id,
            start: Math.max(0, seg.start),
            duration: Math.max(0.4, seg.end - seg.start),
            text: seg.text,
          }),
        );
        const tracks = exists
          ? p.tracks.map((t) => (t.id === textTrack.id ? { ...t, clips: [...t.clips, ...newClips] } : t))
          : [...p.tracks, { ...textTrack, clips: newClips }];
        return { ...p, tracks };
      });
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : "Не удалось распознать речь");
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Текст и титры</h3>
      <button onClick={addTitle} className="mb-3 w-full rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-xs font-semibold text-white">
        + Добавить титр на плейхеде
      </button>

      {speechAssets.length > 0 && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-[11px] font-medium text-slate-300">Субтитры по озвучке</p>
          <select
            value={transcribeAssetId}
            onChange={(e) => setTranscribeAssetId(e.target.value)}
            className="mb-2 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
          >
            <option value="">Выберите файл с речью…</option>
            {speechAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={runTranscription}
            disabled={!transcribeAssetId || transcribing}
            className="w-full rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
          >
            {transcribing ? "Распознаём речь…" : "Расшифровать и расставить титры"}
          </button>
          {transcribeError && <p className="mt-2 text-[10px] leading-relaxed text-red-300">{transcribeError}</p>}
        </div>
      )}

      {!textClip && <p className="text-xs text-slate-500">Выберите текстовый клип на таймлайне (жёлтая дорожка), чтобы редактировать его.</p>}

      {textClip && clip && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <label className="mb-1 block text-[11px] text-slate-400">Текст</label>
            <textarea
              value={textClip.text}
              onChange={(e) => updateClip(clip.id, (c) => ({ ...c, text: e.target.value } as TextClip))}
              rows={2}
              className="mb-2 w-full resize-none rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={textClip.fontFamily} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, fontFamily: e.target.value } as TextClip))} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100">
                {TEXT_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select value={textClip.align} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, align: e.target.value as TextClip["align"] } as TextClip))} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100">
                <option value="left">Слева</option>
                <option value="center">По центру</option>
                <option value="right">Справа</option>
              </select>
            </div>
            <div className="mt-2 grid grid-cols-3 items-center gap-2">
              <label className="text-[11px] text-slate-400">
                Размер
                <input type="number" value={textClip.fontSize} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, fontSize: parseInt(e.target.value) || 24 } as TextClip))} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-slate-100" />
              </label>
              <label className="text-[11px] text-slate-400">
                Цвет
                <input type="color" value={textClip.color} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, color: e.target.value } as TextClip))} className="mt-1 h-7 w-full rounded border border-white/10 bg-transparent" />
              </label>
              <label className="text-[11px] text-slate-400">
                Подложка
                <input
                  type="color"
                  value={textClip.backgroundColor === "transparent" ? "#000000" : textClip.backgroundColor}
                  onChange={(e) => updateClip(clip.id, (c) => ({ ...c, backgroundColor: e.target.value } as TextClip))}
                  className="mt-1 h-7 w-full rounded border border-white/10 bg-transparent"
                />
              </label>
            </div>
            <button
              onClick={() => updateClip(clip.id, (c) => ({ ...c, backgroundColor: "transparent" } as TextClip))}
              className="mt-1 text-[10px] text-slate-500 hover:text-slate-300"
            >
              Убрать подложку
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-[11px] font-medium text-slate-300">Анимация появления/исчезновения</p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <select value={textClip.animationIn} onChange={(e) => applyPreset("animationIn", e.target.value as TextAnimation)} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100">
                {(["none", "fade", "slide-up", "slide-left", "pop"] as TextAnimation[]).map((a) => (
                  <option key={a} value={a}>
                    Вход: {a}
                  </option>
                ))}
              </select>
              <select value={textClip.animationOut} onChange={(e) => applyPreset("animationOut", e.target.value as TextAnimation)} className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100">
                {(["none", "fade", "slide-up", "slide-left", "pop"] as TextAnimation[]).map((a) => (
                  <option key={a} value={a}>
                    Выход: {a}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-slate-500">Пресеты автоматически расставляют ключевые кадры прозрачности/позиции — их можно донастроить ниже.</p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-2 text-[11px] font-medium text-slate-300">Позиция (keyframes ◆)</p>
            <ParamControl label="Прозрачность" param={textClip.opacity} localTime={localTime} clipDuration={textClip.duration} min={0} max={1} onChange={(p) => updateClip(clip.id, (c) => ({ ...c, opacity: p } as TextClip))} />
            <ParamControl label="X" param={textClip.x} localTime={localTime} clipDuration={textClip.duration} min={-1} max={1} onChange={(p) => updateClip(clip.id, (c) => ({ ...c, x: p } as TextClip))} />
            <ParamControl label="Y" param={textClip.y} localTime={localTime} clipDuration={textClip.duration} min={-1} max={1} onChange={(p) => updateClip(clip.id, (c) => ({ ...c, y: p } as TextClip))} />
            <ParamControl label="Масштаб" param={textClip.scale} localTime={localTime} clipDuration={textClip.duration} min={0.2} max={3} onChange={(p) => updateClip(clip.id, (c) => ({ ...c, scale: p } as TextClip))} />
          </div>
        </div>
      )}

      {project && project.tracks.filter((t) => t.type === "text").flatMap((t) => t.clips).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium text-slate-300">Все титры проекта</p>
          <div className="space-y-1">
            {project.tracks
              .filter((t) => t.type === "text")
              .flatMap((t) => t.clips as TextClip[])
              .map((tc) => (
                <button
                  key={tc.id}
                  onClick={() => selectClip(tc.id)}
                  className={`block w-full truncate rounded-md border px-2 py-1 text-left text-[11px] ${
                    clip?.id === tc.id ? "border-violet-400 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  {tc.start.toFixed(1)}s — {tc.text || "(пусто)"}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
