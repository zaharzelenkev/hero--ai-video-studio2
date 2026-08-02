/**
 * AUDIO SYNC — автоматическая синхронизация раздельно записанного звука.
 *
 * Классическая ситуация профессиональной съёмки: картинка пишется на камеру,
 * звук — на петличку/рекордер. PluralEyes и Resolve решают это одинаково:
 * берут огибающую громкости обеих дорожек и ищут сдвиг, при котором они
 * максимально коррелируют. Мы делаем то же самое:
 *
 *   1. Из каждого источника извлекается огибающая громкости (RMS по окнам
 *      ~20мс) — это «отпечаток» события во времени: хлопок, слово, удар
 *      двери видны на обеих дорожках одинаково.
 *   2. Огибающие нормализуются (убирается разница уровней записи) и
 *      приводятся к разностной форме (onset envelope): важно КОГДА звук
 *      начался, а не какой микрофон громче.
 *   3. Нормированная кросс-корреляция по всем допустимым сдвигам находит
 *      offset. Уверенность = пик корреляции против фона (второй по величине
 *      локальный максимум) — если пик не выделяется, синхронизации нет и мы
 *      честно об этом сообщаем, а не двигаем звук наугад.
 *
 * Ядро (`envelopeFromSamples`, `bestOffsetByCorrelation`) чистое: работает и
 * в браузере, и в Node-тестах. Обёртки с WebAudio живут в самом низу файла.
 */

// ---------------------------------------------------------------------------
// Огибающая громкости
// ---------------------------------------------------------------------------

export interface LoudnessEnvelope {
  /** Значения RMS по окнам (уже нормированные 0..1). */
  values: Float32Array;
  /** Длительность одного окна в секундах. */
  hopSec: number;
  /** Длительность исходника в секундах. */
  duration: number;
}

/**
 * RMS-огибающая из PCM-сэмплов. hopSec 0.02 (20мс) — компромисс между
 * точностью синхронизации (±10мс, на глаз незаметно) и стоимостью счёта.
 */
export function envelopeFromSamples(samples: Float32Array, sampleRate: number, hopSec = 0.02): LoudnessEnvelope {
  const hop = Math.max(1, Math.round(sampleRate * hopSec));
  const n = Math.floor(samples.length / hop);
  const values = new Float32Array(Math.max(0, n));
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const from = i * hop;
    const to = from + hop;
    for (let j = from; j < to; j++) {
      const s = samples[j];
      sum += s * s;
    }
    const rms = Math.sqrt(sum / hop);
    values[i] = rms;
    if (rms > peak) peak = rms;
  }
  // Нормализация к пику: разный уровень записи камеры и рекордера не должен
  // влиять на корреляцию — важна ФОРМА огибающей, а не абсолютная громкость.
  for (let i = 0; i < values.length; i++) values[i] /= peak;
  return { values, hopSec, duration: samples.length / sampleRate };
}

/**
 * Onset-огибающая (half-wave rectified difference): подчёркивает МОМЕНТЫ
 * атаки звука. Именно они совпадают на двух дорожках, тогда как хвосты
 * реверберации у камерного микрофона и петлички отличаются радикально.
 */
export function onsetEnvelope(env: LoudnessEnvelope): Float32Array {
  const v = env.values;
  const out = new Float32Array(v.length);
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    out[i] = d > 0 ? d : 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Кросс-корреляция
// ---------------------------------------------------------------------------

export interface OffsetEstimate {
  /**
   * Сдвиг в секундах, заданный как «насколько РАНЬШЕ камеры стартовала
   * внешняя запись»:
   *
   *   offset > 0 — рекордер включили раньше камеры. Начало внешнего файла
   *                лишнее: входим в него с inPoint = offset.
   *   offset < 0 — рекордер включили позже. Клип звука сдвигается вправо
   *                по таймлайну на |offset|.
   *
   * Это ровно то, что нужно монтажному движку, поэтому знак выбран так, а не
   * «математически» (внутренний lag корреляции имеет обратный знак).
   */
  offsetSec: number;
  /** Уверенность 0..1: насколько пик корреляции выделяется над фоном. */
  confidence: number;
  /** Нормированное значение пика корреляции 0..1. */
  peak: number;
}

function zeroMeanUnit(a: Float32Array): { data: Float32Array; norm: number } {
  let mean = 0;
  for (let i = 0; i < a.length; i++) mean += a[i];
  mean /= Math.max(1, a.length);
  const data = new Float32Array(a.length);
  let ss = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] - mean;
    data[i] = v;
    ss += v * v;
  }
  return { data, norm: Math.sqrt(ss) || 1e-9 };
}

