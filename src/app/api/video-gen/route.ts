import { NextRequest, NextResponse } from "next/server";

/**
 * Text-to-Video generation proxy (Pollinations.AI — open-source, free tier).
 *
 * Honest free-tier situation: there is NO fully anonymous unlimited
 * text-to-video API anywhere (video GPU time is the most expensive AI
 * operation that exists). The best genuinely free option is Pollinations.AI:
 * an MIT-licensed platform where you register once (no credit card) at
 * https://enter.pollinations.ai and receive free weekly Pollen credits.
 *
 * Setup (optional — the app works fully without it):
 *   1. Get a free key at https://enter.pollinations.ai/keys
 *   2. Add POLLINATIONS_API_KEY=sk_... to Vercel env / .env.local
 *
 * Without a key this route returns 503 and the client automatically falls
 * back to the free image pipeline (Flux images + our motion engine), so
 * generation never breaks and never costs money.
 */

// Video generation is slow (30–120s). Needs Node runtime + extended duration.
export const runtime = "nodejs";
export const maxDuration = 300;

const POLLINATIONS_BASE = "https://gen.pollinations.ai";

function getKey(): string | undefined {
  return process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY || undefined;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const key = getKey();

  // Capability probe: the client asks once whether real video generation
  // is available before deciding which pipeline to run.
  if (params.get("health") === "1") {
    return NextResponse.json({ videoEnabled: Boolean(key) });
  }

  if (!key) {
    return NextResponse.json(
      { error: "video generation disabled: no POLLINATIONS_API_KEY configured" },
      { status: 503 }
    );
  }

  const prompt = params.get("prompt");
  if (!prompt || prompt.trim().length < 3) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  // seedance: fast, cheap, supports 2–10s, seed, 16:9 / 9:16 — the best
  // quality-per-free-credit ratio on the platform right now.
  const model = params.get("model") || process.env.POLLINATIONS_VIDEO_MODEL || "seedance";
  const duration = Math.max(2, Math.min(10, parseInt(params.get("duration") || "5", 10) || 5));
  const aspectRatio = params.get("aspectRatio") === "16:9" ? "16:9" : "9:16";
  const seed = params.get("seed") || "0";

  const url =
    `${POLLINATIONS_BASE}/video/${encodeURIComponent(prompt)}` +
    `?model=${encodeURIComponent(model)}&duration=${duration}&aspectRatio=${aspectRatio}&seed=${encodeURIComponent(seed)}`;

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      // 4.5 min hard cap: leaves headroom before Vercel's own maxDuration.
      signal: AbortSignal.timeout(270_000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `upstream ${upstream.status}: ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("video")) {
      // Some upstream failures come back 200 with JSON/error bodies —
      // never hand those to the client as "video".
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `unexpected content-type ${contentType}: ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength < 20_000) {
      return NextResponse.json({ error: "video too small — likely failed" }, { status: 502 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `video-gen network error: ${error}` }, { status: 500 });
  }
}
