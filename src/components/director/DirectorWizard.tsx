"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  DirectorBrief,
  DirectorSections,
  PreProduction,
} from "@/lib/production";
import { flattenSections } from "@/lib/production";
import { buildOfflinePreprod } from "@/lib/brain/offlinePreprod";
import { uid } from "@/lib/id";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * CONVERSATIONAL AI Director.
 *
 * - The director asks ONE question at a time.
 * - Between answers it visibly "thinks" and re-builds every document
 *   (logline, treatment, script, vision, storyboard, shot list) in memory.
 * - After the final question it produces a full Production Blueprint via
 *   /api/director (with a silent local fallback — the user never sees it).
 * - Throughout the conversation the director remembers the whole project
 *   context (brief, docs, chat) and NEVER re-asks what's already known.
 */

type WizardPhase = "interview" | "generating" | "ready";

interface Question {
  id: "idea" | "goal" | "audience" | "platform" | "location" | "mood" | "materials";
  icon: IconName;
  ask: string;
  field: keyof DirectorBrief;
  chips?: string[];
  placeholder: string;
}

const QUESTIONS: Question[] = [
  {
    id: "idea",
    icon: "lightbulb",
    ask: "О чём ролик?",
    field: "idea",
    placeholder: "Например: показываю, как за 3 шага приготовить кофе как в кофейне…",
  },
  {
    id: "goal",
    icon: "target",
    ask: "Что должно произойти после просмотра?",
    field: "goal",
    chips: ["Продажи / заявки", "Подписчики", "Обучение", "Вдохновение", "Развлечение"],
    placeholder: "Например: зритель должен захотеть попробовать рецепт и подписаться…",
  },
  {
    id: "audience",
    icon: "casting",
    ask: "Для кого снимаем?",
    field: "audience",
    chips: ["Молодёжь 16–25", "Взрослые 25–45", "Бизнес / B2B", "Широкая аудитория"],
    placeholder: "Например: девушки 20–35, любят эстетичные ролики и кофе…",
  },
  {
    id: "platform",
    icon: "monitor",
    ask: "Куда выложим?",
    field: "platform",
    chips: ["TikTok", "Reels / Shorts", "YouTube", "VK Клипы", "Презентация"],
    placeholder: "Например: TikTok и Reels…",
  },
  {
    id: "location",
    icon: "map-pin",
    ask: "Где происходит действие?",
    field: "location",
    chips: ["Улица / город", "Дом / интерьер", "Офис", "Студия", "Природа"],
    placeholder: "Например: кухня с окном на рассвете…",
  },
  {
    id: "mood",
    icon: "sparkles",
    ask: "Какое настроение у ролика?",
    field: "mood",
    chips: ["Драйв", "Тепло и уют", "Ностальгия", "Вдохновение", "Юмор"],
    placeholder: "Например: тёплое утреннее, чуть с юмором…",
  },
  {
    id: "materials",
    icon: "film",
    ask: "Материалы уже есть?",
    field: "materials",
    chips: ["Да, съёмка есть", "Сниму сам(а)", "Возьму стоки", "Частично есть"],
    placeholder: "Например: есть 3 видео с телефона, музыки нет…",
  },
];

const PLATFORM_DURATION: Record<string, string> = {
  TikTok: "30",
  "Reels / Shorts": "30",
  YouTube: "60",
  "VK Клипы": "30",
  Презентация: "60",
};

const THINKING_STATUSES = [
  "Анализирую идею…",
  "Подбираю драматургию…",
  "Строю концепцию…",
  "Собираю кадры…",
  "Думаю над монтажом…",
  "Готовлю Blueprint…",
];

const emptyBrief = (): DirectorBrief => ({
  idea: "", goal: "", audience: "", platform: "", duration: "30",
  style: "", mood: "", tempo: "Средний", references: "", keyMessage: "",
  callToAction: "", location: "", materials: "",
});

const short = (text: string, n: number) =>
  text.length > n ? text.slice(0, n - 1).trim() + "…" : text;

function mergeRebuild(current: PreProduction | null, fresh: PreProduction, chat: ChatMessage[]): PreProduction {
  const next: PreProduction = { ...fresh, chat: [...chat] };
  if (current) {
    if (current.casting.some((c) => c.photoDataUrl)) next.casting = current.casting;
    if (current.locations.some((l) => l.photoDataUrl)) next.locations = current.locations;
  }
  return next;
}

