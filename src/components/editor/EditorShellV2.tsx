"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useProjectStore, timelineDuration, type EditorPage } from "@/store/projectStore";
import { createEmptyProject } from "@/lib/emptyProject";
import { mediaPool } from "@/lib/editor/resourcePool";
import { audioMixer } from "@/lib/editor/audioMixer";
import PreviewCanvas from "./PreviewCanvas";
import Transport from "./Transport";
import TimelineV2 from "./TimelineV2";
import MediaPool, { useMediaImport } from "./MediaPool";
import MontagePanelV2 from "./panels/MontagePanelV2";
import ColorPanelV2 from "./panels/ColorPanelV2";
import EffectsPanelV2 from "./panels/EffectsPanelV2";
import SoundPanelV2 from "./panels/SoundPanelV2";
import TextPanelV2 from "./panels/TextPanelV2";
import ExportPanelV2 from "./panels/ExportPanelV2";
import ProductionPanelV2 from "./panels/ProductionPanelV2";
import OfflineEditPanel from "./panels/OfflineEditPanel";
import PictureLockPanelV2 from "./panels/PictureLockPanelV2";
import DirectorRedirectPanel from "./DirectorRedirectPanel";
import KeyframeEditor from "./KeyframeEditor";
import { isPictureLocked } from "@/lib/pictureLock";

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

const PAGES: { id: EditorPage; label: string; icon: string; desc: string }[] = [
  { id: "media", label: "Медиа", icon: "🎞", desc: "Медиатека и параметры проекта" },
  { id: "montage", label: "Монтаж", icon: "✂️", desc: "Клип, скорость, кадрирование, переходы" },
  { id: "color", label: "Цвет", icon: "🎨", desc: "Колесо цвета, LUT, скопы" },
  { id: "effects", label: "Эффекты", icon: "✨", desc: "VFX: хромакей, удаление фона/объекта, LUT, bloom, лучи, зерно и др." },
  { id: "sound", label: "Звук", icon: "🎵", desc: "Микшер, EQ, компрессор, панорама" },
  { id: "text", label: "Текст", icon: "📝", desc: "Титры, шрифты, анимация" },
  { id: "animation", label: "Кадры", icon: "🎬", desc: "Ключевые кадры и кривые" },
  { id: "ai", label: "AI", icon: "🤖", desc: "AI Director" },
  { id: "offline", label: "Черновик", icon: "✂️", desc: "Offline Edit: дубли, чистка речи, драматургия" },
  { id: "lock", label: "Picture Lock", icon: "🔒", desc: "Финальная сборка: проверка и фиксация монтажа" },
  { id: "export", label: "Экспорт", icon: "🚀", desc: "MP4 / WebM / GIF" },
];

/** Страница «Медиа»: на узких экранах внутрь инспектора кладём и саму медиатеку. */
function MediaPagePanel() {
  return (
    <div className="space-y-3">
      <div className="h-[46vh] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b13] lg:hidden">
        <MediaPool />
      </div>
      <ProductionPanelV2 />
    </div>
  );
}

/**
 * Стабильные ссылки на компоненты панелей (не inline-функции!).
 * Если объявить панель внутри рендера, на каждом обновлении стора React
 * создаёт новый тип компонента → панель размонтируется/монтируется заново,
 * и фокус теряется после КАЖДОГО символа в textarea.
 */
const PANEL_COMPONENTS: Record<EditorPage, ComponentType> = {
  media: MediaPagePanel,
  montage: MontagePanelV2,
  color: ColorPanelV2,
  effects: EffectsPanelV2,
  sound: SoundPanelV2,
  text: TextPanelV2,
  animation: KeyframeEditor,
  ai: DirectorRedirectPanel,
  offline: OfflineEditPanel,
  lock: PictureLockPanelV2,
  export: ExportPanelV2,
};

/* ------------------------------------------------------------------ */
/* layout helpers                                                      */
/* ------------------------------------------------------------------ */

/** Отложенная очистка медиапула (переживает StrictMode-перемонтирование). */
let disposeTimer: number | null = null;

const LEFT_MIN = 200;
const LEFT_MAX = 460;
const RIGHT_MIN = 280;
const RIGHT_MAX = 620;
const TIMELINE_MIN = 170;

