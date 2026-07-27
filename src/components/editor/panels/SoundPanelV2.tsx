"use client";

import { useProjectStore } from "@/store/projectStore";
import type { AudioClip, VideoClip } from "@/lib/types";
import ParamControl from "../ParamControl";

export default function SoundPanelV2() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);

  if (!project || !selectedClipId) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Звук</h3>
        <p className="text-xs text-slate-500">Выберите аудио- или видео-клип на таймлайне</p>
      </div>
    );
  }

  const clip = project.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId) as (AudioClip | VideoClip) | undefined;

  if (!clip || (clip.type !== "audio" && clip.type !== "video")) {
    return (
      <div className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Звук</h3>
        <p className="text-xs text-slate-500">Редактирование звука доступно для аудио и видео</p>
      </div>
    );
  }

  const isAudio = clip.type === "audio";

  return (
    <div className="h-full overflow-y-auto p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Профессиональный аудиоредактор
      </h3>

      {/* Volume & Fade */}
      <div className="mb-6">
        <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Громкость и затухание</h4>
        
        <ParamControl
          label="Громкость"
          value={clip.volume}
          min={0}
          max={2}
          onChange={(v) => updateClip(selectedClipId, (c) => ({ ...c, volume: v }))}
          unit="%"
          displayFn={(v) => Math.round(v * 100)}
        />

        {isAudio && (
          <>
            <div className="mb-2">
              <label className="mb-1 block text-[11px] text-slate-400">Fade In (сек)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={(clip as AudioClip).fadeIn}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({ ...c, fadeIn: parseFloat(e.target.value) || 0 }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div className="mb-2">
              <label className="mb-1 block text-[11px] text-slate-400">Fade Out (сек)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={(clip as AudioClip).fadeOut}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({ ...c, fadeOut: parseFloat(e.target.value) || 0 }))
                }
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-100"
              />
            </div>
          </>
        )}

        <div className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            id="muted"
            checked={clip.muted}
            onChange={(e) => updateClip(selectedClipId, (c) => ({ ...c, muted: e.target.checked }))}
            className="h-4 w-4 accent-violet-500"
          />
          <label htmlFor="muted" className="text-xs text-slate-300">
            Отключить звук
          </label>
        </div>
      </div>

      {/* Equalizer */}
      {isAudio && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Эквалайзер (3-полосный)</h4>
          
          <div className="mb-2">
            <label className="mb-1 block text-[11px] text-slate-400">
              Низкие частоты: {(clip as AudioClip).eqLow > 0 ? "+" : ""}{(clip as AudioClip).eqLow} dB
            </label>
            <input
              type="range"
              min={-15}
              max={15}
              step={0.5}
              value={(clip as AudioClip).eqLow}
              onChange={(e) =>
                updateClip(selectedClipId, (c) => ({ ...c, eqLow: parseFloat(e.target.value) }))
              }
              className="h-1 w-full accent-green-500"
            />
          </div>

          <div className="mb-2">
            <label className="mb-1 block text-[11px] text-slate-400">
              Средние частоты: {(clip as AudioClip).eqMid > 0 ? "+" : ""}{(clip as AudioClip).eqMid} dB
            </label>
            <input
              type="range"
              min={-15}
              max={15}
              step={0.5}
              value={(clip as AudioClip).eqMid}
              onChange={(e) =>
                updateClip(selectedClipId, (c) => ({ ...c, eqMid: parseFloat(e.target.value) }))
              }
              className="h-1 w-full accent-green-500"
            />
          </div>

          <div className="mb-2">
            <label className="mb-1 block text-[11px] text-slate-400">
              Высокие частоты: {(clip as AudioClip).eqHigh > 0 ? "+" : ""}{(clip as AudioClip).eqHigh} dB
            </label>
            <input
              type="range"
              min={-15}
              max={15}
              step={0.5}
              value={(clip as AudioClip).eqHigh}
              onChange={(e) =>
                updateClip(selectedClipId, (c) => ({ ...c, eqHigh: parseFloat(e.target.value) }))
              }
              className="h-1 w-full accent-green-500"
            />
          </div>
        </div>
      )}

      {/* Audio Effects */}
      {isAudio && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Аудиоэффекты</h4>
          
          <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-medium text-slate-300">Шумоподавление</label>
                <p className="text-[9px] text-slate-500">Убирает фоновый шум</p>
              </div>
              <input
                type="checkbox"
                checked={(clip as AudioClip).denoise}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({ ...c, denoise: e.target.checked }))
                }
                className="h-4 w-4 accent-violet-500"
              />
            </div>

            {(clip as AudioClip).denoise && (
              <div className="ml-2">
                <label className="mb-1 block text-[10px] text-slate-400">
                  Уровень: {((clip as AudioClip).denoiseAmount || 0.5) * 100}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={(clip as AudioClip).denoiseAmount || 0.5}
                  onChange={(e) =>
                    updateClip(selectedClipId, (c) => ({
                      ...c,
                      denoiseAmount: parseFloat(e.target.value),
                    }))
                  }
                  className="h-1 w-full accent-violet-500"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-medium text-slate-300">Нормализация</label>
                <p className="text-[9px] text-slate-500">Выравнивает громкость</p>
              </div>
              <input
                type="checkbox"
                checked={(clip as AudioClip).normalize || false}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({ ...c, normalize: e.target.checked }))
                }
                className="h-4 w-4 accent-violet-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-medium text-slate-300">Voice Enhance</label>
                <p className="text-[9px] text-slate-500">Улучшает голос</p>
              </div>
              <input
                type="checkbox"
                checked={(clip as AudioClip).voiceEnhance || false}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({ ...c, voiceEnhance: e.target.checked }))
                }
                className="h-4 w-4 accent-violet-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Compressor */}
      {isAudio && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Компрессор</h4>
          
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-300">Включить компрессор</label>
              <input
                type="checkbox"
                checked={(clip as AudioClip).compressor?.enabled || false}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    compressor: {
                      enabled: e.target.checked,
                      threshold: -20,
                      ratio: 4,
                      attack: 5,
                      release: 100,
                      ...(c as AudioClip).compressor,
                    },
                  }))
                }
                className="h-4 w-4 accent-violet-500"
              />
            </div>

            {(clip as AudioClip).compressor?.enabled && (
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[10px] text-slate-400">
                    Threshold: {(clip as AudioClip).compressor!.threshold} dB
                  </label>
                  <input
                    type="range"
                    min={-60}
                    max={0}
                    step={1}
                    value={(clip as AudioClip).compressor!.threshold}
                    onChange={(e) =>
                      updateClip(selectedClipId, (c) => ({
                        ...c,
                        compressor: { ...(c as AudioClip).compressor!, threshold: parseFloat(e.target.value) },
                      }))
                    }
                    className="h-1 w-full accent-violet-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] text-slate-400">
                    Ratio: {(clip as AudioClip).compressor!.ratio}:1
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.5}
                    value={(clip as AudioClip).compressor!.ratio}
                    onChange={(e) =>
                      updateClip(selectedClipId, (c) => ({
                        ...c,
                        compressor: { ...(c as AudioClip).compressor!, ratio: parseFloat(e.target.value) },
                      }))
                    }
                    className="h-1 w-full accent-violet-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pan Control */}
      {isAudio && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Панорама</h4>
          
          <ParamControl
            label="Баланс L/R"
            value={(clip as AudioClip).pan || { value: 0, keyframes: [] }}
            min={-1}
            max={1}
            onChange={(v) => updateClip(selectedClipId, (c) => ({ ...c, pan: v }))}
            displayFn={(v) => (v === 0 ? "Center" : v < 0 ? `L ${Math.abs(v * 100).toFixed(0)}%` : `R ${(v * 100).toFixed(0)}%`)}
          />
        </div>
      )}

      {/* Remove Silence */}
      {isAudio && (
        <div className="mb-6">
          <h4 className="mb-3 text-[11px] font-semibold text-slate-300">Удаление тишины</h4>
          
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-300">Убрать тишину</label>
              <input
                type="checkbox"
                checked={(clip as AudioClip).removeSilence?.enabled || false}
                onChange={(e) =>
                  updateClip(selectedClipId, (c) => ({
                    ...c,
                    removeSilence: {
                      enabled: e.target.checked,
                      threshold: -40,
                      minDuration: 0.5,
                      ...(c as AudioClip).removeSilence,
                    },
                  }))
                }
                className="h-4 w-4 accent-violet-500"
              />
            </div>

            {(clip as AudioClip).removeSilence?.enabled && (
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[10px] text-slate-400">
                    Порог: {(clip as AudioClip).removeSilence!.threshold} dB
                  </label>
                  <input
                    type="range"
                    min={-60}
                    max={-20}
                    step={1}
                    value={(clip as AudioClip).removeSilence!.threshold}
                    onChange={(e) =>
                      updateClip(selectedClipId, (c) => ({
                        ...c,
                        removeSilence: { ...(c as AudioClip).removeSilence!, threshold: parseFloat(e.target.value) },
                      }))
                    }
                    className="h-1 w-full accent-violet-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
