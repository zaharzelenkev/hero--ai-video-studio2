/**
 * LUT-конвейер MONTIQ: настоящие 3D LUT (33³), генерируемые из пресетов.
 *
 * Один и тот же грид используется в превью (трилинейная интерполяция в
 * vfxEngine.applyLut) и в экспорте (тот же грид сериализуется в .cube файл,
 * который ffmpeg читает фильтром lut3d). Благодаря этому превью и экспорт
 * LUT-эффекта совпадают байт-в-байт.
 */

import type { LutPreset } from "../types";
import type { LutGrid } from "./vfxEngine";

const LUT_SIZE = 33;

/* ------------------------------------------------------------------ */
/* Инструменты построения грида                                        */
/* ------------------------------------------------------------------ */

type Grid = Float32Array; // size³ * 3, значения 0..1

function identityGrid(size: number): Grid {
  const g = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let gr = 0; gr < size; gr++) {
      for (let b = 0; b < size; b++) {
        const i = (r * size * size + gr * size + b) * 3;
        g[i] = r / (size - 1);
        g[i + 1] = gr / (size - 1);
        g[i + 2] = b / (size - 1);
      }
    }
  }
  return g;
}

/** Монотонная кубическая интерполяция (Fritsch–Carlson) по опорным точкам. */
function monotoneCubic(points: [number, number][], x: number): number {
  if (points.length === 0) return x;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    d[i] = dx > 0 ? (ys[i + 1] - ys[i]) / dx : 0;
  }
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else m[i] = (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) > 3 * Math.abs(d[i])) m[i] = 3 * d[i];
    if (Math.abs(m[i + 1]) > 3 * Math.abs(d[i])) m[i + 1] = 3 * d[i];
  }
  let i = 0;
  while (i < n - 2 && xs[i + 1] < x) i++;
  const h = xs[i + 1] - xs[i] || 1e-6;
  const t = (x - xs[i]) / h;
  const h00 = 2 * t * t * t - 3 * t * t + 1;
  const h10 = t * t * t - 2 * t * t + t;
  const h01 = -2 * t * t * t + 3 * t * t;
  const h11 = t * t * t - t * t;
  return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
}

function applyCurve(g: Grid, channel: 0 | 1 | 2 | -1, points: [number, number][]) {
  for (let i = 0; i < g.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      if (channel !== -1 && channel !== c) continue;
      g[i + c] = clamp01(monotoneCubic(points, g[i + c]));
    }
  }
}

function applySaturation(g: Grid, sat: number) {
  for (let i = 0; i < g.length; i += 3) {
    const r = g[i], gr = g[i + 1], b = g[i + 2];
    const luma = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    g[i] = clamp01(luma + (r - luma) * sat);
    g[i + 1] = clamp01(luma + (gr - luma) * sat);
    g[i + 2] = clamp01(luma + (b - luma) * sat);
  }
}

function applyContrast(g: Grid, contrast: number) {
  for (let i = 0; i < g.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      g[i + c] = clamp01((g[i + c] - 0.5) * (1 + contrast) + 0.5);
    }
  }
}

function applyMix(g: Grid, matrix: number[][]) {
  for (let i = 0; i < g.length; i += 3) {
    const r = g[i], gr = g[i + 1], b = g[i + 2];
    const nr = matrix[0][0] * r + matrix[0][1] * gr + matrix[0][2] * b + (matrix[0][3] ?? 0);
    const ng = matrix[1][0] * r + matrix[1][1] * gr + matrix[1][2] * b + (matrix[1][3] ?? 0);
    const nb = matrix[2][0] * r + matrix[2][1] * gr + matrix[2][2] * b + (matrix[2][3] ?? 0);
    g[i] = clamp01(nr);
    g[i + 1] = clamp01(ng);
    g[i + 2] = clamp01(nb);
  }
}

