/**
 * Бесплатная музыкальная библиотека для автомонтажа.
 *
 * Треки берутся из Wikimedia Commons: это открытая медиатека, не требующая
 * ключа, аккаунта или платного API. Мы сначала получаем актуальный URL файла
 * через MediaWiki API, затем сохраняем Blob в IndexedDB как обычный ассет
 * проекта. Поэтому экспорт идёт по прежнему пути FFmpeg и не зависит от сети.
 *
 * Если сеть/источник недоступны, вызывающий код обязан перейти на прежний
 * procedural fallback — создание видео никогда не должно падать из-за музыки.
 */

export type MusicMood = "calm" | "warm" | "inspiring" | "cinematic" | "energetic";

export interface FreeMusicTrack {
  id: string;
  title: string;
  /** Страница файла Commons. Запись и/или композиция распространяются свободно. */
  commonsFile: string;
  mood: MusicMood;
  bpm: number;
}

/**
 * Небольшая намеренно отобранная библиотека открытых инструментальных записей.
 * В отличие от синтезированного на лету фона это полноценные живые исполнения.
 * URL медиа не зашит: Commons иногда меняет CDN-домен, API всегда отдаёт актуальный.
 */
export const FREE_MUSIC_LIBRARY: readonly FreeMusicTrack[] = [
  {
    id: "moonlight-calm",
    title: "Moonlight Sonata — Adagio sostenuto",
    commonsFile: "Beethoven_Moonlight_1st_movement.ogg",
    mood: "calm",
    bpm: 54,
  },
  {
    id: "gymnopedie-warm",
    title: "Gymnopédie No. 1",
    commonsFile: "Gymnopedie_No._1..ogg",
    mood: "warm",
    bpm: 72,
  },
  {
    id: "vivaldi-inspiring",
    title: "Vivaldi — Spring, Allegro",
    commonsFile: "Vivaldi_-_Four_Seasons_1_Spring_mvt_1_Allegro_-_John_Harrison_violin.oga",
    mood: "inspiring",
    bpm: 108,
  },
  {
    id: "vivaldi-cinematic",
    title: "Vivaldi — Winter, Allegro non molto",
    commonsFile: "Vivaldi_-_Four_Seasons_4_Winter_mvt_1_Allegro_non_molto_-_John_Harrison_violin.oga",
    mood: "cinematic",
    bpm: 96,
  },
  {
    id: "maple-leaf-energy",
    title: "Maple Leaf Rag",
    commonsFile: "Scott_Joplin_-_Maple_Leaf_Rag.ogg",
    mood: "energetic",
    bpm: 116,
  },
] as const;

/** Выбор настроения из уже существующего контекста монтажа, без AI API и оплаты. */
export function musicMoodForVideo(templateId: string | undefined, title = ""): MusicMood {
  const text = `${templateId ?? ""} ${title}`.toLowerCase();
  if (/(wedding|travel|cinematic|luxury|documentary|свад|путешеств|кино|истор)/.test(text)) return "cinematic";
  if (/(podcast|interview|education|minimal|food|учеб|интервью|подкаст|обзор)/.test(text)) return "calm";
  if (/(fitness|gaming|tiktok|reels|shorts|ad|musicvideo|спорт|игр|реклам|драйв)/.test(text)) return "energetic";
  if (/(love|family|baby|home|семейн|семей|люб|дом)/.test(text)) return "warm";
  return "inspiring";
}

/**
 * Детерминированно выбирает трек, чтобы повторный автомонтаж того же ролика
 * не менял музыку случайным образом.
 */
export function selectFreeMusicTrack(mood: MusicMood, seed = 0): FreeMusicTrack {
  const matching = FREE_MUSIC_LIBRARY.filter((track) => track.mood === mood);
  const pool = matching.length ? matching : [...FREE_MUSIC_LIBRARY];
  return pool[Math.abs(seed) % pool.length];
}

function commonsApiUrl(file: string): string {
  const title = `File:${file.replace(/ /g, "_")}`;
  return `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(title)}`;
}

/** Загружает файл выбранного открытого трека в Blob для локального рендера. */
export async function downloadFreeMusicTrack(track: FreeMusicTrack, timeoutMs = 15_000): Promise<Blob | null> {
  if (typeof fetch === "undefined") return null;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const metaResponse = await fetch(commonsApiUrl(track.commonsFile), { signal: controller?.signal });
    if (!metaResponse.ok) return null;
    const payload = await metaResponse.json() as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> };
    };
    const page = Object.values(payload.query?.pages ?? {})[0];
    const sourceUrl = page?.imageinfo?.[0]?.url;
    if (!sourceUrl) return null;

    const audioResponse = await fetch(sourceUrl, { signal: controller?.signal });
    if (!audioResponse.ok) return null;
    const blob = await audioResponse.blob();
    // Ответы с HTML/ошибкой иногда приходят с кодом 200 через CDN — не кладём их в проект.
    if (blob.size < 8_000 || !/^audio\//.test(blob.type || "audio/ogg")) return null;
    return blob;
  } catch {
    return null;
  } finally {
    if (timeout !== null) globalThis.clearTimeout(timeout);
  }
}
