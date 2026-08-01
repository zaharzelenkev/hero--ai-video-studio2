"use client";

import { useMemo, useState } from "react";
import StageShell, { SectionTitle } from "./StageShell";
import type { DirectorBrief, PreProduction, PreprodStage, StoryboardFrame } from "@/lib/production";
import { uid } from "@/lib/id";
import { generateSketchDataUrl } from "@/lib/sketch";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

const SHOT_SIZES = ["ECU", "CU", "MCU", "MS", "WS", "ELS", "POV", "OTS", "INSERT"];

export default function StageStoryboard({ preprod, updatePreprod, onRegenerate, busy }: Props) {
  const sb = preprod.storyboard;
  const [generatingImg, setGeneratingImg] = useState<string | null>(null);

  const set = (patch: Partial<typeof sb>) =>
    updatePreprod((p) => ({ ...p, storyboard: { ...p.storyboard, ...patch } }));

  const updateFrame = (id: string, patch: Partial<StoryboardFrame>) =>
    set({ frames: sb.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

  const addFrame = () =>
    set({
      frames: [
        ...sb.frames,
        {
          id: uid("fr"),
          number: sb.frames.length + 1,
          description: "",
          composition: "",
          cameraMovement: "",
          objectPlacement: "",
          lighting: "",
          color: "",
          shotSize: "MS",
          mood: "",
        },
      ],
    });
  const removeFrame = (id: string) =>
    set({ frames: sb.frames.filter((f) => f.id !== id).map((f, i) => ({ ...f, number: i + 1 })) });

  const refreshSketch = (id: string) => {
    const f = sb.frames.find((x) => x.id === id);
    if (!f) return;
    const url = generateSketchDataUrl(
      {
        shotSize: f.shotSize,
        composition: f.composition,
        lighting: f.lighting,
        mood: f.mood,
        color: f.color,
        cameraMovement: f.cameraMovement,
        description: f.description,
      },
      f.number
    );
    updateFrame(id, { imageDataUrl: url });
  };

  const refreshAllSketches = () => {
    set({
      frames: sb.frames.map((f) => ({
        ...f,
        imageDataUrl: generateSketchDataUrl(
          {
            shotSize: f.shotSize,
            composition: f.composition,
            lighting: f.lighting,
            mood: f.mood,
            color: f.color,
            cameraMovement: f.cameraMovement,
            description: f.description,
          },
          f.number
        ),
      })),
    });
  };

  // Первичная генерация SVG-эскизов, если их нет
  useMemo(() => {
    if (sb.frames.length > 0 && sb.frames.some((f) => !f.imageDataUrl)) {
      set({
        frames: sb.frames.map((f) =>
          f.imageDataUrl
            ? f
            : {
                ...f,
                imageDataUrl: generateSketchDataUrl(
                  {
                    shotSize: f.shotSize,
                    composition: f.composition,
                    lighting: f.lighting,
                    mood: f.mood,
                    color: f.color,
                    cameraMovement: f.cameraMovement,
                    description: f.description,
                  },
                  f.number
                ),
              }
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb.frames.length]);

  // Попытка бесплатной генерации через Pollinations (внешний бесплатный сервис; без ключа)
  const tryPollinations = async (id: string) => {
    const f = sb.frames.find((x) => x.id === id);
    if (!f) return;
    setGeneratingImg(id);
    try {
      const prompt = f.imagePrompt || `cinematic storyboard sketch, ${f.shotSize} shot, ${f.description}, ${f.lighting}, ${f.mood} mood, black and white with accent color, storyboard pro style, --ar 16:9`;
      const res = await fetch("/api/director/generate-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, width: 640, height: 360, seed: f.number * 97 + Date.now() % 1000 }),
      });
      if (!res.ok) throw new Error("generator error");
      const data = await res.json();
      if (data.imageUrl) updateFrame(id, { imageDataUrl: data.imageUrl });
      // If the remote generator is unavailable the SVG sketch is already there —
      // no need to surface technical details to the user.
    } catch {
      // Silently keep the local SVG sketch.
    } finally {
      setGeneratingImg(null);
    }
  };

  return (
    <StageShell
      icon="🖼"
      title="Storyboard — Раскадровка"
      subtitle="Для каждого кадра: описание, композиция, движение камеры, положение объектов, свет, цвет, крупность плана, настроение. Локальные SVG-эскизы генерируются бесплатно и мгновенно; опционально — бесплатная генерация через Pollinations.ai."
      onRegenerate={() => onRegenerate("storyboard")}
      busy={busy}
      actions={
        <div className="flex gap-2">
          <button onClick={refreshAllSketches} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 transition hover:bg-white/[0.08]">
            ↺ Перерисовать эскизы
          </button>
          <button onClick={addFrame} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 transition hover:bg-white/[0.08]">
            + Кадр
          </button>
        </div>
      }
    >
      <div className="mb-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <SectionTitle>Стиль раскадровки</SectionTitle>
          <input value={sb.style} onChange={(e) => set({ style: e.target.value })}
            className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400/50" />
        </div>
        <div>
          <SectionTitle>Соотношение</SectionTitle>
          <select value={sb.aspectRatio} onChange={(e) => set({ aspectRatio: e.target.value })}
            className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400/50">
            <option value="16:9" className="bg-[#0c0c16]">16:9 (горизонталь)</option>
            <option value="9:16" className="bg-[#0c0c16]">9:16 (вертикаль)</option>
            <option value="1:1" className="bg-[#0c0c16]">1:1 (квадрат)</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {sb.frames.map((f) => (
          <div key={f.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-200">КАДР {f.number}</span>
              <select
                value={f.shotSize}
                onChange={(e) => updateFrame(f.id, { shotSize: e.target.value })}
                className="rounded bg-black/40 px-2 py-1 text-[11px] text-slate-200 outline-none"
              >
                {SHOT_SIZES.map((s) => <option key={s} value={s} className="bg-[#0c0c16]">{s}</option>)}
              </select>
              <input
                value={f.mood}
                onChange={(e) => updateFrame(f.id, { mood: e.target.value })}
                placeholder="настроение"
                className="flex-1 rounded bg-black/30 px-2 py-1 text-[12px] text-slate-200 outline-none"
              />
              <button
                onClick={() => removeFrame(f.id)}
                className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-200 hover:bg-rose-500/20"
              >✕</button>
            </div>

            <div className="grid gap-4 md:grid-cols-[320px_1fr]">
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
                  {f.imageDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.imageDataUrl}
                      alt={`Frame ${f.number}`}
                      className={`w-full ${sb.aspectRatio === "9:16" ? "aspect-[9/16]" : sb.aspectRatio === "1:1" ? "aspect-square" : "aspect-video"} object-cover`}
                    />
                  ) : (
                    <div className={`flex ${sb.aspectRatio === "9:16" ? "aspect-[9/16]" : sb.aspectRatio === "1:1" ? "aspect-square" : "aspect-video"} items-center justify-center text-[11px] text-slate-500`}>
                      Нет эскиза
                    </div>
                  )}
                  <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Frame {String(f.number).padStart(2, "0")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => refreshSketch(f.id)}
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-white/[0.08]"
                    title="Перегенерировать локальный SVG-эскиз"
                  >↻ Локальный эскиз</button>
                  <button
                    onClick={() => tryPollinations(f.id)}
                    disabled={generatingImg === f.id}
                    className="flex-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                    title="Попробовать бесплатную нейросетевую генерацию (Pollinations)"
                  >{generatingImg === f.id ? "…" : "✨ AI-кадр"}</button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Описание кадра">
                  <textarea value={f.description} onChange={(e) => updateFrame(f.id, { description: e.target.value })} rows={2} className={taCls} />
                </Field>
                <Field label="Композиция">
                  <textarea value={f.composition} onChange={(e) => updateFrame(f.id, { composition: e.target.value })} rows={2} className={taCls} />
                </Field>
                <Field label="Движение камеры">
                  <input value={f.cameraMovement} onChange={(e) => updateFrame(f.id, { cameraMovement: e.target.value })} className={inpCls} />
                </Field>
                <Field label="Положение объектов">
                  <input value={f.objectPlacement} onChange={(e) => updateFrame(f.id, { objectPlacement: e.target.value })} className={inpCls} />
                </Field>
                <Field label="Свет">
                  <input value={f.lighting} onChange={(e) => updateFrame(f.id, { lighting: e.target.value })} className={inpCls} />
                </Field>
                <Field label="Цвет">
                  <input value={f.color} onChange={(e) => updateFrame(f.id, { color: e.target.value })} className={inpCls} />
                </Field>
                <Field label="Промпт для AI-кадра (англ.)" className="md:col-span-2">
                  <input value={f.imagePrompt || ""} onChange={(e) => updateFrame(f.id, { imagePrompt: e.target.value })} className={inpCls} placeholder="cinematic storyboard sketch..." />
                </Field>
              </div>
            </div>
          </div>
        ))}
      </div>
    </StageShell>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      {children}
    </label>
  );
}

const taCls = "w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50";
const inpCls = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-violet-400/50";
