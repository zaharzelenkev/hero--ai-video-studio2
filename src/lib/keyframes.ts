import type { AnimParam, Easing, Keyframe } from "./types";
import { uid } from "./id";

function ease(t: number, easing: Easing): number {
  switch (easing) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return t;
  }
}

/** Evaluate an animated parameter at a given local clip time (seconds). */
export function evalParam(p: AnimParam, time: number): number {
  if (!p.keyframes.length) return p.value;
  const kfs = [...p.keyframes].sort((a, b) => a.time - b.time);
  if (time <= kfs[0].time) return kfs[0].value;
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time || 1;
      const t = ease((time - a.time) / span, b.easing);
      return a.value + (b.value - a.value) * t;
    }
  }
  return kfs[kfs.length - 1].value;
}

export function addKeyframe(p: AnimParam, time: number, value: number, easing: Easing = "easeInOut"): AnimParam {
  const filtered = p.keyframes.filter((k) => Math.abs(k.time - time) > 0.001);
  const kf: Keyframe = { id: uid("kf"), time, value, easing };
  return { ...p, value: p.keyframes.length ? p.value : value, keyframes: [...filtered, kf].sort((a, b) => a.time - b.time) };
}

export function removeKeyframe(p: AnimParam, keyframeId: string): AnimParam {
  return { ...p, keyframes: p.keyframes.filter((k) => k.id !== keyframeId) };
}

/**
 * Build an FFmpeg time expression (piecewise-linear) evaluating the animated
 * parameter, where `localTimeExpr` is the FFmpeg expression for the clip's
 * local time (usually `t-<clipStart>`). Falls back to a constant when there
 * are no keyframes.
 */
export function paramToFfmpegExpr(p: AnimParam, localTimeExpr: string): string {
  if (!p.keyframes.length) return `${p.value}`;
  const kfs = [...p.keyframes].sort((a, b) => a.time - b.time);
  // Build nested if(between(T,a,b), lerp, next) chain, ending in the last value.
  let expr = `${kfs[kfs.length - 1].value}`;
  for (let i = kfs.length - 2; i >= 0; i--) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const span = b.time - a.time || 1;
    const lerp = `(${a.value}+(${b.value}-${a.value})*((${localTimeExpr}-${a.time})/${span}))`;
    expr = `if(between(${localTimeExpr}\\,${a.time}\\,${b.time})\\,${lerp}\\,${expr})`;
  }
  // before first keyframe -> hold first value
  expr = `if(lt(${localTimeExpr}\\,${kfs[0].time})\\,${kfs[0].value}\\,${expr})`;
  return expr;
}