function ackFor(q: Question, answer: string, brief: DirectorBrief): string {
  const a = short(answer, 70);
  switch (q.id) {
    case "idea":
      return `Фиксирую: «${a}». Уже вижу дугу — проблема, решение, payoff.`;
    case "goal":
      return `Принял: ${a}. Значит, каждый кадр буду строить так, чтобы он вёл к этому результату.`;
    case "audience":
      return `Аудитория: ${a}. Интонация, темп и визуальный язык подстроятся под этого зрителя.`;
    case "platform":
      return `${a}. Формат кадра, хронометраж и темп монтажа — под платформу.`;
    case "location":
      return `Локация «${a}». Уже прикидываю свет, звук и ракурсы.`;
    case "mood":
      return `Настроение «${a}». Палитра, музыка и ритм будут держать эту эмоцию.`;
    case "materials":
      return `Принял по материалам. ${brief.tempo === "Быстрый" ? "Шот-лист" : "Шот-лист"} подстрою под то, что у тебя уже есть.`;
  }
  return "Принял.";
}

interface Props {
  projectTitle: string;
  initialBrief: DirectorBrief;
  initialPreprod: PreProduction | null;
  onBlueprint: (preprod: PreProduction, sections: DirectorSections, brief: DirectorBrief) => void;
  onGoToEditor: () => void;
  onOpenPro: () => void;
}

