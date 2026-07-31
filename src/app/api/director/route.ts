import { NextRequest, NextResponse } from "next/server";
import { AI_CONFIG } from "@/config/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, projectTitle } = body;

    const system = `Ты — профессиональный режиссёр, продюсер и монтажёр с 20-летним опытом. Ты говоришь как человек, не как машина. Пишешь на русском, структурированно, с драматургией, маркетингом и визуальным мышлением. Не даёшь общих фраз — только конкретные художественные решения.`;

    const user = `Проект: "${projectTitle || "Новый проект"}"\nБриф: ${brief || "Нет описания"}\n\nСгенерируй полный Production Plan в формате:\n\n**1. ЛОГЛАЙН**\n(1-2 строки)\n\n**2. СЦЕНАРИЙ** (структура ролика)\n- Hook (0-5 сек)\n- Акт 1 (развитие)\n- Акт 2 (конфликт / кульминация)\n- Акт 3 (разрешение + CTA)\n\n**3. РЕЖИССЁРСКАЯ КОНЦЕПЦИЯ**\n(цвет, свет, камера, настроение, стиль референсов)\n\n**4. СТРУКТУРА РОЛИКА** (таймкод + описание каждой части)\n\n**5. ДРАМАТУРГИЯ / ЭМОЦИОНАЛЬНАЯ ДУГА**\n(начало → развитие → кульминация → финал)\n\n**6. STORYBOARD (6 кадров)**\nДля каждого: номер, описание изображения, движение камеры, свет, звук/диалог.\n\n**7. SHOT LIST**\nНомер, тип (wide/medium/close/insert), камера, длительность, описание.\n\n**8. РЕКОМЕНДАЦИИ**\n- Съёмка: освещение, объективы, стабилизация, движение камеры\n- B-Roll: что снимать дополнительно\n- Музыка: жанр, темп, настроение, ключ, момент входа\n- Цвет и LUT\n- Монтаж: темп, переходы, ритм, скорость\n- Титры и текст: стиль, положение, анимация\n- Переходы: типы, длительность`;

    const r = await fetch(AI_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_CONFIG.groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.6,
        max_tokens: 2500,
      }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => "");
      return NextResponse.json({ error: `Groq error ${r.status}: ${err.slice(0, 300)}` }, { status: 502 });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "Нет ответа.";
    return NextResponse.json({ result: text, sections: parseSections(text) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

function parseSections(text: string) {
  const sections: Record<string, string> = {};
  const map: Record<string, string> = {
    "ЛОГЛАЙН": "logline",
    "СЦЕНАРИЙ": "script",
    "РЕЖИССЁРСКАЯ КОНЦЕПЦИЯ": "concept",
    "СТРУКТУРА РОЛИКА": "structure",
    "ДРАМАТУРГИЯ": "drama",
    "STORYBOARD": "storyboard",
    "SHOT LIST": "shotlist",
    "РЕКОМЕНДАЦИИ": "recs",
  };
  for (const [label, key] of Object.entries(map)) {
    const regex = new RegExp(`\\*\\*\\s*${label}\\s*\\*\\*[\\s\\S]*?(?=\\*\\*\\s*[А-ЯЁ]\\w+\\s*\\*\\*|$)`);
    const match = text.match(regex);
    if (match) sections[key] = match[0].replace(/\*\*/g, "").trim();
  }
  return sections;
}
