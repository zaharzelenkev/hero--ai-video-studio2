// Core data model for MONTIQ - Professional AI Video Editor
// Everything here is plain JSON so it can be persisted in IndexedDB.

export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "cubicBezier";

export interface BezierControlPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Keyframe {
  id: string;
  /** Time in seconds, relative to the start of the clip. */
  time: number;
  value: number;
  easing: Easing;
  bezier?: BezierControlPoints; // For custom bezier curves
}

/** A value that can either be constant or animated with keyframes. */
export interface AnimParam {
  value: number;
  keyframes: Keyframe[];
}

export function param(value: number): AnimParam {
  return { value, keyframes: [] };
}

export type MediaKind = "video" | "image" | "audio";

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  /** Key used to look up the raw Blob in IndexedDB (`assets` store). */
  blobKey: string;
  duration: number;
  width?: number;
  height?: number;
  /** Small data-URL preview used across the UI. */
  thumbnail?: string;
  createdAt: number;
}

export type LutPreset =
  | "none"
  | "cinematic"
  | "warm"
  | "cool"
  | "bw"
  | "vintage"
  | "vivid"
  | "moody"
  | "dramatic"
  | "neutral"
  | "teal-orange"
  | "film-noir";

/** RGB Curve with control points */
export interface CurvePoints {
  points: Array<{ x: number; y: number }>; // Normalized 0-1
}

export interface RGBCurves {
  master: CurvePoints;
  red: CurvePoints;
  green: CurvePoints;
  blue: CurvePoints;
}

/** HSL adjustment per hue range */
export interface HSLAdjustment {
  hue: AnimParam; // 0-360
  saturation: AnimParam; // -100 to 100
  luminance: AnimParam; // -100 to 100
}

/** Professional color wheels for lift/gamma/gain */
export interface ColorWheels {
  lift: { r: number; g: number; b: number }; // Shadows
  gamma: { r: number; g: number; b: number }; // Midtones
  gain: { r: number; g: number; b: number }; // Highlights
}

export interface ColorGrade {
  // Basic adjustments
  brightness: AnimParam; // -1..1
  contrast: AnimParam; // -1..1
  saturation: AnimParam; // -1..1
  vibrance: AnimParam; // -1..1 (smart saturation)
  hue: AnimParam; // -180..180 (degrees)
  
  // Advanced exposure
  exposure: AnimParam; // -3..3 (EV stops)
  highlights: AnimParam; // -100..100
  shadows: AnimParam; // -100..100
  whites: AnimParam; // -100..100
  blacks: AnimParam; // -100..100
  
  // Temperature & Tint
  temperature: AnimParam; // -1..1 (cool..warm)
  tint: AnimParam; // -1..1 (green..magenta)
  
  gamma: AnimParam; // 0.1..3, default 1
  
  // Professional tools
  lut: LutPreset;
  curves?: RGBCurves;
  hsl?: HSLAdjustment[];
  colorWheels?: ColorWheels;
}

export function defaultColorGrade(): ColorGrade {
  return {
    brightness: param(0),
    contrast: param(0),
    saturation: param(0),
    vibrance: param(0),
    hue: param(0),
    exposure: param(0),
    highlights: param(0),
    shadows: param(0),
    whites: param(0),
    blacks: param(0),
    temperature: param(0),
    tint: param(0),
    gamma: param(1),
    lut: "none",
  };
}

export interface ChromaKey {
  enabled: boolean;
  color: string; // hex
  similarity: number; // 0..1
  blend: number; // 0..1
}

export type TransitionType =
  | "cut"
  | "crossfade"
  | "fadeblack"
  | "fadewhite"
  | "wipeleft"
  | "wiperight"
  | "wipeup"
  | "wipedown"
  | "slideup"
  | "slidedown"
  | "slideleft"
  | "slideright"
  | "zoom"
  | "zoomin"
  | "zoomout"
  | "circleopen"
  | "circleclose"
  | "dissolve"
  | "pixelize";

export interface Transition {
  type: TransitionType;
  duration: number;
  easing?: Easing;
}

export interface Mask {
  enabled: boolean;
  shape: "rect" | "ellipse" | "polygon";
  x: AnimParam; // 0..1 normalized
  y: AnimParam;
  width: AnimParam;
  height: AnimParam;
  feather: number;
  inverted: boolean;
  points?: Array<{ x: number; y: number }>; // For polygon masks
}

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "colorDodge"
  | "colorBurn"
  | "hardLight"
  | "softLight"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface MotionBlur {
  enabled: boolean;
  samples: number; // 2-32
  shutterAngle: number; // 0-360 degrees
}

export interface SpeedRamp {
  enabled: boolean;
  keyframes: Array<{
    time: number;
    speed: number; // 0.1 to 10x
    easing: Easing;
  }>;
}

export interface BaseClip {
  id: string;
  trackId: string;
  name: string;
  /** Position on the global timeline, in seconds. */
  start: number;
  /** Duration on the timeline, in seconds (post speed-ramp). */
  duration: number;
  selected?: boolean;
  locked?: boolean;
  group?: string; // Group ID for multi-select operations
}

export interface VideoClip extends BaseClip {
  type: "video" | "image";
  assetId: string;
  /** In/out trim point inside the source asset, in seconds. */
  inPoint: number;
  outPoint: number;
  speed: number;
  speedRamp?: SpeedRamp;
  reversed?: boolean;
  
  // Transform
  opacity: AnimParam;
  x: AnimParam; // -1..1 offset relative to frame width
  y: AnimParam;
  scale: AnimParam; // 1 = 100%
  scaleX?: AnimParam; // Separate X scale for advanced users
  scaleY?: AnimParam; // Separate Y scale
  rotation: AnimParam; // degrees
  rotationX?: AnimParam; // 3D rotation
  rotationY?: AnimParam;
  
