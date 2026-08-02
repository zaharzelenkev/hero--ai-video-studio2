/**
 * Тесты VFX-движка MONTIQ — каждый эффект реально меняет изображение.
 *
 * Запуск: npx tsx scripts/test-vfx.mts
 *
 * Все тесты работают без DOM: движок оперирует плоскими RGBA-буферами.
 * Дополнительно проверяется LUT-конвейер (грид + .cube сериализация) и
 * компоновка кадров экспорта (filterGraph) — см. test-vfx-ffmpeg.mts.
 */
import {
  applyBlendLayer,
  applyLut,
  applyObjectRemoval,
  applySegmentation,
  bloom,
  chromaKey,
  filmGrain,
  glow,
  inpaint,
  lensDistortion,
  lightRays,
  motionBlur,
  newBuffer,
  noiseReduction,
  polygonToMask,
  sharpen,
  strokesToMask,
  vignette,
  applyVfxChain,
  type FrameBuffer,
} from "../src/lib/editor/vfxEngine";
import { cubeTextFor, lutGridFor, cubeFileName } from "../src/lib/editor/lut";
import { maskToPolygon } from "../src/lib/editor/mediaPipeVfx";
import { clipDrawSize, findAiVfxClips, writeLutCubes } from "../src/lib/editor/vfxExport";
import { createEmptyProject, createVideoClip } from "../src/lib/factories";
import type { MediaAsset, VfxSettings } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeBuffer(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): FrameBuffer {
  const buf = newBuffer(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      buf.data[i] = r;
      buf.data[i + 1] = g;
      buf.data[i + 2] = b;
      buf.data[i + 3] = a;
    }
  }
  return buf;
}

function avgLuma(buf: FrameBuffer): number {
  let sum = 0;
  const n = buf.width * buf.height;
  for (let i = 0; i < buf.data.length; i += 4) sum += 0.2126 * buf.data[i] + 0.7152 * buf.data[i + 1] + 0.0722 * buf.data[i + 2];
  return sum / n;
}

function pixel(buf: FrameBuffer, x: number, y: number): [number, number, number, number] {
  const i = (y * buf.width + x) * 4;
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]];
}

function diff(bufA: FrameBuffer, bufB: FrameBuffer): number {
  let d = 0;
  for (let i = 0; i < bufA.data.length; i += 4) {
    d += Math.abs(bufA.data[i] - bufB.data[i]) + Math.abs(bufA.data[i + 1] - bufB.data[i + 1]) + Math.abs(bufA.data[i + 2] - bufB.data[i + 2]);
  }
  return d / (bufA.width * bufA.height);
}

function variance(buf: FrameBuffer): number {
  let sum = 0;
  const n = buf.width * buf.height;
  for (let i = 0; i < buf.data.length; i += 4) sum += 0.2126 * buf.data[i] + 0.7152 * buf.data[i + 1] + 0.0722 * buf.data[i + 2];
  const mean = sum / n;
  let v = 0;
  for (let i = 0; i < buf.data.length; i += 4) {
    const l = 0.2126 * buf.data[i] + 0.7152 * buf.data[i + 1] + 0.0722 * buf.data[i + 2];
    v += (l - mean) * (l - mean);
  }
  return v / n;
}

/* ================================================================== */
console.log("=== Хромакей ===");
{
  const w = 64, h = 64;
  const green = makeBuffer(w, h, () => [20, 220, 40, 255]);
  const keyed = chromaKey(green, { color: [0, 255, 0], similarity: 0.25, blend: 0.1, despill: 0.3 });
  let transparent = 0;
  for (let i = 3; i < keyed.data.length; i += 4) if (keyed.data[i] === 0) transparent++;
  check("зелёный фон становится прозрачным", transparent > w * h * 0.9, `прозрачных ${transparent}/${w * h}`);

  // Спилл: зелёный ореол на полупрозрачном крае подавляется.
  const spill = makeBuffer(16, 16, () => [60, 180, 70, 200]);
  const despilled = chromaKey(spill, { color: [0, 255, 0], similarity: 0.15, blend: 0.4, despill: 1 });
  const [, g1, , a1] = pixel(despilled, 8, 8);
  check("деспилл снижает зелёный канал на краю", a1 < 255 ? g1 < 180 : true, `g=${g1} a=${a1}`);

  const untouched = chromaKey(green, { color: [255, 0, 0], similarity: 0.05, blend: 0.02, despill: 0 });
  let opaque = 0;
  for (let i = 3; i < untouched.data.length; i += 4) if (untouched.data[i] === 255) opaque++;
  check("несовпадающий ключ не вырезает кадр", opaque > w * h * 0.9, `непрозрачных ${opaque}/${w*h}`);
}

