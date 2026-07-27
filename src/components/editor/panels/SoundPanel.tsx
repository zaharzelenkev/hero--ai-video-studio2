"use client";

import { useEffect, useRef, useState } from "react";
import { useSelectedClip } from "./common";
import ParamControl from "../ParamControl";
import { useProjectStore } from "@/store/projectStore";
import { loadBlob } from "@/lib/db";
import { computeWaveformPeaks } from "@/lib/media";
import type { AudioClip, VideoClip } from "@/lib/types";

function Waveform({ assetBlobKey }: { assetBlobKey: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const blob = await loadBlob(assetBlobKey);
      if (!blob || !active) return;
      try {
        const p = await computeWaveformPeaks(blob, 300);
        if (active) setPeaks(p);
      } catch {
        if (active) setPeaks([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [assetBlobKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#a78bfa";
    const barW = canvas.width / peaks.length;
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * canvas.height);
      ctx.fillRect(i * barW, (canvas.height - h) / 2, Math.max(1, barW - 1), h);
    });
  }, [peaks]);

  return <canvas ref={canvasRef} width={520} height={64} className="w-full rounded-md bg-black/30" />;
}

export default function SoundPanel() {
  const updateClip = useProjectStore((s) => s.updateClip);
  const project = useProjectStore((s) => s.project);
  const { clip, audioClip, videoClip, localTime } = useSelectedClip();
  const audioAsset = audioClip ? project?.assets.find((a) => a.id === audioClip.assetId) : undefined;

  if (!clip) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Звук</h3>
        <p className="text-xs text-slate-500">
          Выберите аудио-клип (музыка/озвучка) или видео-клип, чтобы настроить громкость, эквалайзер и шумоподавление.
        </p>
      </div>
    );
  }

  if (audioClip) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Звук — {audioClip.name}</h3>
        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-[11px] font-medium text-slate-300">Волновая форма</p>
          {audioAsset && <Waveform assetBlobKey={audioAsset.blobKey} key={audioClip.id} />}
        </div>
        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <ParamControl label="Громкость" param={audioClip.volume} localTime={localTime} clipDuration={audioClip.duration} min={0} max={2} onChange={(p) => updateClip(clip.id, (c) => ({ ...c, volume: p } as AudioClip))} />
          <label className="mb-2 block text-[11px] text-slate-400">
            Фейд-ин: {audioClip.fadeIn.toFixed(2)}с
            <input type="range" min={0} max={3} step={0.05} value={audioClip.fadeIn} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, fadeIn: parseFloat(e.target.value) } as AudioClip))} className="mt-1 h-1 w-full accent-violet-500" />
          </label>
          <label className="block text-[11px] text-slate-400">
            Фейд-аут: {audioClip.fadeOut.toFixed(2)}с
            <input type="range" min={0} max={3} step={0.05} value={audioClip.fadeOut} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, fadeOut: parseFloat(e.target.value) } as AudioClip))} className="mt-1 h-1 w-full accent-violet-500" />
          </label>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-[11px] font-medium text-slate-300">3-полосный эквалайзер (дБ)</p>
          {(["eqLow", "eqMid", "eqHigh"] as const).map((band) => (
            <label key={band} className="mb-2 block text-[11px] text-slate-400">
              {band === "eqLow" ? "Низкие (100Hz)" : band === "eqMid" ? "Средние (1.2kHz)" : "Высокие (8kHz)"}: {audioClip[band]} дБ
              <input
                type="range"
                min={-15}
                max={15}
                step={1}
                value={audioClip[band]}
                onChange={(e) => updateClip(clip.id, (c) => ({ ...c, [band]: parseInt(e.target.value) } as AudioClip))}
                className="mt-1 h-1 w-full accent-violet-500"
              />
            </label>
          ))}
          <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={audioClip.denoise} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, denoise: e.target.checked } as AudioClip))} />
            Шумоподавление
          </label>
        </div>
      </div>
    );
  }

  if (videoClip) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Звук клипа — {videoClip.name}</h3>
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <label className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={videoClip.muted} onChange={(e) => updateClip(clip.id, (c) => ({ ...c, muted: e.target.checked } as VideoClip))} />
            Отключить встроенный звук
          </label>
          {!videoClip.muted && (
            <ParamControl label="Громкость" param={videoClip.volume} localTime={localTime} clipDuration={videoClip.duration} min={0} max={2} onChange={(p) => updateClip(clip.id, (c) => ({ ...c, volume: p } as VideoClip))} />
          )}
        </div>
      </div>
    );
  }

  return null;
}
