"use client";

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  onRegenerate?: () => void;
  busy?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function StageShell({ icon, title, subtitle, onRegenerate, busy, children, actions }: Props) {
  return (
    <section className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl backdrop-blur-2xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-amber-400/20 text-xl shadow-inner">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-slate-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={busy}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              title="Перегенерировать этот раздел с учётом актуального состояния проекта"
            >
              ↻ AI пересоздаст
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300/90 first:mt-0">{children}</h3>;
}

export function BulletList({ items, onChange }: { items: string[]; onChange?: (v: string[]) => void }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-300">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400/70" />
          {onChange ? (
            <input
              value={it}
              onChange={(e) => {
                const v = [...items];
                v[i] = e.target.value;
                onChange(v);
              }}
              className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] text-slate-200 outline-none hover:border-white/10 focus:border-violet-400/50 focus:bg-black/30"
            />
          ) : (
            <span>{it}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TextArea({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-y rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3 text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-600 outline-none transition focus:border-violet-400/50 focus:bg-black/40"
    />
  );
}

export function NumberSlider({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-[11px] font-semibold text-slate-400 w-32">{label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-violet-500"
      />
      <span className="w-10 shrink-0 rounded-lg bg-black/30 px-2 py-1 text-center text-[12px] font-bold text-violet-200">{value}</span>
    </div>
  );
}

export function ScoreBadge({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const cls =
    pct >= 75
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : pct >= 50
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : "border-rose-400/30 bg-rose-500/10 text-rose-200";
  const dot =
    pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} /> {value}/{max}
    </span>
  );
}
