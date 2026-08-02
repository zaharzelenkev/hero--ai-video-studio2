"use client";

import { create } from "zustand";
import type { AudioClip, Clip, MediaAsset, Marker, Project, TextClip, Track, TrackType, VideoClip } from "@/lib/types";
import { saveProject } from "@/lib/db";
import { uid } from "@/lib/id";
import { createAudioClip, createTextClip, createVideoClip } from "@/lib/factories";
import { createMotionGraphicClip } from "@/lib/motionGraphics";
import type { MotionGraphicKind } from "@/lib/types";
import {
  analyzePictureLock,
  clipIsStructuralEdit,
  fixPictureLock,
  isPictureLocked,
  lockPicture,
  projectStructuralSignature,
  unlockPicture,
} from "@/lib/pictureLock";

/** Страницы инспектора редактора. `offline` — отчёт чернового монтажа
 *  (какие дубли выбраны, что вырезано, как поставлена каждая сцена). */
export type EditorPage = "media" | "montage" | "color" | "effects" | "sound" | "text" | "motion" | "animation" | "ai" | "offline" | "lock" | "export";
export type EditorTool = "select" | "razor" | "hand";
export type TrimEdge = "in" | "out";

/** Минимальная длительность клипа на таймлайне (сек). */
export const MIN_CLIP_DURATION = 0.08;

interface ProjectState {
  project: Project | null;

  /* --- selection --- */
  selectedClipIds: string[];
  /** Первый выделенный клип — совместимость с однокликовыми панелями. */
  selectedClipId: string | null;
  selectedTrackId: string | null;

  /* --- transport --- */
  playhead: number;
  isPlaying: boolean;
  playbackRate: number;
  loop: boolean;
  inPoint: number | null;
  outPoint: number | null;
  volume: number;

  /* --- editing environment --- */
  activePage: EditorPage;
  tool: EditorTool;
  snapping: boolean;
  ripple: boolean;
  pxPerSecond: number;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: number | null;

  /* --- history / clipboard --- */
  past: string[];
  future: string[];
  clipboard: Clip[];

  /* --- history helpers --- */
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Снимок состояния перед интерактивной операцией (drag / trim). */
  beginHistory: () => void;

  /* --- project lifecycle --- */
  loadProject: (p: Project) => void;
  persist: () => Promise<void>;
  updateProject: (fn: (p: Project) => Project, options?: { history?: boolean }) => void;
  setTitle: (title: string) => void;
  setResolution: (width: number, height: number) => void;
  setFps: (fps: number) => void;

  /* --- ui state --- */
  setActivePage: (page: EditorPage) => void;
  setTool: (tool: EditorTool) => void;
  toggleSnapping: () => void;
  toggleRipple: () => void;
  setZoom: (px: number) => void;
  zoomBy: (factor: number) => void;

  /* --- transport --- */
  setPlayhead: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setPlaybackRate: (rate: number) => void;
  setLoop: (loop: boolean) => void;
  setVolume: (v: number) => void;
  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;
  clearRange: () => void;

  /* --- selection --- */
  selectClip: (id: string | null, additive?: boolean) => void;
  selectClips: (ids: string[]) => void;
  clearSelection: () => void;
  selectTrack: (id: string | null) => void;

  /* --- assets --- */
  addAssets: (assets: MediaAsset[]) => void;
  removeAsset: (assetId: string) => void;

  /* --- clips --- */
  updateClip: (clipId: string, fn: (c: Clip) => Clip, options?: { history?: boolean }) => void;
  updateSelectedClips: (fn: (c: Clip) => Clip) => void;
  removeClip: (clipId: string) => void;
  removeSelected: () => void;
  rippleDeleteSelected: () => void;
  duplicateClip: (clipId: string) => void;
  splitClipAt: (clipId: string, time: number) => void;
  splitAtPlayhead: () => void;
  moveClip: (clipId: string, targetTrackId: string, newStart: number, options?: { history?: boolean }) => void;
  trimClip: (clipId: string, edge: TrimEdge, newTime: number, options?: { history?: boolean }) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  detachAudio: (clipId: string) => void;
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
  alignSelectedToPlayhead: () => void;
  closeGapsOnTrack: (trackId: string) => void;

  /* --- picture lock --- */
  /** true, если монтаж зафиксирован (Picture Lock подтверждён). */
  isEditLocked: () => boolean;
  /** Прогнать проверки Picture Lock и сохранить отчёт (без правок). */
  runPictureLockCheck: () => void;
  /** Автоматически исправить найденные проблемы и обновить отчёт. */
  applyPictureLockFixes: () => void;
  /** Подтвердить Picture Lock: монтаж фиксируется, правки тайминга блокируются. */
  confirmPictureLock: () => void;
  /** Снять фиксацию и вернуться к монтажу. */
  unlockPictureLock: () => void;