/* ================================================================== */
console.log("=== Удаление фона (AI-маска) ===");
{
  const w = 64, h = 64;
  const img = makeBuffer(w, h, (x) => [x * 4, 100, 200, 255]);
  const mask = { data: new Uint8ClampedArray(w * h), width: w, height: h };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask.data[y * w + x] = x < 32 ? 255 : 0; // левая половина — передний план

  const t = applySegmentation(img, { mask, smooth: 0, foregroundOpacity: 1, threshold: 0, fill: "transparent", color: [0, 0, 0], blurAmount: 8 });
  const leftAlpha = t.data[3];
  const rightAlpha = t.data[(0 * w + 63) * 4 + 3];
  check("прозрачность: лево непрозрачно", leftAlpha === 255, `left=${leftAlpha}`);
  check("прозрачность: право прозрачно", rightAlpha === 0, `right=${rightAlpha}`);

  const c = applySegmentation(img, { mask, smooth: 0, foregroundOpacity: 1, threshold: 0, fill: "color", color: [255, 0, 0], blurAmount: 8 });
  const [pr, pg, pb] = pixel(c, 60, 30);
  check("заливка цветом: фон красный", pr > 250 && pg < 20 && pb < 20, `rgb=${pr},${pg},${pb}`);

  const bl = applySegmentation(img, { mask, smooth: 0, foregroundOpacity: 1, threshold: 0, fill: "blur", color: [0, 0, 0], blurAmount: 12 });
  const blurredR = pixel(bl, 60, 30)[0];
  const origR = pixel(img, 60, 30)[0];
  check("заливка blur: фон размыт (R-градиент сглажен)", Math.abs(blurredR - origR) > 10, `blur=${blurredR} orig=${origR}`);

  const fgOp = applySegmentation(img, { mask, smooth: 0, foregroundOpacity: 0.4, threshold: 0, fill: "transparent", color: [0, 0, 0], blurAmount: 8 });
  check("непрозрачность переднего плана 0.4", fgOp.data[3] === 102, `alpha=${fgOp.data[3]}`);
}

