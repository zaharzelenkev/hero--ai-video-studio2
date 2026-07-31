"use client";

import { create } from "zustand";
import type { Clip, Project, Track } from "@/lib/types";
import { saveProject } from "@/lib/db";
import { uid } from "@/lib/id";

export type EditorPage = "production" | "montage" | "color" | "effects" | "sound" | "text" | "export" | "preproduction";

interface ProjectState {
  project: Project | null;
  selectedClipId: string | null;
  playhead: number;
  isPlaying: boolean;
  activePage: EditorPage;
  pxPerSecond: number;
  dirty: boolean;
  past: string[];
  future: string[];
  undo: () => void;
  redo: () => void;

  loadProject: (p: Project) => void;
  setActivePage: (page: EditorPage) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (px: number) => void;
  selectClip: (id: string | null) => void;

  updateProject: (fn: (p: Project) => Project) => void;
  updateClip: (clipId: string, fn: (c: Clip) => Clip) => void;
  removeClip: (clipId: string) => void;
  addTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  toggleTrackProp: (trackId: string, prop: "hidden" | "muted" | "locked") => void;
  duplicateClip: (clipId: string) => void;
  splitClipAt: (clipId: string, time: number) => void;
  detachAudio: (clipId: string) => void;

  persist: () => Promise<void>;
}

function recomputeDuration(project: Project): number {
  let max = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.start + clip.duration);
    }
  }
  return max;
}


