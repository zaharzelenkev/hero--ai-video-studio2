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
        <label className="field-label mb-3">Стиль и шаблоны</label>
        <div className="custom-scrollbar -mx-2 flex gap-3 overflow-x-auto px-2 py-2 scroll-smooth">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplateChange(t.id)}
              className={`flex min-w-[150px] flex-col items-start rounded-2xl border p-4 text-left transition-all duration-300 ${
                templateId === t.id
                  ? "border-violet-400/60 bg-violet-500/[0.12] shadow-[0_0_40px_-14px_rgba(124,108,246,0.6)]"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
              }`}
            >
              <div className="mb-2 text-[22px]">{t.icon}</div>
              <h4 className={`mb-1 text-xs font-bold ${templateId === t.id ? "text-violet-100" : "text-slate-200"}`}>
                {t.name}
              </h4>
              <p className="line-clamp-2 text-[10px] leading-relaxed text-slate-500">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="field-label mb-2">Загрузите медиа или просто опишите идею видео</label>
        <textarea
          value={prompt}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder='Например: "Сделай рекламный ролик для кофейни" или "Смонтируй динамичный TikTok"'
          className="input resize-none rounded-2xl !py-4"
        />
        <div className="mt-3.5 flex flex-wrap gap-2">
          {STYLE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onChange(prompt ? `${prompt}, ${chip.hint}` : chip.hint)}
              className="chip hover:!border-violet-500/50 hover:!bg-violet-500/[0.1] hover:!text-white"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
