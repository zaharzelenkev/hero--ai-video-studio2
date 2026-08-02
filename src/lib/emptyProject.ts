import { uid } from "./id";
import type { Project } from "./types";
import { defaultSoundDesign } from "./soundDesign";

export function createEmptyProject(title = "Новый проект"): Project {
  const id = uid("project");
  return {
    id,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    duration: 30,
    assets: [],
    tracks: [
      { id: uid("track"), type: "video", name: "Видео", clips: [], hidden: false, muted: false, locked: false },
      { id: uid("track"), type: "audio", name: "Аудио", clips: [], hidden: false, muted: false, locked: false },
    ],
    markers: [],
    style: {
      pace: "medium",
      bw: false,
      colorGrade: "none",
      kenBurns: false,
      beatSync: false,
      transition: "cut",
      addCaptions: false,
      rawPrompt: "",
    },
    exportSettings: {
      width: 1920,
      height: 1080,
      fps: 30,
      format: "mp4",
      crf: 23,
    },
    soundDesign: defaultSoundDesign(),
  };
}