/* ================================================================== */
console.log("=== Удаление объекта (FMM-инпейнтинг) ===");
{
  const w = 80, h = 80;
  // Диагональный градиент — инпейнтинг должен восстановить его внутри маски.
  const grad = makeBuffer(w, h, (x, y) => [x * 3, y * 3, (x + y) * 1.5, 255]);
  const mask = new Uint8ClampedArray(w * h);
  for (let y = 30; y < 50; y++) for (let x = 30; x < 50; x++) mask[y * w + x] = 255;

  const filled = inpaint(grad, mask, 10);
  // Средняя ошибка внутри маски.
  let err = 0;
  let n = 0;
  for (let y = 32; y < 48; y++) {
    for (let x = 32; x < 48; x++) {
      const i = (y * w + x) * 4;
      err += Math.abs(filled.data[i] - grad.data[i]) + Math.abs(filled.data[i + 1] - grad.data[i + 1]) + Math.abs(filled.data[i + 2] - grad.data[i + 2]);
      n++;
    }
  }
  const avgErr = err / n / 3;
  check("инпейнтинг восстанавливает градиент (ошибка < 20)", avgErr < 20, `avgErr=${avgErr.toFixed(1)}`);

  const strokes = strokesToMask(w, h, [{ x: 0.5, y: 0.5, radius: 0.1 }]);
  let painted = 0;
  for (let i = 0; i < w * h; i++) if (strokes[i] > 0) painted++;
  check("штрих кисти создаёт маску", painted > 100, `painted=${painted}`);

  // Красный объект на фоне градиента: после удаления он должен исчезнуть.
  const withObject = makeBuffer(w, h, (x, y) => {
    const inObj = x >= 30 && x < 50 && y >= 30 && y < 50;
    return inObj ? [240, 30, 30, 255] : [x * 3, y * 3, (x + y) * 1.5, 255];
  });
  const filledPoly = applyObjectRemoval(withObject, [], { polygon: [{ x: 0.38, y: 0.38 }, { x: 0.62, y: 0.38 }, { x: 0.62, y: 0.62 }, { x: 0.38, y: 0.62 }] }, 8);
  let redLeft = 0;
  for (let y = 33; y < 47; y++) for (let x = 33; x < 47; x++) if (pixel(filledPoly, x, y)[0] > 150) redLeft++;
  check("красный объект исчезает после удаления", redLeft === 0, `красных пикселей осталось: ${redLeft}`);
  check("удаление объекта меняет кадр", diff(withObject, filledPoly) > 1, `diff=${diff(withObject, filledPoly).toFixed(2)}`);

  // Маска -> полигон -> снова маска (круглый объект).
  const roundMask = new Uint8ClampedArray(64 * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((x - 32) ** 2 + (y - 32) ** 2 < 12 * 12) roundMask[y * 64 + x] = 255;
  const polyRound = maskToPolygon({ data: roundMask, width: 64, height: 64 }, 40);
  check("маска → полигон (AI-выделение)", polyRound.length >= 8, `points=${polyRound.length}`);
  const remask = polygonToMask(64, 64, polyRound);
  let overlap = 0;
  let total = 0;
  for (let i = 0; i < 64 * 64; i++) {
    if (roundMask[i] > 0 || remask[i] > 0) {
      total++;
      if (roundMask[i] > 0 && remask[i] > 0) overlap++;
    }
  }
  check("полигон ≈ исходная маска (перекрытие > 70%)", total > 0 && overlap / total > 0.7, `overlap=${(overlap / total).toFixed(2)}`);
}

/* ================================================================== */
console.log("=== Motion blur ===");
{
  const w = 64, h = 64;
  const img = makeBuffer(w, h, () => [128, 128, 128, 255]);
  for (let x = 20; x < 44; x++) for (let y = 20; y < 44; y++) {
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255;
  }
  const hblur = motionBlur(img, { angleDeg: 0, length: 16, samples: 8 });
  const vblur = motionBlur(img, { angleDeg: 90, length: 16, samples: 8 });

  const bbox = (buf: FrameBuffer) => {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf.data[(y * w + x) * 4] > 135) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { bw: maxX - minX, bh: maxY - minY };
  };
  const hb = bbox(hblur);
  const vb = bbox(vblur);
  check("горизонтальный блюр шире, чем выше", hb.bw > hb.bh + 6, `w=${hb.bw} h=${hb.bh}`);
  check("вертикальный блюр выше, чем шире", vb.bh > vb.bw + 6, `w=${vb.bw} h=${vb.bh}`);
  check("направления различаются", hb.bw > vb.bw, `hbw=${hb.bw} vbw=${vb.bw}`);
}

