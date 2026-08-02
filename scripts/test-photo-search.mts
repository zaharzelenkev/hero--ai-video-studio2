/**
 * РЕГРЕССИОННЫЙ ТЕСТ ПОИСКА РЕАЛЬНЫХ ФОТО (photoSearch) и детектора реальных объектов.
 *
 * Проверяет чистые функции без сети:
 *   - разбор ответов Wikimedia / Openverse в кандидатов фото;
 *   - выбор лучшего кадра под ориентацию целевого ролика;
 *   - детектор «реальный объект vs абстракция» (для режима без LLM-ключа).
 *
 * Запуск: npx tsx scripts/test-photo-search.mts
 */
import {
  parseWikimedia,
  parseOpenverse,
  pickBestPhoto,
  type PhotoCandidate,
} from "../src/lib/photoSearch";
import { looksLikeRealWorldSubject } from "../src/lib/realSubjectDetector";

let failures = 0;
const check = (name: string, cond: boolean, detail?: string) => {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("=== 1. Разбор Wikimedia Commons ===");
const wiki = {
  query: { pages: {
    "1": { imageinfo: [{ url: "https://upload.wikimedia.org/.../Eiffel.jpg", width: 4000, height: 3000 }] },
    "2": { imageinfo: [{ url: "https://upload.wikimedia.org/.../Map.svg" }] }, // svg — пропускаем
    "3": { imageinfo: [{ url: "https://upload.wikimedia.org/.../portrait.jpg", width: 1000, height: 1800 }] },
  } },
};
const wikiC = parseWikimedia(wiki);
check("разобрано 2 растровых фото", wikiC.length === 2, JSON.stringify(wikiC));
check("svg отброшен", !wikiC.some(c => c.url.includes("svg")));

console.log("\n=== 2. Разбор Openverse ===");
const ov = { results: [
  { url: "https://a/b.jpg", thumbnail: "https://a/b_th.jpg", width: 2000, height: 1000 },
  { url: "https://a/c.svg", width: 100, height: 100 }, // svg — пропускаем
  { thumbnail: "https://a/d_th.jpg", thumbnail_width: 800, thumbnail_height: 1200 },
] };
const ovC = parseOpenverse(ov);
check("разобрано 2 фото", ovC.length === 2, JSON.stringify(ovC));
check("используется thumbnail", ovC.some(c => c.url.includes("_th")));

console.log("\n=== 3. Выбор лучшего кадра под ориентацию ===");
// Цель — портрет 1080x1920 (вертикальный ролик).
const cands: PhotoCandidate[] = [
  { url: "land.jpg", width: 4000, height: 3000 }, // горизонтальное
  { url: "port.jpg", width: 1000, height: 1800 },  // портрет
  { url: "square.jpg", width: 1200, height: 1200 },
];
const bestPortrait = pickBestPhoto(cands, 1080, 1920);
check("для вертикали выбран портрет", bestPortrait?.url === "port.jpg", bestPortrait?.url);
const bestLandscape = pickBestPhoto(cands, 1920, 1080);
check("для горизонтали выбран ландшафт", bestLandscape?.url === "land.jpg", bestLandscape?.url);

console.log("\n=== 4. Пусто → null ===");
check("пустой список → null", pickBestPhoto([], 1080, 1920) === null);

console.log("\n=== 5. Детектор: реальные объекты ===");
const realCases = [
  "Eiffel Tower",
  "Taj Mahal, Agra",
  "Red Square Moscow",
  "Colosseum in Rome",
  "Эйфелева башня в Париже",
  "Москва Кремль",
  "Grand Canyon Arizona",
  "Пирамиды Египта",
  "Mount Everest",
];
for (const c of realCases) check(`real: ${c}`, looksLikeRealWorldSubject(c), "ожидали true");

console.log("\n=== 6. Детектор: абстракции не считаем реальными ===");
const abstractCases = [
  "A cyberpunk city at night",
  "Futuristic flying cars, sci-fi",
  "Abstract neon shapes",
  "A magical fantasy dragon",
  "Киберпанк город будущего",
  "Сюрреалистический пейзаж",
];
for (const c of abstractCases) check(`abstract: ${c}`, !looksLikeRealWorldSubject(c), "ожидали false");

console.log("\n=== 7. Детектор: пусто/короткие ===");
check("пусто → false", !looksLikeRealWorldSubject(""));
check("короткое → false", !looksLikeRealWorldSubject("a"));

console.log(failures === 0 ? "\n✅ PHOTO SEARCH: ВСЕ ТЕСТЫ ПРОШЛИ" : `\n❌ ПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
