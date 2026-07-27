"use client";

import { useProjectStore } from "@/store/projectStore";
import type { VideoClip, BlendMode } from "@/lib/types";

const EFFECT_LIBRARY = [
  { id: "blur", name: "Blur", category: "Основные" },
  { id: "blur-gaussian", name: "Gaussian Blur", category: "Blur" },
  { id: "blur-motion", name: "Motion Blur", category: "Blur" },
  { id: "blur-radial", name: "Radial Blur", category: "Blur" },
  
  { id: "sharpen", name: "Sharpen", category: "Основные" },
  { id: "glow", name: "Glow", category: "Основные" },
  { id: "vignette", name: "Vignette", category: "Основные" },
  
  { id: "rgb-split", name: "RGB Split", category: "Glitch" },
  { id: "glitch-digital", name: "Digital Glitch", category: "Glitch" },
  { id: "glitch-vhs", name: "VHS Glitch", category: "Glitch" },
  { id: "glitch-scan", name: "Scan Lines", category: "Glitch" },
  
  { id: "noise-film", name: "Film Grain", category: "Texture" },
  { id: "noise-static", name: "Static Noise", category: "Texture" },
  
  { id: "distortion-wave", name: "Wave Distortion", category: "Distortion" },
  { id: "distortion-ripple", name: "Ripple", category: "Distortion" },
  { id: "distortion-lens", name: "Lens Distortion", category: "Distortion" },
  
  { id: "chromatic", name: "Chromatic Aberration", category: "Lens" },
  { id: "lens-flare", name: "Lens Flare", category: "Lens" },
  { id: "bokeh", name: "Bokeh", category: "Lens" },
  
  { id: "pixelate", name: "Pixelate", category: "Stylize" },
  { id: "posterize", name: "Posterize", category: "Stylize" },
  { id: "halftone", name: "Halftone", category: "Stylize" },
  { id: "edge-detect", name: "Edge Detect", category: "Stylize" },
  
  { id: "chroma-key", name: "Chroma Key", category: "Keying" },
  { id: "luma-key", name: "Luma Key", category: "Keying" },
];

const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "colorDodge",
  "colorBurn",
  "hardLight",
  "softLight",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
];

