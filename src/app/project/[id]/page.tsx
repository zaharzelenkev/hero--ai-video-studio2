"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { loadProject } from "@/lib/db";
import { useProjectStore } from "@/store/projectStore";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";

const STAGE_ICONS: IconName[] = [
  "brain",
  "lightbulb",
  "target",
  "script",
  "storyboard",
  "film",
  "scissors",
  "rocket",
];

export default function ProjectPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const loadProjectStore = useProjectStore((s) => s.loadProject);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

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
    return () => {
      mounted = false;
    };
  }, [id, loadProjectStore]);

  if (loading)
    return (
      <div className="app-bg flex h-screen items-center justify-center text-slate-300">
        <div className="flex items-center gap-3">
          <span className="status-dot status-dot-dirty status-dot-pulse" />
          Загрузка проекта...
        </div>
      </div>
    );
  if (!project)
    return (
      <div className="app-bg flex h-screen items-center justify-center text-slate-200">
        <div className="surface-card animate-scale-in px-8 py-9 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
            <Icon name="alert" size={28} />
          </div>
          <h2 className="title mb-2 text-xl">Проект не найден</h2>
          <button onClick={() => router.push("/")} className="btn btn-primary mt-4 px-4 py-2 text-sm">
            На главную
          </button>
        </div>
      </div>
    );

  const stages = [
    { label: "AI Director", desc: "Бриф, сценарий, раскадровка, план", href: `/director/${id}`, done: !!project.director },
    { label: "Идея", desc: "Концепция и эмоциональный посыл", href: `/director/${id}`, done: !!project.style?.rawPrompt },
    { label: "Логлайн", desc: "Одно предложение — суть ролика", href: `/director/${id}`, done: !!project.director?.sections?.logline },
    { label: "Сценарий", desc: "Сцены, диалоги, визуал", href: `/director/${id}`, done: !!project.director?.sections?.script },
    { label: "Раскадровка", desc: "Кадры, движения камеры, свет", href: `/director/${id}`, done: !!project.director?.sections?.storyboard },
    { label: "Материалы", desc: "Видео, фото, сэмплы, музыка", href: `/editor/${id}`, done: !!project.assets?.length },
    { label: "Монтаж", desc: "Таймлайн, клипы, переходы", href: `/editor/${id}`, done: !!project.tracks?.some((t: any) => t.clips?.length > 0) },
    { label: "Экспорт", desc: "Финальный файл MP4 / MOV", href: `/editor/${id}`, done: false },
  ];

  return (
    <div className="app-bg min-h-screen text-slate-100">
      <header className="glass sticky top-0 z-30 border-b border-white/[0.06]">
        <div className="mx-auto flex items-center gap-3 px-5 py-3 sm:px-8">
          <button
            onClick={() => router.push("/")}
            className="btn btn-ghost h-8 px-3 text-xs"
          >
            <Icon name="arrow-left" size={14} />
            Назад
          </button>
          <Logo size={30} showText={false} />
          <h1 className="title text-base">
            <span className="text-gradient">AI Production Studio</span>
          </h1>
          <span className="ml-auto truncate text-xs font-medium text-violet-300">{project.title}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Stages */}
          <div className="space-y-3 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="title text-lg text-slate-200">Этапы производства</h2>
              <span className="badge badge-muted">8</span>
            </div>
            {stages.map((s, i) => (
              <a
                key={s.label}
                href={s.href}
                onClick={(e) => {
                  if (!s.done && s.label !== "Редактор" && s.label !== "Монтаж" && s.label !== "Материалы") {
                    e.preventDefault();
                    setToast("Этот этап станет доступен после завершения предыдущих.");
                  }
                }}
                className={`surface-card group flex items-center gap-4 p-4 transition-all duration-200 hover:translate-x-0.5 ${
                  s.done ? "!bg-violet-500/[0.07] !border-violet-400/25" : ""
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                    s.done
                      ? "bg-gradient-to-b from-violet-500 to-violet-600 text-white shadow-[0_8px_20px_-6px_rgba(124,108,246,0.5)]"
                      : "bg-white/[0.05] text-slate-400 group-hover:text-slate-200"
                  }`}
                >
                  {i === 0 ? (
                    <Image src="/director-icon.png" alt="AI Director" width={18} height={18} className="rounded" />
                  ) : (
                    <Icon name={STAGE_ICONS[i]} size={18} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                    <span className="text-[10px] font-semibold text-slate-500">0{i + 1}</span>
                    {s.label}
                  </div>
                  <div className="truncate text-[10px] text-slate-400">{s.desc}</div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-violet-300">
                  {s.done ? (
                    <>
                      <Icon name="check" size={13} className="text-emerald-400" />
                      <span className="text-emerald-400">Готово</span>
                    </>
                  ) : (
                    <>
                      Далее
                      <Icon name="arrow-right" size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </div>
              </a>
            ))}
          </div>

          {/* Quick actions */}
          <div className="space-y-3">
            <div className="surface-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100">
                <Icon name="zap" size={15} className="text-violet-300" />
                Быстрый старт
              </h3>
              <a href={`/director/${id}`} className="btn btn-primary mb-2 block w-full py-3 text-sm">
                AI Director
                <Icon name="arrow-right" size={15} />
              </a>
              <a href={`/editor/${id}`} className="btn btn-ghost mb-2 block w-full py-2.5 text-xs">
                Открыть в редакторе
                <Icon name="arrow-right" size={13} />
              </a>
              <a href={`/`} className="btn btn-ghost block w-full py-2.5 text-xs">
                На главную
              </a>
            </div>

            <div className="surface-card p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-100">
                <Icon name="brain" size={15} className="text-violet-300" />
                AI Препродакшн
              </h3>
              <p className="mb-2.5 text-[11px] leading-relaxed text-slate-400">
                Генерация идеи, логлайна, сценария, раскадровки и рекомендаций.
              </p>
              <a href={`/director/${id}`} className="btn btn-soft px-3 py-1.5 text-xs">
                <Icon name="compass" size={13} />
                Открыть AI Director
              </a>
              <div className="mt-2.5 text-[10px] text-slate-500">
                AI Director теперь — отдельный этап пре-продакшена до монтажа.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Ненавязчивый тост вместо блокирующего alert() */}
      {toast && (
        <div className="animate-pop fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-amber-400/30 bg-[#14101c]/95 px-4 py-2.5 text-xs font-medium text-amber-100 shadow-2xl backdrop-blur-xl">
          <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20">
            <Icon name="info" size={11} className="text-amber-300" />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