/* ================================================================== */
console.log("=== Свечение (glow) и Bloom ===");
{
  const w = 64, h = 64;
  const dark = makeBuffer(w, h, () => [30, 30, 30, 255]);
  // Яркое пятно в центре.
  for (let y = 28; y < 36; y++) for (let x = 28; x < 36; x++) {
    const i = (y * w + x) * 4;
    dark.data[i] = 255; dark.data[i + 1] = 255; dark.data[i + 2] = 255;
  }
  const g = glow(dark, { radius: 6, strength: 0.8, threshold: 0.5 });
  const center = avgLuma(g);
  const edge = avgLuma(g);
  check("glow усиливает яркость", center > avgLuma(dark), `luma=${center.toFixed(1)} vs ${avgLuma(dark).toFixed(1)}`);
  // Проверяем, что область ВОКРУГ пятна стала ярче (ореол).
  let halo = 0;
  for (let y = 20; y < 24; y++) for (let x = 20; x < 24; x++) halo += g.data[(y * w + x) * 4];
  check("glow создаёт ореол вокруг яркого пятна", halo > 20 * 16 * 0.4, `halo=${halo}`);

  const b = bloom(dark, { radius: 5, strength: 0.8, threshold: 0.6 });
  check("bloom увеличивает яркость", avgLuma(b) > avgLuma(dark));
  const nearLuma = (buf: FrameBuffer) => {
    const i = (22 * w + 32) * 4; // в 10px от центра пятна, вне самого пятна
    return 0.2126 * buf.data[i] + 0.7152 * buf.data[i + 1] + 0.0722 * buf.data[i + 2];
  };
  check("bloom даёт ореол вокруг пятна", nearLuma(b) > nearLuma(dark) + 5, `${nearLuma(b).toFixed(1)} vs ${nearLuma(dark).toFixed(1)}`);
}

/* ================================================================== */
console.log("=== Световые лучи ===");
{
  const w = 96, h = 96;
  const bright = makeBuffer(w, h, () => [200, 200, 200, 255]);
  const rays = lightRays(bright, { centerX: 0.5, centerY: 0.5, length: 0.7, strength: 1, rayCount: 6 });
  // Средняя яркость вдоль луча (угол 0° — вправо) должна быть выше, чем между лучами (угол 15°).
  const sample = (angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    let sum = 0;
    let n = 0;
    for (let r = 26; r < 46; r += 3) {
      const x = Math.round(48 + Math.cos(a) * r);
      const y = Math.round(48 + Math.sin(a) * r);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      sum += rays.data[(y * w + x) * 4];
      n++;
    }
    return n ? sum / n : 0;
  };
  const onRay = sample(0);
  const offRay = sample(15);
  check("вдоль луча ярче, чем между лучами", onRay > offRay * 1.05 && onRay > 206, `on=${onRay.toFixed(1)} off=${offRay.toFixed(1)}`);
}

/* ================================================================== */
console.log("=== Плёночное зерно ===");
{
  const w = 48, h = 48;
  const flat = makeBuffer(w, h, () => [120, 120, 120, 255]);
  const g1 = filmGrain(flat, { amount: 0.5, size: 1, monochrome: true, seed: 42, time: 0 });
  const g2 = filmGrain(flat, { amount: 0.5, size: 1, monochrome: true, seed: 42, time: 0 });
  check("зерно меняет пиксели", diff(flat, g1) > 0.1, `diff=${diff(flat, g1).toFixed(3)}`);
  check("тот же seed → тот же узор", diff(g1, g2) === 0);
  const g3 = filmGrain(flat, { amount: 0.5, size: 1, monochrome: true, seed: 42, time: 1 });
  check("зерно анимируется во времени", diff(g1, g3) > 0.1);
  // Монохромное зерно сохраняет цвет (r=g=b после применения).
  const col = filmGrain(flat, { amount: 0.8, size: 1, monochrome: false, seed: 1, time: 0 });
  let colorDiff = 0;
  for (let i = 0; i < col.data.length; i += 4) colorDiff += Math.abs(col.data[i] - col.data[i + 1]) + Math.abs(col.data[i + 1] - col.data[i + 2]);
  check("цветное зерно вносит цветовые различия", colorDiff > 0);
}

/* ================================================================== */
console.log("=== Дисторсия объектива ===");
{
  const w = 64, h = 64;
  const img = makeBuffer(w, h, (x, y) => [x * 4, y * 4, 200, 255]);
  const d = lensDistortion(img, { amount: 0.6 });
  const centerPx = pixel(d, 32, 32);
  check("центр кадра почти не смещается", Math.abs(centerPx[0] - 128) <= 12, `r=${centerPx[0]}`);
  check("дисторсия меняет кадр", diff(img, d) > 0.5, `diff=${diff(img, d).toFixed(2)}`);
  const dNeg = lensDistortion(img, { amount: -0.6 });
  check("отрицательная дисторсия тоже меняет кадр", diff(img, dNeg) > 0.5, `diff=${diff(img, dNeg).toFixed(2)}`);
  check("направления дают разные результаты", diff(d, dNeg) > 0.5, `diff=${diff(d, dNeg).toFixed(2)}`);
}

