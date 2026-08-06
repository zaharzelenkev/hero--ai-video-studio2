"use client";

/**
 * Фоновая «разминка» тяжёлых модулей в моменты простоя.
 *
 * MONTIQ никогда не должен заставлять пользователя ждать: пока человек
 * читает промо-текст, выбирает файлы или смотрит превью, браузер в фоне
 * подгружает JS-бандлы автомонтажа, рендера и Picture Lock, а затем —
 * былм FFmpeg-движка. К моменту, когда пользователь жмёт «Смонтировать»
 * или «Экспорт», всё уже прогрето и работа начинается мгновенно.
 *
 * Все функции безопасно вызывать повторно: разминка выполняется один раз
 * за сессию, ошибки проглатываются (это фоновая оптимизация, не критичный путь).
 */

let heavyWarmed = false;
let heavyScheduled = false;

/** Подгружает тяжёлые JS-модули pipeline (без FFmpeg — его греет warmupFFmpeg). */
export function warmupHeavyModules(delayMs = 2500): void {
  if (heavyWarmed || heavyScheduled || typeof window === "undefined") return;
  heavyScheduled = true;
  const run = () => {
    if (heavyWarmed) return;
    heavyWarmed = true;
    // Ленивые бандлы главной страницы и редактора — подтягиваем заранее,
    // чтобы первый «тяжёлый» клик не ждал сеть за JS.
    void import("@/lib/autoEdit").catch(() => {});
    void import("@/lib/render").catch(() => {});
    void import("@/lib/pictureLock").catch(() => {});
    void import("@/lib/minDuration").catch(() => {});
    void import("@/lib/filterGraph").catch(() => {});
    void import("@/lib/mastering").catch(() => {});
    void import("@/lib/editor/mediaImport").catch(() => {});
    void import("@/lib/freeMusicLibrary").catch(() => {});
    void import("@/lib/editor/vfxExport").catch(() => {});
    void import("@/lib/generators/magicGenerator").catch(() => {});
  };
  scheduleIdle(run, delayMs);
}

let ffmpegWarmed = false;

/**
 * Прогревает FFmpeg (загрузка ~30 МБ wasm из /ffmpeg) в фоне.
 * Пропускается на устройствах с маленьким объёмом памяти.
 */
export function warmupFFmpeg(delayMs = 5000): void {
  if (ffmpegWarmed || typeof window === "undefined") return;
  // На слабых мобильных устройствах не жертвуем памятью ради пары секунд.
  try {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (typeof mem === "number" && mem > 0 && mem < 4) return;
  } catch {
    /* navigator.deviceMemory недоступен — греем как обычно */
  }
  const run = () => {
    if (ffmpegWarmed) return;
    ffmpegWarmed = true;
    void import("@/lib/ffmpeg")
      .then((m) => m.getFFmpeg())
      .catch(() => {});
  };
  scheduleIdle(run, delayMs);
}

function scheduleIdle(run: () => void, delayMs: number): void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const fire = () => {
    if (typeof w.requestIdleCallback === "function") {
      try {
        w.requestIdleCallback(run, { timeout: 2500 });
        return;
      } catch {
        /* fall through */
      }
    }
    run();
  };
  window.setTimeout(fire, delayMs);
}
