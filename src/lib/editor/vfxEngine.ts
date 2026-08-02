/**
 * VFX-движок MONTIQ — настоящая попиксельная обработка изображения.
 *
 * Всё, что здесь есть, работает в редакторе (превью рендерится через этот же
 * движок) и покрыто автотестами (scripts/test-vfx.mts). Модуль не зависит от
 * DOM: функции принимают плоский RGBA-буфер и возвращают НОВЫЙ буфер, поэтому
 * их можно гонять в Node для проверки и в браузере для превью/экспорта.
 *
 * Порядок применения эффектов в цепочке (applyVfxChain):
 *   1. Удаление объекта (inpaint)      — чинит кадр ДО остальных эффектов
 *   2. Удаление фона (AI-маска)
 *   3. Хромакей (альфа + деспилл)
 *   4. LUT-конвейер (3D LUT, трилинейная интерполяция)
 *   5. Шумоподавление (билатеральный фильтр)
 *   6. Резкость (unsharp mask)
 *   7. Motion blur (направленное размытие)
 *   8. Дисторсия объектива
 *   9. Свечение (glow)
 *  10. Bloom
 *  11. Световые лучи
 *  12. Плёночное зерно
 *  13. Виньетка
 */

import { lutGridFor } from "./lut";

export interface FrameBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface MaskBuffer {
  data: Uint8ClampedArray | Float32Array;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function newBuffer(width: number, height: number): FrameBuffer {
  return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

export function cloneBuffer(src: FrameBuffer): FrameBuffer {
  return { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height };
}

export function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** ImageData из буфера движка (обход generic-типов TS для типизированных массивов). */
export function toImageData(buf: FrameBuffer): ImageData {
  return new ImageData(buf.data as unknown as Uint8ClampedArray<ArrayBuffer>, buf.width, buf.height);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Быстрый детерминированный хэш (для зерна и т.п.). */
export function hash2(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = Math.imul(n, 1274126177);
  n = (n ^ (n >> 16)) | 0;
  return (n >>> 0) / 4294967295;
}

/** Билинейная выборка RGBA из буфера (с зажимом по краю). */
export function sampleBilinear(buf: FrameBuffer, x: number, y: number): [number, number, number, number] {
  const { data, width: w, height: h } = buf;
  const x0 = clamp(Math.floor(x), 0, w - 1);
  const y0 = clamp(Math.floor(y), 0, h - 1);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = clamp(x - x0, 0, 1);
  const fy = clamp(y - y0, 0, 1);
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx;
    const bottom = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx;
    out[c] = top + (bottom - top) * fy;
  }
  return out;
}

/** Один проход box-blur по горизонтали. */
function boxBlurH(data: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const div = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let rowBase = y * w * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += data[rowBase + clamp(x, 0, w - 1) * 4 + c];
      for (let x = 0; x < w; x++) {
        out[rowBase + x * 4 + c] = sum / div;
        const addIdx = clamp(x + r + 1, 0, w - 1) * 4 + c;
        const subIdx = clamp(x - r, 0, w - 1) * 4 + c;
        sum += data[rowBase + addIdx] - data[rowBase + subIdx];
      }
    }
  }
  return out;
}

/** Один проход box-blur по вертикали. */
function boxBlurV(data: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const div = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += data[clamp(y, 0, h - 1) * w * 4 + x * 4 + c];
      for (let y = 0; y < h; y++) {
        out[y * w * 4 + x * 4 + c] = sum / div;
        const addIdx = clamp(y + r + 1, 0, h - 1) * w * 4 + x * 4 + c;
        const subIdx = clamp(y - r, 0, h - 1) * w * 4 + x * 4 + c;
        sum += data[addIdx] - data[subIdx];
      }
    }
  }
  return out;
}

/**
 * Гауссово размытие (аппроксимация тремя проходами box-blur — быстро и
 * визуально неотличимо для эффектов). Радиус >= 0 в пикселях.
 */
export function gaussianBlur(src: FrameBuffer, radius: number): FrameBuffer {
  if (radius <= 0.25) return cloneBuffer(src);
  const r = Math.max(1, Math.round(radius * 0.7));
  const { width: w, height: h } = src;
  let d: Uint8ClampedArray = src.data;
  for (let pass = 0; pass < 3; pass++) {
    d = boxBlurH(d, w, h, r);
    d = boxBlurV(d, w, h, r);
  }
  return { data: d, width: w, height: h };
}

/** Размытие только по маске: blur маски-поля (0..255) как изображения. */
export function blurMask(mask: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  if (radius <= 0.25) return mask;
  const r = Math.max(1, Math.round(radius * 0.7));
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = mask[i];
    rgba[i * 4 + 1] = mask[i];
    rgba[i * 4 + 2] = mask[i];
    rgba[i * 4 + 3] = 255;
  }
  let d: Uint8ClampedArray = rgba;
  for (let pass = 0; pass < 3; pass++) {
    d = boxBlurH(d, w, h, r);
    d = boxBlurV(d, w, h, r);
  }
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i * 4];
  return out;
}

/* ------------------------------------------------------------------ */
/* Хромакей                                                            */
/* ------------------------------------------------------------------ */

export interface ChromaKeyParams {
  color: [number, number, number];
  similarity: number; // 0..1 — порог по сумме модулей разности каналов
  blend: number; // 0..1 — мягкость края
  despill: number; // 0..1 — подавление ореола (спилла) ключевого цвета
}

