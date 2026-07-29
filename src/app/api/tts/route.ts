import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get("text");
  if (!text) return new NextResponse("Missing text", { status: 400 });

  const url = `https://api.streamelements.com/kappa/v2/speech?voice=Maxim&text=${encodeURIComponent(text)}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      return new NextResponse(`TTS failed: ${response.status}`, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    return new NextResponse(`TTS network error: ${error}`, { status: 500 });
  }
}
