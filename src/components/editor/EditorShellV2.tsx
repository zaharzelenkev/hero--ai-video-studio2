"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useProjectStore, type EditorPage } from "@/store/projectStore";
import { clearMediaCache } from "./mediaCache";
import PreviewCanvas from "./PreviewCanvas";
import Transport from "./Transport";
import TimelineV2 from "./TimelineV2";
import MontagePanelV2 from "./panels/MontagePanelV2";
import ColorPanelV2 from "./panels/ColorPanelV2";
import EffectsPanelV2 from "./panels/EffectsPanelV2";
import SoundPanelV2 from "./panels/SoundPanelV2";
import TextPanelV2 from "./panels/TextPanelV2";
import ExportPanelV2 from "./panels/ExportPanelV2";

const PAGES: { id: EditorPage; label: string; icon: string }[] = [
  { id: "montage", label: "Монтаж", icon: "✂️" },
  { id: "color", label: "Цвет", icon: "🎨" },
  { id: "effects", label: "Эффекты", icon: "✨" },
  { id: "sound", label: "Звук", icon: "🎵" },
  { id: "text", label: "Текст", icon: "📝" },
  { id: "export", label: "Экспорт", icon: "🚀" },
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

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => persist(), 800);
    return () => clearTimeout(t);
  }, [dirty, persist]);

  // Clean up media cache when leaving editor
  useEffect(() => {
    return () => {
      clearMediaCache();
    };
  }, []);

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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPlaying, selectedClipId, setPlaying, removeClip]);

  if (!project) return null;

  return (
    <div className="flex h-screen flex-col bg-[#0a0a12] text-slate-100">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-white/10 bg-gradient-to-r from-[#0d0d16] to-[#0a0a12] px-4 py-2.5 shadow-lg">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors hover:bg-white/5"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm shadow-lg shadow-violet-500/30">
            🎬
          </div>
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            MONTIQ
          </span>
        </Link>

        <div className="h-5 w-px bg-white/10" />

        <nav className="flex flex-1 items-center gap-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePage(p.id)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-300 ${
                activePage === p.id
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
            <div
              className={`h-2 w-2 rounded-full ${
                dirty ? "bg-amber-400 animate-pulse" : "bg-green-400"
              }`}
            />
            <span className="text-[10px] font-medium text-slate-400">
              {dirty ? "Сохранение..." : "Сохранено"}
            </span>
          </div>

          <button
            onClick={() => persist()}
            disabled={!dirty}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/5 disabled:opacity-40"
          >
            💾 Сохранить
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Main Editor Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewCanvas />
          <Transport />
        </div>

        {/* Side Panel */}
        <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#0d0d16] shadow-2xl">
          {activePage === "montage" && <MontagePanelV2 />}
          {activePage === "color" && <ColorPanelV2 />}
          {activePage === "effects" && <EffectsPanelV2 />}
          {activePage === "sound" && <SoundPanelV2 />}
          {activePage === "text" && <TextPanelV2 />}
          {activePage === "export" && <ExportPanelV2 />}
        </aside>
      </div>

      {/* Timeline */}
      <div className="h-[280px] shrink-0 border-t border-white/10 shadow-2xl">
        <TimelineV2 />
      </div>
    </div>
  );
}
