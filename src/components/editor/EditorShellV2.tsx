"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useProjectStore, type EditorPage } from "@/store/projectStore";
import { clearMediaCache } from "./mediaCache";
import { createEmptyProject } from "@/lib/emptyProject";
import PreviewCanvas from "./PreviewCanvas";
import Transport from "./Transport";
import TimelineV2 from "./TimelineV2";
import MontagePanelV2 from "./panels/MontagePanelV2";
import ColorPanelV2 from "./panels/ColorPanelV2";
import EffectsPanelV2 from "./panels/EffectsPanelV2";
import SoundPanelV2 from "./panels/SoundPanelV2";
import TextPanelV2 from "./panels/TextPanelV2";
import ExportPanelV2 from "./panels/ExportPanelV2";
import DirectorRedirectPanel from "./DirectorRedirectPanel";
import KeyframeEditor from "./KeyframeEditor";

const PAGES: { id: EditorPage; label: string; icon: string; desc: string }[] = [
  { id: "montage", label: "Монтаж", icon: "✂️", desc: "Треки, клипы" },
  { id: "color", label: "Цвет", icon: "🎨", desc: "LUT, curves, wheels" },
  { id: "effects", label: "Эффекты", icon: "✨", desc: "Маски, хромакей, blur" },
  { id: "sound", label: "Звук", icon: "🎵", desc: "Микш, шумоподавление" },
  { id: "text", label: "Текст", icon: "📝", desc: "Анимация, keyframes" },
  { id: "animation", label: "Анимация", icon: "🎬", desc: "Motion, keyframes" },
  { id: "ai", label: "AI Director", icon: "🎬", desc: "Этап пре-продакшена" },
  { id: "export", label: "Экспорт", icon: "🚀", desc: "MP4 / WebM / GIF" },
];

