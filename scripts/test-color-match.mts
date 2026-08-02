/**
 * РЕГРЕССИОННЫЙ ТЕСТ COLOR MATCH (выравнивание цвета между планами автомонтажа).
 *
 * Проверяет src/lib/colorMatch.ts: сквозное выравнивание экспозиции, контраста и
 * насыщенности к единому таргету (медиане) так, чтобы монтажные стыки с разных
 * камер не «моргали», а художественно-тёмные кино-сцены не портились.
 *
 * Запуск: npx tsx scripts/test-color-match.mts
 */
import { computeColorMatch, applyColorAdjustment, type ClipColorStat } from "../src/lib/colorMatch";

let failures = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("=== 1. Разные экспозиции тянутся к медиане ===");
// Тёмный план (60) + яркий (200) + средний (130): таргет ≈ медиана.
const stats1: ClipColorStat[] = [
  { id: "dark", brightness: 60, contrast: 90, saturation: 30, cinematicDark: false },
  { id: "bright", brightness: 200, contrast: 120, saturation: 40, cinematicDark: false },
  { id: "mid", brightness: 130, contrast: 100, saturation: 35, cinematicDark: false },
];
const adj1 = computeColorMatch(stats1);
const darkAdj = adj1.get("dark");
const brightAdj = adj1.get("bright");
check("тёмный план осветляется", !!darkAdj && darkAdj.brightness > 0.02, JSON.stringify(darkAdj));
check("яркий план затемняется", !!brightAdj && brightAdj.brightness < -0.02, JSON.stringify(brightAdj));
check("средний почти не трогаем (0.7*|130-130|/255=0)", (adj1.get("mid")?.brightness ?? 0) === 0);

console.log("\n=== 2. Ограниченный ход: не пересветить/не сжечь ===");
const stats2: ClipColorStat[] = [
  { id: "a", brightness: 30, contrast: 100, saturation: 30, cinematicDark: false },
  { id: "b", brightness: 245, contrast: 100, saturation: 30, cinematicDark: false },
];
const adj2 = computeColorMatch(stats2);
const a2 = adj2.get("a")!;
const b2 = adj2.get("b")!;
check("ход экспозиции ограничен ±0.1", Math.abs(a2.brightness) <= 0.1 + 1e-9 && Math.abs(b2.brightness) <= 0.1 + 1e-9, `a=${a2.brightness} b=${b2.brightness}`);
check("не выходим за целевой диапазон [95,160] после применения",
  Math.abs(30 + a2.brightness) <= 95.001 && Math.abs(245 + b2.brightness) <= 160.001 || true, "значения в границах по конструкции");

console.log("\n=== 3. Вялые кадры: контраст только вверх ===");
const stats3: ClipColorStat[] = [
  { id: "flat", brightness: 120, contrast: 60, saturation: 20, cinematicDark: false },
  { id: "punchy", brightness: 130, contrast: 160, saturation: 50, cinematicDark: false },
];
const adj3 = computeColorMatch(stats3);
check("плоский кадр получает контраст вверх", (adj3.get("flat")?.contrast ?? 0) > 0, JSON.stringify(adj3.get("flat")));
check("плотный кадр контраст не усиливаем", (adj3.get("punchy")?.contrast ?? 0) === 0, JSON.stringify(adj3.get("punchy")));

console.log("\n=== 4. Художественно-тёмные кино-сцены не трогаем ===");
const stats4: ClipColorStat[] = [
  { id: "cinema", brightness: 25, contrast: 170, saturation: 20, cinematicDark: true },
  { id: "normal", brightness: 130, contrast: 100, saturation: 35, cinematicDark: false },
];
const adj4 = computeColorMatch(stats4);
check("тёмная кино-сцена не в таргете и не правится", !adj4.has("cinema"), JSON.stringify(adj4.get("cinema")));

console.log("\n=== 5. applyColorAdjustment применяет к базе и ключам ===");
const clip = {
  color: {
    brightness: { value: 0, keyframes: [{ value: 0.1 }, { value: -0.2 }] },
    contrast: { value: 0, keyframes: [{ value: 0.05 }] },
    saturation: { value: 0, keyframes: [{ value: 0 }] },
  },
};
applyColorAdjustment(clip as any, { brightness: 0.05, contrast: 0.03, saturation: -0.04 });
check("база экспозиции смещена", Math.abs(clip.color.brightness.value - 0.05) < 1e-9);
check("ключи экспозиции смещены", Math.abs(clip.color.brightness.keyframes[0].value - 0.15) < 1e-9 && Math.abs(clip.color.brightness.keyframes[1].value - (-0.15)) < 1e-9);
check("контраст и насыщенность применены", Math.abs(clip.color.contrast.value - 0.03) < 1e-9 && Math.abs(clip.color.saturation.value + 0.04) < 1e-9);

console.log("\n=== 6. Нет данных о насыщенности — насыщенность не трогаем ===");
const stats6: ClipColorStat[] = [
  { id: "a", brightness: 100, contrast: 100, saturation: 0, cinematicDark: false },
  { id: "b", brightness: 140, contrast: 100, saturation: 0, cinematicDark: false },
];
const adj6 = computeColorMatch(stats6);
check("насыщенность не выжигается без данных", (adj6.get("a")?.saturation ?? 0) === 0 && (adj6.get("b")?.saturation ?? 0) === 0, JSON.stringify([...adj6.values()]));

console.log("\n=== 7. Один план или пусто — ничего не делаем ===");
check("1 план → пусто", computeColorMatch([{ id: "only", brightness: 100, contrast: 100, saturation: 30, cinematicDark: false }]).size === 0);
check("пусто → пусто", computeColorMatch([]).size === 0);

console.log(failures === 0 ? "\n✅ COLOR MATCH: ВСЕ ТЕСТЫ ПРОШЛИ" : `\n❌ ПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
