"use client";

import type { ReactNode } from "react";

export function PanelSection({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="surface-card mb-3 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300">{title}</h3>
        {subtitle && <span className="truncate text-[10px] text-slate-500">{subtitle}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.015] p-5 text-center text-[11px] leading-relaxed text-slate-500">
      {children}
    </div>
  );
}

export function ToggleButton({
  children,
  active,
  onClick,
  tone = "default",
  title,
  disabled,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "danger" | "accent";
  title?: string;
  disabled?: boolean;
}) {
  const base = "rounded-lg border px-2 py-1 text-[10px] font-bold transition";
  const styles = active
    ? tone === "danger"
      ? "border-rose-400/50 bg-rose-500/20 text-rose-100"
      : "border-violet-400/50 bg-violet-500/25 text-violet-100"
    : tone === "danger"
      ? "border-white/10 bg-white/[0.04] text-rose-300 hover:bg-rose-500/15"
      : tone === "accent"
        ? "border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white";
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} className={`${base} ${styles} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}>
      {children}
    </button>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="field-label mb-1 !text-[9px]">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          className="input !px-2 !py-1 !text-[11px]"
        />
        {suffix && <span className="text-[10px] text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="field-label mb-1 !text-[9px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input !px-2 !py-1 !text-[11px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#101017]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display?: (v: number) => string;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-violet-300">{display ? display(value) : value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full"
        style={{ accentColor: "var(--primary)" }}
        aria-label={label}
      />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0"
        aria-label={label}
      />
    </label>
  );
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 text-[11px] text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "var(--primary)" }} />
      {label}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  rows = 1,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label mb-1 !text-[9px]">{label}</span>
      {rows > 1 ? (
        <textarea
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`input resize-none !px-2 !py-1.5 !text-[11px] ${mono ? "font-mono" : ""}`}
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`input !px-2 !py-1.5 !text-[11px] ${mono ? "font-mono" : ""}`}
        />
      )}
    </label>
  );
}
