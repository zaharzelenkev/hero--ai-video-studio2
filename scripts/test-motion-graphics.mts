/**
 * Тесты движка моушн-графики: дефолты всех 12 видов, математика анимаций,
 * фабрика клипов, генератор FFmpeg-фильтров и интеграция с compileProjectToFfmpeg.
 *
 * Запуск: npm run test:motion
 */

import assert from "node:assert";
import { createEmptyProject } from "../src/lib/emptyProject";
import { compileProjectToFfmpeg } from "../src/lib/filterGraph";
import {
  MG_KINDS,
  buildMotionGraphicFfmpeg,
  createMotionGraphicClip,
  defaultMotionGraphic,
  heuristicMeasure,
  hexToFfmpegColor,
  layoutMgText,
  mgAnimMotion,
  mgCaptionWordExprs,
  mgEnvelope,
  mgGroupMotion,
  mgWordExprs,
  mgWordStagger,
} from "../src/lib/motionGraphics";
import { createTextClip } from "../src/lib/factories";
import type { TextClip } from "../src/lib/types";

let passed = 0;
function ok(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    console.error(`  ✘ ${name}`);
    throw err;
  }
}

function assertNoNaN(...values: number[]) {
  for (const v of values) assert.ok(Number.isFinite(v), `ожидалось число, получено ${v}`);
}

const measure = heuristicMeasure;

console.log("Motion Graphics: метаданные и дефолты");
ok("12 видов с уникальными id и подписями", () => {
  assert.strictEqual(MG_KINDS.length, 12);
  const ids = new Set(MG_KINDS.map((k) => k.id));
  assert.strictEqual(ids.size, 12);
  for (const k of MG_KINDS) {
    assert.ok(k.label.length > 0);
    assert.ok(k.duration > 0);
    assert.ok(k.fontSize > 0);
  }
});

ok("defaultMotionGraphic для всех видов: числа и цвета валидны", () => {
  for (const k of MG_KINDS) {
    const cfg = defaultMotionGraphic(k.id);
    assert.strictEqual(cfg.kind, k.id);
    assertNoNaN(cfg.inDuration, cfg.outDuration, cfg.panelOpacity, cfg.barWidth, cfg.barThickness, cfg.trackingSpeed, cfg.kineticStagger, cfg.radius, cfg.shadowBlur, cfg.letterSpacing, cfg.lineHeight, cfg.fontWeight, cfg.progress.value);
    for (const c of [cfg.accentColor, cfg.secondaryColor, cfg.backgroundColor, cfg.shadowColor]) {
      assert.match(c, /^#[0-9a-fA-F]{6}$/, `цвет ${c} не hex`);
    }
    assert.ok(cfg.panelOpacity >= 0 && cfg.panelOpacity <= 1);
    assert.ok(cfg.progress.value >= 0 && cfg.progress.value <= 1);
  }
});

ok("createMotionGraphicClip: полноценный TextClip", () => {
  for (const k of MG_KINDS) {
    const clip = createMotionGraphicClip({ trackId: "t1", start: 2, kind: k.id });
    assert.strictEqual(clip.type, "text");
    assert.strictEqual(clip.start, 2);
    assert.ok(clip.duration > 0);
    assert.ok(clip.text.length > 0);
    assert.ok(clip.motionGraphic, "motionGraphic отсутствует");
    assert.strictEqual(clip.motionGraphic!.kind, k.id);
    assertNoNaN(clip.x.value, clip.y.value, clip.scale.value, clip.opacity.value);
  }
});

console.log("Motion Graphics: математика анимаций");
ok("mgEnvelope: фазы in → hold → out", () => {
  const cfg = { ...defaultMotionGraphic("title"), inDuration: 1, outDuration: 1 };
  const env0 = mgEnvelope(cfg, 6, 0);
  assert.strictEqual(env0.phase, "in");
  assert.strictEqual(env0.pIn, 0);
  const envMid = mgEnvelope(cfg, 6, 3);
  assert.strictEqual(envMid.phase, "hold");
  assert.strictEqual(envMid.pIn, 1);
  assert.strictEqual(envMid.pOut, 0);
  const envOut = mgEnvelope(cfg, 6, 6);
  assert.strictEqual(envOut.phase, "out");
  assert.strictEqual(envOut.pOut, 1);
});

ok("mgAnimMotion: вход заканчивается тождеством, выход начинается тождеством", () => {
  for (const anim of ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "pop", "elastic", "stomp", "glitch", "typewriter", "blur-in", "scale-in", "rotate-in", "zoom", "none"] as const) {
    const end = mgAnimMotion(anim, 1, 1);
    assertNoNaN(end.alpha, end.dx, end.dy, end.scale, end.rotate, end.blur);
    assert.ok(Math.abs(end.alpha - 1) < 1e-6, `${anim}: alpha входа ≠ 1`);
    assert.ok(Math.abs(end.scale - 1) < 1e-6, `${anim}: scale входа ≠ 1`);
    assert.ok(Math.abs(end.dx) < 1e-6 && Math.abs(end.dy) < 1e-6, `${anim}: сдвиг входа ≠ 0`);
    const startOut = mgAnimMotion(anim, 0, -1);
    assert.ok(Math.abs(startOut.alpha - 1) < 1e-6, `${anim}: alpha выхода ≠ 1 в начале`);
    const endOut = mgAnimMotion(anim, 1, -1);
    assert.ok(endOut.alpha < 0.5 || anim === "none", `${anim}: выход не скрывает элемент`);
  }
});

