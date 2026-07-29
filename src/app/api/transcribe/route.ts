import { NextRequest, NextResponse } from "next/server";

// Runs on Vercel's Node serverless runtime so we can hold GROQ_API_KEY as a
// server-only environment variable. It is never sent to the browser: the
// client only ever talks to this same-origin route, never to Groq directly.
export const runtime = "nodejs";


export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY || "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";
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
  groqForm.append("timestamp_granularities[]", "word");
  groqForm.append("timestamp_granularities[]", "segment");

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

  
  const data = (await groqResp.json()) as any;
  const segments = (data.segments || [])
    .map((s: any) => ({ start: s.start, end: s.end, text: (s.text || "").trim() }))
    .filter((s: any) => s.text.length > 0);

  let words: { word: string; start: number; end: number }[] = data.words || [];

  // If the API didn't return word-level timestamps (which Whisper often doesn't by default unless requested,
  // and sometimes even then depending on the provider), we dynamically extrapolate them from segments.
  if (words.length === 0 && segments.length > 0) {
    for (const seg of segments) {
      const segText = seg.text.trim();
      if (!segText) continue;
      const segWords = segText.split(/\s+/);
      const totalChars = segWords.join("").length;
      const dur = Math.max(0.1, seg.end - seg.start);
      let currentStart = seg.start;
      
      for (const w of segWords) {
        // Calculate duration based on character count proportion to make it more natural
        const wDur = (w.length / totalChars) * dur;
        words.push({ word: w, start: currentStart, end: currentStart + wDur });
        currentStart += wDur;
      }
    }
  }

  return NextResponse.json({ segments, words });

}
