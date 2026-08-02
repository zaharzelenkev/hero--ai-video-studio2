/**
 * MediaPipe-интеграция VFX: удаление фона (SelfieSegmenter) и умное
 * выделение объекта (InteractiveSegmenter / Magic Touch).
 *
 * Всё бесплатное, без ключей: wasm-файлы копируются из node_modules в
 * /public/mediapipe/tasks-vision (см. scripts/copy-mediapipe.mjs), модели
 * грузятся с публичного Google CDN при первом использовании. Если сеть
 * недоступна — сервис честно сообщает статус "error", интерфейс показывает
 * это, а не притворяется, что работает.
 *
 * Модуль безопасен для импорта в Node (тесты): весь MediaPipe загружается
 * динамически и только при наличии DOM.
 */

export interface SegmentationMask {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type VfxModelStatus = "idle" | "loading" | "ready" | "error";

const SELFIE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
const INTERACTIVE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

interface AnyMaskData {
  getAsUint8Array(): Uint8Array;
  getAsFloat32Array(): Float32Array;
  width: number;
  height: number;
}

interface AnySegmentationResult {
  categoryMask?: AnyMaskData;
  confidenceMasks?: AnyMaskData[];
  getLabels(): string[];
  close?(): void;
}

type AnyImageSegmenter = {
  segment(image: CanvasImageSource): AnySegmentationResult;
  close(): void;
};

type AnyInteractiveSegmenter = {
  setImage(image: CanvasImageSource): void;
  segment(strokes: readonly { brushMode: string; point: { x: number; y: number; z?: number }[]; isCompleted: boolean }[]): { getAsUint8Array(): Uint8Array; width: number; height: number };
  close(): void;
};

let visionModulePromise: Promise<typeof import("@mediapipe/tasks-vision")> | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

async function loadVisionModule(): Promise<typeof import("@mediapipe/tasks-vision")> {
  if (!visionModulePromise) {
    visionModulePromise = import("@mediapipe/tasks-vision").catch((err) => {
      visionModulePromise = null;
      throw new Error(`Не удалось загрузить @mediapipe/tasks-vision: ${String(err)}`);
    });
  }
  return visionModulePromise;
}

async function loadFileset(): Promise<Awaited<ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>>> {
  const vision = await loadVisionModule();
  return vision.FilesetResolver.forVisionTasks("/mediapipe/tasks-vision/wasm");
}

/* ------------------------------------------------------------------ */
/* Удаление фона                                                       */
/* ------------------------------------------------------------------ */

class BackgroundRemovalService {
  private segmenter: AnyImageSegmenter | null = null;
  private loading: Promise<void> | null = null;
  private cache = new Map<string, SegmentationMask>();
  status: VfxModelStatus = "idle";
  error: string | null = null;

