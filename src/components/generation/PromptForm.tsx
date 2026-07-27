"use client";

import { STYLE_CHIPS } from "@/lib/promptStyle";

export default function PromptForm({
  prompt,
  onChange,
}: {
  prompt: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-300">
        Опишите, что нужно сделать с материалами
      </label>
      <textarea
        value={prompt}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder='Например: "Сделай динамичный ролик из этих клипов с музыкой, тёплые тона, добавь титры"'
        className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-slate-100 placeholder:text-slate-500 transition-all duration-300 focus:border-violet-500/50 focus:bg-white/[0.04] focus:outline-none focus:ring-4 focus:ring-violet-500/10"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {STYLE_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => onChange(prompt ? `${prompt}, ${chip.hint}` : chip.hint)}
            className="rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-medium text-slate-300 transition-all hover:scale-105 hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-white hover:shadow-lg hover:shadow-violet-500/20 active:scale-95"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
