"use client";

import { STYLE_CHIPS } from "@/lib/promptStyle";
import { TEMPLATES, type TemplateId } from "@/lib/templates";

export default function PromptForm({
  prompt,
  onChange,
  templateId,
  onTemplateChange,
}: {
  prompt: string;
  onChange: (v: string) => void;
  templateId: TemplateId | "";
  onTemplateChange: (t: TemplateId) => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <label className="mb-3 block text-sm font-medium text-slate-300">
          Стиль и шаблоны
        </label>
        <div className="flex gap-3 overflow-x-auto py-4 px-2 -mx-2 scroll-smooth custom-scrollbar">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplateChange(t.id)}
              className={`flex min-w-[140px] flex-col items-start rounded-2xl border p-4 text-left transition-all duration-300 ${
                templateId === t.id
                  ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/20 scale-[1.02] ring-1 ring-violet-500"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20"
              }`}
            >
              <div className="mb-2 text-2xl">{t.icon}</div>
              <h4 className="mb-1 text-xs font-bold text-slate-200">{t.name}</h4>
              <p className="text-[10px] text-slate-500 line-clamp-2">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
  
      <div>
      <label className="mb-2 block text-sm font-medium text-slate-300">
        Загрузите медиа или просто опишите идею видео
      </label>
      <textarea
        value={prompt}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder='Например: "Сделай рекламный ролик для кофейни" или "Смонтируй динамичный TikTok"'
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
    </div>
  );
}
