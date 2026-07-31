"use client";

import { useState, useRef, useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import { uid } from "@/lib/id";

export default function AIDirector() {
  const project = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; actions?: string[] }>>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setSending(true);
    try {
      const res = await fetch("/api/preproduction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "director",
          prompt: userMsg,
          projectTitle: project?.title || "Проект",
        }),
      });
      const data = await res.json();
      const text = data.result || "Ответ получен.";
      const actions: string[] = [];
      if (text.toLowerCase().includes("split")) actions.push("Разделить клип");
      if (text.toLowerCase().includes("speed") || text.toLowerCase().includes("быстрее")) actions.push("Изменить скорость");
      if (text.toLowerCase().includes("text") || text.toLowerCase().includes("текст")) actions.push("Добавить текст");
      if (text.toLowerCase().includes("b-roll") || text.toLowerCase().includes("broll")) actions.push("Добавить B-Roll");
      setMessages((prev) => [...prev, { role: "assistant", content: text, actions }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Ошибка AI Director: " + (e.message || "") }]);
    }
    setSending(false);
  };

  const applyAction = (action: string) => {
    if (!project) return;
    if (action === "Добавить текст") {
      const track = project.tracks.find((t) => t.type === "text") || project.tracks[0];
      if (track) {
        const clipId = uid("clip");
        updateProject((p) => {
          const tracks = p.tracks.map((t) => {
            if (t.id === track.id) {
              return {
                ...t,
                clips: [
                  ...t.clips,
                  {
                    id: clipId,
                    trackId: t.id,
                    type: "text" as const,
                    name: "AI Текст",
                    start: p.duration / 2 || 1,
                    duration: 3,
                    text: "Новый титр",
                    fontFamily: "Inter",
                    fontSize: 48,
                    color: "#ffffff",
                    backgroundColor: "#00000000",
                    align: "center" as const,
                    animationIn: "fade" as const,
                    animationOut: "fade" as const,
                    x: { value: 0, keyframes: [] },
                    y: { value: 0, keyframes: [] },
                    scale: { value: 1, keyframes: [] },
                    opacity: { value: 1, keyframes: [] },
                    selected: false,
                  } as any,
                ],
              };
            }
            return t;
          });
          return { ...p, tracks };
        });
        alert("Текстовый клип добавлен на таймлайн.");
      }
    } else if (action === "Разделить клип") {
      const firstVideoTrack = project.tracks.find((t) => t.type === "video");
      if (firstVideoTrack && firstVideoTrack.clips.length > 0) {
        const clip = firstVideoTrack.clips[0];
        const playhead = useProjectStore.getState().playhead;
        useProjectStore.getState().splitClipAt(clip.id, playhead);
        alert("Клип разделён в точке playhead.");
      }
    } else if (action === "Изменить скорость") {
      alert("Скорость изменена (демо): выберите клип и настройте в панели Эффекты → Скорость.");
    } else if (action === "Добавить B-Roll") {
      alert("B-Roll можно добавить через Монтаж → Дублировать или импортировать медиа.");
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#0d0d16] to-[#0a0a12] border border-violet-400/20 rounded-xl shadow-2xl shadow-violet-900/20 overflow-hidden">
      <div className="px-3 py-2 bg-gradient-to-r from-violet-900/50 to-fuchsia-900/50 border-b border-violet-400/20 flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <h3 className="text-xs font-bold text-violet-300">AI Director</h3>
        <span className="text-[9px] text-slate-400 ml-auto">Режиссёр-ассистент</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="text-[10px] text-slate-500 leading-relaxed">
            Напиши режиссёру, что нужно:
            <br />• «Сделай ролик эмоциональнее»
            <br />• «Первые 5 секунд скучные»
            <br />• «Добавь больше B-Roll»
            <br />• «Сделай как Apple»
            <br />• «Убери лишние титры»
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`rounded-lg px-2 py-2 text-[11px] leading-snug ${m.role === "user" ? "bg-violet-900/30 border border-violet-400/20 text-slate-100 ml-4" : "bg-white/5 border border-white/10 text-slate-200 mr-4"}`}>
            <div className="font-bold text-[9px] uppercase tracking-wide mb-0.5 text-violet-300">{m.role === "user" ? "Вы" : "AI Director"}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.actions && m.actions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {m.actions.map((a) => (
                  <button key={a} onClick={() => applyAction(a)} className="rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-2 py-0.5 text-[10px] font-bold text-white shadow hover:brightness-110 transition" aria-label={a}>{a}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && <div className="text-[10px] text-violet-300 animate-pulse">AI анализирует проект...</div>}
      </div>

      <div className="p-2 border-t border-violet-400/20 flex gap-2 bg-[#0d0d16]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Напиши режиссёру..."
          className="flex-1 rounded-lg bg-[#0a0a12] border border-violet-400/30 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-violet-400 transition"
          aria-label="Сообщение AI Director"
        />
        <button onClick={send} disabled={sending || !input.trim()} className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg hover:brightness-110 transition disabled:opacity-30" aria-label="Отправить">➤</button>
      </div>
    </div>
  );
}
