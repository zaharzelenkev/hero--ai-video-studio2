import type { TextClip } from "./types";
import { param } from "./types";

const IN_DUR = 0.45;
const OUT_DUR = 0.45;

/** Recomputes x/y/opacity keyframes for a text clip based on the chosen presets. */
export function applyAnimationPreset(clip: TextClip): TextClip {
  const d = clip.duration;
  const baseX = clip.x.keyframes.length ? clip.x.value : clip.x.value;
  const baseY = clip.y.value;
  const opacity = param(1);
  const x = param(baseX);
  const y = param(baseY);
  const scale = param(clip.scale.value);

  const inEnd = Math.min(IN_DUR, d / 2);
  const outStart = Math.max(d - OUT_DUR, d / 2);

  const kf = (p: typeof opacity, time: number, value: number) =>
    p.keyframes.push({ id: `${clip.id}_${time}_${Math.random().toString(36).slice(2, 7)}`, time, value, easing: "easeOut" });

  switch (clip.animationIn) {
    case "fade":
      kf(opacity, 0, 0);
      kf(opacity, inEnd, 1);
      break;
    case "slide-up":
      kf(opacity, 0, 0);
      kf(opacity, inEnd, 1);
      kf(y, 0, baseY + 0.12);
      kf(y, inEnd, baseY);
      break;
    case "slide-left":
      kf(opacity, 0, 0);
      kf(opacity, inEnd, 1);
      kf(x, 0, baseX + 0.15);
      kf(x, inEnd, baseX);
      break;
    case "pop":
      kf(opacity, 0, 0);
      kf(opacity, inEnd, 1);
      kf(scale, 0, 0.6);
      kf(scale, inEnd, 1.05);
      kf(scale, Math.min(inEnd + 0.15, d), 1);
      break;
    default:
      break;
  }

  switch (clip.animationOut) {
    case "fade":
      kf(opacity, outStart, opacity.keyframes.length ? 1 : 1);
      kf(opacity, d, 0);
      break;
    case "slide-up":
      kf(opacity, outStart, 1);
      kf(opacity, d, 0);
      kf(y, outStart, baseY);
      kf(y, d, baseY - 0.12);
      break;
    case "slide-left":
      kf(opacity, outStart, 1);
      kf(opacity, d, 0);
      kf(x, outStart, baseX);
      kf(x, d, baseX - 0.15);
      break;
    case "pop":
      kf(opacity, outStart, 1);
      kf(scale, outStart, 1);
      kf(opacity, d, 0);
      kf(scale, d, 0.6);
      break;
    default:
      break;
  }

  if (!opacity.keyframes.length) opacity.value = 1;

  return { ...clip, opacity, x, y, scale };
}
