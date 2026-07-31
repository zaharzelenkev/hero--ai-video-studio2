"use client";

import { useState, useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DirectorWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const loadProject = useProjectStore((s) => s.loadProject);
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<{ result?: string; sections?: any } | null>(null);
  const [sending, setSending] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; text: string }>>([]);

  useEffect(() => {
    if (project && project.id === projectId) return;
    (async () => {
      try {
        const { loadProject: lp } = await import("@/lib/db");
        const p = await lp(projectId);
        if (p) loadProject(p);
      } catch {}
    })();
  }, [projectId, loadProject, project]);

  const generate = async () => {
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, projectTitle: project?.title || "Проект" }),
      });
      const data = await res.json();
      if (data.error) setResult({ result: "Ошибка: " + data.error });
      else setResult(data);
    } catch (e: any) {
      setResult({ result: "Ошибка сети: " + (e.message || "") });
    }
    setSending(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatHistory((h) => [...h, { role: "user", text: msg }]);
    try {
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: msg, projectTitle: project?.title || "Проект" }),
      });
      const data = await res.json();
      setChatHistory((h) => [...h, { role: "director", text: data.result || "Отвечаю..." }]);
    } catch {
      setChatHistory((h) => [...h, { role: "director", text: "Ошибка связи с AI Director." }]);
    }
  };

  const sections = result?.sections || {};

  const Card = ({ title, content, accent }: { title: string; content: string; accent: string }) => (
    <div className={`rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.03] border border-white/[0.08] p-6 shadow-2xl mb-5`}>
      <h3 className={`text-base font-extrabold mb-3 tracking-tight bg-gradient-to-r ${accent} bg-clip-text text-transparent`}>{title}</h3>
      <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{content}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#06060f] via-[#080810] to-[#0a0a14] text-slate-100 selection:bg-violet-500/30">
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-violet-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-900/20 blur-[100px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-lg bg-[#0a0a12]/70">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-amber-400 text-xl shadow-2xl shadow-violet-500/30 group-hover:scale-105 transition">M</div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-violet-200 via-fuchsia-200 to-amber-200 bg-clip-text text-transparent">MONTIQ</h1>
            <div className="text-[10px] text-slate-400 tracking-[0.2em] uppercase">AI Director Studio</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-violet-200 bg-violet-900/30 border border-violet-400/20 rounded-full px-3 py-1">{project?.title || "Проект"}</span>
          <button onClick={() => router.push(`/editor/${projectId}`)} className="rounded-full bg-gradient-to-r from-amber-500 to-orange-400 px-5 py-2.5 text-xs font-extrabold text-black shadow-xl hover:brightness-110 transition">Перейти в редактор →</button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12 grid lg:grid-cols-12 gap-8">
        <section className="lg:col-span-5 space-y-6">
          <div className="rounded-[2rem] bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-2xl border border-white/[0.08] p-7 shadow-2xl shadow-violet-900/10">
            <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-amber-200 to-violet-200 mb-1">AI Director</h2>
            <p className="text-xs text-slate-400 mb-6">Опишите проект — получите полный Production Plan с концепцией, сценарием и рекомендациями.</p>
            <input className="w-full rounded-xl bg-[#0a0a12]/60 border border-white/10 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30 transition placeholder:text-slate-600 mb-3" placeholder="Идея проекта..." value={brief} onChange={(e) => setBrief(e.target.value)} aria-label="Бриф" />
            <button onClick={generate} disabled={sending || !brief.trim()} className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 text-base font-extrabold text-white shadow-2xl shadow-violet-500/30 hover:brightness-110 transition disabled:opacity-40">{sending ? "AI Director работает..." : "Создать Production Plan →"}</button>
          </div>

          <div className="rounded-[2rem] bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-xl border border-white/[0.08] p-6 shadow-2xl shadow-violet-900/10">
            <h3 className="text-lg font-bold text-amber-200 mb-3 flex items-center gap-2">💬 Режиссёр в чате</h3>
            <div className="h-72 overflow-y-auto space-y-3 mb-3 pr-2">
              {chatHistory.map((c, i) => (
                <div key={i} className={`rounded-2xl px-3 py-3 text-xs leading-relaxed ${c.role === "user" ? "bg-violet-900/30 border border-violet-400/20 text-slate-100" : "bg-amber-900/20 border border-amber-400/20 text-slate-200"}`}>
                  <div className="font-bold text-[9px] uppercase tracking-wide text-violet-300 mb-1">{c.role === "user" ? "Вы" : "AI Director"}</div>
                  <div className="whitespace-pre-wrap">{c.text}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Например: Сделай эмоциональнее..." className="flex-1 rounded-xl bg-[#0a0a12]/60 border border-white/10 px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-violet-400 transition placeholder:text-slate-500" aria-label="Чат" />
              <button onClick={sendChat} className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:brightness-110">Отправить</button>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 space-y-6">
          {result && (
            <div className="rounded-[2.5rem] bg-gradient-to-br from-violet-950/50 via-[#0a0a12]/80 to-amber-950/30 border border-white/10 backdrop-blur-3xl shadow-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-amber-200 to-violet-200">Production Plan</h2>
                <button onClick={() => router.push(`/editor/${projectId}`)} className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-5 py-2.5 text-xs font-extrabold text-black shadow-xl hover:brightness-110">Перейти в редактор →</button>
              </div>
              {sections.logline && <Card title="📝 Логлайн" content={sections.logline} accent="from-violet-400" />}
              {sections.concept && <Card title="🎬 Режиссёрская концепция" content={sections.concept} accent="from-amber-400" />}
              {sections.script && <Card title="📜 Сценарий / Структура" content={sections.script} accent="from-violet-300" />}
              {sections.structure && <Card title="⏱ Структура ролика" content={sections.structure} accent="from-fuchsia-400" />}
              {sections.drama && <Card title="🎭 Драматургия" content={sections.drama} accent="from-rose-300" />}
              <div className="grid md:grid-cols-2 gap-4">
                {sections.storyboard && <Card title="🖼 Storyboard" content={sections.storyboard} accent="from-sky-300" />}
                {sections.shotlist && <Card title="📋 Shot List" content={sections.shotlist} accent="from-emerald-300" />}
              </div>
              {sections.recs && <Card title="📹 Рекомендации" content={sections.recs} accent="from-amber-200" />}
              {!sections.logline && result.result && <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{result.result}</div>}
            </div>
          )}
          {!result && (
            <div className="flex flex-col items-center justify-center h-[60vh] rounded-[2.5rem] bg-gradient-to-b from-white/[0.03] to-transparent border border-white/10 backdrop-blur-xl shadow-2xl text-center px-8">
              <div className="text-8xl mb-6 opacity-50">🎥</div>
              <h2 className="text-3xl font-extrabold text-violet-200 mb-2">AI Director ждет вашего брифа</h2>
              <p className="text-slate-400 text-sm max-w-md">Опишите идею слева — и получите полный Production Plan с концепцией, сценарием, раскадровкой, рекомендациями и структурой монтажа.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 bg-[#06060f]/80 backdrop-blur py-4 px-8 text-[10px] text-slate-500 flex items-center justify-between">
        <span>MONTIQ AI Production Studio · AI Director</span>
        <span>Project: {projectId}</span>
      </footer>
    </div>
  );
}
