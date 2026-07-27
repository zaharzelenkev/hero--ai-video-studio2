import type { AudioClip, ExportSettings, Project, TextClip, VideoClip } from "./types";
import { paramToFfmpegExpr } from "./keyframes";
import { EFFECT_PRESETS, fontFileFor, lutToFfmpeg, transitionToXfade } from "./presets";

let uidCounter = 0;
function id(prefix: string) {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}

export interface InputEntry {
  /** Extra args placed before `-i`, e.g. `-loop 1 -t 4`. */
  pre: string[];
  path: string;
}

export interface CompileResult {
  inputs: InputEntry[];
  filterComplex: string;
  videoMapLabel: string | null;
  audioMapLabel: string | null;
  fontMounted: boolean;
}

export type FileNameResolver = (clip: VideoClip | AudioClip) => string;

function escFilterArg(v: string | number): string {
  return String(v);
}

function escDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

interface ClipChainResult {
  label: string; // final output label (yuva420p stream)
  idx: number; // ffmpeg input index (for reusing embedded audio)
}

/**
 * Builds the per-clip processing chain: trim -> speed -> fit/scale -> color
 * grade -> chroma key -> mask -> opacity. Every clip is decoded as its own
 * ffmpeg input, so the local `t` used inside expressions is always 0-based
 * (starts at the clip's own beginning) which keeps keyframe math simple.
 */
