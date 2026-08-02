"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useProjectStore, timelineDuration, findClip } from "@/store/projectStore";
import { renderFrame, syncVideoElements } from "@/lib/editor/compositor";
import { audioMixer } from "@/lib/editor/audioMixer";
import { mediaPool } from "@/lib/editor/resourcePool";
import { vfxBrush } from "@/lib/editor/vfxBrush";
import { interactiveSegmentService, maskToPolygon } from "@/lib/editor/mediaPipeVfx";
import { defaultVfx } from "@/lib/factories";
import { Icon } from "@/components/ui/Icon";
import type { Clip, VideoClip } from "@/lib/types";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const MAX_PREVIEW_WIDTH = 1280;

function audioSignature(): string {
  const project = useProjectStore.getState().project;
  if (!project) return "";
  const parts: string[] = [];
  for (const track of project.tracks) {
    if (track.type !== "audio") continue;
    parts.push(`${track.id}:${track.muted ? 1 : 0}${track.solo ? 1 : 0}`);
    for (const clip of track.clips) {
      if (clip.type !== "audio") continue;
      parts.push(
        [
          clip.id,
          clip.start.toFixed(3),
          clip.duration.toFixed(3),
          clip.inPoint.toFixed(3),
          clip.volume?.value ?? 1,
          clip.fadeIn ?? 0,
          clip.fadeOut ?? 0,
          clip.eqLow ?? 0,
          clip.eqMid ?? 0,
          clip.eqHigh ?? 0,
          clip.muted ? 1 : 0,
          clip.loop ? 1 : 0,
          clip.speed ?? 1,
          clip.denoise ? 1 : 0,
          clip.compressor?.enabled ? 1 : 0,
          clip.pan?.value ?? 0,
        ].join("|"),
      );
    }
  }
  return parts.join(";");
}

