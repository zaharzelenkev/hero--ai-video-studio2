/**
 * PHOTO SEARCH — поиск РЕАЛЬНЫХ фотографий в открытых источниках.
 *
 * Используется создателем ИИ-видео: для существующих объектов (достопримечательности,
 * города, страны, известные места) вместо генерации нейросетью подбирается настоящее
 * фото. Чистые функции (разбор ответов, выбор лучшего кадра) не зависят от окружения
 * и покрыты unit-тестами (test-photo-search.mts). Сетевые обёртки используют
 * глобальный `fetch` и работают и в браузере, и на Node (серверный прокси-роут).
 */

export interface PhotoCandidate {
  url: string;
  width: number;
  height: number;
}

/** Parse Wikimedia Commons search response into photo candidates. */
export function parseWikimedia(data: unknown): PhotoCandidate[] {
  const out: PhotoCandidate[] = [];
  const pages = (data as any)?.query?.pages;
  if (!pages || typeof pages !== "object") return out;
  for (const page of Object.values(pages) as any[]) {
    const info = page?.imageinfo?.[0];
    const url = info?.url || info?.thumburl || "";
    if (!url) continue;
    if (/\.svg(\?|$)/.test(url.toLowerCase())) continue;
    const w = Number(info.width) || 0;
    const h = Number(info.height) || 0;
    out.push({ url, width: w, height: h });
  }
  return out;
}

/** Parse Openverse API response into photo candidates. */
export function parseOpenverse(data: unknown): PhotoCandidate[] {
  const out: PhotoCandidate[] = [];
  const results = (data as any)?.results;
  if (!Array.isArray(results)) return out;
  for (const r of results) {
    const url = r?.thumbnail || r?.url || "";
    if (!url) continue;
    if (/\.svg(\?|$)/.test(url.toLowerCase())) continue;
    const w = Number(r?.width) || Number(r?.thumbnail_width) || 0;
    const h = Number(r?.height) || Number(r?.thumbnail_height) || 0;
    out.push({ url, width: w, height: h });
  }
  return out;
}

/**
 * Pick the candidate whose orientation best matches the target frame, preferring
 * larger images on ties. Deterministic — same input, same output.
 */
export function pickBestPhoto(list: PhotoCandidate[], targetW: number, targetH: number): PhotoCandidate | null {
  if (list.length === 0) return null;
  const tAspect = targetW > 0 && targetH > 0 ? targetW / targetH : 1;
  let best: PhotoCandidate = list[0];
  let bestScore = -Infinity;
  for (const c of list) {
    const cAspect = c.width > 0 && c.height > 0 ? c.width / c.height : tAspect;
    const aspectMatch = 1 / (1 + Math.abs(Math.log((cAspect + 1e-6) / (tAspect + 1e-6))));
    const size = Math.log(1 + c.width * c.height);
    const s = aspectMatch * 1000 + size;
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

/** Direct Wikimedia Commons query (usable from browser or server). */
export async function searchWikimediaDirect(q: string, limit = 6): Promise<PhotoCandidate[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query` +
    `&generator=search&gsrsearch=${encodeURIComponent(q)}` +
    `&gsrnamespace=6&gsrlimit=${limit}` +
    `&prop=imageinfo&iiprop=url|size&iiurlwidth=1920&format=json&origin=*`;
  const res = await fetch(url, {
    headers: { "User-Agent": "MONTIQ-AI-Video-Studio/2.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  return parseWikimedia(await res.json());
}

/** Direct Openverse query (usable from browser or server). */
export async function searchOpenverseDirect(q: string, limit = 8): Promise<PhotoCandidate[]> {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${limit}&license_type=commercial,modification`;
  const res = await fetch(url, {
    headers: { "User-Agent": "MONTIQ-AI-Video-Studio/2.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  return parseOpenverse(await res.json());
}