export function chromaKey(src: FrameBuffer, p: ChromaKeyParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data);
  const [kr, kg, kb] = p.color;
  // Порог в суммарном RGB-пространстве (0..765).
  const threshold = 765 * Math.max(0.01, p.similarity);
  const softness = Math.max(1, 765 * Math.max(0.01, p.blend));
  const despill = clamp(p.despill, 0, 1);
  // Доминирующий канал ключевого цвета — определяем, какой цвет вычитать.
  const domG = kg > kr && kg > kb;
  const domB = kb > kr && kb > kg;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.abs(r - kr) + Math.abs(g - kg) + Math.abs(b - kb);
    let alpha: number;
    if (dist <= threshold) alpha = 0;
    else if (dist >= threshold + softness) alpha = 255;
    else alpha = ((dist - threshold) / softness) * 255;
    out[i + 3] = Math.min(out[i + 3], alpha);
    if (alpha < 250 && despill > 0) {
      const m = (1 - alpha / 255) * despill;
      if (domG) {
        // Убираем зелёный ореол: зелёный канал не должен превышать максимум R/B.
        const keep = Math.max(r, b);
        out[i + 1] = clampByte(g + (keep - g) * m);
      } else if (domB) {
        const keep = Math.max(r, g);
        out[i + 2] = clampByte(b + (keep - b) * m);
      } else {
        const keep = Math.max(g, b);
        out[i] = clampByte(r + (keep - r) * m);
      }
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Удаление фона (AI-маска)                                            */
/* ------------------------------------------------------------------ */

export interface SegmentationParams {
  /** Маска переднего плана 0..255 (255 = уверенно передний план). */
  mask: MaskBuffer;
  smooth: number; // растушёвка края, px
  foregroundOpacity: number; // 0..1
  threshold: number; // 0..1
  fill: "transparent" | "blur" | "color";
  color: [number, number, number];
  blurAmount: number; // px
}

export function applySegmentation(src: FrameBuffer, p: SegmentationParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data);
  const mw = p.mask.width;
  const mh = p.mask.height;
  const maskSrc = p.mask.data;

  // 1. Масштабируем маску к разрешению кадра (билинейно) и пороговим.
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = (y / h) * (mh - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(mh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = (x / w) * (mw - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(mw - 1, x0 + 1);
      const fx = sx - x0;
      const v00 = maskSrc[y0 * mw + x0];
      const v10 = maskSrc[y0 * mw + x1];
      const v01 = maskSrc[y1 * mw + x0];
      const v11 = maskSrc[y1 * mw + x1];
      let v = v00 + (v10 - v00) * fx + (v01 - v00) * fy + (v11 - v10 - v01 + v00) * fx * fy;
      const norm = v > 1 ? v / 255 : v; // поддерживаем и Float32 (0..1), и Uint8 (0..255)
      m[y * w + x] = norm < p.threshold ? 0 : norm;
    }
  }

  // 2. Растушёвка маски.
  let soft = m;
  if (p.smooth > 0.25) {
    const mask8 = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) mask8[i] = clampByte(soft[i] * 255);
    const blurred = blurMask(mask8, w, h, p.smooth);
    soft = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) soft[i] = blurred[i] / 255;
  }

  const opacity = clamp(p.foregroundOpacity, 0, 1);
  if (p.fill === "transparent") {
    for (let i = 0; i < w * h; i++) {
      const a = soft[i] * opacity;
      out[i * 4 + 3] = Math.round(out[i * 4 + 3] * a);
    }
    return { data: out, width: w, height: h };
  }

  if (p.fill === "color") {
    const [cr, cg, cb] = p.color;
    for (let i = 0; i < w * h; i++) {
      const a = soft[i];
      const idx = i * 4;
      out[idx] = clampByte(cr + (out[idx] - cr) * a);
      out[idx + 1] = clampByte(cg + (out[idx + 1] - cg) * a);
      out[idx + 2] = clampByte(cb + (out[idx + 2] - cb) * a);
    }
    return { data: out, width: w, height: h };
  }

  // fill === "blur": фон = сильно размытая копия кадра.
  const blurred = gaussianBlur(src, p.blurAmount);
  for (let i = 0; i < w * h; i++) {
    const a = soft[i];
    const idx = i * 4;
    out[idx] = clampByte(blurred.data[idx] + (out[idx] - blurred.data[idx]) * a);
    out[idx + 1] = clampByte(blurred.data[idx + 1] + (out[idx + 1] - blurred.data[idx + 1]) * a);
    out[idx + 2] = clampByte(blurred.data[idx + 2] + (out[idx + 2] - blurred.data[idx + 2]) * a);
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Удаление объекта: маски + FMM-инпейнтинг                            */
/* ------------------------------------------------------------------ */

/** Рисует штрихи кисти в бинарную маску (255 = удаляем). */
export function strokesToMask(w: number, h: number, strokes: { x: number; y: number; radius: number }[]): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(w * h);
  for (const s of strokes) {
    const cx = s.x * w;
    const cy = s.y * h;
    const r = Math.max(1, s.radius * w);
    const r2 = r * r;
    const x0 = clamp(Math.floor(cx - r), 0, w - 1);
    const x1 = clamp(Math.ceil(cx + r), 0, w - 1);
    const y0 = clamp(Math.floor(cy - r), 0, h - 1);
    const y1 = clamp(Math.ceil(cy + r), 0, h - 1);
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) mask[y * w + x] = 255;
      }
    }
  }
  return mask;
}

/** Заливает замкнутый полигон в маску (чётно-нечётное правило). */
export function polygonToMask(w: number, h: number, polygon: { x: number; y: number }[]): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(w * h);
  if (!polygon.length) return mask;
  const pts = polygon.map((p) => ({ x: p.x * w, y: p.y * h }));
  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        const intersect = a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y || 1e-9) + a.x;
        if (intersect) inside = !inside;
      }
      if (inside) mask[y * w + x] = 255;
    }
  }
  return mask;
}

/**
 * Fast Marching Method (Telea) инпейнтинг — реальный content-aware fill.
 * mask[i] > 0 — область, которую нужно заменить. Возвращает новый кадр.
 */
