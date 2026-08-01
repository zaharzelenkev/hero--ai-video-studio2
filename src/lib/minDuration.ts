import type { Project, Clip, AnimParam, VideoClip, AudioClip, TextClip } from "./types";

/**
 * Гарантирует, что готовый ролик длится не меньше `min` секунд.
 *
 * Если таймлайн короче минимума, весь таймлайн равномерно растягивается до
 * целевой длительности: старты/длительности клипов, ключевые кадры анимаций,
 * переходы и маркеры масштабируются пропорционально, а короткие видео-исходники
 * добираются slow-mo (или используются полнее), чтобы стыки не рвались и ролик
 * честно набирал минимум.
 */
export const MIN_VIDEO_SECONDS = 10;

function scaleParam(p: AnimParam | undefined, f: number): void {
  if (!p) return;
  for (const kf of p.keyframes) kf.time *= f;
}

function scaleClip(clip: Clip, f: number): void {
  clip.start *= f;
  clip.duration *= f;

  if (clip.type === "video" || clip.type === "image") {
    const v = clip as VideoClip;
    scaleParam(v.opacity, f);
    scaleParam(v.x, f);
    scaleParam(v.y, f);
    scaleParam(v.scale, f);
    scaleParam(v.scaleX, f);
    scaleParam(v.scaleY, f);
    scaleParam(v.rotation, f);
    scaleParam(v.rotationX, f);
    scaleParam(v.rotationY, f);
    scaleParam(v.focusX, f);
    scaleParam(v.focusY, f);
    scaleParam(v.cropLeft, f);
    scaleParam(v.cropRight, f);
    scaleParam(v.cropTop, f);
    scaleParam(v.cropBottom, f);
    scaleParam(v.volume, f);
    if (v.color) {
      const c = v.color;
      scaleParam(c.brightness, f);
      scaleParam(c.contrast, f);
      scaleParam(c.saturation, f);
      scaleParam(c.vibrance, f);
      scaleParam(c.hue, f);
      scaleParam(c.exposure, f);
      scaleParam(c.highlights, f);
      scaleParam(c.shadows, f);
      scaleParam(c.whites, f);
      scaleParam(c.blacks, f);
      scaleParam(c.temperature, f);
      scaleParam(c.tint, f);
      scaleParam(c.gamma, f);
    }
    if (v.mask) {
      scaleParam(v.mask.x, f);
      scaleParam(v.mask.y, f);
      scaleParam(v.mask.width, f);
      scaleParam(v.mask.height, f);
    }
    if (v.speedRamp?.keyframes) {
      for (const k of v.speedRamp.keyframes) k.time *= f;
    }
    if (v.transitionIn) v.transitionIn.duration *= f;
    if (v.transitionOut) v.transitionOut.duration *= f;
  } else if (clip.type === "audio") {
    const a = clip as AudioClip;
    scaleParam(a.volume, f);
    scaleParam(a.pan, f);
  } else {
    const t = clip as TextClip;
    scaleParam(t.x, f);
    scaleParam(t.y, f);
    scaleParam(t.scale, f);
    scaleParam(t.rotation, f);
    scaleParam(t.opacity, f);
  }
}

export function ensureMinDuration(project: Project, min: number = MIN_VIDEO_SECONDS): Project {
  if (!project || !project.tracks) return project;
  const current = project.duration || 0;
  if (current >= min) return project;

  const f = min / Math.max(0.01, current);

  for (const track of project.tracks) {
    for (const clip of track.clips) scaleClip(clip, f);
  }
  for (const m of project.markers || []) m.time *= f;

  // После растяжения гарантируем, что у каждого видео-клипа хватает исходника:
  // расширяем outPoint на весь остаток исходника, а если его всё равно мало —
  // плавный slow-mo (speed < 1) дотягивает клип до новой длительности.
  for (const track of project.tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips) {
      if (clip.type !== "video") continue;
      const v = clip as VideoClip;
      const asset = project.assets?.find((a) => a.id === v.assetId);
      const srcDur = asset?.duration || 0;
      if (srcDur <= 0) continue; // картинки / неизвестный источник — источник бесконечен
      const needed = v.duration * (v.speed || 1);
      const available = srcDur - (v.inPoint || 0);
      if (available < needed - 0.01) {
        v.outPoint = srcDur;
        const avail = v.outPoint - (v.inPoint || 0);
        if (avail > 0.2) {
          v.speed = avail / v.duration;
        }
      }
    }
  }

  project.duration = min;
  return project;
}