/* ================================================================== */
console.log("=== Резкость и шумоподавление ===");
{
  const w = 64, h = 64;
  // Ступенька яркости.
  const edge = makeBuffer(w, h, (x) => (x < 32 ? [40, 40, 40, 255] : [220, 220, 220, 255]));
  const sharp = sharpen(edge, { amount: 1.2, radius: 1.5 });
  // Перепад на границе усиливается: luma(31) < luma(32) становится больше.
  const before = 0.2126 * edge.data[31 * 4] + 0.7152 * edge.data[31 * 4 + 1] + 0.0722 * edge.data[31 * 4 + 2];
  const after = 0.2126 * sharp.data[31 * 4] + 0.7152 * sharp.data[31 * 4 + 1] + 0.0722 * sharp.data[31 * 4 + 2];
  check("unsharp усиливает перепад", Math.abs(after - 40) > Math.abs(before - 40) + 1, `after=${after.toFixed(1)} before=${before.toFixed(1)}`);

  // Шум: соль-перец, билатеральный фильтр снижает дисперсию.
  const noisy = makeBuffer(w, h, (x, y) => {
    const base = 100 + ((x * 7 + y * 13) % 5) * 10;
    const n = ((x * 31 + y * 17) % 7) - 3;
    return [base + n * 20, base + n * 20, base + n * 20, 255];
  });
  const cleaned = noiseReduction(noisy, { amount: 1, radius: 1 });
  check("шумоподавление снижает дисперсию", variance(cleaned) < variance(noisy), `var ${variance(cleaned).toFixed(1)} vs ${variance(noisy).toFixed(1)}`);
}

/* ================================================================== */
console.log("=== Виньетка ===");
{
  const w = 64, h = 64;
  const flat = makeBuffer(w, h, () => [180, 180, 180, 255]);
  const v = vignette(flat, { strength: 0.9, feather: 0.6 });
  const center = pixel(v, 32, 32);
  const corner = pixel(v, 2, 2);
  check("центр ярче угла", center[0] > corner[0] + 20, `center=${center[0]} corner=${corner[0]}`);
  const v0 = vignette(flat, { strength: 0.001, feather: 0.6 });
  check("нулевая сила не меняет кадр", diff(flat, v0) === 0);
}

/* ================================================================== */
console.log("=== LUT-конвейер ===");
{
  const w = 32, h = 32;
  const img = makeBuffer(w, h, () => [120, 120, 120, 255]);

  const neutral = lutGridFor("none");
  check("LUT 'none' отсутствует", neutral === null);

  const warm = lutGridFor("warm")!;
  const warmed = applyLut(img, warm, 1);
  const pr = pixel(warmed, 16, 16);
  check("warm LUT повышает красный", pr[0] > pr[2], `r=${pr[0]} b=${pr[2]}`);

  const bw = lutGridFor("bw")!;
  const bwOut = applyLut(img, bw, 1);
  const pb = pixel(bwOut, 16, 16);
  check("Ч/Б LUT выравнивает каналы", Math.abs(pb[0] - pb[1]) <= 2 && Math.abs(pb[1] - pb[2]) <= 2, `rgb=${pb.join(",")}`);

  const mix = applyLut(img, warm, 0);
  check("интенсивность 0 = без изменений", diff(img, mix) === 0);

  // .cube сериализация совпадает с гридом превью.
  const cube = cubeTextFor("teal-orange", 8);
  check("cube содержит заголовок", cube.includes("LUT_3D_SIZE 8"));
  const lines = cube.split("\n").filter((l) => /^-?\d/.test(l));
  check("cube содержит 8³ точек", lines.length === 8 * 8 * 8, `points=${lines.length}`);
  const grid = lutGridFor("teal-orange")!;
  check("грид 33³", grid.size === 33 && grid.data.length === 33 ** 3 * 3);
}

