"use client";

import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { isPictureLocked, timelineDurationOf } from "@/lib/pictureLock";
import type { PictureLockIssue } from "@/lib/types";
import { PanelSection, ToggleButton, EmptyHint } from "./ui";
import { Icon } from "@/components/ui/Icon";

const KIND_LABELS: Record<PictureLockIssue["kind"], string> = {
  duration: "Длительность",
  rhythm: "Ритм",
  "long-shots": "Длинные кадры",
  "short-shots": "Короткие кадры",
  tempo: "Темп",
  "visual-logic": "Визуальная логика",
};

function StatusIcon({ severity }: { severity: PictureLockIssue["severity"] }) {
  if (severity === "ok") return <Icon name="check" size={12} className="text-emerald-400" />;
  if (severity === "warn") return <Icon name="alert" size={12} className="text-amber-400" />;
  return <Icon name="x" size={12} className="text-rose-400" />;
}

export default function PictureLockPanelV2() {
  const project = useProjectStore((s) => s.project);
  const runPictureLockCheck = useProjectStore((s) => s.runPictureLockCheck);
  const applyPictureLockFixes = useProjectStore((s) => s.applyPictureLockFixes);
  const confirmPictureLock = useProjectStore((s) => s.confirmPictureLock);
  const unlockPictureLock = useProjectStore((s) => s.unlockPictureLock);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!project) return <EmptyHint>Проект не загружен.</EmptyHint>;

  const locked = isPictureLocked(project);
  const lock = project.pictureLock ?? { stage: "none" as const };
  const report = lock.report;
  const duration = timelineDurationOf(project);

  const run = (fn: () => void) => {
    setBusy(true);
    // Даём кнопке отрисоваться, затем применяем (всё синхронно).
    setTimeout(() => {
      fn();
      setBusy(false);
    }, 30);
  };

  return (
    <div className="space-y-3">
      {/* Статус */}
      <div
        className={`rounded-xl border p-3 ${
          locked
            ? "border-emerald-400/30 bg-emerald-500/10"
            : lock.stage === "review"
              ? "border-amber-400/30 bg-amber-500/10"
              : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200"><Icon name={locked ? "lock" : lock.stage === "review" ? "clipboard" : "film"} size={22} /></span>
          <div>
            <div className={`text-xs font-black uppercase tracking-wider ${locked ? "text-emerald-300" : lock.stage === "review" ? "text-amber-300" : "text-slate-300"}`}>
              {locked ? "Picture Lock подтверждён" : lock.stage === "review" ? "Режим финальной сборки" : "Picture Lock не запускался"}
            </div>
            <div className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
              {locked
                ? `Монтаж зафиксирован ${lock.lockedAt ? new Date(lock.lockedAt).toLocaleString("ru-RU") : ""}. Дальше изменяются только цвет, звук, титры и эффекты.`
                : lock.stage === "review"
                  ? "Черновой монтаж завершён. Проверьте отчёт и подтвердите монтаж — после этого склейки и тайминг будут зафиксированы."
                  : "Запустите проверку, чтобы перейти в режим финальной сборки."}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {!locked && (
            <>
              <ToggleButton onClick={() => run(runPictureLockCheck)} disabled={busy} tone="accent">
                <Icon name="search" size={12} />Запустить проверку
              </ToggleButton>
              <ToggleButton
                onClick={() => run(applyPictureLockFixes)}
                disabled={busy || lock.stage === "none"}
                tone="accent"
                title={lock.stage === "none" ? "Сначала запустите проверку" : undefined}
              >
                <Icon name="wrench" size={12} />Исправить автоматически
              </ToggleButton>
            </>
          )}
          {lock.stage === "review" && !locked && (
            <>
              {!confirmOpen ? (
                <ToggleButton onClick={() => setConfirmOpen(true)} tone="accent">
                  <Icon name="lock" size={12} />Подтвердить Picture Lock
                </ToggleButton>
              ) : (
                <div className="flex w-full flex-col gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2">
                  <span className="text-[10px] font-semibold text-emerald-200">
                    После подтверждения монтаж фиксируется: склейки, тайминг, скорость и переходы больше не изменятся.
                    Дальше — только цвет, звук, титры и эффекты. Продолжить?
                  </span>
                  <div className="flex gap-1.5">
                    <ToggleButton tone="accent" onClick={() => { confirmPictureLock(); setConfirmOpen(false); }}>
                      <Icon name="check-circle" size={12} />Да, зафиксировать монтаж
                    </ToggleButton>
                    <ToggleButton onClick={() => setConfirmOpen(false)}>Отмена</ToggleButton>
                  </div>
                </div>
              )}
            </>
          )}
          {locked && (
            <>
              {!unlockOpen ? (
                <ToggleButton onClick={() => setUnlockOpen(true)} tone="danger">
                  <Icon name="draft" size={12} />Снять блокировку
                </ToggleButton>
              ) : (
                <div className="flex w-full flex-col gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2">
                  <span className="text-[10px] font-semibold text-rose-200">
                    Снять Picture Lock и вернуться к монтажу? Отчёт сохранится, но склейки снова станут редактируемыми.
                  </span>
                  <div className="flex gap-1.5">
                    <ToggleButton tone="danger" onClick={() => { unlockPictureLock(); setUnlockOpen(false); }}>
                      Да, разблокировать
                    </ToggleButton>
                    <ToggleButton onClick={() => setUnlockOpen(false)}>Отмена</ToggleButton>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!report && lock.stage === "none" && (
        <PanelSection title="Что такое Picture Lock">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Picture Lock — профессиональный рубеж постпродакшена, после которого монтаж считается окончательным.
            Система автоматически проверяет длительность ролика, ритм, слишком длинные и слишком короткие кадры,
            выравнивает темп и контролирует визуальную логику (дыры, jump cut&apos;ы, переходы). После подтверждения
            изменяются только цвет, звук, титры и эффекты.
          </p>
        </PanelSection>
      )}

      {report && (
        <>
          {/* Длительность */}
          <PanelSection title="Длительность ролика" right={<StatusIcon severity={report.durationOk ? "ok" : "fail"} />}>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-300">
                <span>Фактическая</span>
                <span className="font-mono">{duration.toFixed(2)} с</span>
              </div>
              {report.targetDuration !== undefined && (
                <div className="flex justify-between text-slate-400">
                  <span>Целевая (из брифа)</span>
                  <span className="font-mono">{report.targetDuration.toFixed(0)} с</span>
                </div>
              )}
            </div>
          </PanelSection>

          {/* Ритм */}
          <PanelSection title="Ритм" right={<StatusIcon severity={report.rhythmOk ? "ok" : "warn"} />}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div className="flex justify-between text-slate-300"><span>Планов</span><span className="font-mono">{report.issues.find((i) => i.kind === "rhythm")?.message.match(/\d+/)?.[0] ?? "—"}</span></div>
              <div className="flex justify-between text-slate-300"><span>Средний план</span><span className="font-mono">{report.averageShot.toFixed(2)} с</span></div>
              <div className="flex justify-between text-slate-400"><span>Медиана</span><span className="font-mono">{report.medianShot.toFixed(2)} с</span></div>
              <div className="flex justify-between text-slate-400"><span>Диапазон</span><span className="font-mono">{report.minShot.toFixed(2)}–{report.maxShot.toFixed(2)} с</span></div>
              <div className="flex justify-between text-slate-400"><span>Вариация темпа</span><span className="font-mono">{(report.tempoVariation * 100).toFixed(0)}%</span></div>
              {report.beatAlignment !== undefined && (
                <div className="flex justify-between text-slate-400"><span>Склейки в бит</span><span className="font-mono">{(report.beatAlignment * 100).toFixed(0)}%</span></div>
              )}
            </div>
          </PanelSection>

          {/* Итог проверок */}
          <PanelSection title="Проверки" right={<StatusIcon severity={report.allOk ? "ok" : report.issues.some((i) => i.severity === "fail") ? "fail" : "warn"} />}>
            <div className="space-y-1.5">
              {report.issues.length === 0 && <div className="text-[11px] text-slate-400">Проверок не проводилось.</div>}
              {report.issues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 p-2">
                  <span className="mt-0.5 shrink-0"><StatusIcon severity={issue.severity} /></span>
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{KIND_LABELS[issue.kind]}</div>
                    <div className="text-[11px] leading-snug text-slate-300">{issue.message}</div>
                  </div>
                </div>
              ))}
            </div>
            {report.fixes.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <Icon name="wrench" size={12} />Автоматические исправления ({report.fixes.length})
                </div>
                <div className="space-y-1">
                  {report.fixes.map((fix, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[10px] leading-snug text-emerald-200/90">
                      <Icon name="arrow-right" size={11} className="text-slate-600" />
                      <span>{fix.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </PanelSection>

          {locked && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-[11px] leading-relaxed text-emerald-200/90">
              <Icon name="lock" size={12} className="mr-1 inline-block text-emerald-300" /><b>Монтаж зафиксирован.</b> Редактор понимает, что Picture Lock завершён: страница «Монтаж» переведена
              в режим просмотра, таймлайн не позволяет двигать и обрезать планы, а изменения доступны только в разделах
              «Цвет», «Звук», «Текст» и «Эффекты».
            </div>
          )}
        </>
      )}
    </div>
  );
}