export function inpaint(src: FrameBuffer, mask: Uint8ClampedArray, radius = 8): FrameBuffer {
  const { data, width: w, height: h } = src;
  const N = w * h;
  const out = new Uint8ClampedArray(data);
  const dist = new Float32Array(N).fill(Infinity);
  const flag = new Uint8Array(N); // 0 = unknown, 1 = band, 2 = known/inpainted
  const heap: number[] = [];
  const heapDist = new Float32Array(N);
  const inHeap = new Uint8Array(N);

  // Чамферово преобразование расстояний: насколько глубоко пиксель в маске.
  // Окно интерполяции делаем адаптивным — чтобы оно доставало до известных
  // пикселей из центра даже большой области.
  const chamfer = new Float32Array(N);
  for (let i = 0; i < N; i++) chamfer[i] = mask[i] > 0 ? 1e6 : 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (chamfer[i] === 0) continue;
        const up = y > 0 ? chamfer[i - w] : Infinity;
        const left = x > 0 ? chamfer[i - 1] : Infinity;
        const upLeft = y > 0 && x > 0 ? chamfer[i - w - 1] : Infinity;
        const upRight = y > 0 && x < w - 1 ? chamfer[i - w + 1] : Infinity;
        chamfer[i] = Math.min(chamfer[i], Math.min(up, left) + 1, Math.min(upLeft, upRight) + 1.4142);
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (chamfer[i] === 0) continue;
        const down = y < h - 1 ? chamfer[i + w] : Infinity;
        const right = x < w - 1 ? chamfer[i + 1] : Infinity;
        const downLeft = y < h - 1 && x > 0 ? chamfer[i + w - 1] : Infinity;
        const downRight = y < h - 1 && x < w - 1 ? chamfer[i + w + 1] : Infinity;
        chamfer[i] = Math.min(chamfer[i], Math.min(down, right) + 1, Math.min(downLeft, downRight) + 1.4142);
      }
    }
  }
  let maxChamfer = 0;
  for (let i = 0; i < N; i++) if (chamfer[i] > maxChamfer) maxChamfer = chamfer[i];
  // Окно интерполяции обязано доставать до известных пикселей из центра области.
  const R = Math.min(160, Math.max(radius, Math.ceil(maxChamfer) + 2, 6));

  const push = (idx: number, d: number) => {
    if (inHeap[idx]) {
      if (d < heapDist[idx]) heapDist[idx] = d;
      return;
    }
    inHeap[idx] = 1;
    heapDist[idx] = d;
    let i = heap.length;
    heap.push(idx);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heapDist[heap[parent]] <= heapDist[heap[i]]) break;
      const t = heap[parent];
      heap[parent] = heap[i];
      heap[i] = t;
      i = parent;
    }
  };

  const pop = (): number => {
    if (!heap.length) return -1;
    const top = heap[0];
    const last = heap.pop()!;
    inHeap[top] = 0;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < heap.length && heapDist[heap[l]] < heapDist[heap[smallest]]) smallest = l;
        if (r < heap.length && heapDist[heap[r]] < heapDist[heap[smallest]]) smallest = r;
        if (smallest === i) break;
        const t = heap[i];
        heap[i] = heap[smallest];
        heap[smallest] = t;
        i = smallest;
      }
    }
    return top;
  };

  const R2 = R * R;

  // Известные пиксели: всё, что вне маски.
  for (let i = 0; i < N; i++) {
    if (mask[i] === 0) {
      flag[i] = 2;
      dist[i] = 0;
    }
  }
  // Стартовая полоса: неизвестные пиксели на границе известных.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (flag[i] !== 0) continue;
      const hasKnown =
        (x > 0 && flag[i - 1] === 2) ||
        (x < w - 1 && flag[i + 1] === 2) ||
        (y > 0 && flag[i - w] === 2) ||
        (y < h - 1 && flag[i + w] === 2);
      if (hasKnown) {
        flag[i] = 1;
        dist[i] = 1;
        push(i, 1);
      }
    }
  }

  // Нормаль в точке: градиент поля расстояний (Sobel).
  const normalAt = (idx: number): [number, number] => {
    const x = idx % w;
    const y = (idx / w) | 0;
    const gx =
      dist[clamp(y - 1, 0, h - 1) * w + clamp(x + 1, 0, w - 1)] -
      dist[clamp(y - 1, 0, h - 1) * w + clamp(x - 1, 0, w - 1)] +
      2 * (dist[y * w + clamp(x + 1, 0, w - 1)] - dist[y * w + clamp(x - 1, 0, w - 1)]) +
      dist[clamp(y + 1, 0, h - 1) * w + clamp(x + 1, 0, w - 1)] -
      dist[clamp(y + 1, 0, h - 1) * w + clamp(x - 1, 0, w - 1)];
    const gy =
      dist[clamp(y + 1, 0, h - 1) * w + clamp(x - 1, 0, w - 1)] -
      dist[clamp(y - 1, 0, h - 1) * w + clamp(x - 1, 0, w - 1)] +
      2 * (dist[clamp(y + 1, 0, h - 1) * w + x] - dist[clamp(y - 1, 0, h - 1) * w + x]) +
      dist[clamp(y + 1, 0, h - 1) * w + clamp(x + 1, 0, w - 1)] -
      dist[clamp(y - 1, 0, h - 1) * w + clamp(x + 1, 0, w - 1)];
    const len = Math.hypot(gx, gy) || 1;
    return [gx / len, gy / len];
  };

  let guard = 0;
  const maxIters = N * 4 + 16;
  for (;;) {
    const p = pop();
    if (p < 0) break;
    if (flag[p] !== 1) continue;
    if (++guard > maxIters) break;

    const px = p % w;
    const py = (p / w) | 0;
    const [nx, ny] = normalAt(p);
    const dp = dist[p];

    let rsum = 0;
    let gsum = 0;
    let bsum = 0;
    let wsum = 0;
    // Резерв: простой средний по всем известным соседям (для центра области,
    // где нормаль поля расстояний вырождается в ноль).
    let rsum2 = 0;
    let gsum2 = 0;
    let bsum2 = 0;
    let wsum2 = 0;
    const x0 = Math.max(0, px - R);
    const x1 = Math.min(w - 1, px + R);
    const y0 = Math.max(0, py - R);
    const y1 = Math.min(h - 1, py + R);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > R2 || d2 === 0) continue;
        const q = y * w + x;
        if (flag[q] !== 2) continue;
        const iq = q * 4;
        const dst = 1 / (1 + dp * dp);
        const lev = 1 / (1 + Math.abs(dp - dist[q]));
        // Резервный вес копим всегда — он нужен, если направленный обнулится.
        rsum2 += dst * lev * out[iq];
        gsum2 += dst * lev * out[iq + 1];
        bsum2 += dst * lev * out[iq + 2];
        wsum2 += dst * lev;
        // Направленный вес (Telea): чем сильнее сосед лежит на оси нормали
        // (направление распространения фронта), тем больше его вклад.
        const dir = Math.abs((dx * nx + dy * ny) / Math.sqrt(d2));
        if (dir <= 0.001) continue;
        const wgt = dir * dst * lev;
        rsum += wgt * out[iq];
        gsum += wgt * out[iq + 1];
        bsum += wgt * out[iq + 2];
        wsum += wgt;
      }
    }
    const ip = p * 4;
    if (wsum > 1e-6) {
      out[ip] = clampByte(rsum / wsum);
      out[ip + 1] = clampByte(gsum / wsum);
      out[ip + 2] = clampByte(bsum / wsum);
    } else if (wsum2 > 1e-6) {
      out[ip] = clampByte(rsum2 / wsum2);
      out[ip + 1] = clampByte(gsum2 / wsum2);
      out[ip + 2] = clampByte(bsum2 / wsum2);
    }
    flag[p] = 2;

    const update = (q: number, step: number) => {
      if (q < 0 || q >= N) return;
      if (flag[q] === 2) return;
      const nd = dp + step;
      if (flag[q] === 0) {
        flag[q] = 1;
        dist[q] = nd;
        push(q, nd);
      } else if (nd < dist[q]) {
        dist[q] = nd;
        push(q, nd);
      }
    };
    if (px > 0) update(p - 1, 1);
    if (px < w - 1) update(p + 1, 1);
    if (py > 0) update(p - w, 1);
    if (py < h - 1) update(p + w, 1);
  }

  // Сглаживание заполненной области (убирает блочность).
  const smooth = blurMask(mask, w, h, 1.2);
  const smoothed = gaussianBlur({ data: out, width: w, height: h }, 1.4);
  for (let i = 0; i < N; i++) {
    if (mask[i] > 0) {
      const a = smooth[i] / 255;
      const idx = i * 4;
      out[idx] = clampByte(smoothed.data[idx] + (out[idx] - smoothed.data[idx]) * (1 - a));
      out[idx + 1] = clampByte(smoothed.data[idx + 1] + (out[idx + 1] - smoothed.data[idx + 1]) * (1 - a));
      out[idx + 2] = clampByte(smoothed.data[idx + 2] + (out[idx + 2] - smoothed.data[idx + 2]) * (1 - a));
    }
  }
  return { data: out, width: w, height: h };
}

