"use client";

import { pickBestPhoto, searchWikimediaDirect } from "./photoSearch";

export interface RealPhoto {
  url: string;
  width: number;
  height: number;
  source: string;
}

/**
 * Поиск настоящего фото по поисковому запросу для ИИ-видео.
 *
 * Сначала серверный прокси `/api/image-search` (Wikimedia → Openverse), при его
 * недоступности — прямой запрос к Wikimedia из браузера. Возвращает null, если
 * реальное фото найти не удалось (тогда вызывающий может прибегнуть к генерации).
 */
export async function searchRealPhoto(
  query: string,
  targetW: number,
  targetH: number,
): Promise<RealPhoto | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  // 1. Server proxy (multiple sources, no CORS).
  try {
    const res = await fetch(`/api/image-search?q=${encodeURIComponent(q)}&width=${targetW}&height=${targetH}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.url) return { url: data.url, width: data.width, height: data.height, source: data.source || "proxy" };
    }
  } catch (e) {
    console.warn("image-search proxy failed", e);
  }

  // 2. Client-side Wikimedia direct fallback.
  try {
    const wiki = await searchWikimediaDirect(q);
    const best = pickBestPhoto(wiki, targetW, targetH);
    if (best) return { url: best.url, width: best.width, height: best.height, source: "wikimedia-direct" };
  } catch (e) {
    console.warn("direct wikimedia search failed", e);
  }

  return null;
}
