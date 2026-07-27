"use client";

import { useProjectStore } from "@/store/projectStore";
import type { AudioClip, Clip, TextClip, VideoClip } from "@/lib/types";

export function useSelectedClip() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const playhead = useProjectStore((s) => s.playhead);

  const clip: Clip | undefined = project?.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
  const localTime = clip ? playhead - clip.start : 0;

  return {
    clip,
    localTime,
    videoClip: clip && (clip.type === "video" || clip.type === "image") ? (clip as VideoClip) : undefined,
    audioClip: clip && clip.type === "audio" ? (clip as AudioClip) : undefined,
    textClip: clip && clip.type === "text" ? (clip as TextClip) : undefined,
  };
}

export function panelWrapperEmpty(message: string) {
  return message;
}
