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

/**
 * ДИАЛОГОВЫЙ РЕЖИМ AI DIRECTOR («Базовый режим»).
 *
 * Режиссёр сам ведёт пользователя шаг за шагом и не показывает внутреннюю
 * структуру препродакшена. После КАЖДОГО ответа он «думает» (живые статусы)
 * и пересобирает все документы проекта: логлайн, treatment, сценарий,
 * режиссёрскую экспликацию, storyboard, shot list, стиль монтажа,
 * рекомендации по съёмке.
 *
 * В конце режиссёр собирает полный Production Blueprint (реальный вызов AI
 * с офлайн-фоллбеком) и показывает кнопку «Перейти к монтажу».
 */

type WizardPhase = "interview" | "generating" | "ready";

interface Question {
  id: "idea" | "goal" | "audience" | "platform" | "location" | "mood" | "materials";
  icon: string;
  ask: string;
  hint?: string;
  field: keyof DirectorBrief;
  chips?: string[];
  placeholder: string;
}

const QUESTIONS: Question[] = [
  {
    id: "idea",
    icon: "💡",
    ask: "Какая идея вашего видео?",
    hint: "Расскажите своими словами — что происходит, о чём ролик.",
    field: "idea",
    placeholder: "Например: показываю, как за 3 шага приготовить кофе, как в кофейне…",
  },
  {
    id: "goal",
    icon: "🎯",
    ask: "Что должно произойти после просмотра?",
    hint: "Какая цель у видео — это определит драматургию и финал.",
    field: "goal",
    chips: ["Продажи и заявки", "Подписчики", "Обучение", "Вдохновение", "Развлечение"],
    placeholder: "Например: зритель должен захотеть попробовать рецепт и подписаться…",
  },
  {
    id: "audience",
    icon: "👥",
    ask: "Для кого снимаем?",
    hint: "Кто ваш зритель: возраст, интересы, боли.",
    field: "audience",
    chips: ["Молодёжь 16–25", "Взрослые 25–45", "Бизнес / B2B", "Широкая аудитория"],
    placeholder: "Например: девушки 20–35, любят кофе и эстетичные ролики…",
  },
  {
    id: "platform",
    icon: "📱",
    ask: "Куда пойдёт видео?",
    hint: "От платформы зависят формат кадра, темп и длина.",
    field: "platform",
    chips: ["TikTok", "Reels / Shorts", "YouTube", "VK Клипы", "Презентация"],
    placeholder: "Например: TikTok и Reels…",
  },
  {
    id: "location",
    icon: "📍",
    ask: "Где будет происходить действие?",
    hint: "Локация задаёт свет, звук и атмосферу сцены.",
    field: "location",
    chips: ["Улица / город", "Дом / интерьер", "Офис", "Студия", "Природа"],
    placeholder: "Например: кухня с окном на рассвете…",
  },
  {
    id: "mood",
    icon: "🎭",
    ask: "Какое настроение хотите получить?",
    hint: "Что зритель должен почувствовать — это определит музыку и цвет.",
    field: "mood",
    chips: ["Драйв", "Тепло и уют", "Ностальгия", "Вдохновение", "Юмор"],
    placeholder: "Например: тёплое, утреннее, чуть с юмором…",
  },
  {
    id: "materials",
    icon: "🎞️",
    ask: "Есть ли уже материалы?",
    hint: "Видео, фото или аудио, которые планируете использовать.",
    field: "materials",
    chips: ["Да, съёмка уже есть", "Сниму сам(а)", "Найду стоки", "Частично есть"],
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

/** Живые статусы, которые видит пользователь во время работы режиссёра. */
const BLUEPRINT_STATUSES = [
  "Анализирую идею…",
  "Подбираю драматургию…",
  "Строю режиссёрскую концепцию…",
  "Создаю Shot List…",
  "Продумываю монтаж…",
  "Готовлю Production Blueprint…",
];

const emptyBrief = (): DirectorBrief => ({
  idea: "",
  goal: "",
  audience: "",
  platform: "",
  duration: "",
  style: "",
  mood: "",
  tempo: "",
  references: "",
  keyMessage: "",
  callToAction: "",
  location: "",
  materials: "",
});

const short = (text: string, n: number) => (text.length > n ? text.slice(0, n - 1).trim() + "…" : text);

function readinessFor(preprod: PreProduction): number {
  const sections: Array<keyof PreProduction> = [
    "idea", "logline", "treatment", "script", "vision", "storyboard", "shotlist", "planning", "casting", "locations", "risks",
  ];
  let done = 0;
  for (const key of sections) {
    const v = (preprod as any)[key];
    if (!v) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
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
  if (preprod.casting.length > 0) done++;
  if (preprod.locations.length > 0) done++;
  return Math.round((done / sections.length) * 100);
}

/** Пересборка препродакшена из брифа; сохраняет переписку и фото кастинга/локаций. */
function mergeRebuild(current: PreProduction | null, fresh: PreProduction, chat: ChatMessage[]): PreProduction {
  const next: PreProduction = { ...fresh, chat: [...chat] };
  if (current) {
    const hasCastPhotos = current.casting.some((c) => c.photoDataUrl);
    const hasLocPhotos = current.locations.some((l) => l.photoDataUrl);
    if (hasCastPhotos) next.casting = current.casting;
    if (hasLocPhotos) next.locations = current.locations;
  }
  return next;
}

function ackFor(q: Question, answer: string): string {
  const a = short(answer, 70);
  switch (q.id) {
    case "idea":
      return `Отлично, «${a}» — в этом есть зерно. Фиксирую замысел и уже вижу драматургию: хук, развитие, точку. Обновляю документы.`;
    case "goal":
      return `Понял: цель — ${a}. Теперь весь сценарий выстрою так, чтобы каждый кадр работал на этот результат.`;
    case "audience":
      return `Аудитория — ${a}. Буду держать её в голове: интонация, темп и визуальный язык подстраиваются под зрителя.`;
    case "platform":
      return `${a} — принял. Задаю формат кадра, хронометраж и темп монтажа под платформу.`;
    case "location":
      return `Локация «${a}» — отлично. Уже подбираю свет, звук и ракурсы под это пространство.`;
    case "mood":
      return `Настроение «${a}» — понял. Подбираю палитру, музыку и ритм монтажа под эту эмоцию.`;
    case "materials":
      if (/съёмка|есть/i.test(answer)) return "Замечательно — файлы можно будет добавить прямо в редакторе. Отмечу это в плане.";
      if (/сниму/i.test(answer)) return "Тогда shot list и рекомендации по съёмке будут особенно полезны. Отмечаю в плане.";
      return "Принял. Учту это при планировании — стоки и генерация тоже рабочие варианты.";
  }
}

interface DirectorWizardProps {
  projectTitle: string;
  initialBrief: DirectorBrief;
  initialPreprod: PreProduction | null;
  onBlueprint: (preprod: PreProduction, sections: DirectorSections, brief: DirectorBrief, isFallback: boolean) => void;
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
}: DirectorWizardProps) {
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
            text: "🎬 Здравствуйте! Я — AI Director, ваш виртуальный режиссёр. Я задам несколько вопросов, а затем сам соберу логлайн, treatment, сценарий, режиссёрскую экспликацию, раскадровку, shot list и план монтажа. Начнём?",
            at: Date.now(),
          },
        ]
  );
  const [preprod, setPreprod] = useState<PreProduction | null>(initialPreprod);
  const [qIndex, setQIndex] = useState(0);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [statusIndex, setStatusIndex] = useState(-1);
  const [statusDone, setStatusDone] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const chatRef = useRef<ChatMessage[]>(chat);
  const briefRef = useRef<DirectorBrief>(brief);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Актуальные значения для обработчиков (в render ref'ы не трогаем).
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);
  useEffect(() => {
    briefRef.current = brief;
  }, [brief]);

  const question = QUESTIONS[qIndex] ?? null;
  const isLastQuestion = qIndex === QUESTIONS.length - 1;

  // Прокрутка чата вниз при новых сообщениях/статусах.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.length, thinking, statusIndex, phase]);

  const addMsg = useCallback((m: ChatMessage) => {
    setChat((prev) => [...prev, m]);
  }, []);

  /** Статусы «режиссёр думает»: шагаем по списку с заданной скоростью. */
  const runStatuses = useCallback((dwellMs: number, onDone: () => void): (() => void) => {
    setStatusIndex(0);
    setStatusDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i >= BLUEPRINT_STATUSES.length) {
        clearInterval(timer);
        setStatusIndex(BLUEPRINT_STATUSES.length - 1);
        onDone();
      } else {
        setStatusIndex(i);
      }
    }, dwellMs);
    return () => clearInterval(timer);
  }, []);

  const showAnalyzing = useCallback(
    (dwellMs: number, work: () => void) => {
      setThinking(true);
      const clear = runStatuses(dwellMs, () => {
        setStatusDone(true);
        try {
          work();
        } finally {
          setThinking(false);
        }
      });
      return clear;
    },
    [runStatuses]
  );

  /** Полная генерация Production Blueprint через существующий /api/director. */
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
        setStatusIndex(Math.min(i, BLUEPRINT_STATUSES.length - 1));
      }, 1400);

      const readyMsg = (fallbackMode: boolean): ChatMessage => ({
        id: uid("m"),
        role: "director",
        text: `Готово! Production Blueprint собран: логлайн, treatment, сценарий, режиссёрская экспликация, раскадровка, shot list и план монтажа — всё связано между собой${
          fallbackMode ? " (офлайн-режим: модель недоступна, план построен локально)" : ""
        }. Можно переходить к монтажу.`,
        at: Date.now(),
      });

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
        if (!res.ok || data.error) throw new Error(data.error || "Не удалось получить ответ от AI Director.");

        const nextPreprod: PreProduction = data.preprod || buildOfflinePreprod(currentBrief);
        const finalChat = [...currentChat, readyMsg(!!data.fallback)];
        nextPreprod.chat = finalChat;
        const sections: DirectorSections = data.sections || flattenSections(nextPreprod, currentBrief);
        // Минимальная пауза, чтобы пользователь увидел все статусы.
        const elapsed = Date.now() - started;
        if (elapsed < BLUEPRINT_STATUSES.length * 900) {
          await new Promise((r) => setTimeout(r, BLUEPRINT_STATUSES.length * 900 - elapsed));
        }
        setStatusDone(true);
        setPreprod(nextPreprod);
        setChat(finalChat);
        setIsFallback(!!data.fallback);
        setPhase("ready");
        onBlueprint(nextPreprod, sections, currentBrief, !!data.fallback);
      } catch (e: any) {
        setError("Ошибка сети: " + (e.message || ""));
        const fallback = buildOfflinePreprod(currentBrief);
        const fallbackChat: ChatMessage[] = [
          ...currentChat,
          {
            id: uid("m"),
            role: "director",
            text: "Связь с моделью прервалась, но я собрал Production Blueprint локально — он полностью рабочий. Можно переходить к монтажу.",
            at: Date.now(),
          },
        ];
        fallback.chat = fallbackChat;
        const sections = flattenSections(fallback, currentBrief);
        setStatusDone(true);
        setPreprod(fallback);
        setChat(fallbackChat);
        setIsFallback(true);
        setPhase("ready");
        onBlueprint(fallback, sections, currentBrief, true);
      } finally {
        clearInterval(timer);
        setBusy(false);
      }
    },
    [onBlueprint, projectTitle]
  );

  /** Обработка ответа: сообщение → «анализ» со статусами → пересборка документов → следующий вопрос. */
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
        const dur = PLATFORM_DURATION[answer];
        if (dur) nextBrief.duration = dur;
        if (answer === "YouTube") nextBrief.platform = "YouTube";
      }
      if (q.id === "mood") nextBrief.tempo = answer === "Драйв" ? "Быстрый" : "Средний";
      briefRef.current = nextBrief;
      setBrief(nextBrief);

      const ackMsg: ChatMessage = { id: uid("m"), role: "director", text: ackFor(q, answer), at: Date.now() };

      // Режиссёр «анализирует мысль» — короткий прогон живых статусов,
      // затем пересборка всех документов проекта из обновлённого брифа.
      showAnalyzing(430, () => {
        const fresh = buildOfflinePreprod(nextBrief);
        const merged = mergeRebuild(preprod, fresh, chatRef.current);
        setPreprod(merged);
        addMsg(ackMsg);
        // Документы обновлены: логлайн, treatment, сценарий, экспликация,
        // storyboard, shot list, стиль монтажа, рекомендации по съёмке.
        if (isLastQuestion) {
          void generateBlueprint(nextBrief, [...chatRef.current, ackMsg]);
        } else {
          setQIndex((i) => i + 1);
        }
      });
    },
    [addMsg, busy, generateBlueprint, isLastQuestion, preprod, question, showAnalyzing]
  );

  const restartInterview = useCallback(() => {
    const keptIdea = briefRef.current.idea;
    const nextBrief = { ...emptyBrief(), idea: keptIdea };
    briefRef.current = nextBrief;
    setBrief(nextBrief);
    setPreprod(null);
    setPhase("interview");
    setQIndex(keptIdea.trim() ? 1 : 0);
    setError("");
    setChat([
      {
        id: uid("m"),
        role: "director",
        text: keptIdea.trim()
          ? `Давайте пройдёмся заново. Идею «${short(keptIdea, 60)}» я сохранил — уточним остальное.`
          : "Давайте начнём заново. Какая идея вашего видео?",
        at: Date.now(),
      },
    ]);
  }, []);

  const interactive = phase === "interview" && !thinking;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Чат с режиссёром */}
      <section className="lg:col-span-7">
        <div className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center gap-3 border-b border-white/[0.07] bg-gradient-to-r from-violet-950/40 via-transparent to-amber-950/20 px-5 py-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-xl shadow-xl shadow-violet-900/40">
              🎬
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold tracking-tight text-slate-100">AI Director</div>
              <div className="text-[10px] text-slate-500">
                {phase === "ready" ? "Production Blueprint готов" : phase === "generating" ? "Собирает Production Blueprint…" : "Ведёт интервью"}
              </div>
            </div>
            {phase === "ready" && (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-300">
                ✓ Blueprint готов
              </span>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
            {chat.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-lg ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white"
                      : "border border-white/10 bg-white/[0.04] text-slate-200"
                  }`}
                >
                  {m.role === "director" && (
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                      🎬 AI Director
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}

            {/* Живые статусы работы режиссёра */}
            {(thinking || phase === "generating") && (
              <div className="flex justify-start">
                <div className="w-full max-w-[85%] rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/40 to-[#12121f]/90 px-4 py-3.5 shadow-xl">
                  <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                    {phase === "generating" ? "🎬 Режиссёр собирает Production Blueprint" : "Анализирую ваш ответ…"}
                  </div>
                  <LiveStatusList items={BLUEPRINT_STATUSES} current={statusIndex} done={statusDone} />
                </div>
              </div>
            )}

            {phase === "interview" && question && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 shadow-lg">
                  <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                    🎬 AI Director
                  </div>
                  <div className="text-[13px] font-semibold leading-relaxed text-slate-100">
                    {question.icon} {question.ask}
                  </div>
                  {question.hint && <div className="mt-0.5 text-[11px] text-slate-500">{question.hint}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Поле ввода */}
          <div className="border-t border-white/[0.07] p-4">
            {error && (
              <div className="mb-2.5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                {error} — план собран локально, всё работает.
              </div>
            )}
            {phase === "interview" ? (
              <>
                {question?.chips && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {question.chips.map((c) => (
                      <button
                        key={c}
                        disabled={!interactive}
                        onClick={() => void handleAnswer(c)}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-100 disabled:opacity-40"
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
                    rows={2}
                    placeholder={question?.placeholder || "Ответьте режиссёру…"}
                    className="flex-1 resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-[13px] text-slate-100 outline-none transition focus:border-violet-400/50"
                  />
                  <button
                    onClick={() => void handleAnswer(input)}
                    disabled={!input.trim() || !interactive}
                    className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:opacity-40"
                  >
                    {thinking ? "…" : "Отправить"}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">
                    Вопрос {Math.min(qIndex + 1, QUESTIONS.length)} из {QUESTIONS.length}
                  </span>
                  {qIndex > 0 && (
                    <button onClick={() => setQIndex((i) => Math.max(0, i - 1))} disabled={!interactive} className="text-[10px] font-semibold text-slate-500 hover:text-slate-300 disabled:opacity-40">
                      ← Назад
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
                <div className="text-[12px] text-slate-400">
                  {phase === "generating" ? "Режиссёр собирает весь Production Blueprint — это займёт несколько секунд." : "Интервью завершено."}
                </div>
                {phase === "ready" && (
                  <button onClick={restartInterview} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.08]">
                    ♻ Пройти интервью заново
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Справа: подсказки во время интервью / Production Blueprint после генерации */}
      <aside className="lg:col-span-5">
        {phase === "ready" && preprod ? (
          <BlueprintReady
            preprod={preprod}
            brief={brief}
            isFallback={isFallback}
            onGoToEditor={onGoToEditor}
            onOpenPro={onOpenPro}
            onRestart={restartInterview}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Как работает режиссёр</div>
              <ul className="space-y-2.5">
                {[
                  ["💬", "Задаёт вопросы по одному — как на настоящем питчинге."],
                  ["🧠", "После каждого ответа анализирует мысль и пересобирает все документы."],
                  ["📚", "Логлайн, treatment, сценарий, экспликация, storyboard и shot list обновляются сами."],
                  ["🚀", "В конце соберёт Production Blueprint и отдаст его монтажному движку."],
                ].map(([icon, text]) => (
                  <li key={text} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-400">
                    <span className="mt-0.5 text-sm">{icon}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-950/30 to-amber-950/20 p-5 backdrop-blur-xl">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Что уже знаю</div>
              <div className="space-y-1.5">
                <BriefChip label="Идея" value={brief.idea} />
                <BriefChip label="Цель" value={brief.goal} />
                <BriefChip label="Аудитория" value={brief.audience} />
                <BriefChip label="Платформа" value={brief.platform} />
                <BriefChip label="Локация" value={brief.location} />
                <BriefChip label="Настроение" value={brief.mood} />
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function BriefChip({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{label}</span>
      <span className="truncate rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300" title={value}>
        {short(value, 34)}
      </span>
    </div>
  );
}

/** Панель готового Production Blueprint с кнопкой «Перейти к монтажу». */
function BlueprintReady({
  preprod,
  brief,
  isFallback,
  onGoToEditor,
  onOpenPro,
  onRestart,
}: {
  preprod: PreProduction;
  brief: DirectorBrief;
  isFallback: boolean;
  onGoToEditor: () => void;
  onOpenPro: () => void;
  onRestart: () => void;
}) {
  const readiness = readinessFor(preprod);
  const flat = useMemo(() => flattenSections(preprod, brief), [preprod, brief]);

  const docs: Array<[string, string]> = [
    ["Логлайн", preprod.logline.primary ? "Одна сильная фраза о герое, цели и ставках" : "Будет заполнен"],
    ["Treatment", preprod.treatment.synopsisLong ? "Полная история от хука до финала" : "Будет заполнен"],
    ["Сценарий", preprod.script.scenes.length > 0 ? `${preprod.script.scenes.length} сцен с репликами и таймингом` : "Будет заполнен"],
    ["Режиссёрская экспликация", preprod.vision.scenes.length > 0 ? `Камера, свет, цвет и звук для ${preprod.vision.scenes.length} сцен` : "Будет заполнена"],
    ["Storyboard", preprod.storyboard.frames.length > 0 ? `${preprod.storyboard.frames.length} кадров с композицией` : "Будет заполнен"],
    ["Shot List", preprod.shotlist.shots.length > 0 ? `${preprod.shotlist.shots.length} планов с приоритетами` : "Будет заполнен"],
    ["Стиль монтажа", flat.edit ? "Темп, переходы и ритм каждой сцены" : "Будет подобран"],
    ["Рекомендации по съёмке", preprod.planning.directorNotes.length > 0 ? "Советы оператору и группе" : "Будут готовы"],
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-gradient-to-br from-violet-950/50 via-[#0d0d18]/90 to-amber-950/30 p-6 shadow-2xl backdrop-blur-2xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Production Blueprint</div>
            <h2 className="text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-100 via-fuchsia-100 to-amber-100">
              {preprod.treatment.title || brief.idea || "Проект"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isFallback && (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-200">● Офлайн-режим</span>
            )}
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium text-slate-300">Готовность {readiness}%</span>
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
          {brief.location && <Chip>📍 {brief.location}</Chip>}
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 transition-all" style={{ width: `${Math.max(2, Math.min(100, readiness))}%` }} />
        </div>

        <button
          onClick={onGoToEditor}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-4 text-sm font-extrabold tracking-wide text-black shadow-2xl shadow-orange-900/40 transition-all hover:brightness-110 active:scale-[0.99]"
        >
          🚀 Перейти к монтажу →
        </button>
        <p className="mt-2 text-center text-[10px] text-slate-500">Весь Production Blueprint будет автоматически передан монтажному движку.</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onOpenPro}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] font-bold text-slate-200 transition hover:bg-white/[0.08]"
          >
            🎬 Production Workspace
          </button>
          <button
            onClick={onRestart}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.08]"
          >
            ♻ Пройти заново
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-xl">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Что подготовил режиссёр</div>
        <div className="grid gap-2">
          {docs.map(([title, meta]) => (
            <div key={title} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-black text-emerald-300">✓</span>
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

/** Живой список статусов: выполненные ✓, текущий — спиннер, будущие — пустые. */
function LiveStatusList({ items, current, done }: { items: string[]; current: number; done: boolean }) {
  return (
    <div className="space-y-1.5">
      {items.map((label, i) => {
        const isDone = done || i < current;
        const isActive = !done && i === current;
        return (
          <div
            key={label}
            className={`flex items-center gap-2.5 text-[12px] font-semibold transition-colors duration-300 ${
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
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-300">
      {children}
    </span>
  );
}
