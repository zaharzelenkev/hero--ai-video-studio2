"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadProject } from "@/lib/db";
import { useProjectStore } from "@/store/projectStore";

export default function ProjectPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const loadProjectStore = useProjectStore((s) => s.loadProject);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const p = await loadProject(id);
      if (mounted) {
        setProject(p || null);
        if (p) loadProjectStore(p);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, loadProjectStore]);

  if (loading) return <div className="flex h-screen items-center justify-center bg-[#0a0a12] text-slate-300">Загрузка проекта...</div>;
  if (!project) return (
    <div className="flex h-screen items-center justify-center bg-[#0a0a12] text-slate-200">
      <div className="text-center">
        <div className="text-4xl mb-2">🎬</div>
        <h2 className="text-xl font-bold mb-2">Проект не найден</h2>
        <button onClick={() => router.push("/")} className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white shadow-lg">На главную</button>
      </div>
    </div>
  );

  const stages = [
    { label: "Идея", desc: "Концепция и эмоциональный посыл", done: !!project.style?.rawPrompt },
    { label: "Логлайн", desc: "Одно предложение — суть ролика", done: false },
    { label: "Сценарий", desc: "Сцены, диалоги, визуал", done: false },
    { label: "Раскадровка", desc: "Кадры, движения камеры, свет", done: false },
    { label: "Материалы", desc: "Видео, фото, сэмплы, музыка", done: !!project.assets?.length },
    { label: "Монтаж", desc: "Таймлайн, клипы, переходы", done: !!project.tracks?.some((t: any) => t.clips?.length > 0) },
    { label: "Редактор", desc: "Цвет, эффекты, текст, звук", done: false },
    { label: "Экспорт", desc: "Финальный файл MP4 / MOV", done: false },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a12] to-[#0d0d16] text-slate-100">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#0d0d16]/90 backdrop-blur px-6 py-4 shadow-lg">
        <button onClick={() => router.push("/")} className="rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10">← Назад</button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">AI Production Studio</h1>
        <span className="ml-auto text-xs text-violet-300 font-medium">{project.title}</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Stages */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-lg font-bold text-violet-300 mb-3">Этапы производства</h2>
            {stages.map((s, i) => (
              <a
                key={s.label}
                href={s.label === "Редактор" ? `/editor/${id}` : s.label === "Монтаж" ? `/editor/${id}` : undefined}
                onClick={(e) => { if (!s.done && s.label !== "Редактор" && s.label !== "Монтаж") { e.preventDefault(); alert("Этот этап доступен после завершения предыдущих."); } }}
                className={`flex items-center gap-4 rounded-2xl border p-4 transition hover:brightness-105 ${s.done ? "bg-gradient-to-r from-violet-900/30 to-fuchsia-900/30 border-violet-400/30" : "bg-[#0d0d16] border-white/10"}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-lg ${s.done ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" : "bg-white/10 text-slate-300"}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{s.label}</div>
                  <div className="text-[10px] text-slate-400 truncate">{s.desc}</div>
                </div>
                <div className="text-xs font-bold text-violet-300">{s.done ? "✓ Готово" : "→ Далее"}</div>
              </a>
            ))}
          </div>

          {/* Quick actions */}
          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-b from-violet-900/40 to-fuchsia-900/40 border border-white/10 p-4 shadow-2xl">
              <h3 className="text-sm font-bold text-violet-200 mb-2">Быстрый старт</h3>
              <a href={`/editor/${id}`} className="block w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-center py-3 text-sm font-bold text-white shadow-lg hover:brightness-110 transition mb-2">Открыть редактор →</a>
              <a href={`/`} className="block w-full rounded-xl bg-white/5 border border-white/10 text-center py-2 text-xs font-bold text-slate-300 hover:bg-white/10 transition">На главную</a>
            </div>

            <div className="rounded-2xl bg-[#0d0d16] border border-white/10 p-4 shadow-inner">
              <h3 className="text-sm font-bold text-violet-200 mb-2">AI Препродакшн</h3>
              <p className="text-[11px] text-slate-400 mb-2">Генерация идеи, логлайна, сценария, раскадровки и рекомендаций.</p>
              <a href={`/editor/${id}`} className="inline-block rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow">Открыть в редакторе →</a>
              <div className="text-[10px] text-slate-500 mt-2">Примечание: Препродакшн теперь доступен через вкладку AI Director в редакторе или через этот дашборд.</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
