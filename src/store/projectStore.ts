"use client";

import { create } from "zustand";
import type { Clip, Project, Track } from "@/lib/types";
import { saveProject } from "@/lib/db";
import { uid } from "@/lib/id";

export type EditorPage = "montage" | "color" | "effects" | "sound" | "text" | "export";

interface ProjectState {
  project: Project | null;
  selectedClipId: string | null;
  playhead: number;
  isPlaying: boolean;
  activePage: EditorPage;
  pxPerSecond: number;
  dirty: boolean;

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

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  selectedClipId: null,
  playhead: 0,
  isPlaying: false,
  activePage: "montage",
  pxPerSecond: 60,
  dirty: false,

  loadProject: (p) => set({ project: p, selectedClipId: null, playhead: 0, dirty: false }),
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
      return { project: next, dirty: true };
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
      return { project: next, dirty: true };
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
      return {
        project: next,
        dirty: true,
        selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
      };
    }),

  addTrack: (track) =>
    set((s) => (s.project ? { project: { ...s.project, tracks: [...s.project.tracks, track] }, dirty: true } : s)),

  removeTrack: (trackId) =>
    set((s) =>
      s.project
        ? { project: { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== trackId) }, dirty: true }
        : s,
    ),

  toggleTrackProp: (trackId, prop) =>
    set((s) => {
      if (!s.project) return s;
      const tracks = s.project.tracks.map((t) => (t.id === trackId ? { ...t, [prop]: !t[prop] } : t));
      return { project: { ...s.project, tracks }, dirty: true };
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
      return { project: next, dirty: true, selectedClipId: newId ?? s.selectedClipId };
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
      return { project: { ...s.project, tracks }, dirty: true };
    }),

  persist: async () => {
    const { project } = get();
    if (!project) return;
    await saveProject(project);
    set({ dirty: false });
  },
}));