ok("mgGroupMotion: полный цикл клипа", () => {
  const cfg = defaultMotionGraphic("title");
  const g0 = mgGroupMotion(cfg, cfg.kind === "title" ? 4 : 4, 0.01);
  const gEnd = mgGroupMotion(cfg, 4, 4);
  assertNoNaN(g0.alpha, g0.dx, g0.dy, g0.scale, g0.rotate);
  assert.ok(gEnd.alpha < 0.05, "в конце клипа элемент должен исчезнуть");
});

ok("mgWordStagger не выходит за длительность", () => {
  const s = mgWordStagger(10, 5, 0.16);
  assert.ok(s > 0);
  assert.ok(s * 10 + 0.55 <= 5 + 1e-6, `stagger=${s} слишком большой`);
  assert.strictEqual(mgWordStagger(1, 5, 0.16), 0);
});

ok("layoutMgText: строки и слова без NaN", () => {
  const layout = layoutMgText({ text: "Больше просмотров больше подписчиков", px: 62, maxW: 800, cx: 0, top: 0, lineHeight: 73, align: "center", family: "Montserrat", weight: 800, measure });
  assert.ok(layout.lines.length >= 1);
  assert.ok(layout.words.length >= 4);
  assertNoNaN(layout.height, ...layout.lines.map((l) => l.cx + l.y + l.w), ...layout.words.map((w) => w.cx + w.left + w.w));
});

console.log("Motion Graphics: FFmpeg-фильтры");
const fakeLabel = (() => {
  let i = 0;
  return (p: string) => `${p}${++i}`;
})();

ok("buildMotionGraphicFfmpeg: все виды дают валидные фильтры", () => {
  for (const k of MG_KINDS) {
    const clip = createMotionGraphicClip({ trackId: "t", start: 1, kind: k.id });
    const res = buildMotionGraphicFfmpeg({
      clip,
      W: 1920,
      H: 1080,
      composite: "base",
      label: fakeLabel,
      inputs: [],
      fileNameFor: () => "",
      measure,
      renderOverlay: null,
    });
    assert.ok(res.filters.length > 0, `${k.id}: нет фильтров`);
    const joined = res.filters.join(";");
    assert.ok(!/undefined|NaN|null/.test(joined), `${k.id}: в фильтрах мусор: ${joined.slice(0, 200)}`);
    assert.ok(joined.includes("drawtext"), `${k.id}: нет drawtext`);
    assert.ok(joined.includes("enable='between"), `${k.id}: нет enable`);
    assert.ok(res.composite.startsWith("dt_") || res.composite.startsWith("db_") || res.composite.startsWith("ovc_") || res.composite.startsWith("bg_") || res.composite.startsWith("pct_") || res.composite.startsWith("crp_"), `${k.id}: странный финальный label ${res.composite}`);
  }
});

ok("buildMotionGraphicFfmpeg: PNG-оверлеи панелей", () => {
  const clip = createMotionGraphicClip({ trackId: "t", start: 0, kind: "lowerThird" });
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  let overlayCalls = 0;
  const res = buildMotionGraphicFfmpeg({
    clip,
    W: 1920,
    H: 1080,
    composite: "base",
    label: fakeLabel,
    inputs: [],
    fileNameFor: () => "",
    measure,
    renderOverlay: () => {
      overlayCalls += 1;
      return { path: `panel_${overlayCalls}.png`, png };
    },
  });
  assert.ok(overlayCalls >= 1, "рендерер панелей не вызван");
  assert.ok(res.overlayFiles.length >= 1);
  assert.ok(res.filters.some((f) => f.includes("overlay")), "нет overlay-фильтра");
});