/**
 * Поиск сдвига максимальной корреляции между двумя огибающими.
 *
 * `maxLagFrames` ограничивает диапазон поиска: сдвиг больше нескольких минут
 * не имеет смысла и только замедляет счёт.
 */
export function bestOffsetByCorrelation(
  reference: Float32Array,
  external: Float32Array,
  hopSec: number,
  maxLagFrames?: number,
): OffsetEstimate {
  const maxLag = Math.min(
    maxLagFrames ?? Math.max(reference.length, external.length),
    Math.max(reference.length, external.length),
  );
  if (reference.length < 4 || external.length < 4) {
    return { offsetSec: 0, confidence: 0, peak: 0 };
  }

  const corrAt = (lag: number): number => {
    // lag — сдвиг ВНЕШНЕЙ дорожки вправо относительно камеры: событие,
    // стоящее во внешнем файле на позиции i, совпадает с камерным i + lag.
    // Если рекордер стартовал РАНЬШЕ камеры, события во внешнем файле стоят
    // ПОЗЖЕ по своей шкале → максимум придётся на отрицательный lag.
    const from = Math.max(0, lag);
    const to = Math.min(reference.length, external.length + lag);
    const len = to - from;
    if (len < 8) return 0;
    const a = reference.subarray(from, to);
    const b = external.subarray(from - lag, to - lag);
    const za = zeroMeanUnit(a);
    const zb = zeroMeanUnit(b);
    let dot = 0;
    for (let i = 0; i < len; i++) dot += za.data[i] * zb.data[i];
    const r = dot / (za.norm * zb.norm);
    // Короткие перекрытия статистически ненадёжны — штрафуем.
    const coverage = len / Math.min(reference.length, external.length);
    return r * Math.min(1, 0.35 + coverage * 0.65);
  };

  let bestLag = 0;
  let bestVal = -Infinity;
  const values: number[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const v = corrAt(lag);
    values.push(v);
    if (v > bestVal) {
      bestVal = v;
      bestLag = lag;
    }
  }

  // Второй по величине пик ВНЕ окрестности главного — мера «выделенности».
  const bestIdx = bestLag + maxLag;
  let runnerUp = 0;
  const guard = Math.max(3, Math.round(0.25 / hopSec));
  for (let i = 0; i < values.length; i++) {
    if (Math.abs(i - bestIdx) <= guard) continue;
    if (values[i] > runnerUp) runnerUp = values[i];
  }

  const peak = Math.max(0, bestVal);
  // Уверенность: и сам пик должен быть высоким, и отрыв от фона заметным.
  const separation = peak <= 0 ? 0 : Math.max(0, (peak - Math.max(0, runnerUp)) / peak);
  const confidence = Math.max(0, Math.min(1, peak * 0.62 + separation * 0.38));

  // Инверсия знака: наружу отдаём «насколько раньше камеры стартовал
  // рекордер» — величину, которую монтажный движок применяет напрямую.
  return { offsetSec: -bestLag * hopSec, confidence, peak };
}

// ---------------------------------------------------------------------------
// Решение о синхронизации
// ---------------------------------------------------------------------------

export interface SyncCandidate {
  assetId: string;
  name: string;
  envelope: LoudnessEnvelope;
}