  // Crop
  cropLeft?: AnimParam; // 0-1
  cropRight?: AnimParam;
  cropTop?: AnimParam;
  cropBottom?: AnimParam;
  
  // Flip
  flipH?: boolean;
  flipV?: boolean;
  
  volume: AnimParam;
  muted: boolean;
  
  // Color & Effects
  color: ColorGrade;
  chroma: ChromaKey;
  mask: Mask;
  blendMode?: BlendMode;
  motionBlur?: MotionBlur;
  
  // Transitions
  transitionIn: Transition;
  transitionOut?: Transition;
  
  effects: string[];
}

export interface AudioClip extends BaseClip {
  type: "audio";
  assetId: string;
  inPoint: number;
  outPoint: number;
  speed?: number;
  
  // Volume & Fade
  volume: AnimParam;
  fadeIn: number;
  fadeOut: number;
  
  // Professional audio tools
  eqLow: number; // -15..15 dB
  eqMid: number;
  eqHigh: number;
  
  // Audio effects
  denoise: boolean;
  denoiseAmount?: number; // 0-1
  normalize?: boolean;
  compressor?: {
    enabled: boolean;
    threshold: number; // -60 to 0 dB
    ratio: number; // 1 to 20
    attack: number; // ms
    release: number; // ms
  };
  voiceEnhance?: boolean;
  removeSilence?: {
    enabled: boolean;
    threshold: number; // -60 to 0 dB
    minDuration: number; // seconds
  };
  
  pan?: AnimParam; // -1 (left) to 1 (right), 0 = center
  muted: boolean;
}

export type TextAnimation = 
  | "none" 
  | "fade" 
  | "slide-up" 
  | "slide-down"
  | "slide-left" 
  | "slide-right"
  | "pop" 
  | "typewriter"
  | "blur-in"
  | "scale-in"
  | "rotate-in"
  | "bounce";

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight?: number; // 100-900
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  lineHeight?: number;
  
  // Colors
  color: string;
  backgroundColor: string;
  
  // Effects
  shadow?: {
    enabled: boolean;
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
  stroke?: {
    enabled: boolean;
    color: string;
    width: number;
  };
  gradient?: {
    enabled: boolean;
    type: "linear" | "radial";
    colors: Array<{ color: string; position: number }>; // position 0-1
    angle?: number; // degrees, for linear
  };
}

export interface TextClip extends BaseClip {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  align: "left" | "center" | "right";
  
  // Transform
  x: AnimParam;
  y: AnimParam;
  scale: AnimParam;
  rotation?: AnimParam;
  opacity: AnimParam;
  
  // Animations
  animationIn: TextAnimation;
  animationOut: TextAnimation;
  
  // Advanced styling
  style?: TextStyle;
}

export type Clip = VideoClip | AudioClip | TextClip | SubtitleClip;

/** Auto-generated or manual subtitles */
export interface SubtitleClip extends BaseClip {
  type: "subtitle";
  text: string;
  startTime: number; // Redundant with BaseClip.start but kept for clarity
  endTime: number;
  style?: TextStyle;
  language?: string;
}

export type TrackType = "video" | "audio" | "text" | "subtitle";

/** Timeline marker for navigation */
export interface Marker {
  id: string;
  time: number;
  label: string;
  color?: string;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  hidden: boolean;
  muted: boolean;
  locked: boolean;
  solo?: boolean; // Solo mode for audio tracks
  height?: number; // Custom track height in pixels
}

export interface ExportSettings {
  width: number;
  height: number;
  fps: number;
  format: "mp4" | "webm" | "gif" | "mov";
  
  // Video codec options
  codec?: "h264" | "h265" | "vp9" | "av1";
  crf: number; // Quality (lower = better)
  bitrate?: number; // Optional fixed bitrate in kbps
  preset?: "ultrafast" | "fast" | "medium" | "slow" | "veryslow";
  
  // Audio options
  audioCodec?: "aac" | "opus" | "mp3";
  audioBitrate?: number; // kbps
  audioOnly?: boolean; // Export audio only
  
  // Range export
  exportRange?: {
    start: number;
    end: number;
  };
}

export interface GenerationStyle {
  pace: "slow" | "medium" | "fast";
  bw: boolean;
  colorGrade: LutPreset;
  kenBurns: boolean;
  beatSync: boolean;
  transition: TransitionType;
  addCaptions: boolean;
  rawPrompt: string;
  
  // AI-enhanced options
  contentType?: "podcast" | "youtube" | "shorts" | "reels" | "tiktok" | "ad" | "travel" | "wedding" | "educational" | "music-video" | "interview" | "presentation";
  targetDuration?: number; // Desired output duration in seconds
  intelligentCuts?: boolean; // Use AI to find best moments
  emotionDetection?: boolean; // Analyze emotional peaks
  autoSubtitles?: boolean; // Generate subtitles automatically
}

export interface Project {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  resolution: { width: number; height: number };
  fps: number;
  duration: number;
  assets: MediaAsset[];
  tracks: Track[];
  markers: Marker[];
  style: GenerationStyle;
  exportSettings: ExportSettings;
  
  /** Rendered proxy of the current timeline, used on the results screen. */
  previewBlobKey?: string;
  
  /** Undo/redo support */
  historyIndex?: number;
  
  /** Auto-save timestamp */
  lastAutoSave?: number;
}

export const PROJECT_DB_VERSION = 2; // Increment when schema changes
