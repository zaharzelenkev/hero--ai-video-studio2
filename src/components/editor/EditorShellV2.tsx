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
import Image from "next/image";
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
import MotionGraphicsPanelV2 from "./panels/MotionGraphicsPanelV2";
import ExportPanelV2 from "./panels/ExportPanelV2";
import ProductionPanelV2 from "./panels/ProductionPanelV2";
import OfflineEditPanel from "./panels/OfflineEditPanel";
import PictureLockPanelV2 from "./panels/PictureLockPanelV2";
import KeyframeEditor from "./KeyframeEditor";
import EditorAssistant from "./EditorAssistant";
import { isPictureLocked } from "@/lib/pictureLock";
import { warmupFFmpeg, warmupHeavyModules } from "@/lib/editor/idleWarmup";
import { Icon, type IconName } from "@/components/ui/Icon";

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

const PAGES: { id: EditorPage; label: string; icon: IconName; desc: string }[] = [
  { id: "media", label: "Медиа", icon: "film", desc: "Медиатека и параметры проекта" },
  { id: "montage", label: "Монтаж", icon: "scissors", desc: "Клип, скорость, кадрирование, переходы" },
  { id: "color", label: "Цвет", icon: "palette", desc: "Колесо цвета, LUT, скопы" },
  { id: "effects", label: "Эффекты", icon: "sparkles", desc: "VFX: хромакей, удаление фона/объекта, LUT, bloom, лучи, зерно и др." },
  { id: "sound", label: "Звук", icon: "music", desc: "Микшер, EQ, компрессор, панорама" },
  { id: "text", label: "Текст", icon: "type", desc: "Титры, шрифты, анимация" },
  { id: "motion", label: "Motion", icon: "wand", desc: "Моушн-графика: титры, lower thirds, callouts, CTA, интро/аутро, kinetic" },
  { id: "animation", label: "Кадры", icon: "keyframe", desc: "Ключевые кадры и кривые" },
  { id: "offline", label: "Черновик", icon: "draft", desc: "Offline Edit: дубли, чистка речи, драматургия" },
  { id: "lock", label: "Picture Lock", icon: "lock", desc: "Финальная сборка: проверка и фиксация монтажа" },
  { id: "export", label: "Экспорт", icon: "rocket", desc: "MP4 / WebM / GIF" },
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
  motion: MotionGraphicsPanelV2,
  animation: KeyframeEditor,
  offline: OfflineEditPanel,
  lock: PictureLockPanelV2,
  export: ExportPanelV2,
};

/* ------------------------------------------------------------------ */
/* layout helpers                                                      */
/* ------------------------------------------------------------------ */

/** Отложенная очистка медиапула (переживает StrictMode-перемонтирование). */
let disposeTimer: number | null = null;

const LEFT_MIN = 210;
const LEFT_MAX = 460;
const RIGHT_MIN = 300;
const RIGHT_MAX = 640;
const TIMELINE_MIN = 180;

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
      className="panel-divider hidden w-1.5 shrink-0 cursor-col-resize lg:block"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

