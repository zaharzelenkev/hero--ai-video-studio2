"use client";

import { useEffect, useRef, useState } from "react";
import StageShell from "./StageShell";
import type { ChatMessage, DirectorBrief, PreProduction, PreprodStage } from "@/lib/production";
import { uid } from "@/lib/id";

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

  const add = (m: ChatMessage) => updatePreprod((p) => ({ ...p, chat: [...p.chat, m] }));

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
      const reply = data.reply || "Режиссёр пока не смог ответить.";
      add({ id: uid("m"), role: "director", text: reply, at: Date.now() });
    } catch {
      add({
        id: uid("m"),
        role: "director",
        text: "Сейчас я в офлайне. Но по-человечески — попробуй сформулировать конкретнее: что именно тебя тревожит в сценарии, в кадре или в подаче? Я подскажу без нейросети.",
        at: Date.now(),
      });
    } finally {
      setThinking(false);
    }
  };

  const suggestions = [
    "Укрепи хук — первые 3 секунды",
    "Где сценарий слабый?",
    "Как улучшить финальный CTA?",
    "Посоветуй музыку",
    "Как сыграет финал без диалогов?",
    "Какие кадры обязательно доснять?",
  ];

  return (
    <StageShell
      icon="💬"
      title="AI Director Chat — Режиссёр"
      subtitle="Полноценный разговор с режиссёром: он спорит, критикует, предлагает лучшие решения, советует по драматургии и монтажу ещё до съёмки."
    >
      <div className="rounded-2xl border border-white/10 bg-black/30">
        <div ref={scrollRef} className="max-h-[520px] space-y-3 overflow-y-auto p-4">
          {chat.length === 0 && (
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-3 text-[12px] leading-relaxed text-slate-300">
              Я — ваш режиссёр. Не стесняйтесь спорить со мной и не ждите вежливых общих фраз.
              Я буду говорить, что думаю про идею, сценарий, кастинг и монтаж — и предлагать конкретные решения.
              Начните с вопроса или выберите подсказку ниже.
            </div>
          )}
          {chat.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-lg ${
                m.role === "user"
                  ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white"
                  : "border border-white/10 bg-white/[0.04] text-slate-200"
              }`}>
                {m.role === "director" && (
                  <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                    🎬 AI Director
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
                  <i className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "0ms" }} />
                  <i className="h-2 w-2 animate-bounce rounded-full bg-fuchsia-400" style={{ animationDelay: "120ms" }} />
                  <i className="h-2 w-2 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: "240ms" }} />
                </span>
                Режиссёр думает…
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
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/[0.08]"
              >{s}</button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={2}
              placeholder="Спросите режиссёра: идея, сцена, монтаж, игра актёра, свет…"
              className="flex-1 resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-[13px] text-slate-100 outline-none focus:border-violet-400/50"
            />
            <button
              onClick={send}
              disabled={!input.trim() || thinking}
              className="h-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </StageShell>
  );
}
