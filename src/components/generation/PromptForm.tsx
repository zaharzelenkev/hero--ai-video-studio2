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
        className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {STYLE_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => onChange(prompt ? `${prompt}, ${chip.hint}` : chip.hint)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-violet-400 hover:text-white"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
