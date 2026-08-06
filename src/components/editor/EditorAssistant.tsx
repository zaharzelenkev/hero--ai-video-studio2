"use client";

import { useCallback, useMemo, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { isPictureLocked } from "@/lib/pictureLock";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Project } from "@/lib/types";

/**
 * Умный помощник редактора: анализирует состояние проекта и подсказывает
 * следующий полезный шаг с одной кнопкой — как режиссёр на площадке, который
 * не даёт забыть ни один этап производства. Пользователь видит только то,
 * что ему нужно прямо сейчас (контекст, а не меню).
 *
 * Каждая подсказка выполняет реальное действие в сторе — никаких заглушек.
 */

export interface AssistantSuggestion {
  id: string;
  icon: IconName;
  tone: "violet" | "amber" | "emerald" | "sky";
  title: string;
  hint: string;
  action: () => void;
}

const DISMISS_KEY = "montiq.assistant.dismissed.v1";

function loadDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveDismissed(ids: string[]): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-30)));
  } catch {
    /* ignore */
  }
}

/** Чистая функция анализа проекта → список подсказок в порядке приоритета. */
export function buildSuggestions(
  project: Project | null,
  actions: {
    openPage: (page: "media" | "sound" | "text" | "lock" | "export") => void;
    addFirstClip: () => void;
    addTitle: () => void;
    runCheck: () => void;
  },
): AssistantSuggestion[] {
  if (!project) return [];

  const suggestions: AssistantSuggestion[] = [];
  const videoClipCount = project.tracks.reduce(
    (n, t) => n + t.clips.filter((c) => c.type === "video" || c.type === "image").length,
    0,
  );
  const audioClipCount = project.tracks.reduce((n, t) => n + t.clips.filter((c) => c.type === "audio").length, 0);
  const textClipCount = project.tracks.reduce(
    (n, t) => n + t.clips.filter((c) => c.type === "text" || c.type === "subtitle").length,
    0,
  );
  const locked = isPictureLocked(project);
  const lockStage = project.pictureLock?.stage ?? "none";

  // 1. Пустой проект — сначала медиа.
  if (project.assets.length === 0) {
    suggestions.push({
      id: "no-assets",
      icon: "film",
      tone: "violet",
      title: "Добавьте материалы",
      hint: "Перетащите видео, фото и музыку в медиатеку — монтаж начнётся с них.",
      action: () => actions.openPage("media"),
    });
  } else if (videoClipCount === 0) {
    suggestions.push({
      id: "no-clips",
      icon: "cursor",
      tone: "violet",
      title: "Соберите монтаж на таймлайне",
      hint: "У вас есть медиа, но таймлайн пуст. Добавим первый клип одним нажатием — дальше перетаскивайте остальные.",
      action: actions.addFirstClip,
    });
  } else {
    // 2. Есть картинка — нужен звук.
    if (audioClipCount === 0 && !locked) {
      suggestions.push({
        id: "no-audio",
        icon: "music",
        tone: "sky",
        title: "Добавьте музыку и звук",
        hint: "Без звука ролик теряет половину эмоций. Откройте звуковую панель и соберите микс.",
        action: () => actions.openPage("sound"),
      });
    }
    // 3. Есть монтаж — пора проверить его Picture Lock'ом.
    if (lockStage === "none") {
      suggestions.push({
        id: "picture-lock",
        icon: "clipboard",
        tone: "amber",
        title: "Проверьте монтаж (Picture Lock)",
        hint: "AI проверит ритм, длинные/короткие кадры и визуальную логику — как финальный ассистент режиссёра.",
        action: actions.runCheck,
      });
    } else if (lockStage === "review") {
      suggestions.push({
        id: "lock-review",
        icon: "clipboard",
        tone: "amber",
        title: "Завершите Picture Lock",
        hint: "Отчёт готов: исправьте найденные проблемы или подтвердите фиксацию монтажа.",
        action: () => actions.openPage("lock"),
      });
    }
    // 4. Нет титров — предложим добавить.
    if (textClipCount === 0) {
      suggestions.push({
        id: "no-text",
        icon: "type",
        tone: "emerald",
        title: "Добавьте титр или заголовок",
        hint: "Титры делают ролик понятнее: название, акцент или CTA в конце.",
        action: actions.addTitle,
      });
    }
    // 5. Монтаж собран и проверен — пора на экспорт.
    if ((locked || lockStage !== "none") && textClipCount > 0 && audioClipCount > 0) {
      suggestions.push({
        id: "export",
        icon: "rocket",
        tone: "emerald",
        title: "Видео готово к экспорту",
        hint: "Мастеринг: MP4/MOV/WebM/GIF, аудио, SRT/EDL/XML — всё в одной панели.",
        action: () => actions.openPage("export"),
      });
    }
  }

  // 6. Всегда доступный запасной вариант.
  suggestions.push({
    id: "export-anytime",
    icon: "rocket",
    tone: "emerald",
    title: "Экспортировать видео",
    hint: "Финальная сборка и все форматы вывода — MP4, MOV, WebM, GIF, аудио.",
    action: () => actions.openPage("export"),
  });

  return suggestions;
}

