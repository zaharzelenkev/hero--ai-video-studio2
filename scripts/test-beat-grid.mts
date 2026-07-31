/**
 * Тест beat-детектора на синтезированном треке (Node, без браузера).
 *
 * Генерируем 30с псевдо-трека 128 BPM:
 *  - кик: затухающий синус 52Гц на каждой доли (0.469с);
 *  - хэт: шумовой «цц» на восьмушках;
 *  - бас-педаль и плавный шум-ковёр (маскирует удары для широкополосного флюкса).
 *
 * Проверяем, что комбинированный флюкс (low-band кика + полная полоса)
 * и автокорреляционная сетка восстанавливают период и фазу ударов.
 *
 * Запуск: npx tsx scripts/test-beat-grid.mts
 */
import { combinedOnsetFlux, fluxOf, energyEnvelope, buildBeatGrid } from "../src/lib/beatDetection";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const SR = 44100;
const BPM = 128;
const BEAT = 60 / BPM; // 0.46875
const DUR = 30;
const n = Math.floor(SR * DUR);
const data = new Float32Array(n);

// Детерминированный LCG-noise
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };

// шум-ковёр (маскировка)
for (let i = 0; i < n; i++) data[i] += rnd() * 0.04;
// бас-педаль 41Гц
for (let i = 0; i < n; i++) data[i] += Math.sin(2 * Math.PI * 41 * (i / SR)) * 0.08;

// кик на долях, фаза 0.12с
const PHASE = 0.12;
const trueBeats: number[] = [];
for (let t = PHASE; t < DUR - 0.1; t += BEAT) trueBeats.push(t);
for (const tb of trueBeats) {
  const start = Math.floor(tb * SR);
  const len = Math.floor(0.12 * SR);
  for (let i = 0; i < len && start + i < n; i++) {
    const e = Math.exp(-i / (SR * 0.025));
    data[start + i] += Math.sin(2 * Math.PI * 52 * (i / SR)) * 0.9 * e;
  }
}
// хэт на восьмушках (мешает широкополосному детектору)
for (let t = PHASE + BEAT / 2; t < DUR - 0.1; t += BEAT / 2) {
  const start = Math.floor(t * SR);
  const len = Math.floor(0.03 * SR);
  for (let i = 0; i < len && start + i < n; i++) {
    data[start + i] += rnd() * 0.25 * Math.exp(-i / (SR * 0.006));
  }
}

console.log("=== ДЕТЕКЦИЯ ТЕМПА ===");
const { flux, hopSec } = combinedOnsetFlux(data, SR);
// «сырые» онстеты тем же правилом, что и в detectBeats
const smoothWindow = 20;
const hop = Math.floor(Math.floor(SR * 0.05) / 2);
const minGap = Math.max(1, Math.round((0.25 * SR) / hop));
let last = -minGap;
const onsets: number[] = [];
for (let i = 0; i < flux.length; i++) {
  const s = Math.max(0, i - smoothWindow);
  const e = Math.min(flux.length, i + smoothWindow);
  let avg = 0;
  for (let j = s; j < e; j++) avg += flux[j];
  avg /= e - s || 1;
  if (flux[i] > avg * 1.5 + 0.0005 && i - last >= minGap) {
    onsets.push((i * hop) / SR);
    last = i;
  }
}
console.log(`  онсетов найдено: ${onsets.length} (истинных битов: ${trueBeats.length})`);

const grid = buildBeatGrid(flux, hopSec, DUR, onsets);
check("сетка построена", !!grid && grid.length > 40, grid ? `узлов: ${grid.length}` : "null");

if (grid && grid.length > 10) {
  // период сетки ≈ 0.46875 ±3%
  const deltas = [];
  for (let i = 1; i < grid.length; i++) {
    const d = grid[i] - grid[i - 1];
    if (d > 0.3 && d < 0.65) deltas.push(d); // фильтруем внесеточные акценты
  }
  deltas.sort((a, b) => a - b);
  const period = deltas[Math.floor(deltas.length / 2)];
  const periodErr = Math.abs(period - BEAT) / BEAT;
  check(`период сетки: ${period.toFixed(4)}с vs истина ${BEAT.toFixed(4)}с (ошибка ${(periodErr * 100).toFixed(1)}%)`, periodErr < 0.03);

  // фаза: среднее расстояние от узла до ближайшего истинного бита
  let sum = 0, cnt = 0;
  for (const tb of trueBeats.slice(0, 50)) {
    let best = Infinity;
    for (const g of grid) { const d = Math.abs(g - tb); if (d < best) best = d; }
    sum += best; cnt++;
  }
  const meanPhaseErr = sum / cnt;
  check(`фаза сетки: средний промах ${(meanPhaseErr * 1000).toFixed(0)}мс`, meanPhaseErr < 0.045);

  // покрытие: доля истинных битов, рядом с которыми есть узел
  const covered = trueBeats.filter(tb => grid.some(g => Math.abs(g - tb) < 0.06)).length / trueBeats.length;
  check(`покрытие истинных битов: ${(covered * 100).toFixed(0)}%`, covered > 0.92);
}

// Сравнение со СТАРЫМ (широкополосным) флюксом — он обязан быть хуже на этом материале
const oldFlux = fluxOf(energyEnvelope(data, SR).energies);
const oldGrid = buildBeatGrid(oldFlux, energyEnvelope(data, SR).hopSec, DUR, onsets);
if (oldGrid && grid) {
  const oldDeltas = [];
  for (let i = 1; i < oldGrid.length; i++) { const d = oldGrid[i] - oldGrid[i - 1]; if (d > 0.3 && d < 0.65) oldDeltas.push(d); }
  oldDeltas.sort((a, b) => a - b);
  const oldPeriod = oldDeltas.length ? oldDeltas[Math.floor(oldDeltas.length / 2)] : 0;
  console.log(`  ℹ️  старый широкополосный флюкс: период ${oldPeriod.toFixed(4)}с; новый (low-band): ${(grid && grid.length > 1) ? (grid[1] - grid[0]).toFixed(4) : "?"}с`);
}

if (failures === 0) console.log("\n✅ BEAT GRID: ВСЕ ПРОВЕРКИ ПРОШЛИ");
else { console.error(`\n❌ Провалено: ${failures}`); process.exit(1); }
