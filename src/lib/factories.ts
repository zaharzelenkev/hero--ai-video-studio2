import { uid } from "./id";
import {
  AudioClip,
  ChromaKey,
  ExportSettings,
  Mask,
  MediaAsset,
  Project,
  TextClip,
  Track,
  Transition,
  VideoClip,
  defaultColorGrade,
  param,
} from "./types";

export function defaultChroma(): ChromaKey {
  return { enabled: false, color: "#00ff00", similarity: 0.22, blend: 0.12 };
}

export function defaultMask(): Mask {
  return {
    enabled: false,
    shape: "rect",
    x: param(0.1),
    y: param(0.1),
    width: param(0.8),
    height: param(0.8),
    feather: 10,
    inverted: false,
  };
}

export function defaultTransition(): Transition {
  return { type: "crossfade", duration: 0.6 };
}

export function createVideoClip(opts: {
  trackId: string;
  asset: MediaAsset;
  start: number;
  duration: number;
  inPoint?: number;
  outPoint?: number;
  transitionIn?: Transition;
}): VideoClip {
  const inPoint = opts.inPoint ?? 0;
  const outPoint = opts.outPoint ?? inPoint + opts.duration;
  return {
    id: uid("clip"),
    trackId: opts.trackId,
    type: opts.asset.kind === "image" ? "image" : "video",
    name: opts.asset.name,
    assetId: opts.asset.id,
    fitMode: "cover",
    cameraMotion: "none",
    start: opts.start,
    duration: opts.duration,
    inPoint,
    outPoint,
    speed: 1,
    opacity: param(1),
    x: param(0),
    y: param(0),
    scale: param(1),
    rotation: param(0),
    volume: param(1),
    muted: opts.asset.kind === "image",
    color: defaultColorGrade(),
    chroma: defaultChroma(),
    mask: defaultMask(),
    transitionIn: opts.transitionIn ?? { type: "cut", duration: 0 },
    effects: [],
  };
}

export function createAudioClip(opts: {
  trackId: string;
  asset: MediaAsset;
  start: number;
  duration: number;
  inPoint?: number;
  outPoint?: number;
}): AudioClip {
  const inPoint = opts.inPoint ?? 0;
  const outPoint = opts.outPoint ?? inPoint + opts.duration;
  return {
    id: uid("clip"),
    trackId: opts.trackId,
    type: "audio",
    name: opts.asset.name,
    assetId: opts.asset.id,
    start: opts.start,
    duration: opts.duration,
    inPoint,
    outPoint,
    volume: param(0.9),
    fadeIn: 0.3,
    fadeOut: 0.6,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    denoise: false,
    muted: false,
  };
}

export function createTextClip(opts: { trackId: string; start: number; duration: number; text?: string }): TextClip {
  return {
    id: uid("clip"),
    trackId: opts.trackId,
    type: "text",
    name: "Текст",
    text: opts.text ?? "Новый текст",
    fontFamily: "DejaVu Sans",
    fontSize: 54,
    color: "#ffffff",
    backgroundColor: "transparent",
    strokeColor: "#000000",
    strokeWidth: 0,
    align: "center",
    start: opts.start,
    duration: opts.duration,
    x: param(0),
    y: param(0.35),
    scale: param(1),
    opacity: param(1),
    animationIn: "fade",
    animationOut: "fade",
  };
}

export function createTrack(type: Track["type"], name: string): Track {
  return { id: uid("track"), type, name, clips: [], hidden: false, muted: false, locked: false };
}

export function defaultExportSettings(): ExportSettings {
  return { width: 1280, height: 720, fps: 30, format: "mp4", crf: 23 };
}

export function createEmptyProject(title: string): Project {
  const videoTrack = createTrack("video", "Видео 1");
  const overlayTrack = createTrack("video", "Наложение");
  const textTrack = createTrack("text", "Титры");
  const audioTrack = createTrack("audio", "Музыка");
  const now = Date.now();
  return {
    id: uid("proj"),
    title,
    createdAt: now,
    updatedAt: now,
    resolution: { width: 1280, height: 720 },
    fps: 30,
    duration: 0,
    assets: [],
    tracks: [videoTrack, overlayTrack, textTrack, audioTrack],
    markers: [],
    style: {
      pace: "medium",
      bw: false,
      colorGrade: "none",
      kenBurns: true,
      beatSync: false,
      transition: "crossfade",
      addCaptions: false,
      rawPrompt: "",
    },
    exportSettings: defaultExportSettings(),
  };
}
