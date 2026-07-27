import { NextRequest, NextResponse } from "next/server";

// Runs on Vercel's Node serverless runtime so we can hold GROQ_API_KEY as a
// server-only environment variable. It is never sent to the browser: the
// client only ever talks to this same-origin route, never to Groq directly.
export const runtime = "nodejs";

interface GroqSegment {
  start: number;
  end: number;
  text: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Распознавание речи не настроено на сервере: не указан GROQ_API_KEY." },
      { status: 501 },
    );
  }

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const audio = incoming.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Не передан аудиофайл." }, { status: 400 });
  }

  const groqForm = new FormData();
  groqForm.append("file", audio, "audio.mp3");
  groqForm.append("model", "whisper-large-v3-turbo");
  groqForm.append("response_format", "verbose_json");

  let groqResp: Response;
  try {
    groqResp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });
  } catch {
    return NextResponse.json({ error: "Сервис распознавания речи недоступен, попробуйте позже." }, { status: 502 });
  }

  if (!groqResp.ok) {
    const detail = await groqResp.text().catch(() => "");
    return NextResponse.json(
      { error: `Ошибка распознавания речи (${groqResp.status}). ${detail.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const data = (await groqResp.json()) as { segments?: GroqSegment[] };
  const segments = (data.segments || [])
    .map((s) => ({ start: s.start, end: s.end, text: (s.text || "").trim() }))
    .filter((s) => s.text.length > 0);

  return NextResponse.json({ segments });
}