export default function PreviewCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const expectedPlayheadRef = useRef<number>(0);
  const audioSigRef = useRef<string>("");

  const resolution = useProjectStore((s) => s.project?.resolution);
  const projectId = useProjectStore((s) => s.project?.id);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const clipCount = useProjectStore((s) => s.project?.tracks.reduce((n, t) => n + t.clips.length, 0) ?? 0);
  const [guides, setGuides] = useState(false);
  const [fit, setFit] = useState<{ width: number; height: number }>({ width: 640, height: 360 });

  /* --------------------------- render loop --------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tick = (now: number) => {
      frameRef.current = requestAnimationFrame(tick);
      const state = useProjectStore.getState();
      const project = state.project;
      if (!project) return;

      const last = lastTickRef.current || now;
      lastTickRef.current = now;
      const delta = Math.min(0.25, (now - last) / 1000);

      let time = state.playhead;
      if (state.isPlaying) {
        const total = timelineDuration(project);
        const rangeStart = state.inPoint ?? 0;
        const rangeEnd = state.outPoint ?? total;
        time = state.playhead + delta * state.playbackRate;
        if (time >= rangeEnd - 1e-4) {
          if (state.loop) {
            time = rangeStart;
            audioMixer.play(project, time, state.playbackRate, state.volume);
          } else {
            time = Math.max(0, rangeEnd);
            state.setPlaying(false);
          }
        }
        state.setPlayhead(time);
        expectedPlayheadRef.current = time;
      } else {
        expectedPlayheadRef.current = time;
      }

      const width = Math.min(MAX_PREVIEW_WIDTH, project.resolution.width || 1280);
      const height = Math.round((width / (project.resolution.width || 1280)) * (project.resolution.height || 720));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      syncVideoElements(project, time, {
        isPlaying: state.isPlaying,
        rate: state.playbackRate,
        masterVolume: state.volume,
      });
      renderFrame(ctx, project, time, { guides });
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [guides]);

  /* --------------------------- audio engine -------------------------- */
  useEffect(() => {
    const state = useProjectStore.getState();
    if (isPlaying && state.project) {
      audioSigRef.current = audioSignature();
      audioMixer.play(state.project, state.playhead, state.playbackRate, state.volume);
    } else {
      audioMixer.stop();
    }
    return () => {
      if (!useProjectStore.getState().isPlaying) audioMixer.stop();
    };
  }, [isPlaying]);

  // Пересобираем аудио-граф при seek или правках во время воспроизведения.
  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => {
      if (!state.isPlaying || !state.project) return;
      const drift = Math.abs(state.playhead - expectedPlayheadRef.current);
      const signature = audioSignature();
      if (drift > 0.22 || signature !== audioSigRef.current) {
        audioSigRef.current = signature;
        expectedPlayheadRef.current = state.playhead;
        audioMixer.play(state.project, state.playhead, state.playbackRate, state.volume);
      }
    });
    return unsubscribe;
  }, []);

  // Мастер-громкость.
  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => audioMixer.setMasterVolume(state.volume));
    return unsubscribe;
  }, []);

  // Освобождаем ресурсы клипов, которых больше нет.
  useEffect(() => {
    const interval = setInterval(() => {
      const project = useProjectStore.getState().project;
      if (!project) return;
      const ids = new Set<string>();
      for (const track of project.tracks) for (const clip of track.clips) ids.add(clip.id);
      mediaPool.retainClips(ids);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  /* --------------------------- viewport fit -------------------------- */
  const recomputeFit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !resolution) return;
    const rect = wrap.getBoundingClientRect();
    const padding = 24;
    const availableW = Math.max(120, rect.width - padding);
    const availableH = Math.max(80, rect.height - padding);
    const aspect = (resolution.width || 16) / (resolution.height || 9);
    let width = availableW;
    let height = width / aspect;
    if (height > availableH) {
      height = availableH;
      width = height * aspect;
    }
    setFit({ width, height });
  }, [resolution]);

  useEffect(() => {
    recomputeFit();
    const observer = new ResizeObserver(recomputeFit);
    if (wrapRef.current) observer.observe(wrapRef.current);
    window.addEventListener("resize", recomputeFit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recomputeFit);
    };
  }, [recomputeFit, projectId]);

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  /* ------------------- кисть удаления объекта ------------------- */
  const brushRef = useRef(false);
  const [brushCursor, setBrushCursor] = useState(false);

  const canvasToNorm = (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };

  const brushClip = (): VideoClip | null => {
    const state = useProjectStore.getState();
    const found = findClip(state.project, state.selectedClipId);
    if (!found || (found.clip.type !== "video" && found.clip.type !== "image")) return null;
    return found.clip as VideoClip;
  };

  const saveStrokes = (clip: VideoClip, strokes: { x: number; y: number; radius: number }[]) => {
    useProjectStore.getState().updateClip(clip.id, (c) => {
      const vc = c as VideoClip;
      const vfx = vc.vfx ?? defaultVfx();
      return {
        ...vc,
        vfx: {
          ...vfx,
          objectRemoval: {
            ...vfx.objectRemoval,
            enabled: true,
            strokes: [...(vfx.objectRemoval.strokes ?? []), ...strokes],
          },
        },
      } as Clip;
    });
  };

  const handleAiPick = async (clip: VideoClip, x: number, y: number) => {
    const state = useProjectStore.getState();
    const asset = state.project?.assets.find((a) => a.id === clip.assetId);
    const source =
      clip.type === "video" && asset
        ? mediaPool.videoFor(clip.id, asset)
        : asset
          ? mediaPool.imageFor(asset)
          : null;
    if (!source) return;
    try {
      const mask = await interactiveSegmentService.segmentAt(source, x, y);
      const polygon = maskToPolygon(mask);
      vfxBrush.state.aiPickClipId = null;
      if (polygon.length >= 3) {
        state.updateClip(clip.id, (c) => {
          const vc = c as VideoClip;
          const vfx = vc.vfx ?? defaultVfx();
          return {
            ...vc,
            vfx: { ...vfx, objectRemoval: { ...vfx.objectRemoval, enabled: true, region: { polygon } } },
          } as Clip;
        });
      }
    } catch (err) {
      vfxBrush.state.aiPickClipId = null;
      console.error("AI-выделение объекта не удалось:", err);
    }
  };

  const onBrushDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const clip = brushClip();
    if (!clip) return;
    if (vfxBrush.state.aiPickClipId === clip.id) {
      const norm = canvasToNorm(e);
      if (norm) void handleAiPick(clip, norm.x, norm.y);
      return;
    }
    if (!vfxBrush.isActive(clip.id)) return;
    const norm = canvasToNorm(e);
    if (!norm) return;
    e.preventDefault();
    brushRef.current = true;
    vfxBrush.beginStroke(norm.x, norm.y);
  };

  const onBrushMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const clip = brushClip();
    if (!clip) return;
    setBrushCursor(vfxBrush.isActive(clip.id) || vfxBrush.state.aiPickClipId === clip.id);
    if (!brushRef.current || !vfxBrush.isActive(clip.id)) return;
    const norm = canvasToNorm(e);
    if (norm) vfxBrush.addPoint(norm.x, norm.y);
  };

  const onBrushUp = () => {
    brushRef.current = false;
    const clip = brushClip();
    if (!clip) return;
    const stroke = vfxBrush.endStroke();
    if (stroke?.length && vfxBrush.isActive(clip.id)) {
      saveStrokes(clip, stroke);
    }
  };

  return (
    <div ref={wrapRef} className="preview-stage relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Мягкое свечение за кадром */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 50% 50%, rgba(124,108,246,0.08), transparent 70%)" }}
      />

      <div className="relative" style={{ width: fit.width, height: fit.height }}>
        <canvas
          ref={canvasRef}
          style={{
            width: fit.width,
            height: fit.height,
            cursor: brushCursor ? "crosshair" : "default",
            touchAction: "none",
          }}
          className="preview-canvas rounded-[6px] bg-black"
          aria-label="Окно предпросмотра"
          onPointerDown={onBrushDown}
          onPointerMove={onBrushMove}
          onPointerUp={onBrushUp}
          onPointerCancel={onBrushUp}
          onPointerLeave={() => {
            if (brushRef.current) onBrushUp();
          }}
        />
        {/* Профессиональные уголки рамки */}
        <div className="preview-corner preview-corner-tl" />
        <div className="preview-corner preview-corner-tr" />
        <div className="preview-corner preview-corner-bl" />
        <div className="preview-corner preview-corner-br" />
      </div>

      {/* Верхние оверлеи */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/55 px-2 py-1 font-mono text-[10px] text-slate-300 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" style={{ boxShadow: "0 0 8px rgba(124,108,246,0.9)" }} />
          {resolution ? `${resolution.width}×${resolution.height}` : "—"}
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            onClick={() => setGuides((g) => !g)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold backdrop-blur-md transition-all ${
              guides
                ? "border-violet-400/50 bg-violet-500/25 text-violet-100 shadow-[0_0_12px_-4px_rgba(124,108,246,0.7)]"
                : "border-white/10 bg-black/55 text-slate-300 hover:text-white"
            }`}
            title="Безопасные зоны и сетка третей"
          >
            <Icon name="grid" size={12} />
            Сетка
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex items-center justify-center rounded-lg border border-white/10 bg-black/55 p-1.5 text-slate-300 backdrop-blur-md transition-all hover:text-white"
            title="Полный экран"
          >
            <Icon name="maximize" size={13} />
          </button>
        </div>
      </div>

      {/* Пустой проект — подсказка */}
      {clipCount === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-slate-500">
            <Icon name="film" size={22} strokeWidth={1.5} />
          </div>
          <div className="text-xs font-semibold text-slate-400">Таймлайн пуст</div>
          <div className="max-w-[220px] text-center text-[10px] leading-relaxed text-slate-600">
            Импортируйте видео, аудио или фото и перетащите их на таймлайн — или нажмите «Добавить медиа».
          </div>
        </div>
      )}

      {/* Индикатор записи/воспроизведения */}
      {isPlaying && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-0.5 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" style={{ boxShadow: "0 0 8px rgba(244,63,94,0.9)" }} />
          <span className="font-mono text-[9px] uppercase tracking-widest text-slate-400">Play</span>
        </div>
      )}
    </div>
  );
}