export default function DirectorWizard({
  projectTitle,
  initialBrief,
  initialPreprod,
  onBlueprint,
  onGoToEditor,
  onOpenPro,
}: Props) {
  const [phase, setPhase] = useState<WizardPhase>(() =>
    initialPreprod && initialPreprod.logline?.primary ? "ready" : "interview"
  );
  const [brief, setBrief] = useState<DirectorBrief>({ ...emptyBrief(), ...initialBrief });
  const [chat, setChat] = useState<ChatMessage[]>(() =>
    phase === "ready" && initialPreprod?.chat?.length
      ? initialPreprod.chat
      : [
          {
            id: uid("m"),
            role: "director",
            text: "Здравствуйте. Я — ваш режиссёр. Задам несколько коротких вопросов, потом соберу весь Production Blueprint: логлайн, тритмент, сценарий, кадры и шот-лист. Начнём.",
            at: Date.now(),
          },
        ]
  );
  const [preprod, setPreprod] = useState<PreProduction | null>(initialPreprod);
  const [qIndex, setQIndex] = useState(() => (initialBrief.idea.trim() ? 1 : 0));
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [statusIndex, setStatusIndex] = useState(-1);
  const [statusDone, setStatusDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const chatRef = useRef<ChatMessage[]>(chat);
  const briefRef = useRef<DirectorBrief>(brief);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatRef.current = chat; }, [chat]);
  useEffect(() => { briefRef.current = brief; }, [brief]);

  const question = QUESTIONS[qIndex] ?? null;
  const isLastQuestion = qIndex === QUESTIONS.length - 1;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, thinking, statusIndex, phase]);

  const addMsg = useCallback((m: ChatMessage) => {
    setChat((prev) => [...prev, m]);
  }, []);

  const runStatuses = useCallback((stepMs: number, onDone: () => void): (() => void) => {
    setStatusIndex(0);
    setStatusDone(false);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      if (i >= THINKING_STATUSES.length) {
        clearInterval(t);
        setStatusIndex(THINKING_STATUSES.length - 1);
        onDone();
      } else {
        setStatusIndex(i);
      }
    }, stepMs);
    return () => clearInterval(t);
  }, []);

  const showThinking = useCallback(
    (stepMs: number, work: () => void) => {
      setThinking(true);
      const clear = runStatuses(stepMs, () => {
        setStatusDone(true);
        try { work(); } finally { setThinking(false); }
      });
      return clear;
    },
    [runStatuses]
  );

  const generateBlueprint = useCallback(
    async (currentBrief: DirectorBrief, currentChat: ChatMessage[]) => {
      setPhase("generating");
      setBusy(true);
      setError("");
      setStatusIndex(0);
      setStatusDone(false);
      const started = Date.now();
      let i = 0;
      const timer = setInterval(() => {
        i += 1;
        setStatusIndex(Math.min(i, THINKING_STATUSES.length - 1));
      }, 900);

      try {
        const res = await fetch("/api/director", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brief: currentBrief,
            projectTitle,
            mode: "full",
            stage: undefined,
            preprod: null,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "error");

        const nextPreprod: PreProduction = data.preprod || buildOfflinePreprod(currentBrief);
        const doneMsg: ChatMessage = {
          id: uid("m"),
          role: "director",
          text: "Готово. Логлайн, тритмент, сценарий, видение, раскадровка и шот-лист собраны. Можно переходить в монтаж — или продолжить разговор: я помню проект и подправлю любую часть.",
          at: Date.now(),
        };
        const finalChat = [...currentChat, doneMsg];
        nextPreprod.chat = finalChat;
        const sections: DirectorSections = data.sections || flattenSections(nextPreprod, currentBrief);

        const elapsed = Date.now() - started;
        const minWait = THINKING_STATUSES.length * 650;
        if (elapsed < minWait) await new Promise((r) => setTimeout(r, minWait - elapsed));

        setStatusDone(true);
        setPreprod(nextPreprod);
        setChat(finalChat);
        setPhase("ready");
        onBlueprint(nextPreprod, sections, currentBrief);
      } catch {
        // Local engine takes over — user never sees it.
        const local = buildOfflinePreprod(currentBrief);
        const finalChat: ChatMessage[] = [
          ...currentChat,
          {
            id: uid("m"),
            role: "director",
            text: "Готово. Логлайн, тритмент, сценарий, видение, раскадровка и шот-лист собраны. Можно переходить в монтаж или продолжить разговор.",
            at: Date.now(),
          },
        ];
        local.chat = finalChat;
        const sections = flattenSections(local, currentBrief);
        setStatusDone(true);
        setPreprod(local);
        setChat(finalChat);
        setPhase("ready");
        onBlueprint(local, sections, currentBrief);
      } finally {
        clearInterval(timer);
        setBusy(false);
      }
    },
    [onBlueprint, projectTitle]
  );

  const handleAnswer = useCallback(
    (raw: string) => {
      const answer = raw.trim();
      if (!answer || busy) return;
      const q = question;
      if (!q) return;
      setInput("");

      addMsg({ id: uid("m"), role: "user", text: answer, at: Date.now() });

      const nextBrief: DirectorBrief = { ...briefRef.current, [q.field]: answer };
      if (q.id === "platform") {
        if (PLATFORM_DURATION[answer]) nextBrief.duration = PLATFORM_DURATION[answer];
      }
      if (q.id === "mood") nextBrief.tempo = answer === "Драйв" ? "Быстрый" : "Средний";
      briefRef.current = nextBrief;
      setBrief(nextBrief);

      const ack: ChatMessage = {
        id: uid("m"),
        role: "director",
        text: ackFor(q, answer, nextBrief),
        at: Date.now(),
      };

      showThinking(420, () => {
        const fresh = buildOfflinePreprod(nextBrief);
        const merged = mergeRebuild(preprod, fresh, chatRef.current);
        setPreprod(merged);
        addMsg(ack);
        if (isLastQuestion) {
          void generateBlueprint(nextBrief, [...chatRef.current, ack]);
        } else {
          setQIndex((i) => i + 1);
        }
      });
    },
    [addMsg, busy, generateBlueprint, isLastQuestion, preprod, question, showThinking]
  );

  const restart = useCallback(() => {
    const kept = briefRef.current.idea;
    const nb = { ...emptyBrief(), idea: kept };
    briefRef.current = nb;
    setBrief(nb);
    setPreprod(null);
    setPhase("interview");
    setQIndex(kept.trim() ? 1 : 0);
    setError("");
    setChat([
      {
        id: uid("m"),
        role: "director",
        text: kept.trim()
          ? `Давайте уточним остальное. Идею «${short(kept, 60)}» я держу в голове.`
          : "Начнём заново. О чём ролик?",
        at: Date.now(),
      },
    ]);
  }, []);

  const interactive = phase === "interview" && !thinking;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-7">
        <div className="surface-card flex h-full min-h-[560px] flex-col overflow-hidden rounded-[20px]">
          <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(180deg,#8b7cff,#5c4bd8)", boxShadow: "0 6px 18px -4px rgba(124,108,246,0.5)" }}
            >
              <Icon name="clapper" size={18} strokeWidth={1.6} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold tracking-tight text-slate-100">AI Director</div>
              <div className="text-[10px] text-slate-500">
                {phase === "ready" ? "Blueprint готов" : phase === "generating" ? "Собирает Blueprint…" : "Режиссёр ведёт проект"}
              </div>
            </div>
            {phase === "ready" && (
              <span className="badge badge-ok">
                <Icon name="check" size={11} />
                Готово
              </span>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
            {chat.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-[#6d5cf0] to-[#5c4bd8] text-white"
                      : "border border-white/10 bg-white/[0.04] text-slate-200"
                  }`}
                >
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

            {(thinking || phase === "generating") && (
              <div className="flex justify-start">
                <div className="w-full max-w-[85%] rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/30 to-[#12121f]/80 px-4 py-3 shadow-sm">
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-violet-300">
                    {phase === "generating" ? "Собираю Production Blueprint" : "Обдумываю ответ"}
                  </div>
                  <LiveStatusList items={THINKING_STATUSES} current={statusIndex} done={statusDone} />
                </div>
              </div>
            )}

            {phase === "interview" && question && !thinking && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-sm">
                  <div className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-violet-300/90">
                    <Icon name="compass" size={10} />
                    Режиссёр
                  </div>
                  <div className="flex items-start gap-2 text-[13px] font-semibold leading-relaxed text-slate-100">
                    <Icon name={question.icon} size={15} className="mt-0.5 shrink-0 text-violet-300" />
                    {question.ask}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.06] p-3">
            {error && (
              <div className="mb-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
                {error}
              </div>
            )}
            {phase === "interview" ? (
              <>
                {question?.chips && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {question.chips.map((c) => (
                      <button
                        key={c}
                        disabled={!interactive}
                        onClick={() => void handleAnswer(c)}
                        className="chip hover:!border-violet-400/40 hover:!bg-violet-500/10 hover:!text-violet-100 disabled:opacity-40"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleAnswer(input);
                      }
                    }}
                    rows={1}
                    placeholder={question?.placeholder || "Ваш ответ…"}
                    className="input flex-1 resize-none !py-3 !text-[13px]"
                  />
                  <button
                    onClick={() => void handleAnswer(input)}
                    disabled={!input.trim() || !interactive}
                    aria-label="Отправить"
                    className="btn btn-primary h-11 w-11 !rounded-xl !p-0 disabled:opacity-40"
                  >
                    <Icon name="arrow-up-right" size={17} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-600">
                  <span>Вопрос {Math.min(qIndex + 1, QUESTIONS.length)} из {QUESTIONS.length}</span>
                  {qIndex > 0 && (
                    <button
                      onClick={() => setQIndex((i) => Math.max(0, i - 1))}
                      disabled={!interactive}
                      className="font-semibold text-slate-500 hover:text-slate-300 disabled:opacity-40"
                    >
                      ← Назад
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                <div className="text-[12px] text-slate-400">
                  {phase === "generating"
                    ? "Собираю логлайн, тритмент, сценарий, кадры и шот-лист…"
                    : "Интервью завершено. Можно переходить в монтаж или в детальный рабочий стол."}
                </div>
                {phase === "ready" && (
                  <button
                    onClick={restart}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.07]"
                  >
                    Пройти заново
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="lg:col-span-5">
        {phase === "ready" && preprod ? (
          <BlueprintReady preprod={preprod} brief={brief} onGoToEditor={onGoToEditor} onOpenPro={onOpenPro} onRestart={restart} />
        ) : (
          <div className="space-y-4">
            <div className="surface-card rounded-[18px] p-5">
              <div className="eyebrow mb-2.5">Как это работает</div>
              <ul className="space-y-2 text-[12px] leading-relaxed text-slate-400">
                <li>Режиссёр задаёт один вопрос за раз — как на питчинге.</li>
                <li>После каждого ответа он сразу обновляет все документы проекта.</li>
                <li>В конце вы получаете готовый Production Blueprint и можете перейти в монтаж.</li>
                <li>Любой этап потом можно открыть и доработать в профессиональном режиме.</li>
              </ul>
            </div>
            <div className="surface-card rounded-[18px] p-5">
              <div className="eyebrow mb-2.5">Уже знаю</div>
              <div className="space-y-1.5">
                {(["idea","goal","audience","platform","location","mood"] as const).map((k) => {
                  const labels: Record<string,string> = { idea:"Идея", goal:"Цель", audience:"Аудитория", platform:"Платформа", location:"Локация", mood:"Настроение" };
                  const v = (brief as any)[k];
                  if (!v || !v.trim()) return null;
                  return (
                    <div key={k} className="flex items-center gap-2 text-[12px]">
                      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{labels[k]}</span>
                      <span className="truncate rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-slate-300" title={v}>
                        {short(v, 40)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function BlueprintReady({
  preprod,
  brief,
  onGoToEditor,
  onOpenPro,
  onRestart,
}: {
  preprod: PreProduction;
  brief: DirectorBrief;
  onGoToEditor: () => void;
  onOpenPro: () => void;
  onRestart: () => void;
}) {
  const readiness = useMemo(() => {
    const keys: Array<keyof PreProduction> = [
      "idea","logline","treatment","script","vision","storyboard","shotlist","planning","casting","locations","risks",
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
        else if (key === "script" && v.scenes?.length) done++;
        else if (key === "vision" && v.scenes?.length) done++;
        else if (key === "storyboard" && v.frames?.length) done++;
        else if (key === "shotlist" && v.shots?.length) done++;
        else if (key === "planning" && v.schedule?.length) done++;
        else if (key === "risks" && v.risks?.length) done++;
      }
    }
    if (preprod.casting.length) done++;
    if (preprod.locations.length) done++;
    return Math.round((done / keys.length) * 100);
  }, [preprod]);

  return (
    <div className="space-y-4">
      <div className="surface-card relative overflow-hidden rounded-[20px] p-5">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-violet-600/20 blur-[80px]" />
        <div className="relative flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="eyebrow">Production Blueprint</div>
            <h2 className="title mt-1 truncate text-lg">{preprod.treatment.title || brief.idea || "Проект"}</h2>
          </div>
          <span className="badge badge-primary">{readiness}%</span>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-slate-300">{preprod.logline.primary}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {brief.platform && <Chip>{brief.platform}</Chip>}
          {brief.duration && <Chip>{brief.duration}с</Chip>}
          {brief.tempo && <Chip>{brief.tempo}</Chip>}
          {brief.mood && <Chip>{brief.mood}</Chip>}
          {preprod.treatment.genre && <Chip>{preprod.treatment.genre}</Chip>}
        </div>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(2, Math.min(100, readiness))}%`, background: "linear-gradient(90deg,#7c6cf6,#a78bfa)" }}
          />
        </div>

        <button onClick={onGoToEditor} className="btn btn-primary mt-5 h-11 w-full text-sm">
          Перейти в монтаж
          <Icon name="arrow-right" size={15} />
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onOpenPro}
            className="btn btn-ghost px-4 py-2 text-[11px]"
          >
            <Icon name="layout" size={13} />
            Рабочий стол
          </button>
          <button
            onClick={onRestart}
            className="btn btn-ghost px-4 py-2 text-[11px]"
          >
            <Icon name="refresh" size={13} />
            Пройти заново
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Подготовил режиссёр</div>
        <div className="grid gap-1.5">
          {[
            ["Логлайн", preprod.logline.primary ? "Герой + цель + конфликт + ставки" : ""],
            ["Treatment", preprod.treatment.synopsisLong ? "История от хука до финала" : ""],
            ["Сценарий", preprod.script.scenes.length > 0 ? `${preprod.script.scenes.length} сцен с репликами и таймингом` : ""],
            ["Режиссёрское видение", preprod.vision.scenes.length > 0 ? `Камера, свет и звук для ${preprod.vision.scenes.length} сцен` : ""],
            ["Раскадровка", preprod.storyboard.frames.length > 0 ? `${preprod.storyboard.frames.length} кадров с композицией` : ""],
            ["Шот-лист", preprod.shotlist.shots.length > 0 ? `${preprod.shotlist.shots.length} планов с приоритетами` : ""],
          ].filter(([, m]) => m).map(([title, meta]) => (
            <div key={title} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-black text-emerald-300">✓</span>
              <div className="min-w-0">
                <div className="text-[12px] font-bold text-slate-200">{title}</div>
                <div className="truncate text-[10px] text-slate-500">{meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveStatusList({ items, current, done }: { items: string[]; current: number; done: boolean }) {
  return (
    <div className="space-y-1.5">
      {items.map((label, i) => {
        const isDone = done || i < current;
        const isActive = !done && i === current;
        return (
          <div
            key={label}
            className={`flex items-center gap-2.5 text-[12px] font-semibold transition-colors ${
              isDone ? "text-emerald-300" : isActive ? "text-slate-100" : "text-slate-600"
            }`}
          >
            {isDone ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-black text-emerald-300">✓</span>
            ) : isActive ? (
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-white/15" />
            )}
            <span className={isActive ? "animate-pulse" : ""}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-slate-300">
      {children}
    </span>
  );
}