export default function EffectsPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-3xl shadow-inner border border-white/5">
          ✨
        </div>
        <h3 className="mb-2 text-sm font-bold text-slate-200">Ничего не выбрано</h3>
        <p className="text-xs text-slate-500 max-w-[200px]">Выберите клип на таймлайне внизу, чтобы открыть его параметры.</p>
      </div>
    );
  }

  const clip = project.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId) as VideoClip | undefined;

  if (!clip || (clip.type !== "video" && clip.type !== "image")) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Эффекты</h3>
        <p className="text-xs text-slate-500">Эффекты доступны только для видео и фото</p>
      </div>
    );
  }

  const toggleEffect = (effectId: string) => {
    updateClip(selectedClipId, (c) => {
      if (c.type !== "video" && c.type !== "image") return c;
      const current = (c as VideoClip).effects || [];
      const hasEffect = current.includes(effectId);
      return {
        ...c,
        effects: hasEffect ? current.filter((e) => e !== effectId) : [...current, effectId],
      };
    });
  };

  const activeEffects = clip.effects || [];
  const categories = Array.from(new Set(EFFECT_LIBRARY.map((e) => e.category)));

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Библиотека эффектов
      </h3>

      {/* Active Effects */}
      {activeEffects.length > 0 && (
        <div className="mb-6 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
          <h4 className="mb-2 text-[11px] font-semibold text-violet-300">
            Активные эффекты ({activeEffects.length})
          </h4>
          <div className="space-y-1.5">
            {activeEffects.map((effectId) => {
              const effect = EFFECT_LIBRARY.find((e) => e.id === effectId);
              return (
                <div
                  key={effectId}
                  className="flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5"
                >
                  <span className="text-[11px] text-slate-300">{effect?.name || effectId}</span>
                  <button
                    onClick={() => toggleEffect(effectId)}
                    className="text-[10px] text-red-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Blend Mode */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <label className="mb-2 block text-[11px] font-medium text-slate-300">Blend Mode</label>
        <select
          value={clip.blendMode || "normal"}
          onChange={(e) =>
            updateClip(selectedClipId, (c) => ({ ...c, blendMode: e.target.value as BlendMode }))
          }
          className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
        >
          {BLEND_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Motion Blur */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-slate-300">Motion Blur</label>
          <input
            type="checkbox"
            checked={clip.motionBlur?.enabled || false}
            onChange={(e) =>
              updateClip(selectedClipId, (c) => ({
                ...c,
                motionBlur: {
                  enabled: e.target.checked,
                  samples: 8,
                  shutterAngle: 180,
                  ...(c as VideoClip).motionBlur,
                },
              }))
            }
            className="h-4 w-4 accent-violet-500"
          />
        </div>

        {clip.motionBlur?.enabled && (
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Samples: {clip.motionBlur.samples}
              </label>
              <input
                type="range"
                min={2}
                max={32}
                step={2}
                value={clip.motionBlur.samples}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    motionBlur: { ...(c as VideoClip).motionBlur!, samples: parseInt(e.target.value) },
                  }))
                }
                className="h-1 w-full accent-violet-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Shutter Angle: {clip.motionBlur.shutterAngle}°
              </label>
              <input
                type="range"
                min={0}
                max={360}
                step={15}
                value={clip.motionBlur.shutterAngle}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    motionBlur: { ...(c as VideoClip).motionBlur!, shutterAngle: parseInt(e.target.value) },
                  }))
                }
                className="h-1 w-full accent-violet-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Chroma Key */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-slate-300">Chroma Key (Green Screen)</label>
          <input
            type="checkbox"
            checked={clip.chroma.enabled}
            onChange={(e) =>
              updateClip(selectedClipId, (c) => ({
                ...c,
                chroma: { ...(c as VideoClip).chroma, enabled: e.target.checked },
              }))
            }
            className="h-4 w-4 accent-violet-500"
          />
        </div>

        {clip.chroma.enabled && (
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">Цвет ключа</label>
              <input
                type="color"
                value={clip.chroma.color}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    chroma: { ...(c as VideoClip).chroma, color: e.target.value },
                  }))
                }
                className="h-8 w-full rounded-md border border-white/10"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Чувствительность: {(clip.chroma.similarity * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={clip.chroma.similarity}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    chroma: { ...(c as VideoClip).chroma, similarity: parseFloat(e.target.value) },
                  }))
                }
                className="h-1 w-full accent-green-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Смягчение краев: {(clip.chroma.blend * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={clip.chroma.blend}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    chroma: { ...(c as VideoClip).chroma, blend: parseFloat(e.target.value) },
                  }))
                }
                className="h-1 w-full accent-green-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Mask */}
      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[11px] font-medium text-slate-300">Маска</label>
          <input
            type="checkbox"
            checked={clip.mask.enabled}
            onChange={(e) =>
              updateClip(selectedClipId, (c) => ({
                ...c,
                mask: { ...(c as VideoClip).mask, enabled: e.target.checked },
              }))
            }
            className="h-4 w-4 accent-violet-500"
          />
        </div>

        {clip.mask.enabled && (
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">Форма</label>
              <select
                value={clip.mask.shape}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    mask: { ...(c as VideoClip).mask, shape: e.target.value as "rect" | "ellipse" | "polygon" },
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-100"
              >
                <option value="rect">Прямоугольник</option>
                <option value="ellipse">Эллипс</option>
                <option value="polygon">Полигон</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] text-slate-400">
                Размытие (Feather): {clip.mask.feather}px
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={clip.mask.feather}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    mask: { ...(c as VideoClip).mask, feather: parseInt(e.target.value) },
                  }))
                }
                className="h-1 w-full accent-violet-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="invert-mask"
                checked={clip.mask.inverted}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    mask: { ...(c as VideoClip).mask, inverted: e.target.checked },
                  }))
                }
                className="h-4 w-4 accent-violet-500"
              />
              <label htmlFor="invert-mask" className="text-[10px] text-slate-300">
                Инвертировать маску
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Effect Library */}
      <div className="mb-4">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Доступные эффекты</h4>

        {categories.map((category) => (
          <div key={category} className="mb-4">
            <h5 className="mb-2 text-[10px] font-medium text-slate-400">{category}</h5>
            <div className="grid grid-cols-2 gap-2">
              {EFFECT_LIBRARY.filter((e) => e.category === category).map((effect) => {
                const isActive = activeEffects.includes(effect.id);
                return (
                  <button
                    key={effect.id}
                    onClick={() => toggleEffect(effect.id)}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-medium transition-colors ${
                      isActive
                        ? "border-violet-500/50 bg-violet-500/20 text-violet-300"
                        : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    {effect.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Clear All */}
      {activeEffects.length > 0 && (
        <button
          onClick={() =>
            updateClip(selectedClipId, (c) => ({
              ...c,
              effects: [],
              blendMode: "normal",
              motionBlur: { enabled: false, samples: 8, shutterAngle: 180 },
            }))
          }
          className="w-full rounded-lg border border-red-400/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10"
        >
          Очистить все эффекты
        </button>
      )}
    </div>
  );
}