  /* --- creating content --- */
  addClipFromAsset: (assetId: string, options?: { trackId?: string; start?: number; select?: boolean }) => string | null;
  addTextClip: (text?: string) => string | null;
  /** Создать клип моушн-графики выбранного вида на плейхеде. */
  addMotionGraphic: (kind: MotionGraphicKind, text?: string, duration?: number) => string | null;

  /* --- tracks --- */
  addTrack: (track: Track) => void;
  createTrack: (type: TrackType) => string;
  removeTrack: (trackId: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  toggleTrackProp: (trackId: string, prop: "hidden" | "muted" | "locked" | "solo") => void;
  setTrackHeight: (trackId: string, height: number) => void;
  moveTrack: (trackId: string, direction: -1 | 1) => void;

  /* --- markers --- */
  addMarker: (time: number, label?: string) => void;
  removeMarker: (id: string) => void;
  renameMarker: (id: string, label: string) => void;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function timelineDuration(project: Project | null): number {
  if (!project) return 0;
  let max = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.start + clip.duration);
    }
  }
  return max;
}

function recomputeDuration(project: Project): number {
  return timelineDuration(project);
}

export function findClip(project: Project | null, clipId: string | null): { track: Track; clip: Clip } | null {
  if (!project || !clipId) return null;
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function assetOf(project: Project | null, clip: Clip | undefined | null): MediaAsset | undefined {
  if (!project || !clip) return undefined;
  const assetId = (clip as { assetId?: string }).assetId;
  if (!assetId) return undefined;
  return project.assets.find((a) => a.id === assetId);
}

/** Полная длительность исходника клипа (сек) с учётом скорости. */
export function clipSourceLimit(project: Project | null, clip: Clip): number | null {
  if (clip.type === "text" || clip.type === "subtitle") return null;
  if (clip.type === "image") return null;
  const asset = assetOf(project, clip);
  if (!asset || !asset.duration) return null;
  return asset.duration;
}

function sortClips(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.start - b.start);
}

function withTracks(project: Project, tracks: Track[]): Project {
  const next: Project = { ...project, tracks, updatedAt: Date.now() };
  next.duration = recomputeDuration(next);
  return next;
}

function pushHistory(state: ProjectState, nextProject: Project, record: boolean): Partial<ProjectState> {
  if (!state.project || !record) {
    return { project: nextProject, dirty: true };
  }
  const snapshot = JSON.stringify(state.project);
  const past = state.past.length && state.past[state.past.length - 1] === snapshot
    ? state.past
    : [...state.past, snapshot].slice(-80);
  return { project: nextProject, dirty: true, past, future: [] };
}

function trackTypeForKind(kind: MediaAsset["kind"]): TrackType {
  return kind === "audio" ? "audio" : "video";
}

/**
 * Приводит проект из IndexedDB к актуальной форме: старые сохранения могли
 * не иметь маркеров, ассетов или отсортированных клипов — редактор
 * рассчитывает, что эти поля есть всегда.
 */