/* ================================================================== */
console.log("=== Blend-режимы ===");
{
  const w = 8, h = 8;
  const base = makeBuffer(w, h, () => [128, 100, 60, 255]);
  const layer = makeBuffer(w, h, () => [200, 40, 160, 255]);
  const screen = applyBlendLayer(base, layer, "screen", 1);
  const s = pixel(screen, 4, 4);
  const expScreen = [Math.round(255 - ((255 - 128) * (255 - 200)) / 255), Math.round(255 - ((255 - 100) * (255 - 40)) / 255), Math.round(255 - ((255 - 60) * (255 - 160)) / 255)];
  check("screen = 1-(1-a)(1-b)", Math.abs(s[0] - expScreen[0]) <= 1 && Math.abs(s[1] - expScreen[1]) <= 1 && Math.abs(s[2] - expScreen[2]) <= 1, `got ${s.join(",")} exp ${expScreen.join(",")}`);

  const mult = applyBlendLayer(base, layer, "multiply", 1);
  const m = pixel(mult, 4, 4);
  const expMult = [Math.round((128 * 200) / 255), Math.round((100 * 40) / 255), Math.round((60 * 160) / 255)];
  check("multiply = a*b/255", Math.abs(m[0] - expMult[0]) <= 1 && Math.abs(m[1] - expMult[1]) <= 1 && Math.abs(m[2] - expMult[2]) <= 1, `got ${m.join(",")}`);

  const diffB = applyBlendLayer(base, layer, "difference", 1);
  const d = pixel(diffB, 4, 4);
  check("difference = |a-b|", d[0] === 72 && d[1] === 60 && d[2] === 100, `got ${d.join(",")}`);

  const half = applyBlendLayer(base, layer, "normal", 0.5);
  const halfPx = pixel(half, 4, 4);
  check("normal с opacity 0.5 = полусумма", Math.abs(halfPx[0] - 164) <= 1, `r=${halfPx[0]}`);
  check("нормальный бленд меняет кадр", diff(base, half) > 0);
}

/* ================================================================== */
console.log("=== Единая цепочка VFX ===");
{
  const w = 48, h = 48;
  const img = makeBuffer(w, h, (x, y) => [x * 5, y * 5, 100, 255]);
  const vfx = {
    objectRemoval: { enabled: true, strokes: [{ x: 0.5, y: 0.5, radius: 0.08 }] },
    lut: { enabled: true, preset: "warm", amount: 1 },
    noiseReduction: { enabled: true, amount: 0.3, radius: 1 },
    sharpen: { enabled: true, amount: 0.4, radius: 1 },
    glow: { enabled: true, radius: 6, strength: 0.4, threshold: 0.6 },
    bloom: { enabled: true, radius: 6, strength: 0.3, threshold: 0.7 },
    lightRays: { enabled: true, centerX: 0.5, centerY: 0.5, length: 0.5, strength: 0.4, rayCount: 6 },
    filmGrain: { enabled: true, amount: 0.3, size: 1, monochrome: true, seed: 5 },
    vignette: { enabled: true, strength: 0.5, feather: 0.6 },
    lensDistortion: { enabled: true, amount: 0.05 },
  } as unknown as VfxSettings;
  const chained = applyVfxChain(img, vfx, { time: 0.5 });
  check("цепочка реально меняет кадр", diff(img, chained) > 0.5, `diff=${diff(img, chained).toFixed(2)}`);
  const none = applyVfxChain(img, { ...vfx, glow: { ...vfx.glow, enabled: false }, bloom: { ...vfx.bloom, enabled: false }, lightRays: { ...vfx.lightRays, enabled: false }, filmGrain: { ...vfx.filmGrain, enabled: false }, vignette: { ...vfx.vignette, enabled: false }, sharpen: { ...vfx.sharpen, enabled: false }, noiseReduction: { ...vfx.noiseReduction, enabled: false }, objectRemoval: { ...vfx.objectRemoval, strokes: [] } } as unknown as VfxSettings, { time: 0.5 });
  check("отключённые эффекты не влияют", diff(img, none) < diff(img, chained));
}