ok("buildMotionGraphicFfmpeg: прогресс-бар с ключевыми кадрами прогресса", () => {
  const clip = createMotionGraphicClip({ trackId: "t", start: 0, kind: "progressBar" });
  clip.motionGraphic!.progress = {
    value: 0,
    keyframes: [
      { id: "a", time: 0, value: 0, easing: "linear" },
      { id: "b", time: 6, value: 1, easing: "linear" },
    ],
  };
  const res = buildMotionGraphicFfmpeg({ clip, W: 1920, H: 1080, composite: "base", label: fakeLabel, inputs: [], fileNameFor: () => "", measure, renderOverlay: null });
  const joined = res.filters.join(";");
  assert.ok(joined.includes("drawbox"), "нет drawbox для заливки");
  assert.ok(joined.includes("eif"), "нет выражения процентов");
});

ok("hexToFfmpegColor: корректный формат", () => {
  assert.strictEqual(hexToFfmpegColor("#8b5cf6", 1), "0x8b5cf6@1.000");
  assert.strictEqual(hexToFfmpegColor("#fff", 0.5), "0xffffff@0.500");
});

ok("mgWordExprs и mgCaptionWordExprs: выражения без мусора", () => {
  for (const style of ["wordBurst", "wave", "stomp", "elastic", "glitch", "typewriter", "flip"] as const) {
    const e = mgWordExprs(style, "t-1", 2, 0.18, 0.4, "t");
    assert.ok(!/undefined|NaN/.test(e.alpha + e.dx + e.dy + e.scale), style);
  }
  for (const style of ["classic", "box", "highlight", "pop", "karaoke"] as const) {
    const e = mgCaptionWordExprs(style, "t-1", 2, 0.18, 0.4);
    assert.ok(!/undefined|NaN/.test(e.alpha + e.dx + e.dy + e.scale), style);
  }
});

console.log("Motion Graphics: интеграция с compileProjectToFfmpeg");
ok("проект с 12 клипами моушн-графики компилируется", () => {
  const project = createEmptyProject("MG test");
  const track: typeof project.tracks[number] = { id: "mg_track", type: "text", name: "Титры", clips: [], hidden: false, muted: false, locked: false };
  let cursor = 0;
  for (const k of MG_KINDS) {
    const clip = createMotionGraphicClip({ trackId: track.id, start: cursor, kind: k.id });
    track.clips.push(clip);
    cursor += clip.duration + 0.5;
  }
  project.tracks = [...project.tracks, track];
  project.duration = cursor;

  const res = compileProjectToFfmpeg(project, project.exportSettings, () => "", { renderMgOverlay: null, measureText: heuristicMeasure });
  assert.ok(res.filterComplex.includes("drawtext"), "нет drawtext");
  assert.ok(res.filterComplex.includes("enable='between"), "нет enable");
  assert.ok(!/undefined|NaN/.test(res.filterComplex), "мусор в filterComplex");
  assert.ok(res.fontMounted, "шрифт не помечен");
});

ok("compileProjectToFfmpeg: обычные титры и моушн-графика вместе", () => {
  const project = createEmptyProject("MG mix");
  const track: typeof project.tracks[number] = { id: "mg_track", type: "text", name: "Титры", clips: [], hidden: false, muted: false, locked: false };
  const plain = createTextClip({ trackId: track.id, start: 0, duration: 2, text: "Обычный титр" });
  const mg = createMotionGraphicClip({ trackId: track.id, start: 3, kind: "title" });
  track.clips = [plain, mg];
  project.tracks = [...project.tracks, track];
  project.duration = 10;
  const res = compileProjectToFfmpeg(project, project.exportSettings, () => "", { renderMgOverlay: null, measureText: heuristicMeasure });
  const dtCount = (res.filterComplex.match(/drawtext/g) ?? []).length;
  assert.ok(dtCount >= 4, `мало drawtext: ${dtCount}`);
});

console.log(`\nMotion Graphics: ${passed} проверок пройдено ✔`);