  /** Асинхронная загрузка модели (идемпотентно). */
  async ensureLoaded(): Promise<boolean> {
    if (this.segmenter) return true;
    if (!isBrowser()) {
      this.status = "error";
      this.error = "MediaPipe доступен только в браузере";
      return false;
    }
    if (!this.loading) {
      this.status = "loading";
      this.loading = (async () => {
        try {
          const fileset = await loadFileset();
          const vision = await loadVisionModule();
          this.segmenter = (await vision.ImageSegmenter.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: SELFIE_MODEL_URL, delegate: "CPU" },
            runningMode: "IMAGE",
            outputCategoryMask: true,
            outputConfidenceMasks: true,
          })) as unknown as AnyImageSegmenter;
          this.status = "ready";
          this.error = null;
        } catch (err) {
          this.status = "error";
          this.error = String(err instanceof Error ? err.message : err);
          this.loading = null;
          throw err;
        }
      })();
    }
    try {
      await this.loading;
      return !!this.segmenter;
    } catch {
      return false;
    }
  }

  /**
   * Маска переднего плана (0..255, 255 = человек) для кадра.
   * Синхронный вызов: если маска ещё не готова — возвращает null,
   * вычисление запускается в фоне, и следующий кадр превью её подхватит.
   */
  getMask(key: string): SegmentationMask | null {
    return this.cache.get(key) ?? null;
  }

  /** Принудительное асинхронное вычисление маски для кадра (экспорт). */
  async computeMaskAsync(source: CanvasImageSource, key: string): Promise<SegmentationMask> {
    await this.ensureLoaded();
    const existing = this.cache.get(key);
    if (existing) return existing;
    const mask = await this.segmentFrame(source);
    this.cache.set(key, mask);
    // Ограничиваем кэш, чтобы превью не разрасталось навсегда.
    if (this.cache.size > 120) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    return mask;
  }

  /** Фоновая подсказка для превью (fire-and-forget). */
  computeMaskSoon(source: CanvasImageSource, key: string): void {
    if (this.cache.has(key)) return;
    if (!this.segmenter && this.status !== "loading") {
      void this.ensureLoaded().catch(() => undefined);
    }
    if (!this.segmenter) return;
    void this.segmentFrame(source)
      .then((mask) => {
        this.cache.set(key, mask);
        if (this.cache.size > 120) {
          const first = this.cache.keys().next().value;
          if (first !== undefined) this.cache.delete(first);
        }
      })
      .catch(() => undefined);
  }

  private async segmentFrame(source: CanvasImageSource): Promise<SegmentationMask> {
    if (!this.segmenter) throw new Error("Модель не загружена");
    const result = this.segmenter.segment(source);
    const labels = result.getLabels();
    const personIdx = labels.indexOf("person");
    if (result.confidenceMasks && result.confidenceMasks.length > 0) {
      const m = result.confidenceMasks[0];
      const data = new Uint8ClampedArray(m.getAsFloat32Array().length);
      const f = m.getAsFloat32Array();
      for (let i = 0; i < data.length; i++) data[i] = Math.round(clamp01(f[i]) * 255);
      result.close?.();
      return { data, width: m.width, height: m.height };
    }
    if (result.categoryMask) {
      const raw = result.categoryMask.getAsUint8Array();
      const data = new Uint8ClampedArray(raw.length);
      const target = personIdx >= 0 ? personIdx : 1;
      for (let i = 0; i < data.length; i++) data[i] = raw[i] === target ? 255 : 0;
      result.close?.();
      return { data, width: result.categoryMask.width, height: result.categoryMask.height };
    }
    result.close?.();
    throw new Error("Сегментатор не вернул маску");
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const bgRemovalService = new BackgroundRemovalService();

/* ------------------------------------------------------------------ */
/* Интерактивная сегментация объекта (AI-выделение для удаления)       */
/* ------------------------------------------------------------------ */

class InteractiveSegmentService {
  private segmenter: AnyInteractiveSegmenter | null = null;
  private loading: Promise<void> | null = null;
  status: VfxModelStatus = "idle";
  error: string | null = null;

  async ensureLoaded(): Promise<boolean> {
    if (this.segmenter) return true;
    if (!isBrowser()) {
      this.status = "error";
      this.error = "MediaPipe доступен только в браузере";
      return false;
    }
    if (!this.loading) {
      this.status = "loading";
      this.loading = (async () => {
        try {
          const fileset = await loadFileset();
          const vision = await loadVisionModule();
          this.segmenter = (await vision.InteractiveSegmenter.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: INTERACTIVE_MODEL_URL },
          })) as unknown as AnyInteractiveSegmenter;
          this.status = "ready";
          this.error = null;
        } catch (err) {
          this.status = "error";
          this.error = String(err instanceof Error ? err.message : err);
          this.loading = null;
          throw err;
        }
      })();
    }
    try {
      await this.loading;
      return !!this.segmenter;
    } catch {
      return false;
    }
  }

  /**
   * Сегментирует объект по клику (нормализованная точка 0..1) и возвращает
   * маску. Вызывающий преобразует её в полигон и сохраняет в клип.
   */
  async segmentAt(source: CanvasImageSource, x: number, y: number): Promise<SegmentationMask> {
    await this.ensureLoaded();
    if (!this.segmenter) throw new Error("Модель не загружена");
    this.segmenter.setImage(source);
    const mask = this.segmenter.segment([
      { brushMode: "ADD", point: [{ x, y, z: 0 }], isCompleted: true },
    ]);
    return {
      data: new Uint8ClampedArray(mask.getAsUint8Array()),
      width: mask.width,
      height: mask.height,
    };
  }
}

