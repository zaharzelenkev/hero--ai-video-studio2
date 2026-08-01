"use client";

import Link from "next/link";
import { PREPROD_STAGES, type PreprodStage } from "@/lib/production";

interface Props {
  projectId?: string;
  activeStage?: PreprodStage;
  readiness?: number;
  onStageChange?: (stage: PreprodStage) => void;
  compact?: boolean;
}

/**
 * Горизонтальная панель управления препродакшеном.
 * Располагается НАД логотипом MONTIQ на главной и в рабочем пространстве режиссёра.
 * С неё начинается создание любого видео: пользователь выбирает этап или идёт по порядку.
 */
export default function PreprodControlBar({
  projectId,
  activeStage,
  readiness = 0,
  onStageChange,
  compact,
}: Props) {
  return (
    <div className="w-full border-b border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-5 py-2.5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-amber-400 text-sm shadow-lg shadow-violet-500/30">
            🎬
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
              Pre-Production
            </div>
            <div className="-mt-0.5 text-[11px] font-semibold text-slate-200">
              AI Production Studio
            </div>
          </div>
        </Link>

        <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-thin">
          {PREPROD_STAGES.map((s, i) => {
            const isActive = activeStage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onStageChange?.(s.id)}
                title={s.label}
                className={`group relative flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                  isActive
                    ? "border-violet-400/50 bg-violet-500/20 text-violet-100 shadow-lg shadow-violet-900/30"
                    : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:bg-white/[0.05] hover:text-slate-200"
                }`}
              >
                <span className="text-xs leading-none">{s.icon}</span>
                <span className={compact ? "hidden" : "hidden md:inline"}>{s.short}</span>
                <span className="text-[9px] font-bold opacity-50">{String(i + 1).padStart(2, "0")}</span>
              </button>
            );
          })}
        </div>

        <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

        <div className="hidden flex-col items-end leading-tight sm:flex">
          <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Готовность
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 transition-all"
                style={{ width: `${Math.max(2, Math.min(100, readiness))}%` }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-200">{Math.round(readiness)}%</span>
          </div>
        </div>

        {projectId && (
          <Link
            href={`/editor/${projectId}`}
            className="ml-1 hidden shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-400 px-3 py-1.5 text-[10px] font-extrabold text-black shadow-lg transition hover:brightness-110 md:inline-block"
          >
            Редактор →
          </Link>
        )}
      </div>
    </div>
  );
}