function useDragSize(initial: number, min: number, max: number, axis: "x" | "y", invert = false) {
  const [size, setSize] = useState(initial);
  const stateRef = useRef({ start: 0, base: initial, active: false });

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      stateRef.current = { start: axis === "x" ? event.clientX : event.clientY, base: size, active: true };
    },
    [axis, size],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!stateRef.current.active) return;
      const current = axis === "x" ? event.clientX : event.clientY;
      const delta = (current - stateRef.current.start) * (invert ? -1 : 1);
      setSize(Math.max(min, Math.min(max, stateRef.current.base + delta)));
    },
    [axis, invert, min, max],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent) => {
    stateRef.current.active = false;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
  }, []);

  return { size, setSize, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

function VDivider(props: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className="hidden w-1.5 shrink-0 cursor-col-resize bg-white/[0.04] transition-colors hover:bg-violet-500/40 lg:block"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

function HDivider(props: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className="h-1.5 shrink-0 cursor-row-resize bg-white/[0.04] transition-colors hover:bg-violet-500/40"
      role="separator"
      aria-orientation="horizontal"
    />
  );
}

/* ------------------------------------------------------------------ */
/* shell                                                               */
/* ------------------------------------------------------------------ */

export default function EditorShellV2() {
  const project = useProjectStore((s) => s.project);
  const activePage = useProjectStore((s) => s.activePage);
  const setActivePage = useProjectStore((s) => s.setActivePage);
  const dirty = useProjectStore((s) => s.dirty);
  const saving = useProjectStore((s) => s.saving);
  const persist = useProjectStore((s) => s.persist);
  const setTitle = useProjectStore((s) => s.setTitle);
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const past = useProjectStore((s) => s.past.length);
  const future = useProjectStore((s) => s.future.length);
  const applyPictureLockFixes = useProjectStore((s) => s.applyPictureLockFixes);
  const confirmPictureLock = useProjectStore((s) => s.confirmPictureLock);

  const { importFromDevice, busy: importing, status: importStatus } = useMediaImport();

  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const left = useDragSize(268, LEFT_MIN, LEFT_MAX, "x");
  const right = useDragSize(376, RIGHT_MIN, RIGHT_MAX, "x", true);
  const timeline = useDragSize(288, TIMELINE_MIN, 720, "y", true);

  const duration = timelineDuration(project);
  const clipCount = useMemo(
    () => project?.tracks.reduce((n, t) => n + t.clips.length, 0) ?? 0,
    [project],
  );
  const locked = isPictureLocked(project);
  const lockStage = project?.pictureLock?.stage ?? "none";

  /* ------------------------- autosave ---------------------------- */
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void persist(), 900);
    return () => clearTimeout(t);
  }, [dirty, persist]);

  // Освобождаем тяжёлые медиаресурсы при выходе из редактора. Dispose отложен,
  // чтобы двойной монтаж в React StrictMode не сносил уже загруженные ресурсы.
  useEffect(() => {
    if (disposeTimer !== null) {
      clearTimeout(disposeTimer);
      disposeTimer = null;
    }
    return () => {
      audioMixer.stop();
      disposeTimer = window.setTimeout(() => {
        disposeTimer = null;
        mediaPool.dispose();
      }, 1500);
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useProjectStore.getState().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  /* ------------------------- shortcuts --------------------------- */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;

      const s = useProjectStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      const frame = 1 / (s.project?.fps || 30);
      // Picture Lock подтверждён: монтажные операции недоступны даже с клавиатуры.
      const locked = s.isEditLocked();

      // --- clipboard / history / save -----------------------------
      if (mod && event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && event.code === "KeyY") {
        event.preventDefault();
        s.redo();
        return;
      }
      if (mod && event.code === "KeyS") {
        event.preventDefault();
        void s.persist();
        return;
      }
      if (mod && event.code === "KeyC") {
        event.preventDefault();
        s.copySelection();
        return;
      }
      if (mod && event.code === "KeyX") {
        event.preventDefault();
        if (!locked) s.cutSelection();
        return;
      }
      if (mod && event.code === "KeyV") {
        event.preventDefault();
        if (!locked) s.paste();
        return;
      }
      if (mod && event.code === "KeyD") {
        event.preventDefault();
        if (!locked && s.selectedClipId) s.duplicateClip(s.selectedClipId);
        return;
      }
      if (mod && event.code === "KeyA") {
        event.preventDefault();
        s.selectClips((s.project?.tracks ?? []).flatMap((t) => t.clips.map((c) => c.id)));
        return;
      }
      if (mod && (event.code === "Equal" || event.code === "NumpadAdd")) {
        event.preventDefault();
        s.zoomBy(1.25);
        return;
      }
      if (mod && (event.code === "Minus" || event.code === "NumpadSubtract")) {
        event.preventDefault();
        s.zoomBy(1 / 1.25);
        return;
      }
      if (mod) return;

      // --- transport ----------------------------------------------
      if (event.code === "Space") {
        event.preventDefault();
        s.setPlaying(!s.isPlaying);
        return;
      }
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        s.setPlayhead(Math.max(0, s.playhead - (event.shiftKey ? 1 : frame)));
        return;
      }
      if (event.code === "ArrowRight") {
        event.preventDefault();
        s.setPlayhead(s.playhead + (event.shiftKey ? 1 : frame));
        return;
      }
      if (event.code === "Home") {
        event.preventDefault();
        s.setPlayhead(0);
        return;
      }
      if (event.code === "End") {
        event.preventDefault();
        s.setPlayhead(timelineDuration(s.project));
        return;
      }

      // --- tools & edit -------------------------------------------
      switch (event.code) {
        case "KeyV":
          s.setTool("select");
          break;
        case "KeyC":
          s.setTool("razor");
          break;
        case "KeyH":
          s.setTool("hand");
          break;
        case "KeyN":
          s.toggleSnapping();
          break;
        case "KeyL":
          s.setLoop(!s.loop);
          break;
        case "KeyM":
          s.addMarker(s.playhead);
          break;
        case "KeyS":
        case "KeyB":
          event.preventDefault();
          if (!locked) s.splitAtPlayhead();
          break;
        case "KeyI":
          s.setInPoint(s.playhead);
          break;
        case "KeyO":
          s.setOutPoint(s.playhead);
          break;
        case "KeyZ":
          if (event.shiftKey) window.dispatchEvent(new Event("montiq:timeline-fit"));
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          if (locked) break;
          if (s.ripple) s.rippleDeleteSelected();
          else s.removeSelected();
          break;
        case "Escape":
          s.clearSelection();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ------------------------- global drop -------------------------- */
  const dragDepth = useRef(0);

  const onDragEnter = useCallback((event: ReactDragEvent) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
    dragDepth.current += 1;
    setDropActive(true);
  }, []);

  const onDragLeave = useCallback(() => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropActive(false);
  }, []);

  const onDrop = useCallback((event: ReactDragEvent) => {
    dragDepth.current = 0;
    setDropActive(false);
    // Таймлайн и медиатека обрабатывают drop сами (и вызывают preventDefault) —
    // не импортируем файлы второй раз.
    if (event.defaultPrevented) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    void importDroppedFiles(files);
  }, []);

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a12] text-slate-200">
        <div className="rounded-2xl border border-white/10 bg-[#0d0d16] px-6 py-8 text-center shadow-2xl">
          <div className="mb-3 text-5xl">🎬</div>
          <h2 className="mb-1 text-xl font-bold">Проект не загружен</h2>
          <p className="mb-4 text-sm text-slate-400">Создайте или выберите проект для начала работы.</p>
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110"
            >
              🏠 На главную
            </Link>
            <button
              onClick={() => useProjectStore.getState().loadProject(createEmptyProject("Новый проект"))}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:brightness-110"
            >
              ➕ Создать проект
            </button>
          </div>
        </div>
      </div>
    );
  }

  const page = PAGES.find((p) => p.id === activePage) ?? PAGES[1];
  const Panel = PANEL_COMPONENTS[activePage] ?? MontagePanelV2;

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-[#0a0a12] text-slate-100"
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ------------------------------ header ------------------------------ */}
      <header className="z-50 flex shrink-0 items-center gap-2 border-b border-white/10 bg-gradient-to-r from-[#0d0d16] to-[#0a0a12] px-3 py-2 shadow-lg">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-bold transition-colors hover:bg-white/5"
          title="На главную"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-base shadow-lg shadow-violet-500/30">
            🎬
          </span>
          <span className="hidden bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent xl:inline">
            MONTIQ
          </span>
        </Link>

        <div className="mr-1 flex items-center gap-1 border-r border-white/10 pr-2">
          <button
            onClick={undo}
            disabled={past === 0}
            aria-label="Отменить"
            title="Отменить (Ctrl+Z)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-25"
          >
            ↩
          </button>
          <button
            onClick={redo}
            disabled={future === 0}
            aria-label="Повторить"
            title="Повторить (Ctrl+Shift+Z)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-25"
          >
            ↪
          </button>
        </div>

        {/* Импорт медиа с устройства — доступен в любой момент монтажа */}
        <button
          onClick={() => void importFromDevice()}
          disabled={importing}
          title="Загрузить видео, аудио или фото с устройства"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-[11px] font-extrabold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:opacity-50"
        >
          <span className="text-sm leading-none">＋</span>
          <span className="hidden sm:inline">{importing ? "Импорт…" : "Добавить медиа"}</span>
        </button>

        {/* Picture Lock badge — редактор всегда понимает состояние монтажа */}
        {locked ? (
          <button
            onClick={() => setActivePage("lock")}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-extrabold text-emerald-300 shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-500/20"
            title="Picture Lock подтверждён — монтаж зафиксирован. Доступны: цвет, звук, титры, эффекты."
          >
            🔒 <span className="hidden sm:inline">Picture Lock</span>
          </button>
        ) : lockStage === "review" ? (
          <button
            onClick={() => setActivePage("lock")}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] font-extrabold text-amber-300 shadow-lg shadow-amber-900/20 transition hover:bg-amber-500/20"
            title="Режим финальной сборки: проверьте отчёт Picture Lock"
          >
            📋 <span className="hidden sm:inline">Picture Lock</span>
          </button>
        ) : null}

        {/* Desktop nav */}
        <nav className="no-scrollbar hidden flex-1 items-center justify-center gap-0.5 overflow-x-auto md:flex">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePage(p.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-[11px] font-semibold transition-all duration-200 ${
                activePage === p.id
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
              title={p.desc}
            >
              <span>{p.icon}</span>
              <span className="hidden lg:inline">
                {p.label}
                {locked && p.id === "montage" ? " 🔒" : ""}
              </span>
            </button>
          ))}
        </nav>

        {/* Mobile page toggle */}
        <button
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold md:hidden"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Меню разделов"
        >
          <span>{page.icon}</span>
          <span className="max-w-[80px] truncate">{page.label}</span>
          <span>▼</span>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <input
            value={project.title}
            onChange={(e) => setTitle(e.target.value)}
            className="hidden w-40 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-semibold text-slate-200 outline-none transition focus:border-violet-400/50 xl:block"
            aria-label="Название проекта"
          />
          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 sm:flex">
            <span className={`h-2 w-2 rounded-full ${saving ? "animate-pulse bg-sky-400" : dirty ? "animate-pulse bg-amber-400" : "bg-emerald-400"}`} />
            <span className="text-[10px] font-medium text-slate-400">
              {saving ? "Сохранение…" : dirty ? "Есть изменения" : "Сохранено"}
            </span>
          </div>
          <button
            onClick={() => void persist()}
            disabled={!dirty}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 disabled:opacity-30"
            aria-label="Сохранить"
            title="Сохранить (Ctrl+S)"
          >
            💾 <span className="hidden sm:inline">Сохранить</span>
          </button>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white lg:flex"
            title="Горячие клавиши"
            aria-label="Горячие клавиши"
          >
            ⌨
          </button>
        </div>
      </header>

      {importing && (
        <div className="shrink-0 border-b border-violet-400/20 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold text-violet-200">
          Импорт медиа: {importStatus || "чтение файлов…"}
        </div>
      )}

      {/* ------------------- Picture Lock status strip ------------------- */}
      {locked ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-200">
          <span>🔒 Picture Lock подтверждён — монтаж зафиксирован. Дальше изменяются только цвет, звук, титры и эффекты.</span>
          <button
            onClick={() => setActivePage("lock")}
            className="ml-auto rounded-md border border-emerald-400/30 bg-emerald-500/20 px-2 py-0.5 font-bold transition hover:bg-emerald-500/30"
          >
            Открыть отчёт
          </button>
        </div>
      ) : lockStage === "review" ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold text-amber-200">
          <span>📋 Режим финальной сборки: автомонтаж завершён. Проверьте отчёт Picture Lock и подтвердите монтаж.</span>
          <button
            onClick={() => setActivePage("lock")}
            className="ml-auto rounded-md border border-amber-400/30 bg-amber-500/20 px-2 py-0.5 font-bold transition hover:bg-amber-500/30"
          >
            Открыть отчёт
          </button>
          <button
            onClick={() => applyPictureLockFixes()}
            className="rounded-md border border-amber-400/30 bg-amber-500/20 px-2 py-0.5 font-bold transition hover:bg-amber-500/30"
            title="Автоматически исправить длинные/короткие кадры, темп и визуальную логику"
          >
            🛠 Исправить
          </button>
          <button
            onClick={() => confirmPictureLock()}
            className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-100 transition hover:bg-emerald-500/35"
            title="Зафиксировать монтаж: дальше меняются только цвет, звук, титры и эффекты"
          >
            🔒 Подтвердить Picture Lock
          </button>
        </div>
      ) : null}

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="z-40 grid grid-cols-3 gap-2 border-b border-white/10 bg-[#0d0d16]/95 px-3 py-2 shadow-2xl backdrop-blur md:hidden">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setActivePage(p.id);
                setMobileNavOpen(false);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-[10px] font-semibold transition-all ${
                activePage === p.id
                  ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className="text-xl">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------ body ------------------------------ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Media pool */}
        {leftOpen && (
          <>
            <aside
              className="hidden shrink-0 flex-col border-r border-white/10 bg-[#0b0b13] lg:flex"
              style={{ width: left.size }}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Медиатека</span>
                <button
                  onClick={() => setLeftOpen(false)}
                  className="rounded px-1.5 text-xs text-slate-500 transition hover:bg-white/10 hover:text-white"
                  title="Скрыть медиатеку"
                  aria-label="Скрыть медиатеку"
                >
                  ⟨
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <MediaPool />
              </div>
            </aside>
            <VDivider {...left.handlers} />
          </>
        )}
        {!leftOpen && (
          <button
            onClick={() => setLeftOpen(true)}
            className="hidden w-7 shrink-0 flex-col items-center justify-center gap-2 border-r border-white/10 bg-[#0b0b13] text-[10px] font-bold text-slate-500 transition hover:text-violet-300 lg:flex"
            title="Показать медиатеку"
            aria-label="Показать медиатеку"
          >
            <span>⟩</span>
            <span style={{ writingMode: "vertical-rl" }}>МЕДИА</span>
          </button>
        )}

        {/* Preview + transport + timeline */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 bg-gradient-to-b from-[#08080f] to-[#0a0a12]">
              <PreviewCanvas />
            </div>
            <Transport />
          </div>

          <HDivider {...timeline.handlers} />

          <div className="shrink-0 border-t border-white/10 bg-[#08080f]" style={{ height: timeline.size }}>
            <TimelineV2 />
          </div>
        </div>

        {/* Inspector */}
        {rightOpen && (
          <>
            <VDivider {...right.handlers} />
            <aside
              className="hidden shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#0d0d16] shadow-2xl lg:flex"
              style={{ width: right.size }}
            >
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d0d16]/90 px-3 py-2 backdrop-blur">
                <span className="text-sm">{page.icon}</span>
                <span className="text-xs font-bold text-violet-300">{page.label}</span>
                <span className="truncate text-[10px] text-slate-500">{page.desc}</span>
                <button
                  onClick={() => setRightOpen(false)}
                  className="ml-auto rounded px-1.5 text-xs text-slate-500 transition hover:bg-white/10 hover:text-white"
                  title="Скрыть инспектор"
                  aria-label="Скрыть инспектор"
                >
                  ⟩
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <Panel />
                {activePage !== "animation" && selectedClipIds.length > 0 && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <KeyframeEditor />
                  </div>
                )}
              </div>
            </aside>
          </>
        )}
        {!rightOpen && (
          <button
            onClick={() => setRightOpen(true)}
            className="hidden w-7 shrink-0 flex-col items-center justify-center gap-2 border-l border-white/10 bg-[#0d0d16] text-[10px] font-bold text-slate-500 transition hover:text-violet-300 lg:flex"
            title="Показать инспектор"
            aria-label="Показать инспектор"
          >
            <span>⟨</span>
            <span style={{ writingMode: "vertical-rl" }}>ИНСПЕКТОР</span>
          </button>
        )}
      </div>

      {/* ------------------------------ status bar ------------------------- */}
      <footer className="hidden shrink-0 items-center gap-3 border-t border-white/10 bg-[#0b0b13] px-3 py-1 text-[10px] text-slate-500 lg:flex">
        <span>
          {project.resolution.width}×{project.resolution.height} · {project.fps} fps
        </span>
        <span className="h-3 w-px bg-white/10" />
        <span>{project.tracks.length} дорожек · {clipCount} клипов</span>
        <span className="h-3 w-px bg-white/10" />
        <span>Длительность {duration.toFixed(2)} с</span>
        <span className="h-3 w-px bg-white/10" />
        <span>{project.assets.length} медиафайлов</span>
        <span className="ml-auto">Пробел — play · S — разрез · V/C/H — инструменты · Shift+Z — вместить</span>
      </footer>

      {/* ------------------------------ mobile inspector ------------------- */}
      <div className="shrink-0 border-t border-white/10 bg-[#0d0d16]/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-bold text-violet-300">
            {page.icon} {page.label}
          </span>
          <button
            onClick={() => setMobilePanelOpen((v) => !v)}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg"
            aria-label="Открыть панель"
          >
            {mobilePanelOpen ? "Свернуть ▲" : "Панель ▼"}
          </button>
        </div>
        {mobilePanelOpen && (
          <div className="h-[45vh] overflow-y-auto border-t border-white/10 bg-[#0d0d16] p-3">
            <Panel />
          </div>
        )}
      </div>

      {/* ------------------------------ overlays --------------------------- */}
      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center bg-violet-950/50 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-violet-400/60 px-10 py-8 text-center">
            <div className="mb-2 text-4xl">📥</div>
            <div className="text-sm font-bold text-violet-100">Отпустите файлы — добавим в медиатеку</div>
            <div className="text-[11px] text-violet-300/70">Видео, аудио и изображения</div>
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d16] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-violet-200">Горячие клавиши</h3>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between gap-3 border-b border-white/5 py-1">
                  <span className="text-slate-400">{label}</span>
                  <kbd className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space", "Воспроизведение / пауза"],
  ["← / →", "Шаг на кадр (Shift — на секунду)"],
  ["Home / End", "В начало / в конец"],
  ["V / C / H", "Выбор / лезвие / рука"],
  ["S", "Разрезать на плейхеде"],
  ["N", "Магнитное прилипание"],
  ["L", "Зацикливание"],
  ["M", "Поставить маркер"],
  ["I / O", "Точка входа / выхода"],
  ["Del", "Удалить выделенное"],
  ["Ctrl+D", "Дублировать клип"],
  ["Ctrl+C / X / V", "Копировать / вырезать / вставить"],
  ["Ctrl+A", "Выделить все клипы"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Отменить / повторить"],
  ["Ctrl+S", "Сохранить проект"],
  ["Ctrl+= / Ctrl+−", "Масштаб таймлайна"],
  ["Shift+Z", "Вместить проект в окно"],
  ["Ctrl+колесо", "Масштаб таймлайна"],
  ["Esc", "Снять выделение"],
];

/**
 * Импорт файлов, брошенных в любое место редактора. Хук нельзя вызвать из
 * колбэка, поэтому используем сервисную функцию поверх стора.
 */
async function importDroppedFiles(files: File[]) {
  const { importFilesAsAssets } = await import("@/lib/editor/mediaImport");
  const assets = await importFilesAsAssets(files);
  if (assets.length) useProjectStore.getState().addAssets(assets);
}