/** Удаление объекта: маска из штрихов/полигона + инпейнтинг. */
export function applyObjectRemoval(
  src: FrameBuffer,
  strokes: { x: number; y: number; radius: number }[],
  region?: { polygon: { x: number; y: number }[] },
  radius = 10,
): FrameBuffer {
  const { width: w, height: h } = src;
  const mask = new Uint8ClampedArray(w * h);
  if (strokes.length) {
    const s = strokesToMask(w, h, strokes);
    for (let i = 0; i < w * h; i++) mask[i] = Math.max(mask[i], s[i]);
  }
  if (region?.polygon.length) {
    const p = polygonToMask(w, h, region.polygon);
    for (let i = 0; i < w * h; i++) mask[i] = Math.max(mask[i], p[i]);
  }
  let any = false;
  for (let i = 0; i < w * h; i++) if (mask[i] > 0) { any = true; break; }
  if (!any) return cloneBuffer(src);
  return inpaint(src, mask, radius);
}

/* ------------------------------------------------------------------ */
/* Motion blur                                                         */
/* ------------------------------------------------------------------ */

export interface MotionBlurParams {
  angleDeg: number;
  length: number; // px
  samples: number;
}

export function motionBlur(src: FrameBuffer, p: MotionBlurParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data.length);
  const rad = ((p.angleDeg % 360) * Math.PI) / 180;
  const len = Math.max(0.5, p.length);
  const steps = Math.max(2, Math.min(28, Math.round(p.samples || Math.min(28, len))));
  const dx = Math.cos(rad) * (len / 2);
  const dy = Math.sin(rad) * (len / 2);
  // Вес: треугольный (больше вклад центра).
  const weights: number[] = [];
  let wsum = 0;
  for (let s = 0; s < steps; s++) {
    const t = (s / (steps - 1)) * 2 - 1;
    const wgt = 1 - Math.abs(t);
    weights.push(wgt);
    wsum += wgt;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let s = 0; s < steps; s++) {
        const t = (s / (steps - 1)) * 2 - 1;
        const sx = clamp(Math.round(x + t * dx), 0, w - 1);
        const sy = clamp(Math.round(y + t * dy), 0, h - 1);
        const idx = (sy * w + sx) * 4;
        const wgt = weights[s];
        r += data[idx] * wgt;
        g += data[idx + 1] * wgt;
        b += data[idx + 2] * wgt;
        a += data[idx + 3] * wgt;
      }
      const idx = (y * w + x) * 4;
      out[idx] = clampByte(r / wsum);
      out[idx + 1] = clampByte(g / wsum);
      out[idx + 2] = clampByte(b / wsum);
      out[idx + 3] = clampByte(a / wsum);
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Свечение (glow) и Bloom                                             */
/* ------------------------------------------------------------------ */

function thresholdBright(src: FrameBuffer, threshold: number): FrameBuffer {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data.length);
  const t = clamp(threshold, 0, 1) * 255;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const f = Math.max(0, l - t) / Math.max(1, 255 - t);
    out[i] = clampByte(data[i] * f);
    out[i + 1] = clampByte(data[i + 1] * f);
    out[i + 2] = clampByte(data[i + 2] * f);
    out[i + 3] = data[i + 3];
  }
  return { data: out, width: w, height: h };
}

function screenBlendAdd(base: FrameBuffer, glow: FrameBuffer, strength: number, mode: "screen" | "add"): FrameBuffer {
  const { data, width: w, height: h } = base;
  const out = new Uint8ClampedArray(data.length);
  const s = clamp(strength, 0, 2);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i];
    const b = data[i + 1];
    const c = data[i + 2];
    const ga = glow.data[i];
    const gb = glow.data[i + 1];
    const gc = glow.data[i + 2];
    if (mode === "screen") {
      out[i] = clampByte(255 - (255 - a) * (255 - ga * s) / 255);
      out[i + 1] = clampByte(255 - (255 - b) * (255 - gb * s) / 255);
      out[i + 2] = clampByte(255 - (255 - c) * (255 - gc * s) / 255);
    } else {
      out[i] = clampByte(a + ga * s);
      out[i + 1] = clampByte(b + gb * s);
      out[i + 2] = clampByte(c + gc * s);
    }
    out[i + 3] = data[i + 3];
  }
  return { data: out, width: w, height: h };
}