function normalizeProject(p: Project): Project {
  const resolution = p.resolution ?? { width: 1920, height: 1080 };
  const fps = p.fps || 30;
  const next: Project = {
    ...p,
    resolution,
    fps,
    assets: p.assets ?? [],
    markers: p.markers ?? [],
    tracks: (p.tracks ?? []).map((track) => ({
      ...track,
      clips: sortClips(track.clips ?? []),
      hidden: track.hidden ?? false,
      muted: track.muted ?? false,
      locked: track.locked ?? false,
    })),
    exportSettings: p.exportSettings ?? {
      width: resolution.width,
      height: resolution.height,
      fps,
      format: "mp4",
      crf: 23,
    },
    // Старые сохранения не знают о Picture Lock — считаем монтаж свободным.
    pictureLock: p.pictureLock ?? { stage: "none" },
  };
  next.duration = recomputeDuration(next) || p.duration || 0;
  return next;
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,

  selectedClipIds: [],
  selectedClipId: null,
  selectedTrackId: null,

  playhead: 0,
  isPlaying: false,
  playbackRate: 1,
  loop: false,
  inPoint: null,
  outPoint: null,
  volume: 1,

  activePage: "montage",
  tool: "select",
  snapping: true,
  ripple: false,
  pxPerSecond: 60,
  dirty: false,
  saving: false,
  lastSavedAt: null,

  past: [],
  future: [],
  clipboard: [],

  /* ------------------------------ history ------------------------- */
  undo: () =>
    set((s) => {
      if (!s.project || s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        project: JSON.parse(previous) as Project,
        past: s.past.slice(0, -1),
        future: [JSON.stringify(s.project), ...s.future].slice(0, 80),
        dirty: true,
      };
    }),

  redo: () =>
    set((s) => {
      if (!s.project || s.future.length === 0) return s;
      const next = s.future[0];
      return {
        project: JSON.parse(next) as Project,
        past: [...s.past, JSON.stringify(s.project)].slice(-80),
        future: s.future.slice(1),
        dirty: true,
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  beginHistory: () =>
    set((s) => {
      if (!s.project) return s;
      const snapshot = JSON.stringify(s.project);
      if (s.past.length && s.past[s.past.length - 1] === snapshot) return s;
      return { past: [...s.past, snapshot].slice(-80), future: [] };
    }),

  /* ------------------------------ project ------------------------- */
  loadProject: (p) =>
    set({
      project: normalizeProject(p),
      selectedClipIds: [],
      selectedClipId: null,
      selectedTrackId: p.tracks[0]?.id ?? null,
      playhead: 0,
      isPlaying: false,
      inPoint: null,
      outPoint: null,
      dirty: false,
      past: [],
      future: [],
    }),

  persist: async () => {
    const { project } = get();
    if (!project) return;
    set({ saving: true });
    try {
      await saveProject(project);
      set({ dirty: false, lastSavedAt: Date.now() });
    } finally {
      set({ saving: false });
    }
  },

  updateProject: (fn, options) =>
    set((s) => {
      if (!s.project) return s;
      const next = fn(s.project);
      // Picture Lock: после подтверждения монтаж (склейки, тайминг, выбор
      // исходников) менять нельзя — только цвет, звук, титры и эффекты.
      if (isPictureLocked(s.project) && projectStructuralSignature(next) !== projectStructuralSignature(s.project)) {
        return s;
      }
      next.duration = recomputeDuration(next);
      next.updatedAt = Date.now();
      return pushHistory(s, next, options?.history !== false) as Partial<ProjectState>;
    }),

  setTitle: (title) => get().updateProject((p) => ({ ...p, title })),
  setResolution: (width, height) =>
    get().updateProject((p) => ({
      ...p,
      resolution: { width: Math.max(64, Math.round(width)), height: Math.max(64, Math.round(height)) },
      exportSettings: { ...p.exportSettings, width: Math.max(64, Math.round(width)), height: Math.max(64, Math.round(height)) },
    })),
  setFps: (fps) =>
    get().updateProject((p) => ({
      ...p,
      fps: Math.max(1, Math.min(120, Math.round(fps))),
      exportSettings: { ...p.exportSettings, fps: Math.max(1, Math.min(120, Math.round(fps))) },
    })),

  /* ------------------------------ picture lock --------------------- */
  isEditLocked: () => isPictureLocked(get().project),

  runPictureLockCheck: () => {
    const { project } = get();
    if (!project) return;
    const report = analyzePictureLock(project);
    get().updateProject(
      (p) => ({
        ...p,
        pictureLock: { ...(p.pictureLock ?? { stage: "none" }), report },
      }),
      { history: false },
    );
  },

  applyPictureLockFixes: () => {
    const { project } = get();
    if (!project || isPictureLocked(project)) return;
    const { project: fixed, fixes } = fixPictureLock(project);
    const report = analyzePictureLock(fixed);
    report.fixes = fixes;
    report.fixedShots = fixes.filter((f) => f.kind === "long-shots" || f.kind === "short-shots").length;
    get().updateProject((p) => ({
      ...fixed,
      pictureLock: { ...(p.pictureLock ?? { stage: "review" }), stage: "review", report },
    }));
  },

  confirmPictureLock: () => {
    const { project } = get();
    if (!project) return;
    get().updateProject((p) => lockPicture(p));
  },

  unlockPictureLock: () => {
    const { project } = get();
    if (!project || !isPictureLocked(project)) return;
    get().updateProject((p) => unlockPicture(p));
  },

  /* ------------------------------ ui ------------------------------ */
  setActivePage: (page) => set({ activePage: page }),
  setTool: (tool) => set({ tool }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
  toggleRipple: () => set((s) => ({ ripple: !s.ripple })),
  setZoom: (px) => set({ pxPerSecond: Math.max(4, Math.min(600, px)) }),
  zoomBy: (factor) => set((s) => ({ pxPerSecond: Math.max(4, Math.min(600, s.pxPerSecond * factor)) })),

  /* ------------------------------ transport ----------------------- */
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.1, Math.min(4, rate)) }),
  setLoop: (loop) => set({ loop }),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  setInPoint: (t) => set((s) => ({ inPoint: t === null ? null : Math.max(0, Math.min(t, s.outPoint ?? Infinity)) })),
  setOutPoint: (t) => set((s) => ({ outPoint: t === null ? null : Math.max(t, s.inPoint ?? 0) })),
  clearRange: () => set({ inPoint: null, outPoint: null }),

  /* ------------------------------ selection ----------------------- */
  selectClip: (id, additive) =>
    set((s) => {
      if (!id) return { selectedClipIds: [], selectedClipId: null };
      if (additive) {
        const exists = s.selectedClipIds.includes(id);
        const ids = exists ? s.selectedClipIds.filter((x) => x !== id) : [...s.selectedClipIds, id];
        return { selectedClipIds: ids, selectedClipId: ids[0] ?? null };
      }
      const track = findClip(s.project, id)?.track ?? null;
      return { selectedClipIds: [id], selectedClipId: id, selectedTrackId: track?.id ?? s.selectedTrackId };
    }),
  selectClips: (ids) => set({ selectedClipIds: ids, selectedClipId: ids[0] ?? null }),
  clearSelection: () => set({ selectedClipIds: [], selectedClipId: null }),
  selectTrack: (id) => set({ selectedTrackId: id }),

  /* ------------------------------ assets -------------------------- */
  addAssets: (assets) =>
    get().updateProject((p) => ({ ...p, assets: [...p.assets, ...assets] })),

  removeAsset: (assetId) =>
    get().updateProject((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== assetId),
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => (c as Partial<VideoClip>).assetId !== assetId),
      })),
    })),

  /* ------------------------------ clips --------------------------- */
  updateClip: (clipId, fn, options) =>
    set((s) => {
      if (!s.project) return s;
      const found = findClip(s.project, clipId);
      if (!found) return s;
      const nextClip = fn(found.clip);
      // Picture Lock: правки тайминга/склейки отклоняются, остальное — можно.
      if (isPictureLocked(s.project) && clipIsStructuralEdit(found.clip, nextClip)) return s;
      const tracks = s.project.tracks.map((track) =>
        track.id === found.track.id ? { ...track, clips: track.clips.map((c) => (c.id === clipId ? nextClip : c)) } : track,
      );
      return pushHistory(s, withTracks(s.project, tracks), options?.history !== false) as Partial<ProjectState>;
    }),

  updateSelectedClips: (fn) =>
    set((s) => {
      if (!s.project || s.selectedClipIds.length === 0) return s;
      const ids = new Set(s.selectedClipIds);
      const locked = isPictureLocked(s.project);
      const tracks = s.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) => {
          if (!ids.has(c.id)) return c;
          const next = fn(c);
          // Picture Lock: структурные изменения выделенных клипов отклоняются.
          if (locked && clipIsStructuralEdit(c, next)) return c;
          return next;
        }),
      }));
      return pushHistory(s, withTracks(s.project, tracks), true) as Partial<ProjectState>;
    }),

  removeClip: (clipId) =>
    set((s) => {
      if (!s.project || isPictureLocked(s.project)) return s;
      const tracks = s.project.tracks.map((track) => ({ ...track, clips: track.clips.filter((c) => c.id !== clipId) }));
      return {
        ...pushHistory(s, withTracks(s.project, tracks), true),
        selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId),
        selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
      } as Partial<ProjectState>;
    }),

  removeSelected: () =>
    set((s) => {
      if (!s.project || s.selectedClipIds.length === 0 || isPictureLocked(s.project)) return s;
      const ids = new Set(s.selectedClipIds);
      const tracks = s.project.tracks.map((track) => ({ ...track, clips: track.clips.filter((c) => !ids.has(c.id)) }));
      return {
        ...pushHistory(s, withTracks(s.project, tracks), true),
        selectedClipIds: [],
        selectedClipId: null,
      } as Partial<ProjectState>;
    }),

  rippleDeleteSelected: () =>
    set((s) => {
      if (!s.project || s.selectedClipIds.length === 0 || isPictureLocked(s.project)) return s;
      const ids = new Set(s.selectedClipIds);
      const tracks = s.project.tracks.map((track) => {
        const removed = track.clips.filter((c) => ids.has(c.id));
        if (removed.length === 0) return track;
        let clips = track.clips.filter((c) => !ids.has(c.id));
        // Сдвигаем всё, что правее удалённого клипа, на его длительность.
        for (const gone of sortClips(removed)) {
          clips = clips.map((c) => (c.start >= gone.start ? { ...c, start: Math.max(0, c.start - gone.duration) } : c));
        }
        return { ...track, clips: sortClips(clips) };
      });
      return {
        ...pushHistory(s, withTracks(s.project, tracks), true),
        selectedClipIds: [],
        selectedClipId: null,
      } as Partial<ProjectState>;
    }),

  duplicateClip: (clipId) =>
    set((s) => {
      if (!s.project || isPictureLocked(s.project)) return s;
      let newId: string | null = null;
      const tracks = s.project.tracks.map((track) => {
        const original = track.clips.find((c) => c.id === clipId);
        if (!original) return track;
        newId = uid("clip");
        const copy = { ...JSON.parse(JSON.stringify(original)), id: newId, start: original.start + original.duration } as Clip;
        return { ...track, clips: sortClips([...track.clips, copy]) };
      });
      if (!newId) return s;
      return {
        ...pushHistory(s, withTracks(s.project, tracks), true),
        selectedClipIds: [newId],
        selectedClipId: newId,
      } as Partial<ProjectState>;
    }),

  splitClipAt: (clipId, time) =>
    set((s) => {
      if (!s.project || isPictureLocked(s.project)) return s;
      let created: string | null = null;
      const tracks = s.project.tracks.map((track) => {
        const idx = track.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return track;
        const clip = track.clips[idx];
        const local = time - clip.start;
        if (local <= MIN_CLIP_DURATION || local >= clip.duration - MIN_CLIP_DURATION) return track;
        const clips = [...track.clips];
        const secondId = uid("clip");
        created = secondId;
        if (clip.type === "video" || clip.type === "image" || clip.type === "audio") {
          const media = clip as VideoClip | AudioClip;
          const speed = (media as VideoClip).speed ?? 1;
          const cut = media.inPoint + local * speed;
          const first = { ...media, duration: local, outPoint: cut } as Clip;
          const second = {
            ...JSON.parse(JSON.stringify(media)),
            id: secondId,
            start: clip.start + local,
            duration: clip.duration - local,
            inPoint: cut,
            outPoint: media.outPoint,
            transitionIn: { type: "cut" as const, duration: 0 },
          } as Clip;
          clips.splice(idx, 1, first, second);
        } else {
          const first = { ...clip, duration: local };
          const second = { ...JSON.parse(JSON.stringify(clip)), id: secondId, start: clip.start + local, duration: clip.duration - local };
          clips.splice(idx, 1, first, second);
        }
        return { ...track, clips };
      });
      if (!created) return s;
      return pushHistory(s, withTracks(s.project, tracks), true) as Partial<ProjectState>;
    }),

  splitAtPlayhead: () => {
    const { project, playhead, selectedClipIds, splitClipAt } = get();
    if (!project) return;
    const targets: string[] = [];
    for (const track of project.tracks) {
      if (track.locked) continue;
      for (const clip of track.clips) {
        const inside = playhead > clip.start + MIN_CLIP_DURATION && playhead < clip.start + clip.duration - MIN_CLIP_DURATION;
        if (!inside) continue;
        if (selectedClipIds.length > 0 && !selectedClipIds.includes(clip.id)) continue;
        targets.push(clip.id);
      }
    }
    for (const id of targets) splitClipAt(id, playhead);
  },

  moveClip: (clipId, targetTrackId, newStart, options) =>
    set((s) => {
      if (!s.project || isPictureLocked(s.project)) return s;
      const found = findClip(s.project, clipId);
      if (!found) return s;
      const target = s.project.tracks.find((t) => t.id === targetTrackId);
      if (!target || target.locked) return s;
      const start = Math.max(0, newStart);
      const moved = { ...found.clip, start, trackId: target.id } as Clip;
      const tracks = s.project.tracks.map((track) => {
        if (track.id === found.track.id && track.id === target.id) {
          return { ...track, clips: sortClips(track.clips.map((c) => (c.id === clipId ? moved : c))) };
        }
        if (track.id === found.track.id) return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
        if (track.id === target.id) return { ...track, clips: sortClips([...track.clips, moved]) };
        return track;
      });
      return pushHistory(s, withTracks(s.project, tracks), options?.history === true) as Partial<ProjectState>;
    }),

  trimClip: (clipId, edge, newTime, options) =>
    set((s) => {
      if (!s.project || isPictureLocked(s.project)) return s;
      const found = findClip(s.project, clipId);
      if (!found) return s;
      const clip = found.clip;
      const project = s.project;
      const sourceDuration = clipSourceLimit(project, clip);
      const speed = (clip as VideoClip).speed ?? 1;
      let next: Clip = clip;

      if (edge === "in") {
        const maxStart = clip.start + clip.duration - MIN_CLIP_DURATION;
        let start = Math.max(0, Math.min(newTime, maxStart));
        const delta = start - clip.start;
        if (clip.type === "video" || clip.type === "audio") {
          const media = clip as VideoClip | AudioClip;
          let inPoint = media.inPoint + delta * speed;
          if (inPoint < 0) {
            start -= inPoint / speed;
            inPoint = 0;
          }
          next = { ...media, start, duration: clip.duration - (start - clip.start), inPoint } as Clip;
        } else {
          next = { ...clip, start, duration: clip.duration - delta };
        }
      } else {
        let duration = Math.max(MIN_CLIP_DURATION, newTime - clip.start);
        if (sourceDuration !== null && (clip.type === "video" || clip.type === "audio")) {
          const media = clip as VideoClip | AudioClip;
          const loops = (media as AudioClip).loop === true;
          if (!loops) {
            const available = (sourceDuration - media.inPoint) / speed;
            duration = Math.min(duration, Math.max(MIN_CLIP_DURATION, available));
          }
        }
        if (clip.type === "video" || clip.type === "audio") {
          const media = clip as VideoClip | AudioClip;
          next = { ...media, duration, outPoint: media.inPoint + duration * speed } as Clip;
        } else {
          next = { ...clip, duration };
        }
      }

      const tracks = project.tracks.map((track) =>
        track.id === found.track.id ? { ...track, clips: sortClips(track.clips.map((c) => (c.id === clipId ? next : c))) } : track,
      );
      return pushHistory(s, withTracks(project, tracks), options?.history === true) as Partial<ProjectState>;
    }),

  setClipSpeed: (clipId, speed) => {
    const safe = Math.max(0.1, Math.min(8, speed));
    get().updateClip(clipId, (c) => {
      if (c.type === "text" || c.type === "subtitle") return c;
      const media = c as VideoClip | AudioClip;
      const sourceSpan = Math.max(0.05, media.outPoint - media.inPoint);
      return { ...media, speed: safe, duration: sourceSpan / safe } as Clip;
    });
  },

  detachAudio: (clipId) =>
    set((s) => {
      if (!s.project) return s;
      const found = findClip(s.project, clipId);
      if (!found || found.clip.type !== "video") return s;
      const source = found.clip as VideoClip;
      let tracks = [...s.project.tracks];
      let audioTrack = tracks.find((t) => t.type === "audio" && !t.locked);
      if (!audioTrack) {
        audioTrack = { id: uid("track"), type: "audio", name: "Аудио", clips: [], hidden: false, muted: false, locked: false };
        tracks = [...tracks, audioTrack];
      }
      const audioClip: AudioClip = {
        id: uid("clip"),
        trackId: audioTrack.id,
        type: "audio",
        name: `${source.name} (аудио)`,
        assetId: source.assetId,
        start: source.start,
        duration: source.duration,
        inPoint: source.inPoint,
        outPoint: source.outPoint,
        speed: source.speed,
        volume: { value: source.volume?.value ?? 1, keyframes: [] },
        fadeIn: 0,
        fadeOut: 0,
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        denoise: false,
        muted: false,
        pan: { value: 0, keyframes: [] },
      };
      const trackId = audioTrack.id;
      tracks = tracks.map((t) => {
        if (t.id === found.track.id) {
          return { ...t, clips: t.clips.map((c) => (c.id === clipId ? ({ ...source, muted: true } as Clip) : c)) };
        }
        if (t.id === trackId) return { ...t, clips: sortClips([...t.clips, audioClip]) };
        return t;
      });
      return pushHistory(s, withTracks(s.project, tracks), true) as Partial<ProjectState>;
    }),

  copySelection: () =>
    set((s) => {
      if (!s.project) return s;
      const ids = new Set(s.selectedClipIds);
      const clips = s.project.tracks.flatMap((t) => t.clips.filter((c) => ids.has(c.id)));
      return { clipboard: JSON.parse(JSON.stringify(clips)) as Clip[] };
    }),

  cutSelection: () => {
    get().copySelection();
    get().removeSelected();
  },

  paste: () =>
    set((s) => {
      if (!s.project || s.clipboard.length === 0 || isPictureLocked(s.project)) return s;
      const base = Math.min(...s.clipboard.map((c) => c.start));
      const newIds: string[] = [];
      const additions = new Map<string, Clip[]>();
      for (const clip of s.clipboard) {
        const targetTrack =
          s.project.tracks.find((t) => t.id === clip.trackId) ??
          s.project.tracks.find((t) => t.type === (clip.type === "audio" ? "audio" : clip.type === "text" ? "text" : "video")) ??
          s.project.tracks[0];
        if (!targetTrack) continue;
        const id = uid("clip");
        newIds.push(id);
        const copy = {
          ...JSON.parse(JSON.stringify(clip)),
          id,
          trackId: targetTrack.id,
          start: s.playhead + (clip.start - base),
        } as Clip;
        additions.set(targetTrack.id, [...(additions.get(targetTrack.id) ?? []), copy]);
      }
      const tracks = s.project.tracks.map((t) =>
        additions.has(t.id) ? { ...t, clips: sortClips([...t.clips, ...(additions.get(t.id) as Clip[])]) } : t,
      );
      return {
        ...pushHistory(s, withTracks(s.project, tracks), true),
        selectedClipIds: newIds,
        selectedClipId: newIds[0] ?? null,
      } as Partial<ProjectState>;
    }),

  alignSelectedToPlayhead: () =>
    set((s) => {
      if (!s.project || s.selectedClipIds.length === 0 || isPictureLocked(s.project)) return s;
      const ids = new Set(s.selectedClipIds);
      const selected = s.project.tracks.flatMap((t) => t.clips.filter((c) => ids.has(c.id)));
      if (selected.length === 0) return s;
      const base = Math.min(...selected.map((c) => c.start));
      const delta = s.playhead - base;
      const tracks = s.project.tracks.map((t) => ({
        ...t,
        clips: sortClips(t.clips.map((c) => (ids.has(c.id) ? { ...c, start: Math.max(0, c.start + delta) } : c))),
      }));
      return pushHistory(s, withTracks(s.project, tracks), true) as Partial<ProjectState>;
    }),

  closeGapsOnTrack: (trackId) =>
    set((s) => {
      if (!s.project || isPictureLocked(s.project)) return s;
      const tracks = s.project.tracks.map((track) => {
        if (track.id !== trackId) return track;
        let cursor = 0;
        const clips = sortClips(track.clips).map((c) => {
          const next = { ...c, start: cursor };
          cursor += c.duration;
          return next;
        });
        return { ...track, clips };
      });
      return pushHistory(s, withTracks(s.project, tracks), true) as Partial<ProjectState>;
    }),

  /* ------------------------------ creation ------------------------ */
  addClipFromAsset: (assetId, options) => {
    const state = get();
    const project = state.project;
    if (!project) return null;
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return null;
    // Picture Lock: новые планы на таймлайн добавлять нельзя (меняется монтаж).
    // Аудио — можно: звук остаётся редактируемым после фиксации.
    if (isPictureLocked(project) && asset.kind !== "audio") return null;

    const wantedType = trackTypeForKind(asset.kind);
    let track =
      (options?.trackId ? project.tracks.find((t) => t.id === options.trackId) : undefined) ??
      project.tracks.find((t) => t.id === state.selectedTrackId && t.type === wantedType) ??
      project.tracks.find((t) => t.type === wantedType && !t.locked);

    let tracks = project.tracks;
    if (!track) {
      track = {
        id: uid("track"),
        type: wantedType,
        name: wantedType === "audio" ? `Аудио ${project.tracks.filter((t) => t.type === "audio").length + 1}` : `Видео ${project.tracks.filter((t) => t.type === "video").length + 1}`,
        clips: [],
        hidden: false,
        muted: false,
        locked: false,
      };
      tracks = [...tracks, track];
    }

    const start = options?.start ?? state.playhead;
    const duration = asset.kind === "image" ? 4 : Math.max(0.4, asset.duration || 4);
    const clip: Clip =
      asset.kind === "audio"
        ? createAudioClip({ trackId: track.id, asset, start, duration })
        : createVideoClip({ trackId: track.id, asset, start, duration });

    const trackId = track.id;
    const nextTracks = tracks.map((t) => (t.id === trackId ? { ...t, clips: sortClips([...t.clips, clip]) } : t));

    set((s) => ({
      ...(pushHistory(s, withTracks(project, nextTracks), true) as Partial<ProjectState>),
      selectedClipIds: options?.select === false ? s.selectedClipIds : [clip.id],
      selectedClipId: options?.select === false ? s.selectedClipId : clip.id,
      selectedTrackId: trackId,
    }));
    return clip.id;
  },

  addTextClip: (text) => {
    const state = get();
    const project = state.project;
    if (!project) return null;
    let tracks = project.tracks;
    let track = tracks.find((t) => t.type === "text" && !t.locked);
    if (!track) {
      track = { id: uid("track"), type: "text", name: "Титры", clips: [], hidden: false, muted: false, locked: false };
      tracks = [...tracks, track];
    }
    const clip: TextClip = createTextClip({ trackId: track.id, start: state.playhead, duration: 4, text: text ?? "Новый заголовок" });
    const trackId = track.id;
    const nextTracks = tracks.map((t) => (t.id === trackId ? { ...t, clips: sortClips([...t.clips, clip]) } : t));
    set((s) => ({
      ...(pushHistory(s, withTracks(project, nextTracks), true) as Partial<ProjectState>),
      selectedClipIds: [clip.id],
      selectedClipId: clip.id,
      selectedTrackId: trackId,
      activePage: "text",
    }));
    return clip.id;
  },

  addMotionGraphic: (kind, text, duration) => {
    const state = get();
    const project = state.project;
    if (!project) return null;
    let tracks = project.tracks;
    let track = tracks.find((t) => t.type === "text" && !t.locked);
    if (!track) {
      track = { id: uid("track"), type: "text", name: "Титры", clips: [], hidden: false, muted: false, locked: false };
      tracks = [...tracks, track];
    }
    const clip = createMotionGraphicClip({ trackId: track.id, start: state.playhead, kind, text, duration });
    const trackId = track.id;
    const nextTracks = tracks.map((t) => (t.id === trackId ? { ...t, clips: sortClips([...t.clips, clip]) } : t));
    set((s) => ({
      ...(pushHistory(s, withTracks(project, nextTracks), true) as Partial<ProjectState>),
      selectedClipIds: [clip.id],
      selectedClipId: clip.id,
      selectedTrackId: trackId,
      activePage: "motion",
    }));
    return clip.id;
  },

  /* ------------------------------ tracks -------------------------- */
  addTrack: (track) => {
    // Picture Lock: новая видеодорожка изменила бы монтаж; текст/звук — можно.
    if (isPictureLocked(get().project) && track.type === "video") return;
    get().updateProject((p) => ({ ...p, tracks: [...p.tracks, track] }));
  },

  createTrack: (type) => {
    const { project } = get();
    // Picture Lock: новая видеодорожка изменила бы монтаж; текст/звук — можно.
    if (isPictureLocked(project) && type === "video") return "";
    const id = uid("track");
    const label =
      type === "video" ? "Видео" : type === "audio" ? "Аудио" : type === "text" ? "Титры" : "Субтитры";
    get().updateProject((p) => ({
      ...p,
      tracks: [
        ...p.tracks,
        {
          id,
          type,
          name: `${label} ${p.tracks.filter((t) => t.type === type).length + 1}`,
          clips: [],
          hidden: false,
          muted: false,
          locked: false,
        },
      ],
    }));
    set({ selectedTrackId: id });
    return id;
  },

  removeTrack: (trackId) =>
    set((s) => {
      if (!s.project) return s;
      // Picture Lock: дорожку с планами удалить нельзя — это меняет монтаж.
      const doomed = s.project.tracks.find((t) => t.id === trackId);
      if (isPictureLocked(s.project) && doomed?.clips.some((c) => c.type === "video" || c.type === "image")) return s;
      const tracks = s.project.tracks.filter((t) => t.id !== trackId);
      return {
        ...pushHistory(s, withTracks(s.project, tracks), true),
        selectedTrackId: s.selectedTrackId === trackId ? tracks[0]?.id ?? null : s.selectedTrackId,
      } as Partial<ProjectState>;
    }),

  renameTrack: (trackId, name) =>
    get().updateProject((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, name } : t)) })),

  toggleTrackProp: (trackId, prop) =>
    get().updateProject((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, [prop]: !t[prop] } : t)),
    })),

  setTrackHeight: (trackId, height) =>
    get().updateProject(
      (p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, height: Math.max(44, Math.min(220, height)) } : t)),
      }),
      { history: false },
    ),

  moveTrack: (trackId, direction) =>
    get().updateProject((p) => {
      const idx = p.tracks.findIndex((t) => t.id === trackId);
      const target = idx + direction;
      if (idx === -1 || target < 0 || target >= p.tracks.length) return p;
      const tracks = [...p.tracks];
      const [moved] = tracks.splice(idx, 1);
      tracks.splice(target, 0, moved);
      return { ...p, tracks };
    }),

  /* ------------------------------ markers ------------------------- */
  addMarker: (time, label) =>
    get().updateProject((p) => {
      const marker: Marker = { id: uid("mk"), time, label: label ?? `Маркер ${p.markers.length + 1}`, color: "#f59e0b" };
      return { ...p, markers: [...p.markers, marker].sort((a, b) => a.time - b.time) };
    }),

  removeMarker: (id) => get().updateProject((p) => ({ ...p, markers: p.markers.filter((m) => m.id !== id) })),

  renameMarker: (id, label) =>
    get().updateProject((p) => ({ ...p, markers: p.markers.map((m) => (m.id === id ? { ...m, label } : m)) })),
}));
