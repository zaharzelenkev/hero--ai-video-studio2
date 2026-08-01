import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint for storyboard sketch generation via Pollinations.ai (free, no key).
 *
 * POST /api/director/generate-frame
 *   body: { prompt, width, height, seed }
 *   returns { imageUrl } — a direct URL the browser can render in an <img>.
 *
 * If the remote service is unreachable for any reason we return an HTTP 502 so
 * the UI silently keeps the local SVG sketch that is always available.
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
    const prompt: string =
      typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt.slice(0, 400)
        : "cinematic storyboard sketch, high contrast";
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

    // Return a direct URL; the browser will load the image (and if Pollinations
    // is down the <img> onerror keeps the existing local SVG sketch in place).
    return NextResponse.json({ imageUrl: url, seed });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Unable to generate image" },
      { status: 502 }
    );
  }
}
