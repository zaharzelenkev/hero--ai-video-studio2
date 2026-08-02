import type { ChromaKey, LutPreset, VfxSettings } from "@/lib/types";
import { defaultVfxSettings } from "@/lib/types";

/**
 * Небольшой CPU VFX-процессор для preview. Он намеренно не зависит от DOM и
 * Canvas, поэтому те же алгоритмы можно проверять в Node и использовать для
 * кадров, которые приходят из ImageBitmap/VideoFrame.
 */

export interface VfxProcessOptions {
  chroma?: ChromaKey;
  /** Canvas preview applies the rectangle after geometry, where the user drew it. */
  objectRemovalOnSource?: boolean;
  /** Номер кадра нужен только для детерминированного зерна. */
  seed?: number;
}

export function mergeVfxSettings(value?: Partial<VfxSettings>): VfxSettings {
  const defaults = defaultVfxSettings();
  return {
    backgroundRemoval: { ...defaults.backgroundRemoval, ...(value?.backgroundRemoval ?? {}) },
    objectRemoval: { ...defaults.objectRemoval, ...(value?.objectRemoval ?? {}) },
    glow: { ...defaults.glow, ...(value?.glow ?? {}) },
    lightRays: { ...defaults.lightRays, ...(value?.lightRays ?? {}) },
    filmGrain: { ...defaults.filmGrain, ...(value?.filmGrain ?? {}) },
    lensDistortion: { ...defaults.lensDistortion, ...(value?.lensDistortion ?? {}) },
    bloom: { ...defaults.bloom, ...(value?.bloom ?? {}) },
    sharpen: { ...defaults.sharpen, ...(value?.sharpen ?? {}) },
    noiseReduction: { ...defaults.noiseReduction, ...(value?.noiseReduction ?? {}) },
    vignette: { ...defaults.vignette, ...(value?.vignette ?? {}) },
    lutPipeline: { ...defaults.lutPipeline, ...(value?.lutPipeline ?? {}) },
  };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = String(hex || "").replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => `${c}${c}`).join("") : clean;
  const parsed = Number.parseInt(full, 16);
  if (!Number.isFinite(parsed)) return [0, 255, 0];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function colorDistance(r: number, g: number, b: number, cr: number, cg: number, cb: number): number {
  // Нормированное евклидово расстояние в RGB. 1 — максимально далеко.
  return Math.sqrt((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2) / Math.sqrt(3 * 255 ** 2);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function estimateBorderColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  };
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  for (let x = 0; x < width; x += stepX) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = stepY; y < height - 1; y += stepY) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }
  return count ? [r / count, g / count, b / count] : [0, 0, 0];
}

/**
 * Удаляет связный с границами фон. В отличие от простого colorkey алгоритм
 * сначала строит matte только из похожих пикселей, достижимых от края. Это
 * не вырезает предметы, у которых случайно похожий цвет есть внутри кадра.
 */
export function removeBackgroundPixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  settings: VfxSettings["backgroundRemoval"],
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input);
  if (!settings.enabled || width < 2 || height < 2) return output;

  const reference = settings.mode === "color" ? hexToRgb(settings.sampleColor) : estimateBorderColor(input, width, height);
  const threshold = clamp01(settings.threshold);
  const softness = Math.max(0.001, clamp01(settings.softness));
  const candidate = new Uint8Array(width * height);
  const connected = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      candidate[p] = colorDistance(input[i], input[i + 1], input[i + 2], reference[0], reference[1], reference[2]) <= threshold + softness ? 1 : 0;
    }
  }

  const enqueue = (p: number) => {
    if (!connected[p] && candidate[p]) {
      connected[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = Math.floor(p / width);
    if (x > 0) enqueue(p - 1);
    if (x + 1 < width) enqueue(p + 1);
    if (y > 0) enqueue(p - width);
    if (y + 1 < height) enqueue(p + width);
  }

  for (let p = 0; p < width * height; p += 1) {
    if (!connected[p]) continue;
    const i = p * 4;
    const distance = colorDistance(input[i], input[i + 1], input[i + 2], reference[0], reference[1], reference[2]);
    const keep = smoothstep(threshold, threshold + softness, distance);
    output[i + 3] = byte(input[i + 3] * keep);
  }

  if (settings.edgeBlur > 0) blurAlpha(output, width, height, Math.min(8, Math.round(settings.edgeBlur)));
  return output;
}

/** Цветовой ключ с мягким matte и без изменения RGB предмета. */
export function applyChromaKeyPixels(input: Uint8ClampedArray, width: number, height: number, chroma: ChromaKey): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input);
  if (!chroma.enabled) return output;
  const [kr, kg, kb] = hexToRgb(chroma.color);
  const threshold = clamp01(chroma.similarity);
  const softness = Math.max(0.001, clamp01(chroma.blend));
  const pixelBytes = Math.min(output.length, Math.max(0, width * height * 4));
  for (let i = 0; i < pixelBytes; i += 4) {
    const distance = colorDistance(output[i], output[i + 1], output[i + 2], kr, kg, kb);
    const keep = smoothstep(threshold, threshold + softness, distance);
    output[i + 3] = byte(output[i + 3] * keep);
    // Убираем зелёный spill на полупрозрачном краю, чтобы следующий слой не
    // получил зелёный ореол. Это физически меняет RGB, а не только alpha.
    if (keep < 1 && kg > kr * 1.05 && kg > kb * 1.05) {
      output[i + 1] = byte(output[i + 1] * (0.72 + keep * 0.28));
    }
  }
  return output;
}