export interface GlowParams {
  radius: number; // px
  strength: number; // 0..1
  threshold: number; // 0..1
}

export function glow(src: FrameBuffer, p: GlowParams): FrameBuffer {
  const bright = thresholdBright(src, p.threshold);
  const blurred = gaussianBlur(bright, p.radius);
  return screenBlendAdd(src, blurred, p.strength, "screen");
}

export interface BloomParams {
  radius: number; // px
  strength: number; // 0..1
  threshold: number; // 0..1
}

export function bloom(src: FrameBuffer, p: BloomParams): FrameBuffer {
  const bright = thresholdBright(src, p.threshold);
  const blurred = gaussianBlur(bright, p.radius);
  return screenBlendAdd(src, blurred, p.strength, "add");
}

/* ------------------------------------------------------------------ */
/* Световые лучи (god rays)                                            */
/* ------------------------------------------------------------------ */

export interface LightRaysParams {
  centerX: number; // 0..1
  centerY: number; // 0..1
  length: number; // 0..1
  strength: number; // 0..1
  rayCount: number;
  seed?: number;
}

export function lightRays(src: FrameBuffer, p: LightRaysParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data.length);
  const cx = p.centerX * w;
  const cy = p.centerY * h;
  const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) || 1;
  const len = clamp(p.length, 0, 1);
  const falloff = 1 + len * 2.6; // чем длиннее лучи, тем быстрее затухание
  const rays = Math.max(2, Math.round(p.rayCount));
  const strength = clamp(p.strength, 0, 2);
  const seed = p.seed ?? 7;

  // Заранее считаем поле лучей на сетке (ускоряет и даёт мягкие лучи).
  const gw = Math.max(24, w >> 2);
  const gh = Math.max(16, h >> 2);
  const field = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = (gx / gw) * w;
      const y = (gy / gh) * h;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const streak = Math.pow(Math.abs(Math.cos(angle * rays)), 20);
      const fall = Math.pow(Math.max(0, 1 - r / maxR), falloff);
      const halo = Math.pow(Math.max(0, 1 - r / (maxR * 0.35)), 2);
      field[gy * gw + gx] = streak * fall + halo * 0.5;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const luma = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      // Лучи проступают сквозь яркие области кадра.
      const bright = Math.pow(clamp(luma / 255, 0, 1), 1.6);
      const gx = clamp((x / w) * gw, 0, gw - 1);
      const gy = clamp((y / h) * gh, 0, gh - 1);
      const gxi = Math.floor(gx);
      const gyi = Math.floor(gy);
      const fx = gx - gxi;
      const fy = gy - gyi;
      const gx2 = Math.min(gw - 1, gxi + 1);
      const gy2 = Math.min(gh - 1, gyi + 1);
      const v =
        field[gyi * gw + gxi] * (1 - fx) * (1 - fy) +
        field[gyi * gw + gx2] * fx * (1 - fy) +
        field[gy2 * gw + gxi] * (1 - fx) * fy +
        field[gy2 * gw + gx2] * fx * fy;
      const add = v * strength * bright * 210 * (0.75 + hash2(x, y, seed) * 0.5);
      out[idx] = clampByte(data[idx] + add);
      out[idx + 1] = clampByte(data[idx + 1] + add * 0.95);
      out[idx + 2] = clampByte(data[idx + 2] + add * 0.85);
      out[idx + 3] = data[idx + 3];
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Плёночное зерно                                                     */
/* ------------------------------------------------------------------ */

export interface FilmGrainParams {
  amount: number; // 0..1
  size: number; // 1..16 px
  monochrome: boolean;
  seed: number;
  /** Секунды — чтобы зерно «плясало» при воспроизведении. */
  time?: number;
}

export function filmGrain(src: FrameBuffer, p: FilmGrainParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data.length);
  const amount = clamp(p.amount, 0, 1);
  if (amount <= 0.001) return cloneBuffer(src);
  const size = Math.max(1, p.size);
  const frame = Math.floor((p.time ?? 0) * 24);
  const seed = p.seed + frame * 1013904223;
  const nw = Math.max(2, Math.round(w / size));
  const nh = Math.max(2, Math.round(h / size));
  // Поле шума в низком разрешении (крупность зерна), билинейно при выборке.
  for (let y = 0; y < h; y++) {
    const sy = ((y / size) % nh) / nh;
    for (let x = 0; x < w; x++) {
      const sx = ((x / size) % nw) / nw;
      const gx = clamp(Math.floor(sx * nw), 0, nw - 1);
      const gy = clamp(Math.floor(sy * nh), 0, nh - 1);
      const gx2 = Math.min(nw - 1, gx + 1);
      const gy2 = Math.min(nh - 1, gy + 1);
      const fx = sx * nw - gx;
      const fy = sy * nh - gy;
      const n00 = hash2(gx, gy, seed);
      const n10 = hash2(gx2, gy, seed);
      const n01 = hash2(gx, gy2, seed);
      const n11 = hash2(gx2, gy2, seed);
      const n = n00 * (1 - fx) * (1 - fy) + n10 * fx * (1 - fy) + n01 * (1 - fx) * fy + n11 * fx * fy;
      const grain = (n - 0.5) * 2 * amount * 60;
      const idx = (y * w + x) * 4;
      if (p.monochrome) {
        const l = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
        const gl = clampByte(l + grain);
        const scale = gl / (l || 1);
        out[idx] = clampByte(data[idx] * scale);
        out[idx + 1] = clampByte(data[idx + 1] * scale);
        out[idx + 2] = clampByte(data[idx + 2] * scale);
      } else {
        const n2 = hash2(x, y, seed + 7);
        out[idx] = clampByte(data[idx] + grain * (0.7 + n2 * 0.6));
        out[idx + 1] = clampByte(data[idx + 1] + grain);
        out[idx + 2] = clampByte(data[idx + 2] + grain * (0.6 + n2 * 0.8));
      }
      out[idx + 3] = data[idx + 3];
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Дисторсия объектива                                                 */
/* ------------------------------------------------------------------ */

export interface LensDistortionParams {
  amount: number; // -1..1
}

export function lensDistortion(src: FrameBuffer, p: LensDistortionParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data.length);
  const k = clamp(p.amount, -1, 1) * 0.45;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  if (Math.abs(k) < 0.002) return cloneBuffer(src);
  for (let y = 0; y < h; y++) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / cx;
      const r2 = nx * nx + ny * ny;
      const f = 1 + k * r2; // >0 — бочка (края уходят наружу), <0 — подушка
      const sx = cx + nx * f * cx;
      const sy = cy + ny * f * cy;
      const idx = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) {
        // Заполняем ушедшие края чёрным.
        out[idx] = out[idx + 1] = out[idx + 2] = 0;
        out[idx + 3] = data[idx + 3];
        continue;
      }
      const s = sampleBilinear(src, sx, sy);
      out[idx] = s[0];
      out[idx + 1] = s[1];
      out[idx + 2] = s[2];
      out[idx + 3] = data[idx + 3];
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Резкость и шумоподавление                                           */
/* ------------------------------------------------------------------ */

export interface SharpenParams {
  amount: number; // 0..2
  radius: number; // px
}

export function sharpen(src: FrameBuffer, p: SharpenParams): FrameBuffer {
  const amount = clamp(p.amount, 0, 2);
  if (amount <= 0.002) return cloneBuffer(src);
  const blurred = gaussianBlur(src, Math.max(0.4, p.radius));
  const { data, width: w, height: h } = src;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = clampByte(data[i] + (data[i] - blurred.data[i]) * amount);
    out[i + 1] = clampByte(data[i + 1] + (data[i + 1] - blurred.data[i + 1]) * amount);
    out[i + 2] = clampByte(data[i + 2] + (data[i + 2] - blurred.data[i + 2]) * amount);
    out[i + 3] = data[i + 3];
  }
  return { data: out, width: w, height: h };
}

