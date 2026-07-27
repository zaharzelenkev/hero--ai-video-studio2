"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useProjectStore, type EditorPage } from "@/store/projectStore";
import PreviewCanvas from "./PreviewCanvas";
import Transport from "./Transport";
import Timeline from "./Timeline";
import MontagePanel from "./panels/MontagePanel";
import ColorPanel from "./panels/ColorPanel";
import EffectsPanel from "./panels/EffectsPanel";
import SoundPanel from "./panels/SoundPanel";
import TextPanel from "./panels/TextPanel";
import ExportPanel from "./panels/ExportPanel";

const PAGES: { id: EditorPage; label: string }[] = [
  { id: "montage", label: "Монтаж" },
  { id: "color", label: "Цвет" },
  { id: "effects", label: "Эффекты" },
  { id: "sound", label: "Звук" },
  { id: "text", label: "Текст" },
  { id: "export", label: "Экспорт" },
];

export default function EditorShell() {
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
    <div className="flex h-screen flex-col bg-[#0b0b14] text-slate-100">
      <header className="flex items-center gap-4 border-b border-white/10 bg-[#0d0d16] px-4 py-2">
        <Link href="/" className="text-sm font-semibold text-violet-400 hover:text-violet-300">
          ← MONTIQ
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePage(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activePage === p.id ? "bg-violet-600 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <span className="text-[11px] text-slate-500">{dirty ? "Сохранение…" : "Сохранено ✓"}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewCanvas />
          <Transport />
        </div>
        <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-white/10 bg-[#0d0d16]">
          {activePage === "montage" && <MontagePanel />}
          {activePage === "color" && <ColorPanel />}
          {activePage === "effects" && <EffectsPanel />}
          {activePage === "sound" && <SoundPanel />}
          {activePage === "text" && <TextPanel />}
          {activePage === "export" && <ExportPanel />}
        </aside>
      </div>

      <div className="h-[260px] shrink-0">
        <Timeline />
      </div>
    </div>
  );
}
