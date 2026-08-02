"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * MONTIQ editor — единые примитивы инспектора.
 * Все панели выглядят одинаково: секции с hairline-разделителями,
 * одинаковые кнопки, поля, слайдеры и переключатели.
 */

export function PanelSection({
  title,
  subtitle,
  children,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
  icon?: IconName;
}) {
  return (
    <section className="insp-section">
      <div className="insp-section-header">
        {icon && <Icon name={icon} size={13} strokeWidth={1.8} className="shrink-0 text-violet-300" />}
        <h3 className="insp-section-title">{title}</h3>
        {subtitle && <span className="insp-section-sub">{subtitle}</span>}
        {right && <div className="ml-auto flex shrink-0 items-center gap-1.5">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.13] bg-white/[0.015] px-5 py-7 text-center text-[11px] leading-relaxed text-slate-500">
      <Icon name="info" size={16} strokeWidth={1.6} className="text-slate-600" />
      <span>{children}</span>
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
  const styles = active
    ? tone === "danger"
      ? "border-rose-400/50 bg-rose-500/20 text-rose-100 shadow-[0_0_12px_-4px_rgba(244,63,94,0.5)]"
      : "border-violet-400/55 bg-violet-500/25 text-violet-100 shadow-[0_0_12px_-4px_rgba(124,108,246,0.6)]"
    : tone === "danger"
      ? "border-white/10 bg-white/[0.04] text-rose-300 hover:bg-rose-500/15 hover:border-rose-400/30"
      : tone === "accent"
        ? "border-violet-400/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 hover:border-violet-400/45"
        : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/20";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-all ${styles} ${
        disabled ? "cursor-not-allowed opacity-40" : "active:scale-[0.96]"
      }`}
    >
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
    <label className="block min-w-0">
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
          className="input !px-2 !py-1.5 !text-[11px]"
        />
        {suffix && <span className="shrink-0 text-[10px] text-slate-500">{suffix}</span>}
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
    <label className="block min-w-0">
      <span className="field-label mb-1 !text-[9px]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input !px-2 !py-1.5 !text-[11px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
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
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-300">
        <span className="truncate">{label}</span>
        <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-200">
          {display ? display(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-4 w-full"
        style={{ ["--range-pct" as string]: `${Math.max(0, Math.min(100, pct))}%` }}
        aria-label={label}
      />
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase text-slate-500">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5 transition hover:border-violet-400/40"
          aria-label={label}
        />
      </span>
    </label>
  );
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[11px] font-medium text-slate-300 transition hover:text-slate-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer rounded accent-[#7c6cf6]"
      />
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