export default function EditorShellV2() {
  const project = useProjectStore((s) => s.project);
  const activePage = useProjectStore((s) => s.activePage);
  const setActivePage = useProjectStore((s) => s.setActivePage);
  const dirty = useProjectStore((s) => s.dirty);
  const persist = useProjectStore((s) => s.persist);
  const removeClip = useProjectStore((s) => s.removeClip);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);
  const playhead = useProjectStore((s) => s.playhead);
  const pxPerSecond = useProjectStore((s) => s.pxPerSecond);
  const setZoom = useProjectStore((s) => s.setZoom);

  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => persist(), 800);
    return () => clearTimeout(t);
  }, [dirty, persist]);

  useEffect(() => {
    return () => clearMediaCache();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying(!isPlaying);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        removeClip(selectedClipId);
      }
      if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if (e.code === "KeyY" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
      }
      if ((e.code === "KeyS" || (e.code === "KeyB" && (e.ctrlKey || e.metaKey))) && selectedClipId) {
        e.preventDefault();
        splitClipAt(selectedClipId, playhead);
      }
      // Reset zoom
      if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        // already handled
      }
      // Mobile-like shortcuts for zoom
      if (e.code === "Equal" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoom(Math.min(400, pxPerSecond + 20));
      }
      if (e.code === "Minus" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoom(Math.max(10, pxPerSecond - 20));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPlaying, selectedClipId, playhead, setPlaying, removeClip, undo, redo, splitClipAt, pxPerSecond, setZoom]);

  // Touch / mobile swipe for timeline navigation (basic)
  const onTouchMove = useCallback(() => {
    // Could be used for timeline panning; kept minimal
  }, []);

  if (!project) return (
    <div className="flex h-screen items-center justify-center bg-[#0a0a12] text-slate-200">
      <div className="rounded-2xl border border-white/10 bg-[#0d0d16] px-6 py-8 shadow-2xl text-center">
        <div className="mb-3 text-5xl">🎬</div>
        <h2 className="text-xl font-bold mb-1">Проект не загружен</h2>
        <p className="text-sm text-slate-400 mb-4">Создайте или выберите проект для начала работы.</p>
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 hover:brightness-110 transition">🏠 На главную</Link>
        <button
          onClick={() => { const p = createEmptyProject("Новый проект"); useProjectStore.getState().loadProject(p); }}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 hover:brightness-110 transition"
          aria-label="Создать проект"
        >
          ➕ Создать проект
        </button>
      </div>
    </div>
  );

  const PanelContent = () => {
    switch (activePage) {
      case "montage": return <MontagePanelV2 />;
      case "color": return <ColorPanelV2 />;
      case "effects": return <EffectsPanelV2 />;
      case "sound": return <SoundPanelV2 />;
      case "text": return <TextPanelV2 />;
      case "animation": return <EffectsPanelV2 />;
      case "ai": return <DirectorRedirectPanel />;
      case "export": return <ExportPanelV2 />;
      default: return <MontagePanelV2 />;
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#0a0a12] text-slate-100 overflow-hidden" onTouchMove={onTouchMove}>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-[#0d0d16] to-[#0a0a12] px-3 py-2.5 shadow-lg shrink-0 z-50">
        <Link href="/" className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold transition-colors hover:bg-white/5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-base shadow-lg shadow-violet-500/30">🎬</div>
          <span className="hidden sm:inline bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">MONTIQ</span>
        </Link>

        <div className="flex items-center gap-1 border-r border-white/10 pr-2 mr-1">
          <button onClick={undo} aria-label="Отменить" title="Отменить (Ctrl+Z)" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors text-lg">↩</button>
          <button onClick={redo} aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-colors text-lg">↪</button>
        </div>

        <div className="h-5 w-px bg-white/10" />

        {/* Desktop nav */}
        <nav className="hidden md:flex flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePage(p.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition-all duration-200 whitespace-nowrap ${
                activePage === p.id
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
              title={p.desc}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </nav>

        {/* Mobile page toggle */}
        <button
          className="md:hidden flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold border border-white/10"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          aria-label="Меню"
        >
          <span>{PAGES.find(p => p.id === activePage)?.icon}</span>
          <span className="truncate max-w-[80px]">{PAGES.find(p => p.id === activePage)?.label}</span>
          <span>▼</span>
        </button>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <div className="hidden sm:flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 border border-white/10">
            <div className={`h-2 w-2 rounded-full ${dirty ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
            <span className="text-[10px] font-medium text-slate-400">{dirty ? "Сохранение..." : "Сохранено"}</span>
          </div>
          <button
            onClick={() => persist()}
            disabled={!dirty}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/10 disabled:opacity-30"
            aria-label="Сохранить"
          >
            💾 <span className="hidden sm:inline">Сохранить</span>
          </button>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden z-40 bg-[#0d0d16]/95 backdrop-blur border-b border-white/10 px-3 py-2 grid grid-cols-3 gap-2 shadow-2xl">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => { setActivePage(p.id); setMobileNavOpen(false); }}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-[10px] font-semibold transition-all ${
                activePage === p.id ? "bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg" : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <span className="text-xl">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main Editor Area */}
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          <div className="flex-1 min-h-0 relative bg-gradient-to-b from-[#08080f] to-[#0a0a12]">
            <PreviewCanvas />
          </div>
          <Transport />
        </div>

        {/* Side Panel (desktop) */}
        <aside className="hidden lg:flex w-[380px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#0d0d16] shadow-2xl flex-col">
          <div className="sticky top-0 z-10 bg-[#0d0d16]/90 backdrop-blur border-b border-white/10 px-3 py-2 flex items-center gap-2">
            <span className="text-xs font-bold text-violet-400">{PAGES.find(p => p.id === activePage)?.label}</span>
            <span className="text-[10px] text-slate-500">{PAGES.find(p => p.id === activePage)?.desc}</span>
          </div>
          <div className="p-3">
            <PanelContent />
            {selectedClipId && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <h4 className="text-xs font-bold text-violet-300 mb-1">Keyframes</h4>
                <KeyframeEditor />
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Timeline */}
      <div className="h-[260px] sm:h-[300px] shrink-0 border-t border-white/10 shadow-2xl bg-[#0a0a12]">
        <TimelineV2 />
      </div>

      {/* Mobile bottom panel trigger + bottom sheet */}
      <div className="lg:hidden shrink-0 border-t border-white/10 bg-[#0d0d16]/95 backdrop-blur">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-bold text-violet-300">{PAGES.find(p=>p.id===activePage)?.label}</span>
          <button
            onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg"
            aria-label="Открыть панель"
          >
            {mobilePanelOpen ? "Свернуть ▲" : "Панель ▼"}
          </button>
        </div>
        {mobilePanelOpen && (
          <div className="h-[45vh] overflow-y-auto border-t border-white/10 p-3 bg-[#0d0d16]">
            <PanelContent />
          </div>
        )}
      </div>
    </div>
  );
}
