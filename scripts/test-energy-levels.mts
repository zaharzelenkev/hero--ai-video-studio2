/**
 * Тест перцентильной классификации энергии трека (кость всей синхронизации).
 * Проверяем на двух патологиях, где старая схема (нормализация к max) ошибалась:
 *  A) плотно сжатый поп-трек: старые пороги лепили «drop» на весь куплет;
 *  B) одинокий выброс (хлопок): весь трек «проседал», настоящий дроп терялся.
 *
 * Запуск: npx tsx scripts/test-energy-levels.mts
 */
import { classifyEnergyWindows } from "../src/lib/media";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// --- Сценарий A: сжатый поп-трек, 80с -------------------------------------
// интро тихое (0-10с), куплет громкий (10-56с), настоящий дроп громче всех (56-64с),
// аутро среднее (64-80с)
const eA: number[] = [];
for (let t = 0; t < 40; t++) {
  const sec = t * 2;
  if (sec < 10) eA.push(0.18);
  else if (sec >= 56 && sec < 64) eA.push(1.0);
  else if (sec < 56) eA.push(0.82);
  else eA.push(0.55);
}
const segsA = classifyEnergyWindows(eA, 2, 80);
const dropsA = segsA.filter(s => s.energyLevel === "drop");
check("A: дроп ровно один (а не весь громкий куплет)", dropsA.length === 1,
  `дропов: ${dropsA.length}: ${dropsA.map(d => `${d.startTime}-${d.endTime}`).join(", ")}`);
check("A: дроп встал на 56-64с (реальный пик)", dropsA[0]?.startTime >= 54 && dropsA[0]?.startTime <= 58,
  `start=${dropsA[0]?.startTime}`);
check("A: интро помечено low", segsA[0].energyLevel === "low", `получено ${segsA[0].energyLevel}`);

// --- Сценарий B: хлопок-выброс + музыкально плотный припев ----------------
// трек ровный 0.55, на 20с — одиночный выброс 2.5 (хлопок двери),
// припев 48-60с энергичнее (0.75) — старый код всё делил на 2.5 и дроп гасил.
const eB: number[] = [];
for (let t = 0; t < 40; t++) {
  const sec = t * 2;
  if (sec === 20) eB.push(2.5);
  else if (sec >= 48 && sec < 60) eB.push(0.75);
  else eA.push.length, eB.push(0.55);
}
const segsB = classifyEnergyWindows(eB, 2, 80);
const dropsB = segsB.filter(s => s.energyLevel === "drop");
check("B: настоящий припев помечен дропом несмотря на выброс-секундомер",
  dropsB.some(d => d.startTime >= 46 && d.startTime <= 50),
  `дропы: ${dropsB.map(d => `${d.startTime}-${d.endTime}`).join(", ") || "нет"}`);
check("B: выброс не поглотил все дропы (≤3 зон)", dropsB.length <= 3,
  `дропов: ${dropsB.length}`);

if (failures === 0) console.log("\n✅ ЭНЕРГО-КЛАССИФИКАЦИЯ: ВСЕ ПРОВЕРКИ ПРОШЛИ");
else { console.error(`\n❌ Провалено: ${failures}`); process.exit(1); }
