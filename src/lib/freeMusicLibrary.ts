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

/** Префикс ключей локального кэша в IndexedDB: скачанные треки переиспользуются
 *  между автомонтажами — повторные ролики не ждут сеть и не качают файл заново. */
const LIBRARY_CACHE_PREFIX = "lib_music_";

/** Признак Ogg-семейства MIME. Wikimedia отдаёт эти файлы как application/ogg
 *  (а не audio/ogg) — проверять строго `audio/` нельзя, иначе библиотека всегда
 *  считалась бы «недоступной», даже когда файл успешно скачан. */
function isOggFamily(type: string): boolean {
  return /(?:^|[+/-])(ogg|opus|vorbis)(?:;|$)/i.test(type);
}

/** Это аудио? Принимаем стандартное `audio/*`, ogg-семейство (включая
 *  application/ogg и video/ogg от Wikimedia) — а запасным критерием служит
 *  сигнатура контейнера "OggS" (см. sniffOgg ниже). */
function isAudioType(type: string): boolean {
  return /^audio\//i.test(type) || isOggFamily(type);
}

/** Нормализует MIME ogg-семейства в audio/ogg, чтобы движок рендера и экспорт
 *  всегда видели аудио-тип (extFor/extForMime строят расширение по MIME). */
function normalizeAudioBlob(blob: Blob): Blob {
  const type = (blob.type || "").toLowerCase();
  if (isOggFamily(type) && type !== "audio/ogg") {
    return new Blob([blob], { type: "audio/ogg" });
  }
  return blob;
}

/** Запасной критерий валидности: сигнатура Ogg-контейнера ("OggS") в первых
 *  байтах — если CDN отдал пустой или нестандартный Content-Type. */
async function sniffOgg(blob: Blob): Promise<boolean> {
  try {
    if (blob.size < 4) return false;
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53;
  } catch {
    return false;
  }
}

/** Загружает файл выбранного открытого трека в Blob для локального рендера.
 *  Сначала проверяет локальный кэш IndexedDB (мгновенно, работает и офлайн);
 *  затем качает через MediaWiki API + upload.wikimedia.org. При любой неудаче
 *  возвращает null — вызывающий код переходит на процедурный резервный саундтрек. */
export async function downloadFreeMusicTrack(track: FreeMusicTrack, timeoutMs = 10_000): Promise<Blob | null> {
  if (typeof fetch === "undefined") return null;

  // 1. Быстрый путь — трек уже скачан ранее (IndexedDB).
  if (typeof indexedDB !== "undefined") {
    try {
      const { loadBlob } = await import("./db");
      const cached = await loadBlob(LIBRARY_CACHE_PREFIX + track.id);
      if (cached && cached.size >= 8_000) return normalizeAudioBlob(cached);
    } catch { /* кэш недоступен — просто скачиваем */ }
  }

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

    // Валидация: это реальный аудиофайл, а не HTML-страница ошибки (такие ответы
    // иногда приходят с кодом 200 через CDN). Принимаем audio/*, ogg-семейство
    // MIME (включая application/ogg от Wikimedia) и сигнатуру контейнера "OggS".
    const type = (blob.type || "").toLowerCase();
    const valid = blob.size >= 8_000 && (isAudioType(type) || await sniffOgg(blob));
    if (!valid) return null;
    const normalized = normalizeAudioBlob(blob);

    // 2. Кэшируем, чтобы следующий автомонтаж не ждал сеть.
    if (typeof indexedDB !== "undefined") {
      try {
        const { saveBlob } = await import("./db");
        await saveBlob(LIBRARY_CACHE_PREFIX + track.id, normalized);
      } catch { /* кэш не критичен — трек уже в руках */ }
    }
    return normalized;
  } catch {
    return null;
  } finally {
    if (timeout !== null) globalThis.clearTimeout(timeout);
  }
}
