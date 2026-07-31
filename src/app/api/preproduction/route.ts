import { NextRequest, NextResponse } from "next/server";
import { AI_CONFIG } from "@/config/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { task, prompt, projectTitle } = body;

    const systemPrompt = `Ты — профессиональный AI-продюсер и режиссёр. Твоя задача: помочь создать качество кино до начала съёмок.

Отвечай на русском языке, структурированно, по пунктам, без воды.`;

    let userContent = `Проект: "${projectTitle || "Новый проект"}"\nЗадача: ${task}\n`;
    if (prompt) userContent += `Контекст/идея: ${prompt}\n`;

    // Task-specific instructions
    if (task === "idea") {
      userContent += `\nСгенерируй 3 идеи для ролика/фильма с описанием концепции, целевой аудитории и эмоционального посыла.`;
    } else if (task === "logline") {
      userContent += `\nНапиши 1-2 предложения — логлайн (герой + желание + препятствие + результат).`;
    } else if (task === "script") {
      userContent += `\nНапиши сценарий: вводная сцена (30 сек), кульминация, финал. Формат: Сцена — Визуал — Диалог/Звук — Примечание.`;
    } else if (task === "storyboard") {
      userContent += `\nСоздай раскадровку из 6-8 кадров. Для каждого: номер, описание изображения, движение камеры, свет, диалог/звук.`;
    } else if (task === "shotlist") {
      userContent += `\nСоздай список кадров (shot list): номер, тип (wide/medium/close/insert), движение камеры, длительность, описание.`;
    } else if (task === "recommendations") {
      userContent += `\nДай рекомендации по съёмке: освещение (ключевой/заполняющий), объективы (фокусное расстояние), движение камеры (стабилизация/тревелл/дрон), B-Roll (что снимать дополнительно), музыка (жанр, темп, настроение), стиль монтажа (темп, переходы, цветокоррекция).`;
    } else {
      userContent += `\nДай полный AI-препродакшн-план по этому запросу.`;
    }

    const r = await fetch(AI_CONFIG.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_CONFIG.groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
        max_tokens: 1200,
      }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => "");
      return NextResponse.json({ error: `Groq error ${r.status}: ${err.slice(0, 200)}` }, { status: 502 });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "Нет ответа от AI.";
    return NextResponse.json({ result: text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