export interface NoiseReductionParams {
  amount: number; // 0..1
  radius: number; // 1..3
}

/** Билатеральный фильтр: сглаживает шум, сохраняя границы. */
export function noiseReduction(src: FrameBuffer, p: NoiseReductionParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const amount = clamp(p.amount, 0, 1);
  if (amount <= 0.002) return cloneBuffer(src);
  const radius = Math.max(1, Math.min(3, Math.round(p.radius)));
  const sigmaS = Math.max(1, radius * 0.9);
  const sigmaC = 34;
  const out = new Uint8ClampedArray(data.length);
  const invS2 = 1 / (2 * sigmaS * sigmaS);
  const invC2 = 1 / (2 * sigmaC * sigmaC);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const cr = data[idx];
      const cg = data[idx + 1];
      const cb = data[idx + 2];
      let wr = 0;
      let sr = 0, sg = 0, sb = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = clamp(y + dy, 0, h - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = clamp(x + dx, 0, w - 1);
          const j = (yy * w + xx) * 4;
          const dr = data[j] - cr;
          const dg = data[j + 1] - cg;
          const db = data[j + 2] - cb;
          const space = Math.exp(-(dx * dx + dy * dy) * invS2);
          const color = Math.exp(-(dr * dr + dg * dg + db * db) * invC2);
          const wgt = space * color;
          sr += wgt * data[j];
          sg += wgt * data[j + 1];
          sb += wgt * data[j + 2];
          wr += wgt;
        }
      }
      const mix = amount;
      out[idx] = clampByte(cr + (sr / wr - cr) * mix);
      out[idx + 1] = clampByte(cg + (sg / wr - cg) * mix);
      out[idx + 2] = clampByte(cb + (sb / wr - cb) * mix);
      out[idx + 3] = data[idx + 3];
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Виньетка                                                            */
/* ------------------------------------------------------------------ */

export interface VignetteParams {
  strength: number; // 0..1
  feather: number; // 0..1 (мягкость)
}

export function vignette(src: FrameBuffer, p: VignetteParams): FrameBuffer {
  const { data, width: w, height: h } = src;
  const strength = clamp(p.strength, 0, 1);
  if (strength <= 0.002) return cloneBuffer(src);
  const feather = clamp(p.feather, 0.05, 1);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxR = Math.hypot(cx, cy) || 1;
  // Внутренний радиус, с которого начинается затемнение.
  const inner = 0.35 + feather * 0.55;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - cx, y - cy) / maxR;
      let f: number;
      if (r <= inner) f = 0;
      else if (r >= 1) f = 1;
      else {
        const t = (r - inner) / (1 - inner);
        f = t * t * (3 - 2 * t); // smoothstep
      }
      const dark = f * strength;
      const idx = (y * w + x) * 4;
      out[idx] = clampByte(data[idx] * (1 - dark));
      out[idx + 1] = clampByte(data[idx + 1] * (1 - dark));
      out[idx + 2] = clampByte(data[idx + 2] * (1 - dark));
      out[idx + 3] = data[idx + 3];
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Blend-режимы (композитинг слоёв)                                    */
/* ------------------------------------------------------------------ */

export type BlendModeName =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "colorDodge"
  | "colorBurn"
  | "hardLight"
  | "softLight"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

