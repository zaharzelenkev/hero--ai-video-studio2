"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useProjectStore, findClip, timelineDuration } from "@/store/projectStore";
import { renderFrame, syncVideoElements } from "@/lib/editor/compositor";
import { mergeVfxSettings } from "@/lib/editor/vfx";
import type { VideoClip } from "@/lib/types";
import { audioMixer } from "@/lib/editor/audioMixer";
import { mediaPool } from "@/lib/editor/resourcePool";

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
  const [guides, setGuides] = useState(false);
  const [fit, setFit] = useState<{ width: number; height: number }>({ width: 640, height: 360 });
  const [objectSelectMode, setObjectSelectMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const objectStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const requestSelection = () => {
      objectStartRef.current = null;
      setSelectionRect(null);
      setObjectSelectMode(true);
    };
    window.addEventListener("montiq:vfx-object-select", requestSelection);
    return () => window.removeEventListener("montiq:vfx-object-select", requestSelection);
  }, []);

  const pointerPosition = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  }, []);

  const onObjectPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!objectSelectMode) return;
    event.preventDefault();
    const point = pointerPosition(event);
    if (!point) return;
    objectStartRef.current = point;
    setSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [objectSelectMode, pointerPosition]);

  const onObjectPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!objectSelectMode || !objectStartRef.current) return;
    const point = pointerPosition(event);
    if (!point) return;
    const start = objectStartRef.current;
    setSelectionRect({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
  }, [objectSelectMode, pointerPosition]);

  const onObjectPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!objectSelectMode || !objectStartRef.current) return;
    const point = pointerPosition(event);
    const start = objectStartRef.current;
    objectStartRef.current = null;
    setObjectSelectMode(false);
    if (!point) return;
    const rect = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) };
    setSelectionRect(rect);
    if (rect.width < 0.01 || rect.height < 0.01) return;
    const state = useProjectStore.getState();
    const found = findClip(state.project, state.selectedClipId);
    if (!found || (found.clip.type !== "video" && found.clip.type !== "image")) return;
    state.updateClip(found.clip.id, (clip) => {
      const visual = clip as VideoClip;
      return { ...visual, effects: [...new Set([...(visual.effects ?? []), "object-removal"])], vfx: { ...mergeVfxSettings(visual.vfx), objectRemoval: { ...mergeVfxSettings(visual.vfx).objectRemoval, ...rect, enabled: true } } };
    });
  }, [objectSelectMode, pointerPosition]);

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

  return (
    <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black/60">
      <canvas
        ref={canvasRef}
        style={{ width: fit.width, height: fit.height }}
        className={`rounded-lg bg-black shadow-[0_0_60px_rgba(0,0,0,0.6)] ring-1 ring-white/10 ${objectSelectMode ? "cursor-crosshair" : ""}`}
        aria-label="Окно предпросмотра"
        onPointerDown={onObjectPointerDown}
        onPointerMove={onObjectPointerMove}
        onPointerUp={onObjectPointerUp}
      />

      {objectSelectMode && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-dashed border-amber-300/80 bg-amber-400/10 px-3 py-1 text-[10px] font-bold text-amber-100" style={{ width: fit.width, height: fit.height }}>
          Потяните рамку Object Removal
        </div>
      )}
      {selectionRect && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: fit.width, height: fit.height }}>
          <div className={`absolute border ${objectSelectMode ? "border-amber-300/90 bg-amber-300/15" : "border-emerald-300/80 bg-emerald-300/10"}`} style={{ left: `${selectionRect.x * 100}%`, top: `${selectionRect.y * 100}%`, width: `${selectionRect.width * 100}%`, height: `${selectionRect.height * 100}%` }} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-mono text-slate-300 backdrop-blur">
          {resolution ? `${resolution.width}×${resolution.height}` : "—"}
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button
            onClick={() => setGuides((g) => !g)}
            className={`rounded-lg border px-2 py-1 text-[10px] font-bold backdrop-blur transition ${
              guides ? "border-violet-400/50 bg-violet-500/25 text-violet-100" : "border-white/10 bg-black/60 text-slate-300 hover:text-white"
            }`}
            title="Безопасные зоны и сетка третей"
          >
            ⊞ Сетка
          </button>
          <button
            onClick={toggleFullscreen}
            className="rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-bold text-slate-300 backdrop-blur transition hover:text-white"
            title="Полный экран"
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}