function HDivider(props: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className="panel-divider h-1.5 shrink-0 cursor-row-resize"
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
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const past = useProjectStore((s) => s.past.length);
  const future = useProjectStore((s) => s.future.length);
  const applyPictureLockFixes = useProjectStore((s) => s.applyPictureLockFixes);
  const confirmPictureLock = useProjectStore((s) => s.confirmPictureLock);

  const { busy: importing, status: importStatus } = useMediaImport();

  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  const left = useDragSize(268, LEFT_MIN, LEFT_MAX, "x");
  const right = useDragSize(384, RIGHT_MIN, RIGHT_MAX, "x", true);
  const timeline = useDragSize(284, TIMELINE_MIN, 720, "y", true);

  // Адаптивные размеры панелей при первом открытии: на ноутбуке/планшете
  // панели уже, чтобы предпросмотр оставался главным.
  useEffect(() => {
    if (window.innerHeight < 720 && timeline.size > Math.round(window.innerHeight * 0.3)) {
      timeline.setSize(Math.max(TIMELINE_MIN, Math.round(window.innerHeight * 0.3)));
    }
    if (window.innerWidth < 1360) {
      left.setSize(Math.min(left.size, 240));
      right.setSize(Math.min(right.size, 340));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Пока пользователь смотрит превью и монтирует, в фоне прогреваем тяжёлые
    // модули и FFmpeg — экспорт и автомонтаж стартуют мгновенно.
    warmupHeavyModules(2000);
    warmupFFmpeg(6000);
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
      <div className="app-bg flex h-screen items-center justify-center text-slate-200">
        <div className="surface-card animate-scale-in px-8 py-9 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
            <Icon name="clapper" size={30} strokeWidth={1.5} />
          </div>
          <h2 className="title mb-1 text-xl">Проект не загружен</h2>
          <p className="mb-5 text-sm text-slate-400">Создайте или выберите проект для начала работы.</p>
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="btn btn-ghost px-5 py-2.5 text-sm"
            >
              <Icon name="home" size={15} />
              На главную
            </Link>
            <button
              onClick={() => useProjectStore.getState().loadProject(createEmptyProject("Новый проект"))}
              className="btn btn-primary px-5 py-2.5 text-sm"
            >
              <Icon name="plus" size={15} />
              Создать проект
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
      className="editor-root relative flex h-dvh flex-col overflow-hidden text-slate-100"
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ------------------------------ header ------------------------------ */}
      <header className="editor-header z-50 flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 sm:gap-2 sm:px-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/5"
          title="На главную"
        >
          <span
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg"
            style={{ boxShadow: "0 6px 18px -4px rgba(124,108,246,0.5)" }}
          >
            <Image
              src="/montiq-logo.png"
              alt="Release Cut"
              width={32}
              height={32}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </span>
          <span className="hidden bg-gradient-to-b from-white to-[#a99dff] bg-clip-text text-[15px] font-extrabold tracking-tight text-transparent lg:inline">
            Release Cut
          </span>
        </Link>

        <div className="mr-0.5 flex shrink-0 items-center gap-0.5 border-r border-white/[0.08] pr-1.5">
          <button
            onClick={undo}
            disabled={past === 0}
            aria-label="Отменить"
            title="Отменить (Ctrl+Z)"
            className="icon-btn !h-8 !w-8"
          >
            <Icon name="undo" size={15} />
          </button>
          <button
            onClick={redo}
            disabled={future === 0}
            aria-label="Повторить"
            title="Повторить (Ctrl+Shift+Z)"
            className="icon-btn !h-8 !w-8"
          >
            <Icon name="redo" size={15} />
          </button>
        </div>

        {/* Picture Lock badge — редактор всегда понимает состояние монтажа */}
        {locked ? (
          <button
            onClick={() => setActivePage("lock")}
            className="badge badge-ok h-8 shrink-0 px-3 transition hover:bg-emerald-500/20"
            title="Picture Lock подтверждён — монтаж зафиксирован. Доступны: цвет, звук, титры, эффекты."
          >
            <Icon name="lock" size={13} />
            <span className="hidden sm:inline">Picture Lock</span>
          </button>
        ) : lockStage === "review" ? (
          <button
            onClick={() => setActivePage("lock")}
            className="badge badge-warn h-8 shrink-0 px-3 transition hover:bg-amber-500/20"
            title="Режим финальной сборки: проверьте отчёт Picture Lock"
          >
            <Icon name="clipboard" size={13} />
            <span className="hidden sm:inline">Picture Lock</span>
          </button>
        ) : null}

        {/* Desktop nav */}
        <nav className="no-scrollbar hidden min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto lg:flex">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePage(p.id)}
              className={`nav-item gap-1.5 !px-2.5 !py-2 text-[11px] ${
                activePage === p.id ? "nav-item-active" : ""
              }`}
              title={p.desc}
            >
              <Icon name={p.icon} size={14} />
              <span className="hidden xl:inline">{p.label}</span>
            </button>
          ))}
        </nav>

        {/* Tablet / mobile page toggle */}
        <button
          className="nav-item shrink-0 lg:hidden"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Меню разделов"
        >
          <Icon name={page.icon} size={16} />
          <span className="max-w-[76px] truncate text-xs">{page.label}</span>
          <Icon name="chevron-down" size={13} className="text-slate-500" />
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <div className="hidden items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 sm:flex">
            <span
              className={`status-dot ${
                saving ? "status-dot-dirty status-dot-pulse" : dirty ? "status-dot-warn status-dot-pulse" : "status-dot-ok"
              }`}
            />
            <span className="text-[10px] font-medium text-slate-400">
              {saving ? "Сохранение…" : dirty ? "Есть изменения" : "Сохранено"}
            </span>
          </div>
          <button
            onClick={() => void persist()}
            disabled={!dirty}
            className="btn btn-ghost h-8 px-2.5 text-xs sm:px-3"
            aria-label="Сохранить"
            title="Сохранить (Ctrl+S)"
          >
            <Icon name="save" size={14} />
            <span className="hidden sm:inline">Сохранить</span>
          </button>
          <button
            onClick={() => setShortcutsOpen(true)}
            className="icon-btn !h-8 !w-8 hidden lg:flex"
            title="Горячие клавиши"
            aria-label="Горячие клавиши"
          >
            <Icon name="keyboard" size={16} />
          </button>
        </div>
      </header>

      {importing && (
        <div className="flex shrink-0 items-center gap-2 border-b border-violet-400/20 bg-violet-500/[0.08] px-3 py-1 text-[10px] font-medium text-violet-200">
          <Icon name="upload" size={12} />
          Импорт медиа: {importStatus || "чтение файлов…"}
        </div>
      )}

      {/* ------------------- Picture Lock status strip ------------------- */}
      {locked ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-1.5 text-[10px] font-medium text-emerald-200/90">
          <Icon name="lock" size={12} />
          <span>Picture Lock подтверждён — монтаж зафиксирован. Дальше изменяются только цвет, звук, титры и эффекты.</span>
          <button
            onClick={() => setActivePage("lock")}
            className="ml-auto rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 font-bold transition hover:bg-emerald-500/30"
          >
            Открыть отчёт
          </button>
        </div>
      ) : lockStage === "review" ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-400/15 bg-amber-500/[0.06] px-3 py-1.5 text-[10px] font-medium text-amber-200/90">
          <Icon name="clipboard" size={12} />
          <span>Режим финальной сборки: черновой монтаж завершён. Проверьте отчёт Picture Lock и подтвердите монтаж.</span>
          <button
            onClick={() => setActivePage("lock")}
            className="ml-auto rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 font-bold transition hover:bg-amber-500/30"
          >
            Открыть отчёт
          </button>
          <button
            onClick={() => applyPictureLockFixes()}
            className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 font-bold transition hover:bg-amber-500/30"
            title="Автоматически исправить длинные/короткие кадры, темп и визуальную логику"
          >
            Исправить
          </button>
          <button
            onClick={() => confirmPictureLock()}
            className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-100 transition hover:bg-emerald-500/30"
            title="Зафиксировать монтаж: дальше меняются только цвет, звук, титры и эффекты"
          >
            <Icon name="lock" size={12} />
            Подтвердить Picture Lock
          </button>
        </div>
      ) : null}

      {/* Умный помощник — контекстные подсказки следующего шага */}
      <EditorAssistant />

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="animate-pop z-40 grid grid-cols-3 gap-1.5 border-b border-white/[0.06] bg-[#0d0d16]/95 px-3 py-2 shadow-2xl backdrop-blur-xl lg:hidden">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setActivePage(p.id);
                setMobileNavOpen(false);
              }}
              className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[10px] font-semibold transition-all ${
                activePage === p.id
                  ? "bg-violet-500/20 text-white ring-1 ring-violet-400/40"
                  : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
              }`}
            >
              <Icon name={p.icon} size={18} className={activePage === p.id ? "text-violet-200" : ""} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------ body ------------------------------ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Media pool — desktop/tablet */}
        {leftOpen && (
          <>
            <aside
              className="hidden shrink-0 flex-col border-r border-white/[0.06] bg-[#0b0b12] lg:flex"
              style={{ width: left.size }}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
                <span className="eyebrow flex items-center gap-1.5">
                  <Icon name="film" size={12} className="text-violet-300" />
                  Медиатека
                </span>
                <button
                  onClick={() => setLeftOpen(false)}
                  className="icon-btn !h-6 !w-6"
                  title="Скрыть медиатеку"
                  aria-label="Скрыть медиатеку"
                >
                  <Icon name="chevron-left" size={13} />
                </button>
              </div>
              <div className="animate-panel-in min-h-0 flex-1">
                <MediaPool />
              </div>
            </aside>
            <VDivider {...left.handlers} />
          </>
        )}
        {!leftOpen && (
          <button
            onClick={() => setLeftOpen(true)}
            className="hidden w-7 shrink-0 flex-col items-center justify-center gap-2 border-r border-white/[0.06] bg-[#0b0b12] text-[10px] font-bold text-slate-500 transition hover:text-violet-300 lg:flex"
            title="Показать медиатеку"
            aria-label="Показать медиатеку"
          >
            <Icon name="film" size={14} />
            <span style={{ writingMode: "vertical-rl", letterSpacing: "0.2em" }}>МЕДИА</span>
          </button>
        )}

        {/* Preview + transport + timeline */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <PreviewCanvas />
            </div>
            <Transport />
          </div>

          <HDivider {...timeline.handlers} />

          <div className="shrink-0 border-t border-white/[0.06] bg-[#08080f]" style={{ height: timeline.size }}>
            <TimelineV2 />
          </div>
        </div>

        {/* Inspector — desktop/tablet */}
        {rightOpen && (
          <>
            <VDivider {...right.handlers} />
            <aside
              className="hidden shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-[#0d0d16] shadow-2xl lg:flex"
              style={{ width: right.size }}
            >
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0d0d16]/90 px-3 py-2 backdrop-blur-xl">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                  <Icon name={page.icon} size={14} />
                </span>
                <span className="text-xs font-bold text-slate-100">{page.label}</span>
                <span className="hidden truncate text-[10px] text-slate-500 xl:inline">{page.desc}</span>
                <button
                  onClick={() => setRightOpen(false)}
                  className="icon-btn !h-6 !w-6 ml-auto"
                  title="Скрыть инспектор"
                  aria-label="Скрыть инспектор"
                >
                  <Icon name="chevron-right" size={13} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
                <div key={activePage} className="animate-fade-in">
                  <Panel />
                  {activePage !== "animation" && selectedClipIds.length > 0 && (
                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                      <KeyframeEditor />
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </>
        )}
        {!rightOpen && (
          <button
            onClick={() => setRightOpen(true)}
            className="hidden w-7 shrink-0 flex-col items-center justify-center gap-2 border-l border-white/[0.06] bg-[#0d0d16] text-[10px] font-bold text-slate-500 transition hover:text-violet-300 lg:flex"
            title="Показать инспектор"
            aria-label="Показать инспектор"
          >
            <Icon name="sliders" size={14} />
            <span style={{ writingMode: "vertical-rl", letterSpacing: "0.2em" }}>ИНСПЕКТОР</span>
          </button>
        )}
      </div>

      {/* ------------------------------ status bar ------------------------- */}
      <footer className="hidden shrink-0 items-center gap-3 border-t border-white/[0.06] bg-[#0b0b12] px-3 py-1 text-[10px] text-slate-500 lg:flex">
        <span>
          {project.resolution.width}×{project.resolution.height} · {project.fps} fps
        </span>
        <span className="hairline !h-3 !w-px" />
        <span>{project.tracks.length} дорожек · {clipCount} клипов</span>
        <span className="hairline !h-3 !w-px" />
        <span>Длительность {duration.toFixed(2)} с</span>
        <span className="hairline !h-3 !w-px" />
        <span>{project.assets.length} медиафайлов</span>
        <span className="ml-auto flex items-center gap-1.5">
          <Icon name="keyframe" size={11} className="text-slate-600" />
          Пробел — play · S — разрез · V/C/H — инструменты · Shift+Z — вместить
        </span>
      </footer>

      {/* ------------------------------ mobile inspector ------------------- */}
      <div className="mobile-sheet shrink-0 lg:hidden">
        <div className="flex items-center justify-between px-3 pt-2">
          <span className="flex items-center gap-2 text-xs font-bold text-slate-100">
            <Icon name={page.icon} size={15} className="text-violet-300" />
            {page.label}
          </span>
          <button
            onClick={() => setMobilePanelOpen((v) => !v)}
            className="btn btn-primary h-8 px-3.5 text-xs"
            aria-label="Открыть панель"
          >
            {mobilePanelOpen ? "Свернуть" : "Панель"}
            <Icon name={mobilePanelOpen ? "chevron-down" : "sliders"} size={13} />
          </button>
        </div>
        {mobilePanelOpen && (
          <div className="animate-sheet-up h-[42vh] overflow-y-auto border-t border-white/[0.06] bg-[#0d0d16] p-3 custom-scrollbar">
            <div className="sheet-handle mb-2" />
            <div key={activePage} className="animate-panel-in">
              <Panel />
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------ overlays --------------------------- */}
      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center bg-[#07070c]/70 backdrop-blur-md">
          <div className="glass-strong animate-scale-in flex flex-col items-center rounded-3xl border-2 border-dashed border-violet-400/50 px-12 py-9 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-100">
              <Icon name="upload" size={26} />
            </div>
            <div className="text-sm font-bold text-violet-50">Отпустите файлы — добавим в медиатеку</div>
            <div className="mt-1 text-[11px] text-violet-200/70">Видео, аудио и изображения</div>
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="glass-strong animate-scale-in max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
                <Icon name="keyboard" size={15} className="text-violet-300" />
                Горячие клавиши
              </h3>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="icon-btn !h-7 !w-7"
                aria-label="Закрыть"
              >
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between gap-3 border-b border-white/[0.05] py-1.5">
                  <span className="text-slate-400">{label}</span>
                  <kbd>{keys}</kbd>
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
