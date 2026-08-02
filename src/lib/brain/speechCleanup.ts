/**
 * SPEECH CLEANUP — автоматическая чистка речевой дорожки (offline edit).
 *
 * То, на что монтажёр тратит основную часть смены: вырезать длинные паузы,
 * слова-паразиты, кашель, лишние вдохи и случайные дубли одной и той же
 * фразы. Здесь это делается автоматически по пословному транскрипту.
 *
 * Что удаляется:
 *   • ДЛИННЫЕ ПАУЗЫ  — тишина дольше порога сжимается до «дыхательного» зазора.
 *     Короткие драматические паузы (0.7–2.5с) сохраняются: это reaction beat,
 *     профи их не режут.
 *   • СЛОВА-ПАРАЗИТЫ — «ну», «эээ», «типа», «как бы», «короче», «вот»,
 *     «в общем», «значит», "um", "uh", "like", "you know"… — вырезаются
 *     ТОЛЬКО когда они не несут смысла (не единственное слово фразы и не
 *     часть устойчивого оборота).
 *   • КАШЕЛЬ И ЗВУКИ — Whisper размечает их как [кашель]/(coughs)/*sighs*
 *     или отдаёт как короткие бессмысленные токены.
 *   • ЛИШНИЕ ВДОХИ    — короткий шумный токен между фразами в момент паузы.
 *   • СЛУЧАЙНЫЕ ДУБЛИ — спикер сказал фразу, споткнулся и повторил её заново.
 *     Оставляем ПОСЛЕДНИЙ (обычно самый чистый) вариант — так работает
 *     профессиональный «radio edit».
 *
 * Модуль чистый и детерминированный.
 */

export interface CleanupWord {
  start: number;
  end: number;
  text: string;
}

export type CutKind = "pause" | "filler" | "cough" | "breath" | "retake" | "silence-head";

export interface CleanupCut {
  start: number;
  end: number;
  kind: CutKind;
  /** Что именно вырезано (текст или описание). */
  text: string;
  reason: string;
}

export interface CleanupKeep {
  start: number;
  end: number;
  text: string;
}

export interface CleanupResult {
  /** Интервалы исходника, которые остаются в монтаже (в порядке времени). */
  keep: CleanupKeep[];
  /** Что и почему вырезано. */
  cuts: CleanupCut[];
  stats: {
    removedSec: number;
    pauses: number;
    fillers: number;
    coughs: number;
    breaths: number;
    retakes: number;
    /** Сколько секунд речи осталось. */
    keptSec: number;
  };
  notes: string[];
}

export interface CleanupOptions {
  /** Пауза длиннее этого значения считается «мёртвым воздухом» (сек). */
  maxPauseSec?: number;
  /** Сколько тишины оставить на месте вырезанной паузы (сек). */
  keepPauseSec?: number;
  /** Сохранять драматические паузы в этом диапазоне (сек). */
  dramaticPause?: [number, number];
  /** Вырезать слова-паразиты. */
  removeFillers?: boolean;
  /** Вырезать кашель/вздохи/шумы. */
  removeNoises?: boolean;
  /** Вырезать повторные дубли фраз. */
  removeRetakes?: boolean;
  /** Минимальная длительность оставляемого фрагмента (сек). */
  minKeepSec?: number;
}

// ---------------------------------------------------------------------------
// Словари
// ---------------------------------------------------------------------------

/** Одиночные слова-паразиты (RU + EN). */
const FILLER_WORDS = new Set([
  // русские
  "ну", "э", "ээ", "эээ", "ээээ", "а-а", "аа", "ааа", "м", "мм", "ммм", "мда",
  "типа", "вот", "короче", "значит", "как-бы", "какбы", "блин", "слушай",
  "получается", "допустим", "скажем", "собственно", "походу", "прям", "прямо",
  "просто", "вообще", "реально", "конечно",
  // английские
  "um", "uh", "erm", "hmm", "mmm", "like", "basically", "actually", "literally",
  "right", "okay", "ok", "so", "well", "anyway",
]);