/**
 * Простой многопроходный inpainting для выделенного прямоугольника. На каждом
 * проходе frontier получает взвешенное среднее уже известных соседей, поэтому
 * цвет/текстура действительно распространяются в область удалённого объекта,
 * а не заменяются декоративным прямоугольником.
 */
export function inpaintObjectPixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  settings: VfxSettings["objectRemoval"],
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input);
  if (!settings.enabled || width < 3 || height < 3) return output;
  const x0 = Math.max(0, Math.floor(clamp01(settings.x) * width));
  const y0 = Math.max(0, Math.floor(clamp01(settings.y) * height));
  const x1 = Math.min(width - 1, Math.ceil(clamp01(settings.x + settings.width) * width) - 1);
  const y1 = Math.min(height - 1, Math.ceil(clamp01(settings.y + settings.height) * height) - 1);
  if (x1 <= x0 || y1 <= y0) return output;

  const total = width * height;
  const known = new Uint8Array(total);
  for (let p = 0; p < total; p += 1) known[p] = 1;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) known[y * width + x] = 0;
  }

  const iterations = Math.max(1, Math.min(32, Math.round(settings.iterations)));
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = new Uint8ClampedArray(output);
    const newlyKnown: number[] = [];
    let filled = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const p = y * width + x;
        if (known[p]) continue;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumA = 0;
        let weightTotal = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const np = ny * width + nx;
            if (!known[np]) continue;
            const ni = np * 4;
            const weight = ox === 0 || oy === 0 ? 2 : 1;
            sumR += output[ni] * weight;
            sumG += output[ni + 1] * weight;
            sumB += output[ni + 2] * weight;
            sumA += output[ni + 3] * weight;
            weightTotal += weight;
          }
        }
        if (weightTotal > 0) {
          const i = p * 4;
          next[i] = byte(sumR / weightTotal);
          next[i + 1] = byte(sumG / weightTotal);
          next[i + 2] = byte(sumB / weightTotal);
          next[i + 3] = byte(sumA / weightTotal);
          newlyKnown.push(p);
          filled += 1;
        }
      }
    }
    for (const p of newlyKnown) known[p] = 1;
    output.set(next);
    if (filled === 0) break;
  }

  // Мягкая граница смешивает восстановленные пиксели с исходником только на
  // внешнем периметре. Внутри выделения исходный объект не возвращается.
  const feather = Math.max(0, Math.round(clamp01(settings.feather) * Math.min(width, height) * 0.12));
  if (feather > 0) {
    for (let y = Math.max(0, y0 - feather); y <= Math.min(height - 1, y1 + feather); y += 1) {
      for (let x = Math.max(0, x0 - feather); x <= Math.min(width - 1, x1 + feather); x += 1) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        const distance = Math.min(Math.abs(x - x0), Math.abs(x - x1), Math.abs(y - y0), Math.abs(y - y1));
        if (distance >= feather) continue;
        const mix = distance / feather;
        const i = (y * width + x) * 4;
        output[i] = byte(input[i] * (1 - mix) + output[i] * mix);
        output[i + 1] = byte(input[i + 1] * (1 - mix) + output[i + 1] * mix);
        output[i + 2] = byte(input[i + 2] * (1 - mix) + output[i + 2] * mix);
      }
    }
  }
  return output;
}