/** Математика одного канала для режима наложения. */
export function blendChannel(a: number, b: number, mode: BlendModeName): number {
  const x = a / 255;
  const y = b / 255;
  let v: number;
  switch (mode) {
    case "normal": v = y; break;
    case "multiply": v = x * y; break;
    case "screen": v = 1 - (1 - x) * (1 - y); break;
    case "overlay": v = x < 0.5 ? 2 * x * y : 1 - 2 * (1 - x) * (1 - y); break;
    case "darken": v = Math.min(x, y); break;
    case "lighten": v = Math.max(x, y); break;
    case "colorDodge": v = y >= 1 ? 1 : Math.min(1, x / (1 - y)); break;
    case "colorBurn": v = y <= 0 ? 0 : 1 - Math.min(1, (1 - x) / y); break;
    case "hardLight": v = y < 0.5 ? 2 * x * y : 1 - 2 * (1 - x) * (1 - y); break;
    case "softLight": v = (1 - 2 * y) * x * x + 2 * y * x; break;
    case "difference": v = Math.abs(x - y); break;
    case "exclusion": v = x + y - 2 * x * y; break;
    case "hue": case "saturation": case "color": case "luminosity":
      // HSL-режимы требуют преобразования всего пикселя — обрабатываются в applyBlendLayer.
      v = y;
      break;
    default: v = y;
  }
  return clampByte(v * 255);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = clampByte(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [clampByte(hue2rgb(h + 1 / 3) * 255), clampByte(hue2rgb(h) * 255), clampByte(hue2rgb(h - 1 / 3) * 255)];
}

function blendHslPixel(br: number, bg: number, bb: number, lr: number, lg: number, lb: number, mode: BlendModeName): [number, number, number] {
  const baseHsl = rgbToHsl(br, bg, bb);
  const layerHsl = rgbToHsl(lr, lg, lb);
  switch (mode) {
    case "hue": return hslToRgb(layerHsl[0], baseHsl[1], baseHsl[2]);
    case "saturation": return hslToRgb(baseHsl[0], layerHsl[1], baseHsl[2]);
    case "color": return hslToRgb(layerHsl[0], layerHsl[1], baseHsl[2]);
    case "luminosity": return hslToRgb(baseHsl[0], baseHsl[1], layerHsl[2]);
    default: return [br, bg, bb];
  }
}

/**
 * Накладывает слой с blend-режимом и непрозрачностью (с учётом альфы слоя).
 * Возвращает новый буфер.
 */
export function applyBlendLayer(base: FrameBuffer, layer: FrameBuffer, mode: BlendModeName, opacity = 1): FrameBuffer {
  const bd = base.data;
  const ld = layer.data;
  const out = new Uint8ClampedArray(bd.length);
  const n = base.width * base.height;
  const op = clamp(opacity, 0, 1);
  for (let i = 0; i < n; i++) {
    const bi = i * 4;
    const br = bd[bi], bg = bd[bi + 1], bb = bd[bi + 2], ba = bd[bi + 3];
    const lr = ld[bi], lg = ld[bi + 1], lb = ld[bi + 2], la = ld[bi + 3];
    if (mode === "normal") {
      // Классическое альфа-композитинг.
      const a = (la / 255) * op;
      const oa = a + (ba / 255) * (1 - a);
      if (oa <= 0) continue;
      out[bi] = clampByte((lr * a + br * (ba / 255) * (1 - a)) / oa);
      out[bi + 1] = clampByte((lg * a + bg * (ba / 255) * (1 - a)) / oa);
      out[bi + 2] = clampByte((lb * a + bb * (ba / 255) * (1 - a)) / oa);
      out[bi + 3] = clampByte(oa * 255);
      continue;
    }
    if (mode === "hue" || mode === "saturation" || mode === "color" || mode === "luminosity") {
      const [mr, mg, mb] = blendHslPixel(br, bg, bb, lr, lg, lb, mode);
      const a = (la / 255) * op;
      out[bi] = clampByte(mr * a + br * (1 - a));
      out[bi + 1] = clampByte(mg * a + bg * (1 - a));
      out[bi + 2] = clampByte(mb * a + bb * (1 - a));
      out[bi + 3] = ba;
      continue;
    }
    const a = (la / 255) * op;
    out[bi] = clampByte(blendChannel(br, lr, mode) * a + br * (1 - a));
    out[bi + 1] = clampByte(blendChannel(bg, lg, mode) * a + bg * (1 - a));
    out[bi + 2] = clampByte(blendChannel(bb, lb, mode) * a + bb * (1 - a));
    out[bi + 3] = ba;
  }
  return { data: out, width: base.width, height: base.height };
}

/* ------------------------------------------------------------------ */
/* LUT-конвейер (3D LUT, трилинейная интерполяция)                     */
/* ------------------------------------------------------------------ */

export interface LutGrid {
  /** size³ записей по 3 канала, каждый 0..255. */
  data: Uint8ClampedArray;
  size: number;
}

export function applyLut(src: FrameBuffer, lut: LutGrid, amount: number): FrameBuffer {
  const { data, width: w, height: h } = src;
  const { data: g, size } = lut;
  const amt = clamp(amount, 0, 1);
  if (amt <= 0.001 || size < 2) return cloneBuffer(src);
  const maxIdx = size - 1;
  const out = new Uint8ClampedArray(data.length);
  const stride = size * size * 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g0 = data[idx + 1];
      const b = data[idx + 2];
      const fr = (r / 255) * maxIdx;
      const fg = (g0 / 255) * maxIdx;
      const fb = (b / 255) * maxIdx;
      const ir = Math.min(maxIdx - 1, Math.floor(fr));
      const ig = Math.min(maxIdx - 1, Math.floor(fg));
      const ib = Math.min(maxIdx - 1, Math.floor(fb));
      const dr = fr - ir;
      const dg = fg - ig;
      const db = fb - ib;
      const i000 = (ir * size * size + ig * size + ib) * 3;
      const i100 = i000 + stride;
      const i010 = i000 + size * 3;
      const i110 = i100 + size * 3;
      const i001 = i000 + 3;
      const i101 = i100 + 3;
      const i011 = i010 + 3;
      const i111 = i110 + 3;
      const c000 = 1 - dr, c100 = dr, c010 = 1 - dg, c110 = dg, c001 = 1 - db, c101 = db;
      for (let c = 0; c < 3; c++) {
        const v =
          g[i000 + c] * c000 * c010 * c001 +
          g[i100 + c] * c100 * c010 * c001 +
          g[i010 + c] * c000 * c110 * c001 +
          g[i110 + c] * c100 * c110 * c001 +
          g[i001 + c] * c000 * c010 * c101 +
          g[i101 + c] * c100 * c010 * c101 +
          g[i011 + c] * c000 * c110 * c101 +
          g[i111 + c] * c100 * c110 * c101;
        out[idx + c] = clampByte(data[idx + c] + (v - data[idx + c]) * amt);
      }
      out[idx + 3] = data[idx + 3];
    }
  }
  return { data: out, width: w, height: h };
}

/* ------------------------------------------------------------------ */
/* Единая цепочка                                                      */
/* ------------------------------------------------------------------ */

export interface VfxChainOptions {
  /** Локальное время клипа (сек) — для анимированного зерна и т.п. */
  time?: number;
  /** Хромакей (клиповый, вне vfx-настроек). */
  chroma?: ChromaKeyParams | null;
  /** Маска переднего плана для удаления фона (из MediaPipe). */
  bgMask?: MaskBuffer | null;
  /** Масштаб рабочего буфера относительно референсного кадра: px-параметры
   *  эффектов умножаются на него. В тестах обычно 1. */
  workScale?: number;
}

