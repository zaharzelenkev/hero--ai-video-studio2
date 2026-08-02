"use client";

import { useMemo, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { PACE_LABELS } from "@/lib/brain/sceneDirection";
import type { PlannedScene } from "@/lib/brain/directorPlan";

/**
 * OFFLINE EDIT (Черновой монтаж) — что автоматика сделала до того,
 * как пользователь открыл таймлайн.
 *
 * Панель отвечает на единственный вопрос профессионала: «почему монтаж
 * выглядит именно так?». Каждое решение показывается вместе с причиной:
 * какой дубль выбран и чем он лучше, что вырезано из речи, как
 * синхронизирован звук, какая цель/темп/цвет/музыка у каждой сцены.
 */

const PHASE_LABELS: Record<string, string> = {
  teaser: "Тизер",
  hook: "Хук",
  setup: "Контекст",
  buildup: "Нарастание",
  preClimax: "Взвод",
  climax: "Кульминация",
  resolution: "Развязка",
  outro: "Выдох",
};

const PHASE_COLORS: Record<string, string> = {
  teaser: "bg-amber-500/15 text-amber-300 border-amber-400/25",
  hook: "bg-rose-500/15 text-rose-300 border-rose-400/25",
  setup: "bg-sky-500/15 text-sky-300 border-sky-400/25",
  buildup: "bg-violet-500/15 text-violet-300 border-violet-400/25",
  preClimax: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/25",
  climax: "bg-orange-500/20 text-orange-300 border-orange-400/30",
  resolution: "bg-teal-500/15 text-teal-300 border-teal-400/25",
  outro: "bg-slate-500/15 text-slate-300 border-slate-400/25",
};

const CUT_KIND_LABELS: Record<string, string> = {
  pause: "пауза",
  filler: "слово-паразит",
  cough: "кашель / шум",
  breath: "лишний вдох",
  retake: "случайный дубль",
  "silence-head": "тишина в начале",
};

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d0d16] p-3 shadow-inner">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-violet-300">{title}</h3>
        {badge && (
          <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-200">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Stat({ value, label, tone = "default" }: { value: string; label: string; tone?: "default" | "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-slate-100";
  return (
    <div className="rounded-xl border border-white/5 bg-black/30 px-2 py-1.5 text-center">
      <div className={`text-sm font-extrabold leading-tight ${color}`}>{value}</div>
      <div className="text-[9px] leading-tight text-slate-500">{label}</div>
    </div>
  );
}

export default function OfflineEditPanel() {
  const project = useProjectStore((s) => s.project);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const [openScene, setOpenScene] = useState<string | null>(null);

  const plan = project?.directorPlan;

  /** Время начала каждой сцены на таймлайне — для перехода по клику. */
  const sceneStarts = useMemo(() => {
    const out = new Map<string, number>();
    let t = 0;
    for (const s of plan?.scenes ?? []) {
      out.set(s.id, t);
      t += s.duration;
    }
    return out;
  }, [plan]);

  if (!project) return <div className="text-xs text-slate-400">Проект не загружен.</div>;

  if (!plan) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0d0d16] p-4 text-center">
        <div className="mb-2 text-3xl">✂️</div>
        <h3 className="mb-1 text-sm font-bold text-slate-200">Черновой монтаж не выполнялся</h3>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Этот проект собран вручную. Автоматический черновой монтаж (умный выбор дублей,
          синхронизация звука, чистка речи и драматургия) выполняется при создании проекта
          через AI-генерацию.
        </p>
      </div>
    );
  }

  const oe = plan.offlineEdit;
  const totalDur = plan.scenes.reduce((a, s) => a + s.duration, 0);

  return (
    <div className="space-y-3">
      {/* ---------------- Сводка ---------------- */}
      <Card title="Offline Edit · черновой монтаж" badge={plan.kind === "narrative" ? "нарратив" : "визуальный"}>
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          <Stat value={String(plan.scenes.length)} label="сцен" />
          <Stat value={`${totalDur.toFixed(0)}с`} label="хронометраж" />
          <Stat
            value={`${(oe?.totalTrimmedSec ?? 0).toFixed(0)}с`}
            label="отсеяно"
            tone={(oe?.totalTrimmedSec ?? 0) > 0 ? "good" : "default"}
          />
          <Stat value={`${plan.climaxAt.toFixed(0)}с`} label="кульминация" />
        </div>
        <p className="text-[11px] leading-relaxed text-slate-300">{plan.concept}</p>
        {oe?.summary.map((s, i) => (
          <div key={i} className="mt-1.5 rounded-lg border border-emerald-400/15 bg-emerald-500/5 px-2 py-1.5 text-[10px] leading-relaxed text-emerald-200">
            {s}
          </div>
        ))}
      </Card>

      {/* ---------------- Синхронизация звука ---------------- */}
      {oe?.audioSync && oe.audioSync.pairs.length > 0 && (
        <Card title="Синхронизация звука" badge={`${oe.audioSync.pairs.filter((p) => p.applied).length} применено`}>
          <div className="space-y-1.5">
            {oe.audioSync.pairs.map((p, i) => (
              <div
                key={i}
                className={`rounded-lg border px-2 py-1.5 text-[10px] leading-relaxed ${
                  p.applied
                    ? "border-emerald-400/20 bg-emerald-500/5 text-emerald-200"
                    : "border-white/10 bg-black/30 text-slate-400"
                }`}
              >
                <div className="font-bold">
                  {p.audioName} → {p.videoName}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-mono">
                    {p.offsetSec >= 0 ? "+" : ""}
                    {p.offsetSec.toFixed(2)}с
                  </span>
                  <span className="text-slate-500">уверенность {(p.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-0.5 text-slate-400">{p.reason}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---------------- Умный выбор дублей ---------------- */}
      {oe?.takes && oe.takes.groups > 0 && (
        <Card title="Умный выбор дублей" badge={`${oe.takes.rejected} отбраковано`}>
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            <Stat value={String(oe.takes.groups)} label="групп" />
            <Stat value={String(oe.takes.rejected)} label="дублей отсеяно" tone="good" />
            <Stat value={`${oe.takes.rejectedSec}с`} label="материала" />
          </div>
          <div className="space-y-1.5">
            {oe.takes.decisions.map((d, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/30 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-bold text-emerald-300">
                    ✓ {d.assetName} @{d.start}с
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-emerald-400">{d.score.toFixed(2)}</span>
                </div>
                {d.strengths.length > 0 && (
                  <div className="mt-0.5 text-[9px] text-slate-400">Сильные стороны: {d.strengths.join(", ")}</div>
                )}
                {d.losers.map((l, j) => (
                  <div key={j} className="mt-1 border-l-2 border-rose-400/30 pl-2 text-[9px] leading-relaxed text-slate-400">
                    <span className="text-rose-300">✕ {l.assetName} @{l.start}с</span> — {l.reason}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---------------- Чистка речи ---------------- */}
      {oe?.speechCleanup && oe.speechCleanup.length > 0 && (
        <Card title="Чистка речевой дорожки">
          {oe.speechCleanup.map((sc, i) => (
            <div key={i} className="mb-2 last:mb-0">
              <div className="mb-1.5 grid grid-cols-5 gap-1">
                <Stat value={String(sc.pauses)} label="пауз" />
                <Stat value={String(sc.fillers)} label="паразитов" />
                <Stat value={String(sc.coughs)} label="кашля" />
                <Stat value={String(sc.breaths)} label="вдохов" />
                <Stat value={String(sc.retakes)} label="дублей" />
              </div>
              <div className="mb-1.5 text-[10px] text-slate-400">
                Удалено <span className="font-bold text-amber-300">{sc.removedSec.toFixed(1)}с</span>, осталось{" "}
                <span className="font-bold text-emerald-300">{sc.keptSec.toFixed(1)}с</span> чистой речи.
              </div>
              <div className="space-y-1">
                {sc.examples.map((ex, j) => (
                  <button
                    key={j}
                    onClick={() => setPlayhead(Math.max(0, ex.start))}
                    className="flex w-full items-start gap-2 rounded-lg border border-white/5 bg-black/30 px-2 py-1 text-left transition hover:border-violet-400/30 hover:bg-violet-500/5"
                  >
                    <span className="shrink-0 font-mono text-[9px] text-slate-500">{ex.start.toFixed(1)}с</span>
                    <span className="shrink-0 rounded bg-rose-500/15 px-1 text-[9px] text-rose-300">
                      {CUT_KIND_LABELS[ex.kind] ?? ex.kind}
                    </span>
                    <span className="truncate text-[9px] text-slate-400">{ex.text || ex.reason}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* ---------------- Драматургия по сценам ---------------- */}
      <Card title="Драматургия · режиссёрский план" badge={`${plan.scenes.length} сцен`}>
        <div className="space-y-1">
          {plan.scenes.map((s: PlannedScene) => {
            const start = sceneStarts.get(s.id) ?? 0;
            const open = openScene === s.id;
            return (
              <div key={s.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
                <button
                  onClick={() => {
                    setOpenScene(open ? null : s.id);
                    setPlayhead(start);
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-white/5"
                >
                  <span className="shrink-0 font-mono text-[9px] text-slate-500">{start.toFixed(1)}с</span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                      PHASE_COLORS[s.phase] ?? PHASE_COLORS.buildup
                    }`}
                  >
                    {PHASE_LABELS[s.phase] ?? s.phase}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{s.goal}</span>
                  <span className="shrink-0 text-[9px] text-slate-500">{s.duration.toFixed(1)}с</span>
                </button>
                {open && (
                  <div className="space-y-1 border-t border-white/5 bg-black/40 px-2 py-2 text-[9px] leading-relaxed">
                    <Row label="Цель" value={s.goal} />
                    <Row label="Эмоция" value={s.emotion} />
                    <Row label="Темп" value={PACE_LABELS[s.pace] ?? s.pace} />
                    <Row
                      label="Переход"
                      value={`${s.transitionIn?.type ?? "cut"}${
                        s.transitionIn?.duration ? ` · ${s.transitionIn.duration.toFixed(2)}с` : ""
                      }${s.transitionIn?.reason ? ` — ${s.transitionIn.reason}` : ""}`}
                    />
                    <Row label="Цвет" value={`${s.colorMood.mood} — ${s.colorMood.reason}`} />
                    <Row
                      label="Музыка"
                      value={`${s.music.role} · ${(s.music.level * 100).toFixed(0)}%${
                        s.music.ducking ? " · ducking" : ""
                      }${s.music.accent ? " · акцент" : ""} — ${s.music.reason}`}
                    />
                    {s.brollRecommendations.length > 0 && (
                      <Row
                        label="B-Roll"
                        value={s.brollRecommendations
                          .map((b) => `${b.subject}${b.matchedAssetId ? "" : " (нет материала)"} — ${b.reason}`)
                          .join("; ")}
                      />
                    )}
                    {typeof s.takeScore === "number" && (
                      <Row
                        label="Дубль"
                        value={`оценка ${s.takeScore.toFixed(2)}/1.00${
                          s.takeAlternatives ? ` · победил среди ${s.takeAlternatives + 1} дублей` : ""
                        }`}
                      />
                    )}
                    <Row label="Почему" value={s.why} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------------- Самопроверка ---------------- */}
      {(plan.qa.passed.length > 0 || plan.qa.fixed.length > 0) && (
        <Card title="Самопроверка режиссёра">
          {plan.qa.passed.map((p, i) => (
            <div key={`p${i}`} className="mb-1 text-[10px] leading-relaxed text-emerald-300">
              ✓ {p}
            </div>
          ))}
          {plan.qa.fixed.map((f, i) => (
            <div key={`f${i}`} className="mb-1 text-[10px] leading-relaxed text-amber-300">
              ⟳ {f}
            </div>
          ))}
        </Card>
      )}

      {/* ---------------- Журнал решений ---------------- */}
      {plan.directorNotes.length > 0 && (
        <Card title="Журнал решений" badge={`${plan.directorNotes.length}`}>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {plan.directorNotes.map((n, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-black/30 px-2 py-1 text-[9px] leading-relaxed text-slate-400">
                {n}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="w-14 shrink-0 font-bold text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-slate-300">{value}</span>
    </div>
  );
}