function buildVideoClipChain(
  clip: VideoClip,
  inputs: InputEntry[],
  fileNameFor: FileNameResolver,
  fps: number,
  canvasW: number,
  canvasH: number,
  fitMode: "cover" | "native",
  lines: string[],
): ClipChainResult {
  const idx = inputs.length;
  if (clip.type === "image") {
    inputs.push({ pre: ["-loop", "1", "-t", String(Math.max(0.1, clip.duration))], path: fileNameFor(clip) });
  } else {
    inputs.push({ pre: [], path: fileNameFor(clip) });
  }

  const tag = clip.id.replace(/[^a-zA-Z0-9]/g, "");
  let current = id(`c${tag}_`);

  if (clip.type === "image") {
    lines.push(`[${idx}:v]fps=${fps},format=yuv420p,setpts=PTS-STARTPTS[${current}]`);
  } else {
    lines.push(
      `[${idx}:v]trim=start=${clip.inPoint}:end=${clip.outPoint},setpts=PTS-STARTPTS,fps=${fps}[${current}]`,
    );
  }

  if (clip.speed && clip.speed !== 1) {
    const next = id(`c${tag}_`);
    lines.push(`[${current}]setpts=PTS/${clip.speed}[${next}]`);
    current = next;
  }

  if (fitMode === "cover") {
    const next = id(`c${tag}_`);
    lines.push(
      `[${current}]scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,crop=${canvasW}:${canvasH},setsar=1[${next}]`,
    );
    current = next;
  } else {
    const scaleExpr = paramToFfmpegExpr(clip.scale, "t");
    const next = id(`c${tag}_`);
    lines.push(
      `[${current}]scale=w='trunc(iw*(${scaleExpr})/2)*2':h='trunc(ih*(${scaleExpr})/2)*2':eval=frame,setsar=1[${next}]`,
    );
    current = next;
  }

  const rotVal = clip.rotation;
  if (rotVal.value !== 0 || rotVal.keyframes.length) {
    const degExpr = paramToFfmpegExpr(rotVal, "t");
    const next = id(`c${tag}_`);
    lines.push(`[${current}]format=yuva420p,rotate=a='(${degExpr})*PI/180':c=black@0:eval=frame[${next}]`);
    current = next;
  }

  // Color grade (brightness/contrast/saturation/gamma via eq, hue separately).
  const c = clip.color;
  const brightnessExpr = paramToFfmpegExpr(c.brightness, "t");
  const contrastExpr = `(1+(${paramToFfmpegExpr(c.contrast, "t")}))`;
  const saturationExpr = `(1+(${paramToFfmpegExpr(c.saturation, "t")}))`;
  const gammaExpr = paramToFfmpegExpr(c.gamma, "t");
  const nextEq = id(`c${tag}_`);
  lines.push(
    `[${current}]eq=brightness='${brightnessExpr}':contrast='${contrastExpr}':saturation='${saturationExpr}':gamma='${gammaExpr}':eval=frame[${nextEq}]`,
  );
  current = nextEq;

  if (c.hue.value !== 0 || c.hue.keyframes.length) {
    const hueExpr = paramToFfmpegExpr(c.hue, "t");
    const next = id(`c${tag}_`);
    lines.push(`[${current}]hue=h='${hueExpr}':eval=frame[${next}]`);
    current = next;
  }

  if (c.temperature.value !== 0 || c.tint.value !== 0) {
    const rs = (c.temperature.value * 0.3 + c.tint.value * 0.1).toFixed(3);
    const gs = (c.tint.value * 0.15).toFixed(3);
    const bs = (-c.temperature.value * 0.3 + c.tint.value * -0.1).toFixed(3);
    const next = id(`c${tag}_`);
    lines.push(`[${current}]colorbalance=rs=${rs}:gs=${gs}:bs=${bs}:rm=${rs}:gm=${gs}:bm=${bs}[${next}]`);
    current = next;
  }

  const lutFilters = lutToFfmpeg(c.lut);
  for (const f of lutFilters) {
    const next = id(`c${tag}_`);
    lines.push(`[${current}]${f}[${next}]`);
    current = next;
  }

  if (clip.chroma.enabled) {
    const next = id(`c${tag}_`);
    lines.push(
      `[${current}]format=yuva420p,colorkey=color=${clip.chroma.color}:similarity=${clip.chroma.similarity}:blend=${clip.chroma.blend}[${next}]`,
    );
    current = next;
  }

  for (const effectId of clip.effects || []) {
    const preset = EFFECT_PRESETS.find((e) => e.id === effectId);
    if (!preset) continue;
    const next = id(`c${tag}_`);
    lines.push(`[${current}]${preset.ffmpeg}[${next}]`);
    current = next;
  }

  if (clip.mask.enabled) {
    const mx = clamp(clip.mask.x.value, 0, 1);
    const my = clamp(clip.mask.y.value, 0, 1);
    const mw = clamp(clip.mask.width.value, 0.01, 1);
    const mh = clamp(clip.mask.height.value, 0.01, 1);
    const next = id(`c${tag}_`);
    const inside =
      clip.mask.shape === "rect"
        ? `if(between(X\\,W*${mx}\\,W*${mx + mw})*between(Y\\,H*${my}\\,H*${my + mh})\\,255\\,0)`
        : `if(lte(pow((X-(W*${mx + mw / 2}))/(W*${mw / 2})\\,2)+pow((Y-(H*${my + mh / 2}))/(H*${mh / 2})\\,2)\\,1)\\,255\\,0)`;
    const alphaExpr = clip.mask.inverted ? `255-(${inside})` : inside;
    lines.push(`[${current}]format=yuva420p,geq=lum='p(X,Y)':a='${alphaExpr}'[${next}_pre]`);
    current = `${next}_pre`;
    if (clip.mask.feather > 0) {
      const feathered = id(`c${tag}_`);
      lines.push(`[${current}]boxblur=0:1:0:1:${Math.round(clip.mask.feather)}:1[${feathered}]`);
      current = feathered;
    }
  }

  const opacityExpr = paramToFfmpegExpr(clip.opacity, "t");
  const finalLabel = id(`c${tag}_`);
  lines.push(`[${current}]format=yuva420p,colorchannelmixer=aa='${opacityExpr}':eval=frame[${finalLabel}]`);

  return { label: finalLabel, idx };
}

function buildAudioChain(
  sourceRef: string, // e.g. "3:a"
  clipId: string,
  inPoint: number,
  outPoint: number,
  start: number,
  volume: import("./types").AnimParam,
  fadeIn: number,
  fadeOut: number,
  eqLow: number,
  eqMid: number,
  eqHigh: number,
  denoise: boolean,
  duration: number,
  lines: string[],
): string {
  const tag = clipId.replace(/[^a-zA-Z0-9]/g, "");
  let current = id(`a${tag}_`);
  lines.push(`[${sourceRef}]atrim=start=${inPoint}:end=${outPoint},asetpts=PTS-STARTPTS[${current}]`);

  const volExpr = paramToFfmpegExpr(volume, "t");
  const next1 = id(`a${tag}_`);
  lines.push(`[${current}]volume='${volExpr}':eval=frame[${next1}]`);
  current = next1;

  if (fadeIn > 0) {
    const n = id(`a${tag}_`);
    lines.push(`[${current}]afade=t=in:st=0:d=${fadeIn}[${n}]`);
    current = n;
  }
  if (fadeOut > 0) {
    const n = id(`a${tag}_`);
    lines.push(`[${current}]afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}[${n}]`);
    current = n;
  }
  if (eqLow || eqMid || eqHigh) {
    const n = id(`a${tag}_`);
    lines.push(
      `[${current}]equalizer=f=100:t=q:w=1:g=${eqLow},equalizer=f=1200:t=q:w=1:g=${eqMid},equalizer=f=8000:t=q:w=1:g=${eqHigh}[${n}]`,
    );
    current = n;
  }
  if (denoise) {
    const n = id(`a${tag}_`);
    lines.push(`[${current}]afftdn=nf=-25[${n}]`);
    current = n;
  }
  const n2 = id(`a${tag}_`);
  const delayMs = Math.max(0, Math.round(start * 1000));
  lines.push(`[${current}]aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}[${n2}]`);
  return n2;
}

