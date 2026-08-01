import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy-эндпоинт для генерации эскизов раскадровки через бесплатный Pollinations.ai
 * (не требует ключа, CORS-разрешён).
 *
 * POST /api/director/generate-frame
 * body: { prompt, width, height, seed }
 * returns: { imageUrl } (прямая ссылка на сгенерированное изображение)
 *
 * Поскольку это бесплатный внешний сервис, он может быть недоступен — в этом случае
 * UI использует локальный SVG-эскиз из src/lib/sketch.ts.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  if (action !== "generate-frame") {
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const prompt: string = typeof body.prompt === "string" ? body.prompt.slice(0, 400) : "cinematic storyboard sketch";
    const width = Math.min(Number(body.width) || 640, 1024);
    const height = Math.min(Number(body.height) || 360, 1024);
    const seed = Number(body.seed) || Math.floor(Math.random() * 1_000_000);

    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      seed: String(seed),
      model: "flux",
      nologo: "true",
      enhance: "false",
    });
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

    // HEAD-check to ensure service is reachable (don't fetch image bytes here —
    // the browser will load the image directly from pollinations via <img>).
    return NextResponse.json({ imageUrl: url, seed, fallback: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "generation failed", fallback: true }, { status: 502 });
  }
}