/** Двусловные обороты-паразиты. */
const FILLER_BIGRAMS = new Set([
  "как бы", "в общем", "то есть", "так сказать", "в принципе", "на самом деле",
  "you know", "i mean", "sort of", "kind of",
]);

/** Разметка неречевых звуков от Whisper: [кашель], (coughs), *sighs*, ♪. */
const NOISE_MARKUP_RE = /^[\[\(\*♪].{0,28}[\]\)\*♪]$/;

const COUGH_RE = /(кашел|кхе|кхм|кха|cough|ahem|clears?\s+throat|прочищ)/i;
const BREATH_RE = /(вдох|выдох|breath|inhale|exhale|sigh|вздох|дыхан|sniff)/i;
const NOISE_RE = /(смех|laugh|музык|music|аплодис|applause|шум|noise|silence|тишин|blank_audio|звук)/i;

/** Нормализация слова: только буквы, нижний регистр. */
function norm(word: string): string {
  return word.toLowerCase().replace(/[^a-zа-яё]/gi, "");
}

/** Слово несёт смысл (не паразит, не разметка шума)? */
function isFillerWord(text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  return FILLER_WORDS.has(t);
}

function isNoiseToken(text: string): { noise: boolean; kind: CutKind } {
  const raw = text.trim();
  if (NOISE_MARKUP_RE.test(raw)) {
    if (COUGH_RE.test(raw)) return { noise: true, kind: "cough" };
    if (BREATH_RE.test(raw)) return { noise: true, kind: "breath" };
    if (NOISE_RE.test(raw)) return { noise: true, kind: "cough" };
    return { noise: true, kind: "cough" };
  }
  if (COUGH_RE.test(raw) && norm(raw).length <= 8) return { noise: true, kind: "cough" };
  if (BREATH_RE.test(raw) && norm(raw).length <= 8) return { noise: true, kind: "breath" };
  return { noise: false, kind: "cough" };
}

// ---------------------------------------------------------------------------
// Разбор транскрипта
// ---------------------------------------------------------------------------