export function reduceNoisePixels(input: Uint8ClampedArray, width: number, height: number, amount: number): Uint8ClampedArray {
  const strength = clamp01(amount);
  if (strength <= 0) return new Uint8ClampedArray(input);
  const output = new Uint8ClampedArray(input);
  const radius = strength > 0.65 ? 2 : 1;
  const tolerance = 10 + strength * 42;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weightTotal = 0;
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = (ny * width + nx) * 4;
          const distance = Math.abs(input[ni] - input[i]) + Math.abs(input[ni + 1] - input[i + 1]) + Math.abs(input[ni + 2] - input[i + 2]);
          if (distance > tolerance && (ox !== 0 || oy !== 0)) continue;
          const weight = 1 / (1 + Math.abs(ox) + Math.abs(oy));
          r += input[ni] * weight;
          g += input[ni + 1] * weight;
          b += input[ni + 2] * weight;
          a += input[ni + 3] * weight;
          weightTotal += weight;
        }
      }
      if (weightTotal) {
        output[i] = byte(input[i] * (1 - strength) + (r / weightTotal) * strength);
        output[i + 1] = byte(input[i + 1] * (1 - strength) + (g / weightTotal) * strength);
        output[i + 2] = byte(input[i + 2] * (1 - strength) + (b / weightTotal) * strength);
        output[i + 3] = byte(a / weightTotal);
      }
    }
  }
  return output;
}

export function sharpenPixels(input: Uint8ClampedArray, width: number, height: number, amount: number): Uint8ClampedArray {
  const strength = Math.max(0, Math.min(2, amount));
  if (strength <= 0) return new Uint8ClampedArray(input);
  const output = new Uint8ClampedArray(input);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const left = (y * width + Math.max(0, x - 1)) * 4;
      const right = (y * width + Math.min(width - 1, x + 1)) * 4;
      const up = (Math.max(0, y - 1) * width + x) * 4;
      const down = (Math.min(height - 1, y + 1) * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        output[i + c] = byte(input[i + c] * (1 + 4 * strength) - strength * (input[left + c] + input[right + c] + input[up + c] + input[down + c]));
      }
    }
  }
  return output;
}

/** Баррел/пинкюшн distortion через обратное билинейное отображение. */
export function distortLensPixels(input: Uint8ClampedArray, width: number, height: number, amount: number): Uint8ClampedArray {
  const k = Math.max(-1, Math.min(1, amount));
  if (Math.abs(k) < 0.0001) return new Uint8ClampedArray(input);
  const output = new Uint8ClampedArray(input);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const sx = Math.max(1, cx);
  const sy = Math.max(1, cy);
  const sample = (x: number, y: number, channel: number) => {
    const fx = Math.max(0, Math.min(width - 1, x));
    const fy = Math.max(0, Math.min(height - 1, y));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = input[(y0 * width + x0) * 4 + channel];
    const b = input[(y0 * width + x1) * 4 + channel];
    const c = input[(y1 * width + x0) * 4 + channel];
    const d = input[(y1 * width + x1) * 4 + channel];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / sx;
      const ny = (y - cy) / sy;
      const radius2 = nx * nx + ny * ny;
      const factor = 1 + k * radius2;
      const srcX = cx + nx * factor * sx;
      const srcY = cy + ny * factor * sy;
      const i = (y * width + x) * 4;
      output[i] = byte(sample(srcX, srcY, 0));
      output[i + 1] = byte(sample(srcX, srcY, 1));
      output[i + 2] = byte(sample(srcX, srcY, 2));
      output[i + 3] = byte(sample(srcX, srcY, 3));
    }
  }
  return output;
}

export function addFilmGrainPixels(input: Uint8ClampedArray, width: number, height: number, amount: number, size: number, monochrome: boolean, seed = 0): Uint8ClampedArray {
  const strength = clamp01(amount);
  if (strength <= 0) return new Uint8ClampedArray(input);
  const output = new Uint8ClampedArray(input);
  const scale = Math.max(1, Math.min(3, Math.round(size)));
  const hash = (x: number, y: number, channel: number) => {
    let n = (x * 374761393 + y * 668265263 + channel * 1442695041 + Math.floor(seed) * 1013904223) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const gx = Math.floor(x / scale) * scale;
      const gy = Math.floor(y / scale) * scale;
      const base = (hash(gx, gy, 0) - 0.5) * 255 * strength;
      for (let c = 0; c < 3; c += 1) {
        const noise = monochrome ? base : (hash(gx, gy, c) - 0.5) * 255 * strength;
        output[i + c] = byte(input[i + c] + noise);
      }
    }
  }
  return output;
}

function blurAlpha(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  if (radius <= 0) return;
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          sum += source[(ny * width + nx) * 4 + 3];
          count += 1;
        }
      }
      data[(y * width + x) * 4 + 3] = byte(sum / Math.max(1, count));
    }
  }
}