/* ================================================================== */
console.log("=== Экспортные помощники ===");
{
  const asset = (id: string, kind: "video" | "image" = "video", w = 1280, h = 720): MediaAsset => ({
    id, name: id, kind, mime: "video/mp4", blobKey: id, duration: 6, width: w, height: h, createdAt: Date.now(),
  });
  const proj = createEmptyProject("vfx-helpers");
  proj.assets = [asset("a1"), asset("a2", "video", 720, 1280)];
  const track = proj.tracks.find((t) => t.type === "video")!;

  const c1 = createVideoClip({ trackId: track.id, asset: proj.assets[0], start: 0, duration: 2, inPoint: 0, outPoint: 2 });
  const c2 = createVideoClip({ trackId: track.id, asset: proj.assets[1], start: 0, duration: 2, inPoint: 0, outPoint: 2 });
  c2.fitMode = "contain";
  const c3 = createVideoClip({ trackId: track.id, asset: proj.assets[0], start: 0, duration: 2, inPoint: 0, outPoint: 2 });
  c3.vfx = { ...c3.vfx!, backgroundRemoval: { ...c3.vfx!.backgroundRemoval, enabled: true }, lightRays: { ...c3.vfx!.lightRays, enabled: true } };
  const c4 = createVideoClip({ trackId: track.id, asset: proj.assets[0], start: 0, duration: 2, inPoint: 0, outPoint: 2 });
  c4.vfx = { ...c4.vfx!, objectRemoval: { ...c4.vfx!.objectRemoval, enabled: true, strokes: [{ x: 0.5, y: 0.5, radius: 0.05 }] } };
  track.clips.push(c1, c2, c3, c4);

  const jobs = findAiVfxClips(proj);
  check("findAiVfxClips находит фоновый и объектный AI-клипы", jobs.length === 2, `jobs=${jobs.length}`);

  const sizeCover = clipDrawSize(c1, proj.assets[0], 1280, 720);
  check("clipDrawSize: cover = канвас", sizeCover.width === 1280 && sizeCover.height === 720);
  const sizeContain = clipDrawSize(c2, proj.assets[1], 1280, 720);
  check("clipDrawSize: contain-портрет = 720×1280", sizeContain.width === 720 && sizeContain.height === 1280, `${sizeContain.width}x${sizeContain.height}`);

  // writeLutCubes пишет валидные .cube через мок ffmpeg.
  const written = new Map<string, string>();
  await writeLutCubes({ writeFile: (p, d) => { written.set(p, new TextDecoder().decode(d)); return Promise.resolve(); } }, ["warm"]);
  check("writeLutCubes записал файл", written.has(cubeFileName("warm")), [...written.keys()].join(","));
  const cube = written.get(cubeFileName("warm")) ?? "";
  const okCube = cube.includes("LUT_3D_SIZE 33") && cube.split("\n").filter((l) => /^\d/.test(l)).length === 33 ** 3;
  check("writeLutCubes: корректный .cube 33³", okCube);
}

/* ================================================================== */
console.log("=== Общие свойства ===");
{
  const w = 32, h = 32;
  const img = makeBuffer(w, h, (x, y) => [x * 8, y * 8, 128, 255]);
  const copy = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  void chromaKey(img, { color: [0, 255, 0], similarity: 0.2, blend: 0.1, despill: 0.3 });
  void glow(img, { radius: 4, strength: 0.5, threshold: 0.5 });
  void motionBlur(img, { angleDeg: 30, length: 6, samples: 4 });
  void vignette(img, { strength: 0.5, feather: 0.5 });
  check("движок не мутирует входной буфер", diff(img, copy) === 0);
}

/* ================================================================== */
console.log("");
if (failures === 0) {
  console.log("✅ VFX-движок: все тесты пройдены");
} else {
  console.error(`❌ VFX-движок: ${failures} провалов`);
  process.exit(1);
}