export function applyVfxChain(src: FrameBuffer, vfx: VfxSettingsLike | null | undefined, opts: VfxChainOptions = {}): FrameBuffer {
  if (!vfx) return cloneBuffer(src);
  const s = opts.workScale ?? 1;
  let buf = cloneBuffer(src);

  // 1. Удаление объекта.
  if (vfx.objectRemoval?.enabled && (vfx.objectRemoval.strokes?.length || vfx.objectRemoval.region?.polygon?.length)) {
    buf = applyObjectRemoval(buf, vfx.objectRemoval.strokes ?? [], vfx.objectRemoval.region, 10 * s);
  }

  // 2. Удаление фона (маска подставляется извне через opts? нет — mask не входит в VfxSettings,
  //    поэтому компоновщик вызывает applySegmentation отдельно ДО цепочки).
  if (vfx.backgroundRemoval?.enabled && opts.bgMask) {
    buf = applySegmentation(buf, {
      mask: opts.bgMask,
      smooth: (vfx.backgroundRemoval.edgeSmooth ?? 6) * s,
      foregroundOpacity: vfx.backgroundRemoval.foregroundOpacity ?? 1,
      threshold: vfx.backgroundRemoval.threshold ?? 0.4,
      fill: vfx.backgroundRemoval.fill ?? "transparent",
      color: hexToRgbArr(vfx.backgroundRemoval.color ?? "#000000"),
      blurAmount: (vfx.backgroundRemoval.blurAmount ?? 18) * s,
    });
  }

  // 3. Хромакей.
  if (opts.chroma) {
    buf = chromaKey(buf, opts.chroma);
  }

  // 4. LUT.
  if (vfx.lut?.enabled && vfx.lut.preset && vfx.lut.preset !== "none") {
    const lut = lutGridFor(vfx.lut.preset);
    if (lut) buf = applyLut(buf, lut, vfx.lut.amount ?? 1);
  }

  // 5. Шумоподавление.
  if (vfx.noiseReduction?.enabled) {
    buf = noiseReduction(buf, { amount: vfx.noiseReduction.amount ?? 0.5, radius: vfx.noiseReduction.radius ?? 1 });
  }

  // 6. Резкость.
  if (vfx.sharpen?.enabled) {
    buf = sharpen(buf, { amount: vfx.sharpen.amount ?? 0.6, radius: (vfx.sharpen.radius ?? 1.2) * s });
  }

  // 7. Motion blur.
  if (vfx.motionBlur?.enabled) {
    buf = motionBlur(buf, {
      angleDeg: vfx.motionBlur.angleDeg ?? 0,
      length: (vfx.motionBlur.length ?? 6) * s,
      samples: vfx.motionBlur.samples ?? 8,
    });
  }

  // 8. Дисторсия.
  if (vfx.lensDistortion?.enabled) {
    buf = lensDistortion(buf, { amount: vfx.lensDistortion.amount ?? 0 });
  }

  // 9. Свечение.
  if (vfx.glow?.enabled) {
    buf = glow(buf, { radius: (vfx.glow.radius ?? 10) * s, strength: vfx.glow.strength ?? 0.6, threshold: vfx.glow.threshold ?? 0.55 });
  }

  // 10. Bloom.
  if (vfx.bloom?.enabled) {
    buf = bloom(buf, { radius: (vfx.bloom.radius ?? 14) * s, strength: vfx.bloom.strength ?? 0.5, threshold: vfx.bloom.threshold ?? 0.72 });
  }

  // 11. Световые лучи.
  if (vfx.lightRays?.enabled) {
    buf = lightRays(buf, {
      centerX: vfx.lightRays.centerX ?? 0.5,
      centerY: vfx.lightRays.centerY ?? 0.35,
      length: vfx.lightRays.length ?? 0.6,
      strength: vfx.lightRays.strength ?? 0.5,
      rayCount: vfx.lightRays.rayCount ?? 8,
    });
  }

  // 12. Зерно.
  if (vfx.filmGrain?.enabled) {
    buf = filmGrain(buf, {
      amount: vfx.filmGrain.amount ?? 0.12,
      size: (vfx.filmGrain.size ?? 1.5) * s,
      monochrome: vfx.filmGrain.monochrome ?? true,
      seed: vfx.filmGrain.seed ?? 1337,
      time: opts.time ?? 0,
    });
  }

  // 13. Виньетка.
  if (vfx.vignette?.enabled) {
    buf = vignette(buf, { strength: vfx.vignette.strength ?? 0.45, feather: vfx.vignette.feather ?? 0.6 });
  }

  return buf;
}

/** Плоский тип, совместимый с VfxSettings (для тестов без импорта типов). */
export interface VfxSettingsLike {
  objectRemoval?: { enabled?: boolean; strokes?: { x: number; y: number; radius: number }[]; region?: { polygon: { x: number; y: number }[] } } | null;
  backgroundRemoval?: {
    enabled?: boolean;
    fill?: "transparent" | "blur" | "color";
    color?: string;
    blurAmount?: number;
    edgeSmooth?: number;
    foregroundOpacity?: number;
    threshold?: number;
  } | null;
  lut?: { enabled?: boolean; preset?: string; amount?: number } | null;
  noiseReduction?: { enabled?: boolean; amount?: number; radius?: number } | null;
  sharpen?: { enabled?: boolean; amount?: number; radius?: number } | null;
  motionBlur?: { enabled?: boolean; angleDeg?: number; length?: number; samples?: number } | null;
  lensDistortion?: { enabled?: boolean; amount?: number } | null;
  glow?: { enabled?: boolean; radius?: number; strength?: number; threshold?: number } | null;
  bloom?: { enabled?: boolean; radius?: number; strength?: number; threshold?: number } | null;
  lightRays?: { enabled?: boolean; centerX?: number; centerY?: number; length?: number; strength?: number; rayCount?: number } | null;
  filmGrain?: { enabled?: boolean; amount?: number; size?: number; monochrome?: boolean; seed?: number } | null;
  vignette?: { enabled?: boolean; strength?: number; feather?: number } | null;
}

export function hexToRgbArr(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full || "000000", 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
