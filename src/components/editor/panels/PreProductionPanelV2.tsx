"use client";

import { useState, type ReactNode } from "react";
import { useProjectStore } from "@/store/projectStore";

function ImageCard({ prompt, label }: { prompt: string; label: string }) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&width=512&height=288&seed=42`;
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0a0a12] shadow-lg shadow-violet-900/10">
      <img
        src={url}
        alt={label}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-36 object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      <div className="p-2 text-[10px] text-slate-300 font-medium">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-gradient-to-b from-[#0d0d16] to-[#0a0a12] border border-white/10 p-3 shadow-inner mb-3">
      <h3 className="text-xs font-bold text-violet-300 mb-2 flex items-center gap-2">{title}</h3>
      {children}
    </section>
  );
}

export default function PreProductionPanelV2() {
  const project = useProjectStore((s) => s.project);
  const [idea, setIdea] = useState("");
  const [logline, setLogline] = useState("");
  const [script, setScript] = useState("");
  const [storyboardText, setStoryboardText] = useState("");
  const [shotlistText, setShotlistText] = useState("");
  const [recs, setRecs] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  const callAI = async (task: string, setter: (v: string) => void) => {
    setLoading(task);
    try {
      const res = await fetch("/api/preproduction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          prompt: idea || project?.title || "",
          projectTitle: project?.title || "Новый проект",
        }),
      });
      const data = await res.json();
      if (data.error) setter("Ошибка AI: " + data.error);
      else setter(data.result || "Нет ответа");
    } catch (e: any) {
      setter("Ошибка сети: " + e.message);
    }
    setLoading(null);
  };

  const storyFrames = [
    { label: "Кадр 1 — Вводная", prompt: "Cinematic wide establishing shot of a modern city at golden hour, film grain, calm mood" },
    { label: "Кадр 2 — Герой", prompt: "Medium close-up portrait of a creative young person, soft natural window light, shallow depth of field" },
    { label: "Кадр 3 — Действие", prompt: "Dynamic low angle tracking shot of hands working on a camera or laptop, warm amber lighting" },
    { label: "Кадр 4 — Эмоция", prompt: "Close-up emotional moment, tears or smile, cinematic color grading teal orange, soft bokeh" },
    { label: "Кадр 5 — Перелом", prompt: "Dramatic silhouette against bright sky, wide angle, high contrast, calm tension" },
    { label: "Кадр 6 — Финал", prompt: "Peaceful aerial drone shot settling over a calm landscape at sunset, film look, calm" },
  ];

  if (!project) return <div className="text-sm text-slate-400">Проект не загружен.</div>;

  return (
    <div className="space-y-3">
      <Section title="🎯 Генерация идеи (AI)">
        <div className="flex gap-2 mb-2">
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Опишите вашу концепцию или тему..."
            className="flex-1 rounded-lg bg-[#0a0a12] border border-white/10 text-xs p-2 resize-none h-16 text-slate-100 focus:border-violet-400 focus:outline-none"
            aria-label="Идея"
          />
          <button
            onClick={() => callAI("idea", setIdea)}
            disabled={loading === "idea"}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 transition disabled:opacity-50"
            aria-label="Сгенерировать идею"
          >
            {loading === "idea" ? "..." : "Генерировать"}
          </button>
        </div>
        {idea && <div className="rounded-lg bg-[#08060c] border border-white/5 p-2 text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap">{idea}</div>}
      </Section>

      <Section title="📄 Логлайн (AI)">
        <button
          onClick={() => callAI("logline", setLogline)}
          disabled={loading === "logline"}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 mb-2"
          aria-label="Сгенерировать логлайн"
        >
          {loading === "logline" ? "Генерация..." : "Создать логлайн из идеи"}
        </button>
        {logline && <div className="rounded-lg bg-[#08060c] border border-white/5 p-2 text-xs text-violet-200 font-medium whitespace-pre-wrap">{logline}</div>}
      </Section>

      <Section title="🎬 Сценарий (AI)">
        <button
          onClick={() => callAI("script", setScript)}
          disabled={loading === "script"}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 mb-2"
          aria-label="Сгенерировать сценарий"
        >
          {loading === "script" ? "Генерация..." : "Написать сценарий"}
        </button>
        {script && <div className="rounded-lg bg-[#08060c] border border-white/5 p-2 text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">{script}</div>}
      </Section>

      <Section title="🖼 Раскадровка / Storyboard (AI + изображения)">
        <p className="text-[10px] text-slate-400 mb-2">AI генерирует описания + изображения через Pollinations.</p>
        <button
          onClick={() => callAI("storyboard", setStoryboardText)}
          disabled={loading === "storyboard"}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 mb-2"
          aria-label="Сгенерировать раскадровку"
        >
          {loading === "storyboard" ? "Генерация..." : "Генерировать раскадровку"}
        </button>
        {storyboardText && <div className="rounded-lg bg-[#08060c] border border-white/5 p-2 text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap mb-2">{storyboardText}</div>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {storyFrames.map((f) => (
            <ImageCard key={f.label} label={f.label} prompt={f.prompt} />
          ))}
        </div>
      </Section>

      <Section title="📋 Shot List / Список кадров (AI)">
        <button
          onClick={() => callAI("shotlist", setShotlistText)}
          disabled={loading === "shotlist"}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 mb-2"
          aria-label="Сгенерировать список кадров"
        >
          {loading === "shotlist" ? "Генерация..." : "Создать список кадров"}
        </button>
        {shotlistText && <div className="rounded-lg bg-[#08060c] border border-white/5 p-2 text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">{shotlistText}</div>}
      </Section>

      <Section title="🎥 Рекомендации по съёмке (AI)">
        <button
          onClick={() => callAI("recommendations", setRecs)}
          disabled={loading === "recommendations"}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 transition disabled:opacity-50 mb-2"
          aria-label="Получить рекомендации"
        >
          {loading === "recommendations" ? "Генерация..." : "Получить полный план препродакшн"}
        </button>
        {recs && (
          <div className="rounded-lg bg-[#08060c] border border-white/5 p-2 text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
            {recs}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] text-slate-300">
          <div className="rounded-lg bg-white/5 border border-white/10 p-2"><b>Освещение:</b> ключевой / заполняющий / контровой</div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2"><b>Объективы:</b> 24мм, 50мм, 85мм, macro</div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2"><b>Камера:</b> стабилизация / трэвелл / дрон</div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2"><b>B-Roll:</b> детали, окружение, атмосфера</div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2"><b>Музыка:</b> жанр, темп, настроение, ключ</div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-2"><b>Монтаж:</b> темп, переходы, цвет, ритм</div>
        </div>
      </Section>
    </div>
  );
}
