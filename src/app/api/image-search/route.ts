import { NextRequest, NextResponse } from "next/server";
import {
  pickBestPhoto,
  searchOpenverseDirect,
  searchWikimediaDirect,
} from "@/lib/photoSearch";

/**
 * Image search proxy — поиск РЕАЛЬНЫХ фотографий в интернете для ИИ-видео.
 *
 * Когда пользователь просит ролик про существующий объект (достопримечательность,
 * город, страну, известное место), генерировать его нейросетью неправильно —
 * получится выдумка. Вместо этого подбираем настоящее фото из открытых источников:
 *
 *   1. Wikimedia Commons  — крупнейший свободный фотоархив (без ключа).
 *   2. Openverse API      — бесплатный поиск по открытым лицензиям (без ключа).
 *
 * Роут выполняется на сервере: обходит CORS-ограничения браузера, пробует
 * источники по очереди и возвращает прямую ссылку на фото (или 404).
 * Параметры: q (поисковый запрос), width/height (подсказка ориентации кадра).
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") || "").trim();
  const w = Math.max(1, parseInt(params.get("width") || "1080", 10) || 1080);
  const h = Math.max(1, parseInt(params.get("height") || "1920", 10) || 1920);

  if (q.length < 2) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const errors: string[] = [];

  // 1. Wikimedia Commons first (stable, reliable, great for landmarks).
  try {
    const wiki = await searchWikimediaDirect(q);
    const best = pickBestPhoto(wiki, w, h);
    if (best) {
      return NextResponse.json({ url: best.url, width: best.width, height: best.height, source: "wikimedia" });
    }
    errors.push("wikimedia: no results");
  } catch (e) {
    errors.push("wikimedia: " + (e as Error).message);
  }

  // 2. Openverse fallback (broader stock coverage, free/commercial licenses).
  try {
    const ov = await searchOpenverseDirect(q);
    const best = pickBestPhoto(ov, w, h);
    if (best) {
      return NextResponse.json({ url: best.url, width: best.width, height: best.height, source: "openverse" });
    }
    errors.push("openverse: no results");
  } catch (e) {
    errors.push("openverse: " + (e as Error).message);
  }

  return NextResponse.json({ error: "no real photo found", detail: errors.join("; ") }, { status: 404 });
}
