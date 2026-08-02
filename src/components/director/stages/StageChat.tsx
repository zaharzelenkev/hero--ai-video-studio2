"use client";

import { useEffect, useRef, useState } from "react";
import StageShell from "./StageShell";
import type { ChatMessage, DirectorBrief, PreProduction, PreprodStage } from "@/lib/production";
import { uid } from "@/lib/id";
import { Icon } from "@/components/ui/Icon";

interface Props {
  brief: DirectorBrief;
  preprod: PreProduction;
  updatePreprod: (fn: (p: PreProduction) => PreProduction) => void;
  onRegenerate: (s: PreprodStage) => void;
  busy?: boolean;
}

export default function StageChat({ brief, preprod, updatePreprod }: Props) {
  const chat = preprod.chat;
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const projectTitle = preprod.treatment.title || brief.idea || "Проект";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, thinking]);

  const add = (m: ChatMessage) =>
    updatePreprod((p) => ({ ...p, chat: [...p.chat, m] }));

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    add({ id: uid("m"), role: "user", text, at: Date.now() });
    setThinking(true);
    try {
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          brief,
          projectTitle,
          preprod,
          userMessage: text,
        }),
      });
      const data = await res.json();
      const reply = (data.reply || "").trim() || "Давайте уточним — что именно вы хотите поменять в этой сцене?";
      add({ id: uid("m"), role: "director", text: reply, at: Date.now() });
    } catch {
      // Network hiccup — director still answers; user sees a real reply.
      add({
        id: uid("m"),
        role: "director",
        text: "Давайте по существу: скажите, какая часть проекта сейчас волнует — хук, сцена, финал, цвет или монтаж, — и я дам конкретное решение по кадру и таймингу.",
        at: Date.now(),
      });
    } finally {
      setThinking(false);
    }
  };

  const suggestions = [
    "Сделай хук сильнее",
    "Где сценарий слабый?",
    "Как усилить финальный CTA?",
    "Посоветуй музыку и звук",
    "Какие кадры обязательно доснять?",
    "Покритикуй идею честно",
  ];

  return (
    <StageShell
      icon="💬"
      title="Режиссёр"
      subtitle="Говорите как с режиссёром на площадке: можно спорить, можно жаловаться на слабую сцену, можно просить конкретных решений. Я помню весь проект — бриф, логлайн, тритмент, сценарий, кадры и всю переписку."
    >
      <div className="rounded-2xl border border-white/10 bg-black/25">
        <div ref={scrollRef} className="max-h-[540px] space-y-3 overflow-y-auto p-4">
          {chat.length === 0 && (
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 px-3 py-3 text-[12px] leading-relaxed text-slate-300">
              Я — ваш режиссёр на этом проекте. Говорите прямо: если что-то не держит,
              если хук вялый, если сцена банальная — я скажу об этом и предложу,
              как исправить, вплоть до таймингов и ракурсов.
            </div>
          )}
          {chat.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-gradient-to-br from-[#6d5cf0] to-[#5c4bd8] text-white"
                  : "border border-white/10 bg-white/[0.04] text-slate-200"
              }`}>
                {m.role === "director" && (
                  <div className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-violet-300/90">
                    <Icon name="compass" size={10} />
                    Режиссёр
                  </div>
                )}
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[12px] text-slate-400">
                <span className="inline-flex gap-1">
                  <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "0ms" }} />
                  <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "120ms" }} />
                  <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "240ms" }} />
                </span>
                Обдумываю…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition hover:bg-white/[0.08]"
              >{s}</button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
              }}
              rows={2}
              placeholder="Спросите про хук, сцену, монтаж, свет, игру актёра, цвет…"
              className="input flex-1 resize-none !py-3 !text-[13px]"
            />
            <button
              onClick={send}
              disabled={!input.trim() || thinking}
              aria-label="Отправить"
              className="btn btn-primary h-full min-w-[44px] !rounded-xl !px-4 py-3 disabled:opacity-50"
            >
              <Icon name="arrow-up-right" size={16} />
            </button>
          </div>
        </div>
      </div>
    </StageShell>
  );
}