const TONE_CLASS: Record<AssistantSuggestion["tone"], string> = {
  violet: "border-violet-400/25 bg-violet-500/[0.07] text-violet-200",
  amber: "border-amber-400/25 bg-amber-500/[0.07] text-amber-200",
  emerald: "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-200",
  sky: "border-sky-400/25 bg-sky-500/[0.07] text-sky-200",
};

export default function EditorAssistant() {
  const project = useProjectStore((s) => s.project);
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed());
  const [hidden, setHidden] = useState(false);

  const actions = useMemo(
    () => ({
      openPage: (page: "media" | "sound" | "text" | "lock" | "export") => useProjectStore.getState().setActivePage(page),
      addFirstClip: () => {
        const state = useProjectStore.getState();
        const project = state.project;
        if (!project) return;
        const asset = project.assets.find((a) => a.kind !== "audio") ?? project.assets[0];
        if (asset) state.addClipFromAsset(asset.id);
      },
      addTitle: () => useProjectStore.getState().addTextClip(),
      runCheck: () => useProjectStore.getState().runPictureLockCheck(),
    }),
    [],
  );

  const suggestions = useMemo(() => buildSuggestions(project, actions), [project, actions]);
  const visible = suggestions.filter((s) => !dismissed.includes(s.id));
  const current = visible[0];

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = [...prev, id];
      saveDismissed(next);
      return next;
    });
  }, []);

  if (hidden || !current) return null;

  const tone = TONE_CLASS[current.tone];

  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 text-[10px] font-medium ${tone}`}>
      <Icon name="lightbulb" size={13} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="mr-2 font-bold uppercase tracking-wider text-white/80">Умный помощник</span>
        <span className="font-semibold">{current.title}</span>
        <span className="ml-2 hidden text-white/55 sm:inline">{current.hint}</span>
      </div>
      <button
        onClick={() => {
          current.action();
          dismiss(current.id);
        }}
        className="shrink-0 rounded-md border border-white/15 bg-white/[0.08] px-2.5 py-1 font-bold transition hover:bg-white/[0.18]"
      >
        Выполнить
      </button>
      <button
        onClick={() => dismiss(current.id)}
        className="icon-btn !h-6 !w-6 shrink-0 opacity-60"
        title="Скрыть подсказку"
        aria-label="Скрыть подсказку"
      >
        <Icon name="x" size={12} />
      </button>
      <button
        onClick={() => setHidden(true)}
        className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-white/50 transition hover:text-white/80"
        title="Скрыть умного помощника до перезагрузки"
      >
        Свернуть
      </button>
    </div>
  );
}
