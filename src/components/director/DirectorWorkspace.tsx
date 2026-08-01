"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectStore } from "@/store/projectStore";
import { loadProject as loadProjectFromDb, saveProject } from "@/lib/db";
import { planFromDirector } from "@/lib/production";
import type { DirectorBrief, DirectorSections, DirectorOutput } from "@/lib/production";

type WorkspaceStage = "brief" | "generating" | "result";

const PLATFORMS = ["YouTube", "TikTok", "Reels / Shorts", "Instagram (пост)", "VK Клипы", "Презентация", "Кино / Документальный"];
const TEMPOS = ["Очень быстрый", "Быстрый", "Средний", "Медленный", "Спокойный"];
const DURATIONS = ["15", "20", "30", "45", "60", "90", "120"];

const emptyBrief = (): DirectorBrief => ({
  idea: "",
  goal: "",
  audience: "",
  platform: PLATFORMS[0],
  duration: "30",
  style: "",
  mood: "",
  tempo: TEMPOS[2],
  references: "",
  keyMessage: "",
  callToAction: "",
});

const BRIEF_FIELDS: Array<{ key: keyof DirectorBrief; label: string; placeholder: string; multiline?: boolean }> = [
  { key: "idea", label: "Идея проекта", placeholder: "О чём ролик? Напишите суть — что происходит, что показываем.", multiline: true },
  { key: "goal", label: "Цель видео", placeholder: "Что должен сделать зритель или что он должен почувствовать?", multiline: true },
  { key: "audience", label: "Целевая аудитория", placeholder: "Кто ваш зритель: возраст, интересы, где живёт, что смотрит.", multiline: true },
  { key: "style", label: "Стиль ролика", placeholder: "Динамичный/спокойный, лайфстайл/продуктовый, камерный/грандиозный…" },
  { key: "mood", label: "Настроение", placeholder: "Тёплое, драйвовое, ностальгическое, вдохновляющее, ироничное…" },
  { key: "references", label: "Референсы", placeholder: "Ссылки или описания роликов, на которые хотите быть похожи (стиль, ритм, музыка).", multiline: true },
  { key: "keyMessage", label: "Ключевая мысль", placeholder: "Одна фраза, которую зритель должен запомнить.", multiline: true },
  { key: "callToAction", label: "CTA / призыв к действию", placeholder: "Подписаться, оставить заявку, перейти по ссылке, сохранить…" },
];

