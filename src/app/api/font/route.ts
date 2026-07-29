import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const family = req.nextUrl.searchParams.get("family");
  if (!family) return new NextResponse("Missing font family", { status: 400 });
  const weight = req.nextUrl.searchParams.get("weight") || "700";

  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  
  try {
    const cssResp = await fetch(cssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!cssResp.ok) return new NextResponse(`Failed to fetch Google Fonts CSS`, { status: cssResp.status });

    
    
    

    // Some Google Fonts return woff2 to modern browsers, we need to bypass or convert.
    // Wait, FFmpeg's FreeType actually supports woff2 if compiled with it, but usually standard TTF is safer.
    // If we change the User-Agent to an old browser, Google Fonts will return a raw TTF URL.
    const oldCssResp = await fetch(cssUrl, {
      headers: {
        "User-Agent": "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0)" // Extremely old IE forces TTF
      }
    });
    const oldCssText = await oldCssResp.text();
    const rawTtfMatch = oldCssText.match(/url\((https:\/\/[^)]+\.ttf)\)/);
    
    if (!rawTtfMatch) {
       return new NextResponse("Could not extract TTF URL from Google Fonts", { status: 500 });
    }

    const ttfUrl = rawTtfMatch[1];
    const fontResp = await fetch(ttfUrl);
    const buffer = await fontResp.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "font/ttf",
        "Cache-Control": "public, max-age=31536000",
        "Access-Control-Allow-Origin": "*"
      },
    });

  } catch (error) {
    return new NextResponse(`Font network error: ${error}`, { status: 500 });
  }
}
