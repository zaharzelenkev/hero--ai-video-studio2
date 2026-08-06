"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * AI Director — Sequential 12-point generator.
 * Each point is generated independently via the AI backend when the user presses
 * "Next". No fluff. Only what's needed to make a short film or video.
 */

const STAGES = [
  { id: "idea", label: "Замысел", icon: "lightbulb", prompt: "О чём ролик и что в нём происходит? Кратко, по делу." },
  { id: "goal", label: "Цель", icon: "target", prompt: "Что зритель должен сделать или почувствовать после просмотра?" },
  { id: "audience", label: "Аудитория", icon: "casting", prompt: "Кто смотрит: возраст, интересы, платформа?" },
  { id: "format", label: "Формат", icon: "monitor", prompt: "Где публикуем (TikTok, Reels, YouTube, презентация)? Длина в секундах?" },
  { id: "location", label: "Локация", icon: "map-pin", prompt: "Где происходит действие? Какие условия света и звука?" },
  { id: "mood", label: "Настроение", icon: "sparkles", prompt: "Какая эмоция и темп? Быстрый/медленный, тёплый/холодный?" },
  { id: "materials", label: "Материалы", icon: "film", prompt: "Что уже снято или есть? Видео, фото, музыка, голос?" },
  { id: "hook", label: "Хук", icon: "zap", prompt: "Первая секунда — что останавливает скролл? Конкретная фраза или кадр." },
  { id: "script", label: "Сценарий", icon: "script", prompt: "Краткая структура по сценам (начало, развитие, финал). Без воды." },
  { id: "visual", label: "Визуал", icon: "vision", prompt: "Как выглядит: крупные планы или общие, движение камеры, стиль кадров?" },
  { id: "sound", label: "Звук", icon: "music", prompt: "Музыка, голос, звуковые эффекты — что нужно?" },
  { id: "plan", label: "План", icon: "clipboard", prompt: "Кто что делает и когда: съёмка, монтаж, правки, экспорт?" },
];

interface PointResult {
  stageId: string;
  text: string;
  timestamp: number;
}

export default function DirectorWizard({ onDraftMontage }: { onDraftMontage?: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<PointResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [completed, setCompleted] = useState(false);

  const stage = STAGES[currentIndex];

  const generatePoint = useCallback(async () => {
    setLoading(true);
    try {
      // Build context from previous results
      const context = results.map((r) => `${STAGES.find(s => s.id === r.stageId)?.label}: ${r.text}`).join("\n");
      const body = JSON.stringify({
        stage: stage.id,
        prompt: stage.prompt,
        userInput: input.trim() || stage.prompt,
        context: context,
      });
      const res = await fetch("/api/director/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      const text = data.text || data.result || "(нет ответа — проверьте API-ключ в .env.local)";
      setResults((prev) => [...prev, { stageId: stage.id, text, timestamp: Date.now() }]);
      setInput("");
      if (currentIndex < STAGES.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setCompleted(true);
      }
    } catch {
      setResults((prev) => [...prev, { stageId: stage.id, text: "(ошибка запроса — повторите)", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [stage, input, results, currentIndex]);

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setResults((prev) => prev.slice(0, -1));
      setCompleted(false);
    }
  };

  /** Клик по пройденному этапу — мгновенный переход (не 5 кликов «Назад»). */
  const jumpTo = (index: number) => {
    if (index >= currentIndex || loading) return;
    setCurrentIndex(index);
    setResults((prev) => prev.slice(0, index));
    setInput("");
    setCompleted(false);
  };

  const restart = () => {
    setCurrentIndex(0);
    setResults([]);
    setInput("");
    setCompleted(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-gradient mb-2">AI Director</h1>
        <p className="text-sm text-slate-400">12 практических пунктов для создания короткометражки или видео. Ничего лишнего.</p>
        <div className="mt-4 flex gap-2 flex-wrap">
          {STAGES.map((s, i) => {
            const done = i < currentIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpTo(i)}
                disabled={!done}
                title={done ? "Перейти к этому этапу" : "Сначала пройдите предыдущие этапы"}
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                  done
                    ? "cursor-pointer bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/35"
                    : i === currentIndex
                      ? "bg-violet-500/20 text-violet-100 border border-violet-400/40 ring-1 ring-violet-300/20"
                      : "bg-white/[0.04] text-slate-500 border border-white/10"
                }`}
              >
                {i + 1}. {s.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="space-y-6">
        {!completed && (
          <section className="rounded-[20px] border border-white/[0.07] bg-[#0c0c16]/70 p-6 shadow-xl backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-800 shadow-lg shadow-violet-500/20">
                <Icon name={stage.icon as any} size={20} strokeWidth={1.8} className="text-white" />
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-slate-100">{stage.label}</h2>
                <span className="text-[10px] font-semibold text-violet-300/80 uppercase tracking-widest">Пункт {currentIndex + 1} из 12</span>
              </div>
            </div>

            <p className="text-sm text-slate-300 mb-4 leading-relaxed">{stage.prompt}</p>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"Опишите кратко этот пункт..."}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-100 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/20 transition resize-none"
            />

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={goBack}
                disabled={currentIndex === 0}
                className="text-[11px] font-bold text-slate-400 hover:text-slate-200 disabled:opacity-30 transition"
              >
                ← Назад
              </button>
              <button
                onClick={generatePoint}
                disabled={loading}
                className="btn btn-primary px-6 py-2.5 text-sm font-bold rounded-full shadow-lg shadow-violet-500/20 transition hover:shadow-violet-500/40 disabled:opacity-40"
              >
                {loading ? "Генерируем..." : "Запустить AI Director →"}
              </button>
            </div>
          </section>
        )}

        <section className="space-y-4">
          {results.map((r, idx) => {
            const s = STAGES.find((st) => st.id === r.stageId);
            return (
              <article key={r.stageId + idx} className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#11111a] to-[#0a0a14] p-5 shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name={s?.icon as any} size={14} className="text-violet-300" />
                  <h3 className="text-sm font-extrabold text-slate-100">{s?.label}</h3>
                  <span className="ml-auto text-[10px] text-slate-600">{new Date(r.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{r.text}</p>
              </article>
            );
          })}
        </section>

        {results.length === 12 && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/30 p-6 text-center">
            <h3 className="text-xl font-extrabold text-emerald-200 mb-2">Все 12 пунктов готовы</h3>
            <p className="text-sm text-emerald-100/80 mb-4">AI Director завершил работу. Теперь можно перейти к автомонтажу, где весь исходный материал будет использован для создания чернового ролика.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => onDraftMontage?.()} className="btn btn-ghost px-5 py-2 text-sm font-bold rounded-full border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/10 transition">
                Перейти к черновому монтажу
              </button>
              <button onClick={restart} className="btn btn-ghost px-5 py-2 text-sm font-bold rounded-full border border-white/10 text-slate-300 hover:bg-white/5 transition">
                Пройти заново
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
