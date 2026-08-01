"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectStore } from "@/store/projectStore";
import { loadProject as loadProjectFromDb, saveProject } from "@/lib/db";
import { planFromDirector, flattenSections } from "@/lib/production";
import type {
  DirectorBrief,
  DirectorSections,
  DirectorOutput,
  PreProduction,
  PreprodStage,
} from "@/lib/production";
import { buildOfflinePreprod } from "@/lib/brain/offlinePreprod";
import PreprodControlBar from "./PreprodControlBar";
import DirectorWizard from "./DirectorWizard";
import ModeSwitcher, { type DirectorMode } from "./ModeSwitcher";
import StageIdea from "./stages/StageIdea";
import StageLogline from "./stages/StageLogline";
import StageTreatment from "./stages/StageTreatment";
import StageScript from "./stages/StageScript";
import StageVision from "./stages/StageVision";
import StageStoryboard from "./stages/StageStoryboard";
import StageShotlist from "./stages/StageShotlist";
import StagePlanning from "./stages/StagePlanning";
import StageCasting from "./stages/StageCasting";
import StageLocations from "./stages/StageLocations";
import StageRisks from "./stages/StageRisks";
import StageChat from "./stages/StageChat";

type WorkspaceStage = "brief" | "generating" | "result";

const PLATFORMS = [
  "YouTube",
  "TikTok",
  "Reels / Shorts",
  "Instagram (пост)",
  "VK Клипы",
  "Презентация",
  "Кино / Документальный",
];
const TEMPOS = ["Очень быстрый", "Быстрый", "Средний", "Медленный", "Спокойный"];
const DURATIONS = ["15", "20", "30", "45", "60", "90", "120", "180"];

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

const inputCls =
  "w-full rounded-xl border border-white/[0.09] bg-black/30 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-violet-400/60 focus:bg-black/40 focus:ring-2 focus:ring-violet-500/20";