function applyOffset(g: Grid, channel: 0 | 1 | 2 | -1, delta: number) {
  for (let i = 0; i < g.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      if (channel !== -1 && channel !== c) continue;
      g[i + c] = clamp01(g[i + c] + delta);
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function toUint8(grid: Grid): Uint8ClampedArray {
  const out = new Uint8ClampedArray(grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = Math.round(clamp01(grid[i]) * 255);
  return out;
}

function gridToLutGrid(grid: Grid, size: number): LutGrid {
  return { data: toUint8(grid), size };
}

/* ------------------------------------------------------------------ */
/* Рецепты пресетов                                                    */
/* ------------------------------------------------------------------ */

function buildPreset(preset: LutPreset, size: number): Grid {
  const g = identityGrid(size);
  switch (preset) {
    case "neutral":
      applyContrast(g, 0.04);
      applySaturation(g, 1.03);
      break;
    case "cinematic":
      applyCurve(g, -1, [[0, 0.02], [0.25, 0.24], [0.5, 0.5], [0.75, 0.78], [1, 0.98]]);
      applySaturation(g, 0.92);
      // Лёгкий teal в тенях, тёплый в светах.
      applyMix(g, [
        [1.02, -0.02, 0.02, 0],
        [-0.01, 1.02, -0.01, 0],
        [0.02, -0.01, 1.03, 0],
      ]);
      break;
    case "teal-orange":
      applyContrast(g, 0.12);
      applySaturation(g, 1.1);
      applyMix(g, [
        [1.06, 0.02, -0.02, 0.01],
        [-0.04, 1.04, 0.0, 0.0],
        [0.03, -0.02, 0.98, -0.02],
      ]);
      applyCurve(g, 2, [[0, 0.0], [0.4, 0.5], [0.65, 0.52], [1, 0.9]]); // тени в teal
      break;
    case "warm":
      applyMix(g, [
        [1.12, 0.04, -0.02, 0.02],
        [0.02, 1.02, 0.0, 0.0],
        [-0.03, -0.02, 0.94, 0],
      ]);
      applySaturation(g, 1.12);
      break;
    case "cool":
      applyMix(g, [
        [0.95, 0.0, 0.02, -0.01],
        [0.0, 1.0, 0.02, 0],
        [0.02, 0.03, 1.08, 0.02],
      ]);
      applySaturation(g, 1.05);
      break;
    case "bw":
      applySaturation(g, 0);
      applyContrast(g, 0.08);
      break;
    case "vintage":
      applySaturation(g, 0.78);
      applyContrast(g, -0.02);
      applyMix(g, [
        [1.05, 0.08, 0.02, 0.02],
        [0.02, 0.98, 0.02, 0.01],
        [0.0, -0.04, 0.86, 0.02],
      ]);
      applyCurve(g, 1, [[0, 0.02], [0.5, 0.5], [1, 0.9]]); // приглушённые света
      break;
    case "vivid":
      applySaturation(g, 1.45);
      applyContrast(g, 0.1);
      break;
    case "moody":
      applyContrast(g, 0.16);
      applySaturation(g, 0.85);
      applyOffset(g, -1, -0.02);
      applyMix(g, [
        [1.0, 0.0, 0.02, 0],
        [0.0, 1.0, 0.02, 0],
        [0.0, 0.02, 1.06, 0.01],
      ]);
      break;
    case "dramatic":
      applyContrast(g, 0.28);
      applySaturation(g, 0.88);
      applyCurve(g, -1, [[0, 0.0], [0.5, 0.46], [1, 1]]);
      break;
    case "film-noir":
      applySaturation(g, 0);
      applyContrast(g, 0.3);
      applyCurve(g, -1, [[0, 0.01], [0.5, 0.48], [1, 0.97]]);
      break;
    case "luxury":
      applySaturation(g, 1.18);
      applyContrast(g, 0.1);
      applyMix(g, [
        [1.05, 0.02, 0.0, 0.01],
        [0.0, 1.02, 0.0, 0.0],
        [-0.01, 0.0, 0.97, 0],
      ]);
      break;
    default:
      break;
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Публичное API                                                       */
/* ------------------------------------------------------------------ */

const gridCache = new Map<string, LutGrid>();

/** Грид LUT для пресета (кэшируется). null — для "none". */
export function lutGridFor(preset: LutPreset | string | undefined): LutGrid | null {
  if (!preset || preset === "none") return null;
  const cached = gridCache.get(preset);
  if (cached) return cached;
  const grid = buildPreset(preset as LutPreset, LUT_SIZE);
  const lut = gridToLutGrid(grid, LUT_SIZE);
  gridCache.set(preset, lut);
  return lut;
}

/** Сериализация грида в формат .cube (для ffmpeg lut3d). */
export function cubeTextFor(preset: LutPreset | string, size = LUT_SIZE): string {
  const grid = buildPreset(preset as LutPreset, size);
  const lines: string[] = [];
  lines.push(`TITLE "MONTIQ ${preset}"`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push(`DOMAIN_MIN 0.0 0.0 0.0`);
  lines.push(`DOMAIN_MAX 1.0 1.0 1.0`);
  for (let r = 0; r < size; r++) {
    for (let gr = 0; gr < size; gr++) {
      for (let b = 0; b < size; b++) {
        const i = (r * size * size + gr * size + b) * 3;
        lines.push(`${grid[i].toFixed(6)} ${grid[i + 1].toFixed(6)} ${grid[i + 2].toFixed(6)}`);
      }
    }
  }
  return lines.join("\n");
}

/** Имя файла .cube в виртуальной ФС ffmpeg. */
export function cubeFileName(preset: LutPreset | string): string {
  return `/lut_${preset.replace(/[^a-z0-9-]/gi, "_")}.cube`;
}

/** Список пресетов с реальными гридами (для UI). */
export const LUT_PRESETS_WITH_CUBE: LutPreset[] = [
  "neutral",
  "cinematic",
  "teal-orange",
  "warm",
  "cool",
  "bw",
  "vintage",
  "vivid",
  "moody",
  "dramatic",
  "film-noir",
  "luxury",
];
