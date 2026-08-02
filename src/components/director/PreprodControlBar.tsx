"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PREPROD_STAGES, type PreprodStage } from "@/lib/production";
import { STAGE_ICONS } from "./stageIcons";

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
    <div className="w-full border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-5 py-2 sm:px-8">
        <div className="custom-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {PREPROD_STAGES.map((s) => {
            const isActive = activeStage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onStageChange?.(s.id)}
                title={s.label}
                className={`group relative flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                  isActive
                    ? "border-violet-400/40 bg-violet-500/[0.18] text-violet-100"
                    : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:bg-white/[0.05] hover:text-slate-200"
                }`}
              >
                <Icon name={STAGE_ICONS[s.id]} size={13} className={isActive ? "text-violet-200" : ""} />
                <span className={compact ? "hidden" : "hidden md:inline"}>{s.short}</span>
              </button>
            );
          })}
        </div>

        <div className="mx-1 hidden h-6 w-px bg-white/[0.08] sm:block" />

        <div className="hidden flex-col items-end leading-tight sm:flex">
          <div className="eyebrow text-[9px]">Готовность</div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, Math.min(100, readiness))}%`, background: "linear-gradient(90deg,#7c6cf6,#a78bfa)" }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-200">{Math.round(readiness)}%</span>
          </div>
        </div>

        {projectId && (
          <Link
            href={`/editor/${projectId}`}
            className="btn btn-primary ml-1 hidden shrink-0 px-3.5 py-1.5 text-[11px] md:inline-flex"
          >
            Редактор
            <Icon name="arrow-right" size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}