function applyLutColor(r: number, g: number, b: number, preset: LutPreset): [number, number, number] {
  let rr = r;
  let gg = g;
  let bb = b;
  const contrast = (value: number, amount: number) => (value - 128) * amount + 128;
  switch (preset) {
    case "bw": {
      const y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      rr = gg = bb = y;
      break;
    }
    case "warm":
      rr += 18;
      gg += 5;
      bb -= 12;
      break;
    case "cool":
      rr -= 10;
      gg += 2;
      bb += 18;
      break;
    case "vintage": {
      const y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      rr = y * 0.9 + rr * 0.1 + 18;
      gg = y * 0.75 + gg * 0.25 + 8;
      bb = y * 0.55 + bb * 0.15 - 4;
      break;
    }
    case "vivid":
      rr = contrast(rr, 1.22);
      gg = contrast(gg, 1.22);
      bb = contrast(bb, 1.22);
      break;
    case "dramatic":
      rr = contrast(rr, 1.32);
      gg = contrast(gg, 1.32);
      bb = contrast(bb, 1.32);
      break;
    case "moody":
      rr = contrast(rr, 1.16) - 8;
      gg = contrast(gg, 1.16) - 8;
      bb = contrast(bb, 1.2) + 4;
      break;
    case "teal-orange": {
      const y = (rr + gg + bb) / 3;
      if (y > 128) {
        rr += 20;
        gg += 7;
        bb -= 12;
      } else {
        rr -= 8;
        gg += 8;
        bb += 16;
      }
      break;
    }
    case "film-noir": {
      const y = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      rr = gg = bb = contrast(y, 1.35) - 8;
      break;
    }
    case "luxury":
      rr = contrast(rr + 12, 1.14);
      gg = contrast(gg + 5, 1.1);
      bb = contrast(bb - 8, 1.12);
      break;
    case "cinematic":
      rr = contrast(rr + 8, 1.08);
      gg = contrast(gg + 2, 1.08);
      bb = contrast(bb - 4, 1.08);
      break;
    case "neutral":
      rr = contrast(rr, 1.03);
      gg = contrast(gg, 1.03);
      bb = contrast(bb, 1.03);
      break;
    case "none":
    default:
      break;
  }
  return [byte(rr), byte(gg), byte(bb)];
}

export function applyLutPixels(input: Uint8ClampedArray, width: number, height: number, preset: LutPreset, intensity: number): Uint8ClampedArray {
  const strength = clamp01(intensity);
  if (preset === "none" || strength <= 0) return new Uint8ClampedArray(input);
  const output = new Uint8ClampedArray(input);
  for (let i = 0; i < width * height * 4; i += 4) {
    const [r, g, b] = applyLutColor(input[i], input[i + 1], input[i + 2], preset);
    output[i] = byte(input[i] * (1 - strength) + r * strength);
    output[i + 1] = byte(input[i + 1] * (1 - strength) + g * strength);
    output[i + 2] = byte(input[i + 2] * (1 - strength) + b * strength);
  }
  return output;
}

/** Полный source-level pipeline, вызываемый перед геометрией клипа. */
export function processVfxPixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  settings: VfxSettings,
  options: VfxProcessOptions = {},
): Uint8ClampedArray {
  const vfx = mergeVfxSettings(settings);
  let output: Uint8ClampedArray<ArrayBufferLike> = new Uint8ClampedArray(input);
  if (vfx.backgroundRemoval.enabled) output = removeBackgroundPixels(output, width, height, vfx.backgroundRemoval);
  if (options.chroma?.enabled) output = applyChromaKeyPixels(output, width, height, options.chroma);
  if (vfx.objectRemoval.enabled && options.objectRemovalOnSource !== false) output = inpaintObjectPixels(output, width, height, vfx.objectRemoval);
  if (vfx.noiseReduction.enabled) output = reduceNoisePixels(output, width, height, vfx.noiseReduction.amount);
  if (vfx.sharpen.enabled) output = sharpenPixels(output, width, height, vfx.sharpen.amount);
  if (vfx.lensDistortion.enabled) output = distortLensPixels(output, width, height, vfx.lensDistortion.amount);
  if (vfx.lutPipeline.enabled) output = applyLutPixels(output, width, height, vfx.lutPipeline.preset, vfx.lutPipeline.intensity);
  if (vfx.filmGrain.enabled) output = addFilmGrainPixels(output, width, height, vfx.filmGrain.amount, vfx.filmGrain.size, vfx.filmGrain.monochrome, options.seed ?? 0);
  return output;
}

/** Веса для реального temporal/spatial motion blur в preview и FFmpeg. */
export function motionBlurWeights(samples: number): number[] {
  const count = Math.max(2, Math.min(32, Math.round(samples)));
  return Array.from({ length: count }, () => 1 / count);
}

/** Удобно для smoke-тестов и диагностики: количество изменённых байтов. */
export function changedByteCount(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let changed = 0;
  const length = Math.min(before.length, after.length);
  for (let i = 0; i < length; i += 1) if (before[i] !== after[i]) changed += 1;
  return changed;
}
