"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { STAGE_ICONS, STAGE_LABELS } from "./stageIcons";
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
// Длительности: короткие вертикальные ролики + классические длительности
// короткометражек (3, 5, 7, 10, 15 мин), чтобы про-режим покрывал и кино-формат.
const DURATIONS = [
  "15", "20", "30", "45", "60", "90", "120", "180",
  "300", "420", "600", "900",
];

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

const inputCls = "input !py-2.5 !text-sm";

// Длительность по умолчанию под выбранную площадку (про-режим): кино-формат
// сразу получает длину короткометражки, остальные — короткие вертикальные.
const PLATFORM_DEFAULT_DURATION: Record<string, string> = {
  "Кино / Документальный": "600", // 10 минут — классика короткометражки
  "Презентация": "120",
  YouTube: "60",
  TikTok: "30",
  "Reels / Shorts": "30",
  "Instagram (пост)": "30",
  "VK Клипы": "30",
};

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
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [busyStage, setBusyStage] = useState<string | null>(null);
  // true — предыдущий полный запуск не удался: при повторе отправляем серверу
  // текущий preprod, чтобы он переиспользовал уже сгенерированные Groq блоки
  // и догенерировал только недостающие. Сбрасывается при любом изменении брифа.
  const [resumeAfterFailure, setResumeAfterFailure] = useState(false);
  // NOTE: model selection (remote vs local) is internal and NEVER shown to the user.

  useEffect(() => {
    try {
      localStorage.setItem(`montiq.director.mode.${projectId}`, mode);
    } catch {
      /* ignore */
    }
  }, [mode, projectId]);

  // Load existing project
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p =
          project && project.id === projectId ? project : await loadProjectFromDb(projectId);
        if (!mounted || !p) return;
        if (!(project && project.id === projectId)) loadProjectStore(p);
        if (p.director?.brief) {
          // Не восстанавливаем ранее написанный промт (поле «Идея») — пользователь
          // просил не показывать старый текст; остальные поля брифа сохраняются.
          const { idea: _ignoredIdea, ...restBrief } = p.director.brief;
          setBrief((prev) => ({ ...prev, ...restBrief }));
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
    // Бриф изменился — сохранённые блоки больше не соответствуют заданию,
    // повторный запуск должен генерировать всё заново.
    setResumeAfterFailure(false);
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
    const keys: Array<keyof PreProduction> = [
      "idea", "logline", "treatment", "script", "vision",
      "storyboard", "shotlist", "planning", "casting", "locations", "risks",
    ];
    let done = 0;
    for (const key of keys) {
      const v = (preprod as any)[key];
      if (!v) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        if (key === "idea" && v.refined) done++;
        else if (key === "logline" && v.primary) done++;
        else if (key === "treatment" && v.synopsisLong) done++;
        else if (key === "script" && v.scenes?.length > 0) done++;
        else if (key === "vision" && v.scenes?.length > 0) done++;
        else if (key === "storyboard" && v.frames?.length > 0) done++;
        else if (key === "shotlist" && v.shots?.length > 0) done++;
        else if (key === "planning" && v.schedule?.length > 0) done++;
        else if (key === "risks" && v.risks?.length > 0) done++;
      }
    }
    if (preprod.casting.length > 0) done++;
    if (preprod.locations.length > 0) done++;
    return Math.round((done / keys.length) * 100);
  }, [preprod, filledCount]);

  const canGenerate = brief.idea.trim().length >= 4 && stage !== "generating";

  const generate = async (stg: PreprodStage | "full" = "full") => {
    setError("");
    setNotice("");
    if (stg === "full") setStage("generating");
    setBusyStage(stg);
    const steps = [
      "Формулирую идею и ЦА…",
      "Пишу логлайн и тритмент…",
      "Работаю над сценарием и драматургией…",
      "Строю кадры: камера, свет, звук…",
      "Делаю раскадровку…",
      "Составляю шот-лист и план съёмок…",
      "Просчитываю риски…",
    ];
    const timers = steps.map((msg, i) => setTimeout(() => setProgressMsg(msg), i * 700 + 300));

    try {
      const currentPreprod = preprod || buildOfflinePreprod(brief);
      // После неудачного запуска передаём серверу текущий preprod + resume:
      // он переиспользует блоки, которые Groq уже успела сгенерировать,
      // и догоняет только недостающие — повторный запуск быстрый.
      const isFull = stg === "full";
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          projectTitle: project?.title || brief.idea || "Новый проект",
          mode: isFull ? "full" : "stage",
          stage: isFull ? undefined : stg,
          preprod: isFull ? (resumeAfterFailure ? currentPreprod : null) : currentPreprod,
          resume: isFull && resumeAfterFailure,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Не удалось получить ответ.");
        if (isFull) {
          setStage("brief");
          // Сохраняем всё, что удалось собрать, и разрешаем догенерацию при повторе.
          setResumeAfterFailure(true);
        }
        return;
      }

      if (isFull) {
        const nextPreprod: PreProduction = data.preprod || buildOfflinePreprod(brief);
        nextPreprod.activeStage = "idea";
        setPreprod(nextPreprod);
        setSections(data.sections || flattenSections(nextPreprod, brief));
        setStage("result");
        setActiveStage("idea");
        // После частичной сборки (что-то Groq не успела) оставляем resume
        // включённым: «Перегенерировать» догонит только недостающие разделы.
        // Частичная сборка — не ошибка, но сказать о ней надо.
        if (data.partial && Array.isArray(data.warnings) && data.warnings.length > 0) {
          setResumeAfterFailure(true);
          setNotice(data.warnings.join(" "));
        } else {
          setResumeAfterFailure(false);
        }
      } else {
        setPreprod((prev) => {
          if (!prev) return prev;
          const next = { ...prev, [stg]: data.data } as PreProduction;
          next.updatedAt = Date.now();
          setSections(flattenSections(next, brief));
          return next;
        });
      }
      setSaved(false);
    } catch (e: any) {
      // Не подменяем ответ режиссёра локальной заготовкой: в pro-режиме
      // пользователь должен либо получить персональный результат Groq, либо
      // увидеть ошибку и повторить запрос с заполненным брифом.
      setError("Не удалось связаться с AI Director. Проверьте ключ Groq и попробуйте ещё раз.");
      if (stg === "full") {
        setStage("brief");
        setResumeAfterFailure(true);
      }
    } finally {
      timers.forEach(clearTimeout);
      setBusyStage(null);
    }
  };

  // В pro-режиме генерацию запускает только кнопка после заполнения брифа.
  // Раньше она срабатывала уже после первых четырёх полей и отправляла Groq
  // неполный контекст; оставшиеся ответы заменялись общими заготовками.

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

  useEffect(() => {
    if (!preprod || !sections) return;
    const t = setTimeout(() => {
      persistPlan();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preprod, activeStage, brief]);

  const goToEditor = async () => {
    try {
      if (preprod && sections) await persistPlan();
    } catch {
      /* persistPlan already shows error */
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
    <div className="surface-card rounded-[20px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-100">
            <Icon name="clipboard" size={15} className="text-violet-300" />
            Brief
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Несколько слов о проекте — остальное сделает режиссёр.</p>
        </div>
        <span className="badge badge-muted">{filledCount}/8</span>
      </div>

      <div className="space-y-3.5">
        <Field label="Идея">
          <textarea
            value={brief.idea}
            onChange={(e) => set("idea", e.target.value)}
            placeholder="О чём ролик, что происходит в кадре."
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>
        <Field label="Цель">
          <input value={brief.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Что зритель должен сделать / почувствовать?" className={inputCls} />
        </Field>
        <Field label="Аудитория">
          <input value={brief.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Кто смотрит: возраст, боли, интересы." className={inputCls} />
        </Field>
        <Field label="Ключевая мысль">
          <input value={brief.keyMessage} onChange={(e) => set("keyMessage", e.target.value)} placeholder="Одна фраза, которую зритель запомнит." className={inputCls} />
        </Field>
        <Field label="CTA">
          <input value={brief.callToAction} onChange={(e) => set("callToAction", e.target.value)} placeholder="Подписаться / оставить заявку / перейти по ссылке…" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Платформа">
            <select
              value={brief.platform}
              onChange={(e) => {
                const v = e.target.value;
                set("platform", v);
                // При смене площадки подставляем подходящую длительность (если
                // пользователь ещё не выбирал свою или переключился на кино-формат).
                if (PLATFORM_DEFAULT_DURATION[v]) set("duration", PLATFORM_DEFAULT_DURATION[v]);
              }}
              className={`${inputCls} appearance-none`}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p} className="bg-[#0c0c16]">{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Длина, сек">
            <select value={brief.duration} onChange={(e) => set("duration", e.target.value)} className={`${inputCls} appearance-none`}>
              {DURATIONS.map((d) => (
                <option key={d} value={d} className="bg-[#0c0c16]">{d}с</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Стиль">
            <input value={brief.style} onChange={(e) => set("style", e.target.value)} placeholder="Динамичный / спокойный…" className={inputCls} />
          </Field>
          <Field label="Настроение">
            <input value={brief.mood} onChange={(e) => set("mood", e.target.value)} placeholder="Тёплое, драйвовое…" className={inputCls} />
          </Field>
        </div>

        <Field label="Темп">
          <div className="flex flex-wrap gap-1.5">
            {TEMPOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("tempo", t)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  brief.tempo === t
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-100"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Референсы">
          <input value={brief.references} onChange={(e) => set("references", e.target.value)} placeholder="Ролики или фильмы, на которые хотите быть похожи." className={inputCls} />
        </Field>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">{error}</div>
      )}

      {notice && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">{notice}</div>
      )}

      <button
        onClick={() => generate("full")}
        disabled={!canGenerate}
        className={`btn btn-primary mt-5 h-11 w-full text-sm ${stage === "generating" ? "is-loading" : ""}`}
      >
        {stage === "generating" ? (
          "Режиссёр работает…"
        ) : (
          <>
            <Icon name="clapper" size={16} />
            Запустить AI Director
          </>
        )}
      </button>
    </div>
  );

  const emptyState = (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.015] p-10 text-center">
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
        <Icon name="clapper" size={30} strokeWidth={1.5} />
      </div>
      <h3 className="title mb-2 text-lg">Расскажите о проекте</h3>
      <p className="max-w-md text-[13px] leading-relaxed text-slate-400">
        Заполните бриф слева — и режиссёр соберёт логлайн, тритмент, сценарий,
        раскадровку и шот-лист. Без форм и вкладок, без повторных вопросов.
      </p>
    </div>
  );

  const generating = (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.015] p-10 text-center">
      <div className="relative mb-7 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-violet-400" style={{ animationDuration: "1.4s" }} />
        <div className="absolute inset-2 animate-spin rounded-full border border-transparent border-b-violet-500/50" style={{ animationDuration: "2.2s", animationDirection: "reverse" }} />
        <span className="text-violet-200">
          <Icon name="clapper" size={30} strokeWidth={1.5} />
        </span>
      </div>
      <h3 className="title mb-1.5 text-base">Режиссёр работает</h3>
      <p className="max-w-sm text-[13px] text-slate-400">{progressMsg || "Проектирую кадры…"}</p>
      <div className="mt-5 h-1 w-56 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full w-full origin-left animate-shimmer rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />
      </div>
    </div>
  );

  const resultPanel = preprod && sections && (
    <div className="space-y-5">
      <div className="surface-card relative overflow-hidden rounded-[20px] p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-violet-600/20 blur-[80px]" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Препродакшен</div>
            <h2 className="title mt-1 truncate text-lg">
              {preprod.treatment.title || brief.idea || "Production Book"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-primary">{readiness}%</span>
            {saved && (
              <span className="badge badge-ok">
                <Icon name="check" size={11} />
                Сохранено
              </span>
            )}
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-300">{preprod.logline.primary}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {brief.platform && <Chip>{brief.platform}</Chip>}
          {brief.duration && <Chip>{brief.duration}с</Chip>}
          {brief.tempo && <Chip>{brief.tempo}</Chip>}
          {brief.mood && <Chip>{brief.mood}</Chip>}
          {preprod.treatment.genre && <Chip>{preprod.treatment.genre}</Chip>}
        </div>
      </div>

      {busyStage && (
        <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-100">
          Перестраиваю раздел «{busyStage}» с учётом правок…
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
          {notice}
        </div>
      )}

      <StageComponent
        brief={brief}
        preprod={preprod}
        updatePreprod={updatePreprod}
        onRegenerate={(s) => generate(s)}
        busy={busyStage !== null}
      />

      <div className="surface-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={() => generate("full")}
            disabled={busyStage !== null}
            className="btn btn-ghost px-4 py-2 text-[11px]"
          >
            <Icon name="refresh" size={13} />
            Перегенерировать
          </button>
          <button
            onClick={persistPlan}
            className="btn btn-ghost px-4 py-2 text-[11px]"
          >
            <Icon name="save" size={13} />
            {saved ? "Сохранено" : "Сохранить"}
          </button>
        </div>
        <button
          onClick={() => void goToEditor()}
          className="btn btn-primary px-5 py-2 text-[11px]"
        >
          В редактор
          <Icon name="arrow-right" size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#07070f] text-slate-100 selection:bg-violet-500/30">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-[#080814] via-[#07070f] to-[#0a0a16]" />
        <div className="absolute -left-40 -top-32 h-[520px] w-[520px] rounded-full bg-violet-800/20 blur-[130px]" />
        <div className="absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-violet-900/10 blur-[140px]" />
        <div className="absolute bottom-[-20%] left-1/3 h-[480px] w-[480px] rounded-full bg-violet-950/20 blur-[150px]" />
      </div>

      {mode === "pro" && stage === "result" && preprod && (
        <PreprodControlBar
          activeStage={activeStage}
          onStageChange={setActiveStage}
        />
      )}

      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#07070f]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <ModeSwitcher mode={mode} onChange={switchMode} />
          <Logo size={34} href="/" />
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[220px] truncate rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] font-medium text-slate-400 md:block">
              {project?.title || brief.idea || "Новый проект"}
            </span>
            {stage === "result" && (
              <button
                onClick={() => void goToEditor()}
                className="btn btn-primary h-8 px-4 text-[11px]"
              >
                Редактор
                <Icon name="arrow-right" size={13} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        {mode === "basic" ? (
          <>
            <div className="mb-6">
              <h1 className="title text-3xl sm:text-4xl">
                <span className="text-gradient">AI Director</span>
              </h1>
              <p className="mt-1 max-w-xl text-sm text-slate-400">
                Режиссёр ведёт вас через проект и сам собирает Production Blueprint.
              </p>
            </div>

            {!loaded ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">Загружаем проект…</div>
            ) : (
              <DirectorWizard />
            )}
          </>
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-20 space-y-4">
                {briefPanel}

                {stage === "result" && preprod && (
                  <div className="surface-card rounded-[18px] p-4">
                    <div className="eyebrow mb-2.5">Разделы</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(Object.keys(STAGE_ICONS) as PreprodStage[]).map((id) => (
                        <button
                          key={id}
                          onClick={() => setActiveStage(id)}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition ${
                            activeStage === id
                              ? "bg-violet-500/[0.18] text-violet-100 ring-1 ring-violet-400/30"
                              : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                          }`}
                        >
                          <Icon
                            name={STAGE_ICONS[id]}
                            size={14}
                            className={activeStage === id ? "text-violet-200" : "text-slate-500"}
                          />
                          {STAGE_LABELS[id]}
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
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-slate-300">
      {children}
    </span>
  );
}