/** Парсит текстовый транскрипт формата `[1.2s - 1.8s] слово` в слова. */
export function parseWords(transcript: string): CleanupWord[] {
  const out: CleanupWord[] = [];
  for (const line of transcript.split("\n")) {
    const m = line.match(/\[([\d.]+)s\s*-\s*([\d.]+)s\]\s*(.+)/);
    if (!m) continue;
    const start = parseFloat(m[1]);
    const end = parseFloat(m[2]);
    const text = m[3].trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;
    out.push({ start, end, text });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Обнаружение случайных дублей (retakes)
// ---------------------------------------------------------------------------

interface Phrase {
  start: number;
  end: number;
  words: CleanupWord[];
  text: string;
  /** Ключ для сравнения: значимые слова без паразитов. */
  key: string;
}

/** Слова → фразы по паузам (граница ≥ gapSec). */
function groupPhrases(words: CleanupWord[], gapSec = 0.45): Phrase[] {
  const phrases: Phrase[] = [];
  let cur: CleanupWord[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && w.start - prev.end >= gapSec) {
      phrases.push(makePhrase(cur));
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) phrases.push(makePhrase(cur));
  return phrases;
}

function makePhrase(words: CleanupWord[]): Phrase {
  const text = words.map((w) => w.text).join(" ");
  const key = words
    .map((w) => norm(w.text))
    .filter((t) => t.length > 1 && !FILLER_WORDS.has(t))
    .join(" ");
  return { start: words[0].start, end: words[words.length - 1].end, words, text, key };
}

/** Сходство двух строк по перекрытию значимых слов (0..1). */
export function phraseSimilarity(a: string, b: string): number {
  const wa = a.split(/\s+/).filter(Boolean);
  const wb = b.split(/\s+/).filter(Boolean);
  if (wa.length === 0 || wb.length === 0) return 0;
  const setB = new Map<string, number>();
  for (const w of wb) setB.set(w, (setB.get(w) ?? 0) + 1);
  let hits = 0;
  for (const w of wa) {
    const c = setB.get(w) ?? 0;
    if (c > 0) {
      hits++;
      setB.set(w, c - 1);
    }
  }
  return hits / Math.max(wa.length, wb.length);
}

/**
 * Ищет случайные дубли: спикер начал фразу, сбился и повторил её.
 * Признак — две соседние (в пределах retakeWindow фраз) реплики с высоким
 * сходством. Оставляем ПОСЛЕДНЮЮ: обычно она дочитана и без запинки.
 */
function findRetakes(phrases: Phrase[], threshold = 0.72, retakeWindow = 2): Set<number> {
  const doomed = new Set<number>();
  for (let i = 0; i < phrases.length; i++) {
    if (doomed.has(i)) continue;
    const a = phrases[i];
    if (a.key.split(/\s+/).filter(Boolean).length < 2) continue;
    for (let j = i + 1; j <= Math.min(phrases.length - 1, i + retakeWindow); j++) {
      if (doomed.has(j)) continue;
      const b = phrases[j];
      if (b.key.split(/\s+/).filter(Boolean).length < 2) continue;
      const sim = phraseSimilarity(a.key, b.key);
      if (sim < threshold) continue;
      // Оставляем более полный/длинный вариант; при равенстве — последний.
      const aWords = a.key.split(/\s+/).length;
      const bWords = b.key.split(/\s+/).length;
      if (aWords > bWords + 1) doomed.add(j);
      else doomed.add(i);
      break;
    }
  }
  return doomed;
}

/**
 * Дубль ВНУТРИ одной фразы: спикер повторил кусок без паузы
 * («кадр должен работать кадр должен работать»). Пауза не успела появиться,
 * поэтому пофразный детектор такое не ловит — ищем повтор подряд идущих
 * значимых слов и вырезаем ПЕРВУЮ копию (вторая обычно дочитана чище).
 *
 * Возвращает индексы слов (в переданном массиве), подлежащие удалению.
 */
export function findInPhraseRepeats(words: CleanupWord[], minRunWords = 2): Set<number> {
  const doomed = new Set<number>();
  // Значимые токены (без паразитов) с обратной ссылкой на индекс слова.
  const toks: Array<{ t: string; i: number }> = [];
  for (let i = 0; i < words.length; i++) {
    // Одно «слово» Whisper-сегмента может содержать несколько токенов —
    // сравниваем по нормализованной строке целиком, это устойчивее.
    const t = words[i].text
      .toLowerCase()
      .split(/\s+/)
      .map(norm)
      .filter((x) => x.length > 1 && !FILLER_WORDS.has(x))
      .join(" ");
    if (t) toks.push({ t, i });
  }
  if (toks.length < minRunWords * 2) return doomed;

  // Ищем самый длинный повтор A A подряд, начиная с самых длинных окон.
  const maxK = Math.floor(toks.length / 2);
  for (let k = maxK; k >= 1; k--) {
    for (let s = 0; s + 2 * k <= toks.length; s++) {
      const first = toks.slice(s, s + k);
      const second = toks.slice(s + k, s + 2 * k);
      if (first.every((x, n) => x.t === second[n].t)) {
        // Повтор должен нести хотя бы minRunWords значимых слов — иначе это
        // естественный повтор служебного слова, а не сбитый дубль.
        const wordCount = first.reduce((a, x) => a + x.t.split(/\s+/).length, 0);
        if (wordCount < minRunWords) continue;
        // Пауза между копиями должна быть небольшой (сбился и переснял),
        // иначе это осознанный риторический повтор — его не трогаем.
        const gap = words[second[0].i].start - words[first[first.length - 1].i].end;
        if (gap > 2.5) continue;
        for (const x of first) doomed.add(x.i);
        return doomed;
      }
    }
  }
  return doomed;
}

// ---------------------------------------------------------------------------
// Основной проход
// ---------------------------------------------------------------------------

export function cleanupSpeech(words: CleanupWord[], opts: CleanupOptions = {}): CleanupResult {
  const maxPauseSec = opts.maxPauseSec ?? 0.65;
  const keepPauseSec = opts.keepPauseSec ?? 0.18;
  const dramaticPause = opts.dramaticPause ?? [0.7, 2.5];
  const removeFillers = opts.removeFillers ?? true;
  const removeNoises = opts.removeNoises ?? true;
  const removeRetakes = opts.removeRetakes ?? true;
  const minKeepSec = opts.minKeepSec ?? 0.12;

  const cuts: CleanupCut[] = [];
  const notes: string[] = [];
  const stats = { removedSec: 0, pauses: 0, fillers: 0, coughs: 0, breaths: 0, retakes: 0, keptSec: 0 };

  if (words.length === 0) {
    return { keep: [], cuts, stats, notes };
  }

  const sorted = [...words].sort((a, b) => a.start - b.start);

  // --- 1. Пометка «плохих» слов ---
  const dropped = new Array<CutKind | null>(sorted.length).fill(null);

  if (removeNoises) {
    for (let i = 0; i < sorted.length; i++) {
      const { noise, kind } = isNoiseToken(sorted[i].text);
      if (noise) dropped[i] = kind;
    }
  }

  if (removeFillers) {
    for (let i = 0; i < sorted.length; i++) {
      if (dropped[i]) continue;
      const w = sorted[i];
      // Биграммы-паразиты («как бы», «в общем»).
      if (i + 1 < sorted.length && !dropped[i + 1]) {
        const bigram = `${norm(w.text)} ${norm(sorted[i + 1].text)}`.trim();
        if (FILLER_BIGRAMS.has(bigram) && sorted[i + 1].start - w.end < 0.35) {
          dropped[i] = "filler";
          dropped[i + 1] = "filler";
          continue;
        }
      }
      if (!isFillerWord(w.text)) continue;
      // Паразит на своих правах: если он ЕДИНСТВЕННОЕ слово между двумя
      // большими паузами, он мог быть осмысленной репликой («Ну!») — режем
      // только когда рядом есть настоящая речь.
      const prev = sorted[i - 1];
      const next = sorted[i + 1];
      const hasNeighbourSpeech =
        (prev && !dropped[i - 1] && w.start - prev.end < 1.2) || (next && next.start - w.end < 1.2);
      if (!hasNeighbourSpeech) continue;
      dropped[i] = "filler";
    }

    // Заикание/повтор одного слова подряд («я я я думал») — оставляем последний.
    for (let i = 1; i < sorted.length; i++) {
      if (dropped[i] || dropped[i - 1]) continue;
      const a = norm(sorted[i - 1].text);
      const b = norm(sorted[i].text);
      if (a && a === b && sorted[i].start - sorted[i - 1].end < 0.5) {
        dropped[i - 1] = "filler";
      }
    }
  }

  // --- 2. Случайные дубли ---
  if (removeRetakes) {
    // 2a. Дубли ЦЕЛЫХ фраз (между репликами есть пауза).
    const aliveIdx = sorted.map((_, i) => i).filter((i) => !dropped[i]);
    const alive = aliveIdx.map((i) => sorted[i]);
    const phrases = groupPhrases(alive);
    const doomed = findRetakes(phrases);
    for (const idx of doomed) {
      const p = phrases[idx];
      for (let i = 0; i < sorted.length; i++) {
        if (dropped[i]) continue;
        if (sorted[i].start >= p.start - 1e-6 && sorted[i].end <= p.end + 1e-6) dropped[i] = "retake";
      }
      stats.retakes++;
      cuts.push({
        start: p.start,
        end: p.end,
        kind: "retake",
        text: p.text,
        reason: "случайный дубль: спикер повторил ту же мысль — оставлен лучший вариант",
      });
      stats.removedSec += p.end - p.start;
    }

    // 2b. Дубли ВНУТРИ фразы (спикер сбился и переснял без паузы).
    // Ищем в каждой уцелевшей фразе: повтор подряд идущих слов.
    const stillAliveIdx = sorted.map((_, i) => i).filter((i) => !dropped[i]);
    const stillAlive = stillAliveIdx.map((i) => sorted[i]);
    for (const phrase of groupPhrases(stillAlive)) {
      const localDoomed = findInPhraseRepeats(phrase.words);
      if (localDoomed.size === 0) continue;
      const globalIdx = [...localDoomed]
        .map((li) => sorted.indexOf(phrase.words[li]))
        .filter((i) => i >= 0 && !dropped[i])
        .sort((a, b) => a - b);
      if (globalIdx.length === 0) continue;
      for (const gi of globalIdx) dropped[gi] = "retake";
      const start = sorted[globalIdx[0]].start;
      const end = sorted[globalIdx[globalIdx.length - 1]].end;
      stats.retakes++;
      cuts.push({
        start,
        end,
        kind: "retake",
        text: globalIdx.map((i) => sorted[i].text).join(" "),
        reason: "спикер сбился и повторил фразу без паузы — первая попытка вырезана",
      });
      stats.removedSec += end - start;
    }
  }

  // --- 3. Регистрация вырезанных слов ---
  {
    let i = 0;
    while (i < sorted.length) {
      const kind = dropped[i];
      if (!kind || kind === "retake") {
        i++;
        continue;
      }
      let j = i;
      const texts: string[] = [];
      while (j < sorted.length && dropped[j] === kind) {
        texts.push(sorted[j].text);
        j++;
      }
      const start = sorted[i].start;
      const end = sorted[j - 1].end;
      cuts.push({
        start,
        end,
        kind,
        text: texts.join(" "),
        reason:
          kind === "filler"
            ? "слово-паразит: не несёт смысла, тормозит речь"
            : kind === "cough"
              ? "кашель / посторонний звук"
              : "лишний вдох между фразами",
      });
      stats.removedSec += end - start;
      if (kind === "filler") stats.fillers += texts.length;
      else if (kind === "cough") stats.coughs++;
      else if (kind === "breath") stats.breaths++;
      i = j;
    }
  }

  // --- 4. Сборка интервалов «оставить» с чисткой пауз ---
  const alive = sorted.filter((_, i) => !dropped[i]);
  if (alive.length === 0) {
    notes.push("Речевая дорожка состоит только из мусора — чистка оставила бы пустоту, монтаж идёт по кадру.");
    return { keep: [], cuts, stats, notes };
  }

  // Голова: тишина/шум до первого слова — всегда мёртвый воздух.
  if (alive[0].start > maxPauseSec) {
    const cutEnd = Math.max(0, alive[0].start - keepPauseSec);
    if (cutEnd > 0.05) {
      cuts.push({
        start: 0,
        end: cutEnd,
        kind: "silence-head",
        text: "",
        reason: "тишина перед первым словом — ролик должен начинаться с речи",
      });
      stats.removedSec += cutEnd;
    }
  }

  const keep: CleanupKeep[] = [];
  // «Воздух» перед первым словом не имеет права залезть в уже вырезанную зону
  // (например, в срезанный филлер «ну») — иначе мусор вернётся в монтаж.
  const cutEndBefore = (t: number): number => {
    let bound = 0;
    for (const c of cuts) {
      if (c.end <= t + 1e-6 && c.end > bound) bound = c.end;
    }
    return bound;
  };
  let segStart = Math.max(
    cutEndBefore(alive[0].start),
    Math.max(0, alive[0].start - Math.min(keepPauseSec, alive[0].start)),
  );
  let segWords: CleanupWord[] = [alive[0]];

  /** Закрывает текущий фрагмент на времени `end`. */
  const closeSegment = (end: number): void => {
    if (end - segStart >= minKeepSec) {
      keep.push({ start: segStart, end, text: segWords.map((w) => w.text).join(" ") });
    }
  };

  for (let i = 1; i < alive.length; i++) {
    const prev = alive[i - 1];
    const cur = alive[i];
    const gap = cur.start - prev.end;

    // МЕЖДУ ЭТИМИ СЛОВАМИ ЧТО-ТО ВЫРЕЗАНО (паразит, кашель, вдох, дубль)?
    // Если да — интервал «оставить» ОБЯЗАН разорваться: иначе вырезанный
    // кашель всё равно попадёт в монтаж внутри непрерывного фрагмента.
    // Это была главная ловушка: слово помечалось удалённым, но интервал
    // keep продолжал его перекрывать.
    const removedBetween = cuts.some(
      (c) => c.kind !== "pause" && c.kind !== "silence-head" && c.start >= prev.end - 1e-6 && c.end <= cur.start + 1e-6,
    );

    if (removedBetween) {
      // Закрываем фрагмент на конце последнего живого слова (+ микро-хвост,
      // чтобы не срезать последний звук) и открываем новый на следующем.
      const tail = Math.min(keepPauseSec * 0.5, Math.max(0, gap * 0.35));
      closeSegment(prev.end + tail);
      const head = Math.min(keepPauseSec * 0.5, Math.max(0, gap * 0.35));
      segStart = Math.max(prev.end + tail, cur.start - head);
      segWords = [cur];
      continue;
    }

    if (gap <= maxPauseSec) {
      segWords.push(cur);
      continue;
    }

    const isDramatic = gap >= dramaticPause[0] && gap <= dramaticPause[1];
    if (isDramatic) {
      // Reaction beat: пауза сохраняется как часть драматургии, фрагмент не рвём.
      segWords.push(cur);
      continue;
    }

    // Длинная пауза: закрываем фрагмент, оставляя «дыхательный» хвост.
    const segEnd = prev.end + keepPauseSec;
    closeSegment(segEnd);
    const cutStart = segEnd;
    const cutEnd = Math.max(cutStart, cur.start - keepPauseSec);
    if (cutEnd - cutStart > 0.05) {
      cuts.push({
        start: cutStart,
        end: cutEnd,
        kind: "pause",
        text: "",
        reason: `мёртвый воздух ${(cutEnd - cutStart).toFixed(1)}с — пауза сжата до дыхания`,
      });
      stats.removedSec += cutEnd - cutStart;
      stats.pauses++;
    }
    segStart = Math.max(cutEnd, cur.start - keepPauseSec);
    segWords = [cur];
  }

  const lastWord = alive[alive.length - 1];
  closeSegment(lastWord.end + keepPauseSec);

  // Порядок правок по времени — так отчёт читается как монтажный лист.
  cuts.sort((a, b) => a.start - b.start);

  stats.keptSec = keep.reduce((a, k) => a + (k.end - k.start), 0);
  stats.removedSec = Math.round(stats.removedSec * 100) / 100;
  stats.keptSec = Math.round(stats.keptSec * 100) / 100;

  if (stats.removedSec > 0.2) {
    const parts: string[] = [];
    if (stats.pauses) parts.push(`пауз ${stats.pauses}`);
    if (stats.fillers) parts.push(`слов-паразитов ${stats.fillers}`);
    if (stats.coughs) parts.push(`кашля/шумов ${stats.coughs}`);
    if (stats.breaths) parts.push(`лишних вдохов ${stats.breaths}`);
    if (stats.retakes) parts.push(`дублей фраз ${stats.retakes}`);
    notes.push(
      `Чистка речи: вырезано ${stats.removedSec.toFixed(1)}с (${parts.join(", ") || "мусор"}); ` +
        `осталось ${stats.keptSec.toFixed(1)}с чистой речи.`,
    );
  }

  return { keep, cuts, stats, notes };
}

/**
 * Свёртка результата чистки в фразы для режиссёра: каждый keep-интервал —
 * готовый монтажный фрагмент с текстом (уже без мусора).
 */
export function cleanupToPhrases(
  assetId: string,
  result: CleanupResult,
): Array<{ assetId: string; start: number; end: number; text: string }> {
  return result.keep.map((k) => ({ assetId, start: k.start, end: k.end, text: k.text }));
}

/** Проверка: попадает ли момент в вырезанную зону. */
export function isCut(result: CleanupResult, t: number): boolean {
  return result.cuts.some((c) => t >= c.start && t < c.end);
}
