import { NextRequest, NextResponse } from "next/server";
import { callGroq } from "@/lib/ai/groqClient";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { stage, prompt, userInput, context } = body;

    const systemPrompt = `Ты — профессиональный режиссёр короткометражки или видео. Отвечай кратко, без воды, только то, что реально нужно для создания ролика. Русский язык.`;

    const userMessage = `Пункт AI Director: ${stage}\n\nВопрос: ${prompt}\n\nОтвет пользователя: ${userInput || "(не указан)"}\n\nКонтекст уже сгенерированных пунктов:\n${context || "(пока ничего)"}\n\nДай конкретный, полезный ответ для этого пункта. Максимум 3-4 предложения.`;

    const groq = await callGroq({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
      maxTokens: 800,
      timeoutMs: 0, // без лимита времени — Groq отвечает столько, сколько нужно
      maxRetries: 2,
      responseFormat: { type: "text" },
    });

    if (groq.ok) {
      return NextResponse.json({ text: groq.text.trim(), ok: true });
    }

    // Fallback: local concise answer based on stage keywords so the UI never stalls
    const fallbackMap: Record<string, string> = {
      idea: "Замысел: короткий ролик с ясной темой и одним главным сообщением для конкретной аудитории.",
      goal: "Цель: зритель поймёт суть, почувствует эмоцию и сделает конкретное действие после просмотра.",
      audience: "Аудитория: люди, для которых тема ролика актуальна и интересна в данный момент.",
      format: "Формат: вертикаль или горизонталь под выбранную платформу, хронометраж по задаче.",
      location: "Локация: место с подходящим светом и звуком для задуманного действия.",
      mood: "Настроение: эмоция, которая поддерживает цель ролика и удерживает внимание зрителя.",
      materials: "Материалы: всё, что уже снято или доступно, используется полностью без выборочного обрезания.",
      hook: "Хук: первая секунда с конкретным обещанием или визуальным ударом, чтобы остановить скролл.",
      script: "Сценарий: начало (контекст), развитие (конфликт/решение), финал (вывод или призыв к действию).",
      visual: "Визуал: крупные планы для эмоции, общие для контекста, движение камеры по смыслу.",
      sound: "Звук: музыка под ритм, чистая речь без обрезки, звуковые акценты на ключевых моментах.",
      plan: "План: кто снимает, когда монтаж, что проверять перед экспортом — коротко и по делу.",
    };

    const fallbackText = fallbackMap[stage] || `Ответ для пункта «${stage}» — конкретное режиссёрское решение под ваш ролик.`;

    return NextResponse.json({ text: fallbackText, ok: false, note: "local_fallback" });
  } catch (e: any) {
    return NextResponse.json({ error: "Chunk generation error", text: "Ошибка генерации. Попробуйте снова." }, { status: 500 });
  }
}