export default function DirectorWorkspace({
  projectId,
  initialMode,
}: {
  projectId: string;
  initialMode?: string;
}) {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const loadProjectStore = useProjectStore((s) => s.loadProject);
  const updateProject = useProjectStore((s) => s.updateProject);

  const [mode, setMode] = useState<DirectorMode>(() => {
    if (initialMode === "pro" || initialMode === "basic") return initialMode;
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`montiq.director.mode.${projectId}`);
        if (saved === "pro" || saved === "basic") return saved;
      } catch {
        /* ignore */
      }
    }
    return "basic";
  });
  const [loaded, setLoaded] = useState(false);
  const [brief, setBrief] = useState<DirectorBrief>(emptyBrief());
  const [preprod, setPreprod] = useState<PreProduction | null>(null);
  const [sections, setSections] = useState<DirectorSections | null>(null);
  const [stage, setStage] = useState<WorkspaceStage>("brief");
  const [activeStage, setActiveStage] = useState<PreprodStage>("idea");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  // Сохраняем выбранный режим для этого проекта (Базовый / Профессиональный).
  useEffect(() => {
    try {
      localStorage.setItem(`montiq.director.mode.${projectId}`, mode);
    } catch {
      /* ignore */
    }
  }, [mode, projectId]);

  // Load existing project on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p =
          project && project.id === projectId ? project : await loadProjectFromDb(projectId);
        if (!mounted || !p) return;
        if (!(project && project.id === projectId)) loadProjectStore(p);
        if (p.director?.brief) {
          setBrief((prev) => ({ ...prev, ...p.director!.brief }));
        }
        if (p.director?.preprod) {
          setPreprod(p.director.preprod);
          setActiveStage(p.director.preprod.activeStage || "idea");
          setSections(flattenSections(p.director.preprod, p.director.brief));
          setStage("result");
        }
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [projectId, loadProjectStore, project]);

  // Persist helper (local state)
  const updatePreprod = (fn: (p: PreProduction) => PreProduction) => {
    setPreprod((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      next.updatedAt = Date.now();
      return next;
    });
    setSaved(false);
  };

  const set = (key: keyof DirectorBrief, value: string) => {
    setBrief((b) => ({ ...b, [key]: value }));
    setSaved(false);
  };

  const filledCount = useMemo(
    () =>
      ["idea", "goal", "audience", "platform", "style", "mood", "keyMessage", "callToAction"].filter(
        (k) => (brief as any)[k].trim().length > 0
      ).length,
    [brief]
  );

  const readiness = useMemo(() => {
    if (!preprod) return Math.min(100, filledCount * 8);
    const sections: Array<keyof PreProduction> = [
      "idea",
      "logline",
      "treatment",
      "script",
      "vision",
      "storyboard",
      "shotlist",
      "planning",
      "casting",
      "locations",
      "risks",
    ];
    let done = 0;
    for (const key of sections) {
      const v = (preprod as any)[key];
      if (!v) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        // check key content
        if (key === "idea" && v.refined) done++;
        else if (key === "logline" && v.primary) done++;
        else if (key === "treatment" && v.synopsisLong) done++;
        else if (key === "script" && v.scenes && v.scenes.length > 0) done++;
        else if (key === "vision" && v.scenes && v.scenes.length > 0) done++;
        else if (key === "storyboard" && v.frames && v.frames.length > 0) done++;
        else if (key === "shotlist" && v.shots && v.shots.length > 0) done++;
        else if (key === "planning" && v.schedule && v.schedule.length > 0) done++;
        else if (key === "risks" && v.risks && v.risks.length > 0) done++;
      }
    }
    // casting/locations start empty (user adds photos) → count them as partially done if role templates exist
    if (preprod.casting.length > 0) done++;
    if (preprod.locations.length > 0) done++;
    return Math.round((done / sections.length) * 100);
  }, [preprod, filledCount]);

  const canGenerate = brief.idea.trim().length >= 4 && stage !== "generating";

  const generate = async (stg: PreprodStage | "full" = "full") => {
    setError("");
    if (stg === "full") setStage("generating");
    setBusyStage(stg);
    const steps = [
      "Режиссёр формулирует идею и ЦА…",
      "Пишет логлайн и тритмент…",
      "Работает над сценарием и драматургией…",
      "Строит режиссёрскую экспликацию (камера, свет, звук)…",
      "Раскадровывает кадры…",
      "Составляет шот-лист и план съёмок…",
      "Просчитывает риски…",
    ];
    const timers = steps.map((msg, i) => setTimeout(() => setProgressMsg(msg), i * 1200 + 400));

    try {
      const currentPreprod = preprod || buildOfflinePreprod(brief);
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          projectTitle: project?.title || brief.idea || "Новый проект",
          mode: stg === "full" ? "full" : "stage",
          stage: stg === "full" ? undefined : stg,
          preprod: stg === "full" ? null : currentPreprod,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Не удалось получить ответ от AI Director.");
        if (stg === "full") setStage("brief");
        return;
      }

      if (stg === "full") {
        const nextPreprod: PreProduction = data.preprod || buildOfflinePreprod(brief);
        nextPreprod.activeStage = "idea";
        setPreprod(nextPreprod);
        setSections(data.sections || flattenSections(nextPreprod, brief));
        setStage("result");
        setActiveStage("idea");
        setIsFallback(!!data.fallback);
      } else {
        // merge stage result into current preprod
        setPreprod((prev) => {
          if (!prev) return prev;
          const next = { ...prev, [stg]: data.data } as PreProduction;
          next.updatedAt = Date.now();
          setSections(flattenSections(next, brief));
          return next;
        });
        setIsFallback(!!data.fallback);
      }
      setSaved(false);
    } catch (e: any) {
      setError("Ошибка сети: " + (e.message || ""));
      if (stg === "full") {
        const fallback = buildOfflinePreprod(brief);
        setPreprod(fallback);
        setSections(flattenSections(fallback, brief));
        setStage("result");
        setIsFallback(true);
      }
    } finally {
      timers.forEach(clearTimeout);
      setBusyStage(null);
    }
  };

  const persistPlan = async () => {
    if (!preprod || !sections) return;
    try {
      const p = project && project.id === projectId ? project : await loadProjectFromDb(projectId);
      if (!p) return;
      const directorOut: DirectorOutput = {
        version: 2,
        generatedAt: p.director?.generatedAt || Date.now(),
        updatedAt: Date.now(),
        status: "approved",
        brief,
        sections,
        preprod: { ...preprod, activeStage },
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

  // Autosave when preprod changes (debounced)
  useEffect(() => {
    if (!preprod || !sections) return;
    const t = setTimeout(() => {
      persistPlan();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preprod, activeStage, brief]);

  /** Результат диалогового режима: режиссёр передаёт готовый Production Blueprint. */
  const handleBlueprint = (
    nextPreprod: PreProduction,
    nextSections: DirectorSections,
    nextBrief: DirectorBrief,
    fallback: boolean
  ) => {
    setPreprod(nextPreprod);
    setSections(nextSections);
    setBrief(nextBrief);
    setStage("result");
    setActiveStage("idea");
    setIsFallback(fallback);
  };

  /** «Перейти к монтажу»: сохранить план и передать его монтажному движку. */
  const goToEditor = async () => {
    try {
      if (preprod && sections) await persistPlan();
    } catch {
      /* persistPlan уже показывает ошибку */
    }
    router.push(`/editor/${projectId}`);
  };

  const switchMode = (m: DirectorMode) => setMode(m);

  const StageComponent = useMemo(() => {
    switch (activeStage) {
      case "idea": return StageIdea;
      case "logline": return StageLogline;
      case "treatment": return StageTreatment;
      case "script": return StageScript;
      case "vision": return StageVision;
      case "storyboard": return StageStoryboard;
      case "shotlist": return StageShotlist;
      case "planning": return StagePlanning;
      case "casting": return StageCasting;
      case "locations": return StageLocations;
      case "risks": return StageRisks;
      case "chat": return StageChat;
      default: return StageIdea;
    }
  }, [activeStage]);

  const briefPanel = (
    <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-2xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-100">Production Brief</h2>
          <p className="text-[11px] text-slate-500">Расскажите режиссёру о проекте — остальное он сделает сам.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold text-violet-200">
          {filledCount}/8
        </span>
      </div>

      <div className="space-y-4">
        <Field label="Идея проекта">
          <textarea
            value={brief.idea}
            onChange={(e) => set("idea", e.target.value)}
            placeholder="О чём ролик? Напишите суть — что происходит, что показываем."
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>
        <Field label="Цель видео">
          <textarea
            value={brief.goal}
            onChange={(e) => set("goal", e.target.value)}
            placeholder="Что должен сделать зритель или что он должен почувствовать?"
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </Field>
        <Field label="Целевая аудитория">
          <textarea
            value={brief.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="Кто ваш зритель: возраст, интересы, боли, что смотрит."
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </Field>
        <Field label="Ключевая мысль">
          <textarea
            value={brief.keyMessage}
            onChange={(e) => set("keyMessage", e.target.value)}
            placeholder="Одна фраза, которую зритель запомнит."
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </Field>
        <Field label="CTA / призыв к действию">
          <input value={brief.callToAction} onChange={(e) => set("callToAction", e.target.value)} placeholder="Подписаться, оставить заявку, перейти по ссылке…" className={inputCls} />
        </Field>

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

        <Field label="Стиль ролика">
          <input value={brief.style} onChange={(e) => set("style", e.target.value)} placeholder="Динамичный/спокойный, лайфстайл/продуктовый…" className={inputCls} />
        </Field>
        <Field label="Настроение">
          <input value={brief.mood} onChange={(e) => set("mood", e.target.value)} placeholder="Тёплое, драйвовое, ностальгическое, вдохновляющее…" className={inputCls} />
        </Field>

        <Field label="Темп">
          <div className="flex flex-wrap gap-2">
            {TEMPOS.map((t) => (
              <button
                key={t}
                type="button"
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

        <Field label="Референсы">
          <textarea
            value={brief.references}
            onChange={(e) => set("references", e.target.value)}
            placeholder="Ссылки или названия роликов/фильмов, на которые хотите быть похожи."
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</div>
      )}

      <button
        onClick={() => generate("full")}
        disabled={!canGenerate}
        className="mt-6 w-full rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 px-6 py-4 text-sm font-extrabold tracking-wide text-white shadow-2xl shadow-violet-900/40 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {stage === "generating" ? "AI Director работает…" : "🎬 Запустить AI Director →"}
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
        Заполните бриф слева — и AI Director пройдёт с вами все 12 этапов препродакшена:
        от идеи и логлайна до кастинга, локаций и финального шот-листа.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-4 gap-3 text-left">
        {[
          { icon: "💡", t: "Замысел" },
          { icon: "📜", t: "Сценарий" },
          { icon: "🎬", t: "Режиссура" },
          { icon: "📋", t: "Съёмки" },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-center">
            <div className="mb-1 text-xl">{c.icon}</div>
            <div className="text-xs font-bold text-slate-200">{c.t}</div>
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
      <p className="mb-6 max-w-sm text-sm text-slate-400">{progressMsg || "Проектируем кадры…"}</p>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-full origin-left animate-shimmer rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400" />
      </div>
    </div>
  );

  const resultPanel = preprod && sections && (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-gradient-to-br from-violet-950/40 via-[#0d0d18]/90 to-amber-950/30 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Этап 01 · Препродакшен
            </div>
            <h2 className="text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-fuchsia-200 to-amber-200">
              {preprod.treatment.title || brief.idea || "Production Book"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isFallback && (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-200" title="AI-модель недоступна, используется локальный фоллбек">
                ● Офлайн-режим
              </span>
            )}
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium text-slate-300">
              Готовность {readiness}%
            </span>
            {saved && <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-300">✓ Сохранено</span>}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Логлайн</div>
          <p className="text-sm leading-relaxed text-slate-200">{preprod.logline.primary}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {brief.platform && <Chip>{brief.platform}</Chip>}
          {brief.duration && <Chip>{brief.duration} сек</Chip>}
          {brief.tempo && <Chip>{brief.tempo}</Chip>}
          {brief.mood && <Chip>{brief.mood}</Chip>}
          {preprod.treatment.genre && <Chip>{preprod.treatment.genre}</Chip>}
        </div>
      </div>

      {busyStage && (
        <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-3 text-xs text-violet-100">
          AI перестраивает раздел «{busyStage}» с учётом ваших правок…
        </div>
      )}

      <StageComponent
        brief={brief}
        preprod={preprod}
        updatePreprod={updatePreprod}
        onRegenerate={(s) => generate(s)}
        busy={busyStage !== null}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-xl">
        <div className="flex gap-2">
          <button
            onClick={() => generate("full")}
            disabled={busyStage !== null}
            className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.1] disabled:opacity-50"
          >
            ♻ Перегенерировать весь план
          </button>
          <button
            onClick={persistPlan}
            className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-white/[0.1]"
          >
            {saved ? "✓ План сохранён" : "💾 Сохранить"}
          </button>
        </div>
        <button
          onClick={() => void goToEditor()}
          className="rounded-full bg-gradient-to-r from-amber-500 to-orange-400 px-5 py-2.5 text-xs font-extrabold text-black shadow-xl transition hover:brightness-110"
        >
          Перейти в редактор →
        </button>
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

      {/* Control panel ABOVE the logo (только в профессиональном режиме) */}
      {mode === "pro" && stage === "result" && preprod && (
        <PreprodControlBar
          projectId={projectId}
          activeStage={activeStage}
          readiness={readiness}
          onStageChange={setActiveStage}
        />
      )}

      {/* Header with logo */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#07070f]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <ModeSwitcher mode={mode} onChange={switchMode} />
            <div className="mx-1 hidden h-7 w-px bg-white/10 sm:block" />
          </div>
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-amber-400 text-xl shadow-2xl shadow-violet-500/40 transition group-hover:scale-105">
              🎬
            </div>
            <div>
              <div className="text-base font-extrabold tracking-tight">MONTIQ</div>
              <div className="text-[9px] uppercase tracking-[0.28em] text-slate-500">
                AI Production Studio
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-400 sm:block">
              {project?.title || brief.idea || "Новый проект"}
            </span>
            {stage === "result" && (
              <button
                onClick={() => void goToEditor()}
                className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-[11px] font-extrabold text-white shadow-xl shadow-violet-900/30 transition hover:brightness-110"
              >
                Редактор →
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        {mode === "basic" ? (
          <>
            <div className="mb-6 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" /> Этап 01 · Пре-продакшен · Диалоговый режим
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                <span className="bg-gradient-to-r from-violet-100 via-fuchsia-100 to-amber-100 bg-clip-text text-transparent">AI Director</span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
                Режиссёр ведёт вас шаг за шагом и сам собирает весь Production Blueprint —
                от логлайна и сценария до shot list и плана монтажа.
              </p>
            </div>

            {!loaded ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">Загружаем проект…</div>
            ) : (
              <DirectorWizard
                projectTitle={project?.title || brief.idea || "Новый проект"}
                initialBrief={brief}
                initialPreprod={preprod}
                onBlueprint={handleBlueprint}
                onGoToEditor={goToEditor}
                onOpenPro={() => switchMode("pro")}
              />
            )}
          </>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" /> Этап 01 · Пре-продакшен
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                <span className="bg-gradient-to-r from-violet-100 via-fuchsia-100 to-amber-100 bg-clip-text text-transparent">AI Director</span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
                Полноценный виртуальный режиссёр и продюсер: от идеи до финального плана съёмок.
                Все 12 этапов связаны между собой — изменение в одном автоматически отражается на остальных.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
              <aside className="lg:col-span-4">
                <div className="lg:sticky lg:top-24 space-y-4">
                  {briefPanel}

                  {stage === "result" && preprod && (
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 backdrop-blur-xl">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Навигация по этапам</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          ["idea", "💡 Idea"],
                          ["logline", "🎯 Logline"],
                          ["treatment", "📖 Treatment"],
                          ["script", "📜 Script"],
                          ["vision", "🎬 Vision"],
                          ["storyboard", "🖼 Storyboard"],
                          ["shotlist", "📋 Shot List"],
                          ["planning", "🗓 Planning"],
                          ["casting", "🎭 Casting"],
                          ["locations", "📍 Locations"],
                          ["risks", "⚠️ Risks"],
                          ["chat", "💬 Chat"],
                        ].map(([id, label]) => (
                          <button
                            key={id}
                            onClick={() => setActiveStage(id as PreprodStage)}
                            className={`rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition ${
                              activeStage === id
                                ? "bg-violet-500/20 text-violet-100"
                                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>

              <section className="lg:col-span-8">
                {stage === "generating" ? generating : stage === "result" && preprod ? resultPanel : emptyState}
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="relative z-10 mt-16 border-t border-white/[0.05] bg-[#07070f]/80 px-8 py-4 text-[10px] text-slate-600 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <span>MONTIQ · AI Production Studio — от идеи до финального кадра</span>
          <span>Project {projectId}</span>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      {children}
    </label>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-300">
      {children}
    </span>
  );
}