function SectionCard({ index, title, icon, content, accent }: { index: string; title: string; icon: string; content: string; accent: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-6 shadow-xl backdrop-blur-xl transition-all hover:border-white/[0.16] hover:bg-white/[0.06]">
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-3xl opacity-40" style={{ background: accent }} />
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm shadow-inner">{icon}</div>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Раздел {index}</div>
          <h3 className="truncate text-sm font-bold text-slate-100">{title}</h3>
        </div>
      </div>
      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300/90">{content}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/[0.09] bg-black/30 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-violet-400/60 focus:bg-black/40 focus:ring-2 focus:ring-violet-500/20";

export default function DirectorWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const loadProjectStore = useProjectStore((s) => s.loadProject);
  const updateProject = useProjectStore((s) => s.updateProject);

  const [brief, setBrief] = useState<DirectorBrief>(emptyBrief());
  const [sections, setSections] = useState<DirectorSections | null>(null);
  const [stage, setStage] = useState<WorkspaceStage>("brief");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = project && project.id === projectId ? project : await loadProjectFromDb(projectId);
        if (!mounted || !p) return;
        if (!(project && project.id === projectId)) loadProjectStore(p);
        if (p.director?.brief) {
          setBrief((prev) => ({ ...prev, ...p.director!.brief }));
          setSections(p.director!.sections);
          setStage("result");
        }
      } catch {
        /* project may not exist yet */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [projectId, loadProjectStore, project]);

  const set = (key: keyof DirectorBrief, value: string) => {
    setBrief((b) => ({ ...b, [key]: value }));
    setSaved(false);
  };

  const filledCount = useMemo(
    () => BRIEF_FIELDS.filter((f) => brief[f.key].trim().length > 0).length,
    [brief]
  );
  const canGenerate = brief.idea.trim().length >= 4 && stage !== "generating";

  const generate = async () => {
    setStage("generating");
    setError("");
    setProgressMsg("Режиссёр изучает бриф и выстраивает драматургию…");
    // Staged progress so the workspace feels alive while the model works.
    const timers = [
      setTimeout(() => setProgressMsg("Прописываем логлайн, хук и эмоциональную дугу…"), 2600),
      setTimeout(() => setProgressMsg("Раскадровываем сцены и собираем shot list…"), 5600),
      setTimeout(() => setProgressMsg("Подбираем музыку, цвет и режиссуру монтажа…"), 8200),
    ];
    try {
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, projectTitle: project?.title || "Новый проект" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Не удалось получить ответ от AI Director.");
        setStage("brief");
        return;
      }
      setSections(data.sections || {});
      setStage("result");
      setSaved(false);
    } catch (e: any) {
      setError("Ошибка сети: " + (e.message || ""));
      setStage("brief");
    } finally {
      timers.forEach(clearTimeout);
    }
  };

  const persistPlan = async () => {
    if (!sections) return;
    try {
      const p = project && project.id === projectId ? project : await loadProjectFromDb(projectId);
      if (!p) return;
      const directorOut: DirectorOutput = {
        version: 1,
        generatedAt: Date.now(),
        status: "approved",
        brief,
        sections,
      };
      const next = {
        ...p,
        title: brief.idea ? brief.idea.replace(/[.!?].*$/, "").slice(0, 58) : p.title,
        director: directorOut,
        production: planFromDirector(brief, p.assets),
        updatedAt: Date.now(),
      };
      await saveProject(next);
      loadProjectStore(next);
      updateProject(() => next);
      setSaved(true);
    } catch (e: any) {
      setError("Не удалось сохранить план: " + (e.message || ""));
    }
  };

  const briefPanel = (
    <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-100">Production Brief</h2>
          <p className="text-[11px] text-slate-500">Расскажите режиссёру о проекте — остальное он сделает сам.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold text-violet-200">
          {filledCount}/{BRIEF_FIELDS.length}
        </span>
      </div>

      <div className="space-y-4">
        {BRIEF_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.multiline ? (
              <textarea
                value={brief[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={f.key === "idea" ? 3 : 2}
                className={`${inputCls} resize-none`}
              />
            ) : (
              <input value={brief[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className={inputCls} />
            )}
          </Field>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Платформа">
            <select value={brief.platform} onChange={(e) => set("platform", e.target.value)} className={`${inputCls} appearance-none`}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p} className="bg-[#0c0c16]">{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Длительность, сек">
            <select value={brief.duration} onChange={(e) => set("duration", e.target.value)} className={`${inputCls} appearance-none`}>
              {DURATIONS.map((d) => (
                <option key={d} value={d} className="bg-[#0c0c16]">{d} сек</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Темп">
          <div className="flex flex-wrap gap-2">
            {TEMPOS.map((t) => (
              <button
                key={t}
                onClick={() => set("tempo", t)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  brief.tempo === t
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-100 shadow-lg shadow-violet-900/30"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</div>
      )}

      <button
        onClick={generate}
        disabled={!canGenerate}
        className="mt-6 w-full rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 px-6 py-4 text-sm font-extrabold tracking-wide text-white shadow-2xl shadow-violet-900/40 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {stage === "generating" ? "AI Director работает…" : "Создать Production Plan →"}
      </button>
      {!brief.idea.trim() && (
        <p className="mt-2 text-center text-[10px] text-slate-600">Опишите идею хотя бы парой слов, чтобы начать.</p>
      )}
    </div>
  );

  const emptyState = (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/[0.12] bg-white/[0.02] p-10 text-center">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-amber-400/20 shadow-2xl shadow-violet-900/30">
        <span className="text-4xl">🎬</span>
      </div>
      <h3 className="mb-2 text-xl font-bold tracking-tight text-slate-100">Виртуальный режиссёр ждёт брифа</h3>
      <p className="mb-6 max-w-md text-sm leading-relaxed text-slate-400">
        Заполните бриф слева — и AI Director создаст логлайн, сценарий, режиссёрскую концепцию,
        раскадровку, shot list и рекомендации по съёмке, музыке, цвету, монтажу, титрам и переходам.
      </p>
      <div className="grid w-full max-w-md grid-cols-3 gap-3 text-left">
        {[
          { icon: "💡", t: "Идея", d: "Бриф проекта" },
          { icon: "📜", t: "Сценарий", d: "4 акта + дуга" },
          { icon: "🎛", t: "Продакшен", d: "14 разделов" },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="mb-1 text-xl">{c.icon}</div>
            <div className="text-xs font-bold text-slate-200">{c.t}</div>
            <div className="text-[10px] text-slate-500">{c.d}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const generating = (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[1.75rem] border border-white/[0.08] bg-white/[0.02] p-10 text-center">
      <div className="relative mb-8 flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-violet-400 border-r-amber-400" style={{ animationDuration: "1.4s" }} />
        <div className="absolute inset-2 animate-spin rounded-full border border-transparent border-b-fuchsia-400" style={{ animationDuration: "2.2s", animationDirection: "reverse" }} />
        <span className="text-3xl">🎥</span>
      </div>
      <h3 className="mb-2 text-lg font-bold text-slate-100">Режиссёр работает над проектом</h3>
      <p className="mb-6 max-w-sm text-sm text-slate-400">{progressMsg}</p>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-full origin-left animate-shimmer rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400" />
      </div>
    </div>
  );

  const resultsGroups: Array<{ title: string; items: Array<{ key: keyof DirectorSections; title: string; icon: string; accent: string }> }> = [
    {
      title: "Ядро истории",
      items: [
        { key: "logline", title: "Логлайн", icon: "📝", accent: "#8b5cf6" },
        { key: "hook", title: "Хук", icon: "🎯", accent: "#f59e0b" },
        { key: "drama", title: "Драматургия", icon: "🎭", accent: "#fb7185" },
      ],
    },
    {
      title: "Сценарий и концепция",
      items: [
        { key: "script", title: "Сценарий", icon: "📜", accent: "#a78bfa" },
        { key: "concept", title: "Режиссёрская концепция", icon: "🎬", accent: "#fbbf24" },
        { key: "structure", title: "Структура ролика", icon: "🕐", accent: "#e879f9" },
      ],
    },
    {
      title: "Визуализация",
      items: [
        { key: "storyboard", title: "Storyboard", icon: "🖼", accent: "#38bdf8" },
        { key: "shotlist", title: "Shot List", icon: "📋", accent: "#34d399" },
        { key: "shooting", title: "Рекомендации по съёмке", icon: "📹", accent: "#22d3ee" },
      ],
    },
    {
      title: "Продакшен и звук",
      items: [
        { key: "music", title: "Музыка", icon: "🎧", accent: "#f472b6" },
        { key: "color", title: "Цвет и LUT", icon: "🎨", accent: "#c084fc" },
        { key: "edit", title: "Монтаж", icon: "✂️", accent: "#818cf8" },
        { key: "titles", title: "Титры и текст", icon: "🔤", accent: "#2dd4bf" },
        { key: "transitions", title: "Переходы", icon: "🔀", accent: "#a3e635" },
      ],
    },
  ];

  const resultPanel = sections && (
    <div className="space-y-6">
      {/* Plan header / summary */}
      <div className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-gradient-to-br from-violet-950/40 via-[#0d0d18]/90 to-amber-950/30 p-7 shadow-2xl backdrop-blur-2xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-fuchsia-200 to-amber-200">Production Plan</h2>
            <p className="text-[11px] text-slate-500">Создан AI Director · можно сохранить и продолжить в редакторе</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sections.logline && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium text-slate-300">{"● Готов к монтажу"}</span>
            )}
            {saved && <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-300">✓ Сохранено</span>}
          </div>
        </div>
        <div className="mb-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Логлайн</div>
          <p className="text-sm leading-relaxed text-slate-200">{sections.logline || "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {brief.platform && <Chip>{brief.platform}</Chip>}
          {brief.duration && <Chip>{brief.duration} сек</Chip>}
          {brief.tempo && <Chip>{brief.tempo}</Chip>}
          {brief.mood && <Chip>{brief.mood}</Chip>}
        </div>
      </div>

      {/* Sections grouped */}
      {resultsGroups.map((group) => {
        const present = group.items.filter((i) => sections[i.key]);
        if (present.length === 0) return null;
        return (
          <div key={group.title}>
            <div className="mb-3 flex items-center gap-3 px-1">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{group.title}</h3>
              <div className="h-px flex-1 bg-white/[0.07]" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {present.map((item, i) => (
                <SectionCard
                  key={item.key}
                  index={String(i + 1).padStart(2, "0")}
                  title={item.title}
                  icon={item.icon}
                  accent={item.accent}
                  content={sections[item.key] || ""}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-xl">
        <p className="text-xs text-slate-400">План готов. Сохраните его в проект и переходите к монтажу.</p>
        <div className="flex gap-2">
          <button
            onClick={persistPlan}
            className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.1]"
          >
            {saved ? "✓ План сохранён" : "Сохранить план"}
          </button>
          <button
            onClick={() => router.push(`/editor/${projectId}`)}
            className="rounded-full bg-gradient-to-r from-amber-500 to-orange-400 px-5 py-2.5 text-xs font-extrabold text-black shadow-xl transition hover:brightness-110"
          >
            Перейти в редактор →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#07070f] text-slate-100 selection:bg-violet-500/30">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-[#080814] via-[#07070f] to-[#0a0a16]" />
        <div className="absolute -left-40 -top-32 h-[560px] w-[560px] rounded-full bg-violet-800/25 blur-[130px]" />
        <div className="absolute -right-40 top-1/3 h-[520px] w-[520px] rounded-full bg-fuchsia-800/15 blur-[140px]" />
        <div className="absolute bottom-[-20%] left-1/3 h-[520px] w-[520px] rounded-full bg-amber-700/15 blur-[150px]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#07070f]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-amber-400 text-xl shadow-2xl shadow-violet-500/40 transition group-hover:scale-105">
              🎬
            </div>
            <div>
              <div className="text-base font-extrabold tracking-tight">MONTIQ</div>
              <div className="text-[9px] uppercase tracking-[0.28em] text-slate-500">AI Director Studio</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 sm:block">
              {project?.title || "Новый проект"}
            </span>
            {stage === "result" && (
              <button
                onClick={() => router.push(`/editor/${projectId}`)}
                className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-[11px] font-extrabold text-white shadow-xl shadow-violet-900/30 transition hover:brightness-110"
              >
                Редактор →
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        {/* Hero intro */}
        <div className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" /> Этап 01 · Пре-продакшен
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-violet-100 via-fuchsia-100 to-amber-100 bg-clip-text text-transparent">AI Director</span>
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
            Полноценный виртуальный режиссёр и продюсер. Расскажите о проекте — он подготовит логлайн, сценарий,
            режиссёрскую концепцию, раскадровку, shot list и рекомендации по съёмке, звуку, цвету и монтажу ещё до первого кадра.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">{briefPanel}</div>
          </aside>

          <section className="lg:col-span-8">
            {stage === "generating" ? generating : stage === "result" && sections ? resultPanel : emptyState}
          </section>
        </div>
      </main>

      <footer className="relative z-10 mt-16 border-t border-white/[0.05] bg-[#07070f]/80 px-8 py-4 text-[10px] text-slate-600 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <span>MONTIQ · AI Director — виртуальный режиссёр вашего проекта</span>
          <span>Project {projectId}</span>
        </div>
      </footer>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-300">
      {children}
    </span>
  );
}