export function compileProjectToFfmpeg(
  project: Project,
  exportSettings: ExportSettings,
  fileNameFor: FileNameResolver,
): CompileResult {
  uidCounter = 0;
  const inputs: InputEntry[] = [];
  const lines: string[] = [];
  const audioLabels: string[] = [];
  const W = exportSettings.width;
  const H = exportSettings.height;
  const fps = exportSettings.fps;

  const videoTracks = project.tracks.filter((t) => t.type === "video" && !t.hidden);
  const textTracks = project.tracks.filter((t) => t.type === "text" && !t.hidden);
  const audioTracks = project.tracks.filter((t) => t.type === "audio" && !t.hidden);

  const baseTrack = videoTracks[0];
  const overlayTracks = videoTracks.slice(1);

  let composite: string | null = null;

  if (baseTrack && baseTrack.clips.length) {
    const clips = [...baseTrack.clips].sort((a, b) => a.start - b.start) as VideoClip[];
    type Segment = { label: string; duration: number; transition: VideoClip["transitionIn"]; idx: number };
    const segments: Segment[] = [];
    let cursor = 0;
    for (const clip of clips) {
      if (clip.start - cursor > 0.02) {
        const gap = clip.start - cursor;
        const fillLabel = id("gapfill_");
        lines.push(`color=c=black:s=${W}x${H}:d=${gap}:r=${fps},format=yuva420p[${fillLabel}]`);
        segments.push({ label: fillLabel, duration: gap, transition: { type: "cut", duration: 0 }, idx: -1 });
      }
      const { label, idx } = buildVideoClipChain(clip, inputs, fileNameFor, fps, W, H, "cover", lines);
      segments.push({ label, duration: clip.duration, transition: clip.transitionIn, idx });
      cursor = clip.start + clip.duration;

      if (!clip.muted) {
        const audioLabel = buildAudioChain(
          `${idx}:a`,
          clip.id,
          clip.inPoint,
          clip.outPoint,
          clip.start,
          clip.volume,
          0,
          0,
          0,
          0,
          0,
          false,
          clip.duration,
          lines,
        );
        audioLabels.push(audioLabel);
      }
    }

    if (segments.length === 1) {
      composite = segments[0].label;
    } else if (segments.length > 1) {
      let acc = segments[0].label;
      let accDur = segments[0].duration;
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.transition.type === "cut" || seg.transition.duration <= 0) {
          const next = id("concat_");
          lines.push(`[${acc}][${seg.label}]concat=n=2:v=1:a=0[${next}]`);
          acc = next;
          accDur += seg.duration;
        } else {
          const dur = Math.max(0.05, Math.min(seg.transition.duration, accDur, seg.duration));
          const offset = Math.max(0, accDur - dur);
          const xfadeName = transitionToXfade(seg.transition.type);
          const next = id("xfade_");
          lines.push(
            `[${acc}][${seg.label}]xfade=transition=${xfadeName}:duration=${dur}:offset=${offset}[${next}]`,
          );
          acc = next;
          accDur = accDur - dur + seg.duration;
        }
      }
      composite = acc;
    }
  }

  if (!composite) {
    const fallback = id("blank_");
    lines.push(`color=c=black:s=${W}x${H}:d=${Math.max(1, project.duration)}:r=${fps},format=yuva420p[${fallback}]`);
    composite = fallback;
  }

  // Overlay video/image tracks.
  for (const track of overlayTracks) {
    for (const clip of track.clips as VideoClip[]) {
      const { label: rawLabel, idx } = buildVideoClipChain(clip, inputs, fileNameFor, fps, W, H, "native", lines);
      const start = clip.start;
      const end = clip.start + clip.duration;
      // buildVideoClipChain resets this clip's PTS to start at 0. Since it will be
      // composited against the global timeline (via enable='between(t,start,end)'),
      // its clock must be shifted forward by `start` first - otherwise, by the time
      // the gate opens at t=start, the overlay stream has already played `start`
      // seconds ahead of its own content (or finished entirely for short clips).
      const label = id("ovshift_");
      lines.push(`[${rawLabel}]setpts=PTS+${start}/TB[${label}]`);
      const xExpr = paramToFfmpegExpr(clip.x, `t-${start}`);
      const yExpr = paramToFfmpegExpr(clip.y, `t-${start}`);
      const next = id("ov_");
      lines.push(
        `[${composite}][${label}]overlay=x='(main_w-overlay_w)/2+(${xExpr})*main_w/2':y='(main_h-overlay_h)/2+(${yExpr})*main_h/2':enable='between(t\\,${start}\\,${end})'[${next}]`,
      );
      composite = next;

      if (!clip.muted) {
        const audioLabel = buildAudioChain(
          `${idx}:a`,
          clip.id,
          clip.inPoint,
          clip.outPoint,
          clip.start,
          clip.volume,
          0,
          0,
          0,
          0,
          0,
          false,
          clip.duration,
          lines,
        );
        audioLabels.push(audioLabel);
      }
    }
  }

  // Text tracks (drawtext, needs DejaVuSans.ttf mounted at fontFile).
  let usedFont = false;
  for (const track of textTracks) {
    for (const clip of track.clips as TextClip[]) {
      usedFont = true;
      const start = clip.start;
      const end = clip.start + clip.duration;
      const xExpr = paramToFfmpegExpr(clip.x, `t-${start}`);
      const yExpr = paramToFfmpegExpr(clip.y, `t-${start}`);
      const opacityExpr = paramToFfmpegExpr(clip.opacity, `t-${start}`);
      const text = escDrawtext(clip.text);
      const next = id("txt_");
      const xPos = `(w-text_w)/2+(${xExpr})*w/2`;
      const yPos = `(h-text_h)/2+(${yExpr})*h/2`;
      lines.push(
        [
          `[${composite}]drawtext=fontfile=${fontFileFor(clip.fontFamily)}`,
          `text='${text}'`,
          `fontsize=${clip.fontSize}`,
          `fontcolor=${clip.color}@1`,
          `x='${xPos}'`,
          `y='${yPos}'`,
          `alpha='${opacityExpr}'`,
          `box=${clip.backgroundColor && clip.backgroundColor !== "transparent" ? 1 : 0}`,
          `boxcolor=${(clip.backgroundColor && clip.backgroundColor !== "transparent") ? clip.backgroundColor : "black@0.4"}`,
          `boxborderw=10`,
          `enable='between(t\\,${start}\\,${end})'`,
        ].join(":") + `[${next}]`,
      );
      composite = next;
    }
  }

  const finalVideo = id("vout_");
  lines.push(`[${composite}]format=yuv420p[${finalVideo}]`);

  // Dedicated audio tracks (music / sfx).
  for (const track of audioTracks) {
    for (const clip of track.clips as AudioClip[]) {
      if (clip.muted) continue;
      const idx = inputs.length;
      inputs.push({ pre: [], path: fileNameFor(clip) });
      const audioLabel = buildAudioChain(
        `${idx}:a`,
        clip.id,
        clip.inPoint,
        clip.outPoint,
        clip.start,
        clip.volume,
        clip.fadeIn,
        clip.fadeOut,
        clip.eqLow,
        clip.eqMid,
        clip.eqHigh,
        clip.denoise,
        clip.duration,
        lines,
      );
      audioLabels.push(audioLabel);
    }
  }

  let finalAudio: string | null = null;
  if (audioLabels.length) {
    finalAudio = id("aout_");
    lines.push(
      `${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0[${finalAudio}]`,
    );
  }

  return {
    inputs,
    filterComplex: lines.join(";\n"),
    videoMapLabel: finalVideo,
    audioMapLabel: finalAudio,
    fontMounted: usedFont,
  };
}

export function buildOutputArgs(exportSettings: ExportSettings, outputName: string): string[] {
  const codecArgs =
    exportSettings.format === "webm"
      ? ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", String(exportSettings.crf), "-c:a", "libopus"]
      : exportSettings.format === "gif"
        ? []
        : ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(exportSettings.crf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k"];
  return [...codecArgs, "-r", String(exportSettings.fps), outputName];
}

export { escFilterArg };