export const interactiveSegmentService = new InteractiveSegmentService();

/* ------------------------------------------------------------------ */
/* Маска → полигон (марширующие квадраты + упрощение Дугласа–Пекера)   */
/* ------------------------------------------------------------------ */

/**
 * Преобразует маску в компактный замкнутый полигон (нормализованные
 * координаты 0..1). maxPoints ограничивает размер для хранения в проекте.
 */
export function maskToPolygon(mask: SegmentationMask, maxPoints = 96): { x: number; y: number }[] {
  const { data, width: w, height: h } = mask;
  // Двоичная маска с порогом.
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = data[i] > 100 ? 1 : 0;

  // Марширующие квадраты по сетке с шагом 2 (достаточно для контура).
  const step = 2;
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < h - step; y += step) {
    for (let x = 0; x < w - step; x += step) {
      const tl = bin[y * w + x];
      const tr = bin[y * w + x + step];
      const bl = bin[(y + step) * w + x];
      const br = bin[(y + step) * w + x + step];
      const caseIdx = tl | (tr << 1) | (bl << 2) | (br << 3);
      if (caseIdx === 0 || caseIdx === 15) continue;
      // Средняя точка ребра, где пересекается контур.
      if ((caseIdx & 1) !== (caseIdx & 2)) points.push({ x: x + step / 2, y });
      if ((caseIdx & 1) !== (caseIdx & 4)) points.push({ x, y: y + step / 2 });
      if ((caseIdx & 2) !== (caseIdx & 8)) points.push({ x: x + step, y: y + step / 2 });
      if ((caseIdx & 4) !== (caseIdx & 8)) points.push({ x: x + step / 2, y: y + step });
    }
  }
  if (points.length < 3) return [];

  // Соединяем точки в цепочку (жадный ближайший сосед) — упрощение для контура.
  const chain: { x: number; y: number }[] = [];
  const used = new Uint8Array(points.length);
  let cur = 0;
  used[0] = 1;
  chain.push(points[0]);
  for (;;) {
    let best = -1;
    let bestD = Infinity;
    const cx = points[cur].x;
    const cy = points[cur].y;
    for (let i = 0; i < points.length; i++) {
      if (used[i]) continue;
      const d = (points[i].x - cx) * (points[i].x - cx) + (points[i].y - cy) * (points[i].y - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    used[best] = 1;
    chain.push(points[best]);
    cur = best;
  }

  // Упрощение Дугласа–Пекера.
  const simplify = (pts: { x: number; y: number }[], tol: number): { x: number; y: number }[] => {
    if (pts.length <= 2) return pts;
    const distToSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      return Math.hypot(p.x - px, p.y - py);
    };
    const rec = (list: { x: number; y: number }[]): { x: number; y: number }[] => {
      if (list.length <= 2) return list;
      let maxD = 0;
      let idx = 0;
      const first = list[0];
      const last = list[list.length - 1];
      for (let i = 1; i < list.length - 1; i++) {
        const d = distToSeg(list[i], first, last);
        if (d > maxD) {
          maxD = d;
          idx = i;
        }
      }
      if (maxD > tol) {
        const left = rec(list.slice(0, idx + 1));
        const right = rec(list.slice(idx));
        return [...left.slice(0, -1), ...right];
      }
      return [first, last];
    };
    return rec(pts);
  };

  const tol = Math.max(w, h) * 0.01;
  let simplified = simplify(chain, tol);
  // Замыкаем полигон.
  if (simplified.length && (simplified[0].x !== simplified[simplified.length - 1].x || simplified[0].y !== simplified[simplified.length - 1].y)) {
    simplified = [...simplified, simplified[0]];
  }
  // Нормализация + прореживание до maxPoints.
  const normalized = simplified.map((p) => ({ x: clamp01(p.x / w), y: clamp01(p.y / h) }));
  if (normalized.length > maxPoints) {
    const keep = normalized.filter((_, i) => i % Math.ceil(normalized.length / maxPoints) === 0);
    if (keep.length >= 3) return keep;
  }
  return normalized;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Сброс всех сервисов (при переключении проекта). */
export function resetVfxServices(): void {
  bgRemovalService.clearCache();
}