function pushHistory(s: ProjectState, nextProject: Project): Partial<ProjectState> {
  if (!s.project) return { project: nextProject, dirty: true };
  const str = JSON.stringify(s.project);
  if (s.past.length > 0 && s.past[s.past.length - 1] === str) {
    return { project: nextProject, dirty: true };
  }
  return {
    project: nextProject,
    dirty: true,
    past: [...s.past, str].slice(-50),
    future: []
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  selectedClipId: null,
  playhead: 0,
  isPlaying: false,
  activePage: "montage",
  pxPerSecond: 60,
  dirty: false,
  past: [],
  future: [],
  
  undo: () => set((s) => {
    if (s.past.length === 0 || !s.project) return s;
    const prevJson = s.past[s.past.length - 1];
    const newPast = s.past.slice(0, -1);
    const newFuture = [JSON.stringify(s.project), ...s.future];
    return { project: JSON.parse(prevJson), past: newPast, future: newFuture, dirty: true };
  }),
  
  redo: () => set((s) => {
    if (s.future.length === 0 || !s.project) return s;
    const nextJson = s.future[0];
    const newFuture = s.future.slice(1);
    const newPast = [...s.past, JSON.stringify(s.project)];
    return { project: JSON.parse(nextJson), past: newPast, future: newFuture, dirty: true };
  }),

  loadProject: (p) => set({ project: p, selectedClipId: null, playhead: 0, dirty: false, past: [], future: [] }),
  setActivePage: (page) => set({ activePage: page }),
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setZoom: (px) => set({ pxPerSecond: Math.max(10, Math.min(400, px)) }),
  selectClip: (id) => set({ selectedClipId: id }),

  updateProject: (fn) =>
    set((s) => {
      if (!s.project) return s;
      const next = fn(s.project);
      next.duration = recomputeDuration(next);
      next.updatedAt = Date.now();
      return pushHistory(s, next) as any;
    }),

  updateClip: (clipId, fn) =>
    set((s) => {
      if (!s.project) return s;
      const tracks = s.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) => (c.id === clipId ? fn(c) : c)),
      }));
      const next = { ...s.project, tracks, updatedAt: Date.now() };
      next.duration = recomputeDuration(next);
      return pushHistory(s, next) as any;
    }),

  removeClip: (clipId) =>
    set((s) => {
      if (!s.project) return s;
      const tracks = s.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId),
      }));
      const next = { ...s.project, tracks, updatedAt: Date.now() };
      next.duration = recomputeDuration(next);
      return { ...pushHistory(s, next), selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId } as any;
    }),

  addTrack: (track) =>
    set((s) => s.project ? pushHistory(s, { ...s.project, tracks: [...s.project.tracks, track] }) : s),

  removeTrack: (trackId) =>
    set((s) => s.project ? pushHistory(s, { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== trackId) }) : s),

  toggleTrackProp: (trackId, prop) =>
    set((s) => {
      if (!s.project) return s;
      const tracks = s.project.tracks.map((t) => (t.id === trackId ? { ...t, [prop]: !t[prop] } : t));
      return pushHistory(s, { ...s.project, tracks }) as any;
    }),

  duplicateClip: (clipId) =>
    set((s) => {
      if (!s.project) return s;
      let newId: string | null = null;
      const tracks = s.project.tracks.map((track) => {
        const idx = track.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return track;
        const original = track.clips[idx];
        newId = uid("clip");
        const copy: Clip = { ...original, id: newId, start: original.start + original.duration + 0.05 };
        return { ...track, clips: [...track.clips, copy] };
      });
      const next = { ...s.project, tracks };
      next.duration = recomputeDuration(next);
      return { ...pushHistory(s, next), selectedClipId: newId ?? s.selectedClipId } as any;
    }),


  detachAudio: (clipId) => set((s) => {
    if (!s.project) return s;
    let targetTrack = s.project.tracks.find(t => t.type === "audio");
    const nextProject = { ...s.project, tracks: [...s.project.tracks] };

    if (!targetTrack) {
      targetTrack = { id: uid("track"), type: "audio", name: "Аудио (Отделенное)", clips: [], hidden: false, muted: false, locked: false };
      nextProject.tracks.push(targetTrack);
    }

    let sourceClip: any = null;
    
    // find clip and mute it
    nextProject.tracks = nextProject.tracks.map(t => {
      const cIdx = t.clips.findIndex(c => c.id === clipId);
      if (cIdx >= 0 && t.type === "video") {
         sourceClip = t.clips[cIdx];
         const newClips = [...t.clips];
         newClips[cIdx] = { ...sourceClip, muted: true };
         return { ...t, clips: newClips };
      }
      return t;
    });

    if (!sourceClip) return s;

    // Create audio clip
    const audioClip: import("@/lib/types").AudioClip = {
      id: uid("clip"),
      trackId: targetTrack.id,
      type: "audio",
      name: sourceClip.name + " (Аудио)",
      assetId: sourceClip.assetId,
      start: sourceClip.start,
      duration: sourceClip.duration,
      inPoint: sourceClip.inPoint,
      outPoint: sourceClip.outPoint,
      speed: sourceClip.speed,
      volume: { value: 1, keyframes: [] },
      fadeIn: 0, fadeOut: 0, eqLow: 0, eqMid: 0, eqHigh: 0, denoise: false, muted: false, pan: { value: 0, keyframes: [] }
    };

    // Add to target track
    nextProject.tracks = nextProject.tracks.map(t => {
      if (t.id === targetTrack!.id) {
         return { ...t, clips: [...t.clips, audioClip] };
      }
      return t;
    });

    return pushHistory(s, nextProject) as any;
  }),

  splitClipAt: (clipId, time) =>
    set((s) => {
      if (!s.project) return s;
      const tracks = s.project.tracks.map((track) => {
        const idx = track.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return track;
        const clip = track.clips[idx];
        const localTime = time - clip.start;
        if (localTime <= 0.05 || localTime >= clip.duration - 0.05) return track;
        const firstDuration = localTime;
        const secondDuration = clip.duration - localTime;
        const clips = [...track.clips];
        if (clip.type === "video" || clip.type === "image" || clip.type === "audio") {
          const c = clip as Extract<Clip, { assetId: string }>;
          const first = { ...c, duration: firstDuration, outPoint: c.inPoint + firstDuration };
          const second = {
            ...c,
            id: uid("clip"),
            start: clip.start + firstDuration,
            duration: secondDuration,
            inPoint: c.inPoint + firstDuration,
            outPoint: c.outPoint,
            transitionIn: { type: "cut" as const, duration: 0 },
          };
          clips.splice(idx, 1, first, second);
        } else {
          const first = { ...clip, duration: firstDuration };
          const second = { ...clip, id: uid("clip"), start: clip.start + firstDuration, duration: secondDuration };
          clips.splice(idx, 1, first, second);
        }
        return { ...track, clips };
      });
      return pushHistory(s, { ...s.project, tracks }) as any;
    }),

  persist: async () => {
    const { project } = get();
    if (!project) return;
    await saveProject(project);
    set({ dirty: false });
  },
}));