export interface SyncDecision {
  /** Аудио-ассет, который синхронизируем. */
  audioAssetId: string;
  audioName: string;
  /** Видео-ассет, к которому его привязали. */
  videoAssetId: string;
  videoName: string;
  offsetSec: number;
  confidence: number;
  /** Принято ли решение синхронизировать (уверенность выше порога). */
  applied: boolean;
  reason: string;
}

/** Порог уверенности, ниже которого сдвиг не применяется (лучше не трогать). */
export const SYNC_CONFIDENCE_THRESHOLD = 0.55;

/**
 * Сопоставляет внешние аудио-дорожки с видео по звуковому отпечатку.
 *
 * Для каждой внешней дорожки перебираются все видео с камерным звуком;
 * побеждает пара с наибольшей уверенностью. Если ни одна пара не проходит
 * порог, дорожка считается музыкой/подложкой — её не двигают.
 */
export function decideAudioSync(
  videos: SyncCandidate[],
  externals: SyncCandidate[],
  opts: { threshold?: number; maxLagSec?: number } = {},
): SyncDecision[] {
  const threshold = opts.threshold ?? SYNC_CONFIDENCE_THRESHOLD;
  const maxLagSec = opts.maxLagSec ?? 180;
  const out: SyncDecision[] = [];

  for (const ext of externals) {
    let best: SyncDecision | null = null;
    for (const vid of videos) {
      if (vid.envelope.hopSec !== ext.envelope.hopSec) continue;
      const maxLagFrames = Math.round(maxLagSec / vid.envelope.hopSec);
      const est = bestOffsetByCorrelation(
        onsetEnvelope(vid.envelope),
        onsetEnvelope(ext.envelope),
        vid.envelope.hopSec,
        maxLagFrames,
      );
      const decision: SyncDecision = {
        audioAssetId: ext.assetId,
        audioName: ext.name,
        videoAssetId: vid.assetId,
        videoName: vid.name,
        offsetSec: Math.round(est.offsetSec * 1000) / 1000,
        confidence: Math.round(est.confidence * 1000) / 1000,
        applied: false,
        reason: "",
      };
      if (!best || decision.confidence > best.confidence) best = decision;
    }
    if (!best) continue;
    best.applied = best.confidence >= threshold;
    best.reason = best.applied
      ? `Звук «${best.audioName}» синхронизирован с «${best.videoName}»: сдвиг ${best.offsetSec >= 0 ? "+" : ""}${best.offsetSec.toFixed(2)}с ` +
        `(уверенность ${(best.confidence * 100).toFixed(0)}%) — совпадение звуковых событий обеих дорожек.`
      : `Звук «${best.audioName}» не удалось надёжно синхронизировать (уверенность ${(best.confidence * 100).toFixed(0)}% < ` +
        `${(threshold * 100).toFixed(0)}%) — дорожка используется как музыка/подложка без сдвига.`;
    out.push(best);
  }

  return out;
}

// ---------------------------------------------------------------------------
// WebAudio-обёртки (браузер)
// ---------------------------------------------------------------------------

/** Декодирует файл и строит огибающую. В Node/без WebAudio вернёт null. */
export async function envelopeFromBlob(file: Blob, hopSec = 0.02): Promise<LoudnessEnvelope | null> {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  // Гигантские файлы не тянем в память целиком — синхронизация не стоит фриза вкладки.
  if (file.size > 220 * 1024 * 1024) return null;
  const ctx = new AudioCtx();
  try {
    const buf = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const ch = audio.getChannelData(0);
    // Синхронизация по первым ~5 минутам: этого с запасом хватает, чтобы
    // найти сдвиг, а память и время остаются под контролем.
    const limit = Math.min(ch.length, audio.sampleRate * 300);
    const slice = limit === ch.length ? ch : ch.subarray(0, limit);
    return envelopeFromSamples(slice as Float32Array, audio.sampleRate, hopSec);
  } catch {
    return null;
  } finally {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
  }
}
