/**
 * Измерительный стенд нарративного автомонтажа (buildNarrativeScript).
 *
 * Фикстура: однокамерный подкаст 60с: 15 фраз с мусорными («ну эээ»),
 * эмоциональная разрядка (крик-энергия) на фразе про «самое важное» (~40с).
 * Проверяем:
 *  1) есть сцена фазы climax и она попала на эмоциональный/смысловой пик;
 *  2) flash-forward teaser добавлен в начало (для монолога тоже);
 *  3) филлеры («ну эээ типа») вырезаны;
 *  4) хук селективен (не первая попавшаяся фраза).
 *
 * Запуск: npx tsx scripts/measure-narrative-montage.mts
 */
import { DirectorEngine } from "../src/lib/brain/engine";
import { AI_CONFIG } from "../src/config/ai";
import type { AudioEnergySegment } from "../src/lib/media";

// Жёстко глушим LLM: проверяем именно ЭВРИСТИЧЕСКИЙ путь (работает без ключей).
(AI_CONFIG as any).groqApiKey = "";

const w = (start: number, end: number, text: string) => `[${start.toFixed(1)}s - ${end.toFixed(1)}s] ${text}`;
const phrases: Array<[number, number, string]> = [
  [0.0, 1.4, "ну эээ всем привет"],
  [2.0, 4.2, "сегодня расскажу как я за месяц увеличил продажи вдвое"],
  [4.6, 5.0, "типа"],
  [5.4, 8.0, "сначала я думал что проблема в рекламе но ошибался"],
  [8.5, 11.0, "мы слили бюджет на три канала и получили ноль заявок"],
  [11.5, 14.0, "потом я сел и разобрал воронку по шагам"],
  [14.5, 15.0, "ну"],
  [15.5, 18.0, "оказалось клиенты уходили на втором экране сайта"],
  [18.5, 21.0, "мы переписали заголовок за один вечер без дизайнера"],
  [21.5, 24.5, "и конверсия выросла на семьдесят процентов за неделю"],
  [25.0, 28.0, "но это ещё не всё что мы сделали"],
  [28.5, 31.5, "дальше я убрал половину полей из формы заказа"],
  [32.0, 34.0, "менеджеры сначала возмущались но потом согласились"],
  [38.0, 41.5, "и вот самое важное что вы должны запомнить"],
  [42.0, 45.0, "продажи растут не от рекламы а от скорости ответа клиенту"],
  [45.5, 48.0, "проверьте свою воронку уже сегодня вечером"],
  [48.5, 51.0, "подписывайтесь и пишите в комментариях что получилось"],
];

// Энергия камеры: спокойно, эмоциональный подъём-выплеск на 38-46с (пик-фраза)
const audioEnergy: AudioEnergySegment[] = [];
for (let t = 0; t < 60; t += 2) {
  const lv: AudioEnergySegment["energyLevel"] = t >= 38 && t < 46 ? "drop" : t >= 28 && t < 36 ? "medium" : "low";
  audioEnergy.push({ startTime: t, endTime: t + 2, energyLevel: lv });
}

const transcript = phrases.map(([s, e, t]) => w(s, e, t)).join("\n");
const request: any = {
  userPrompt: "подкаст про продажи, 45 сек",
  assets: [
    {
      id: "talk", name: "podcast.mp4", type: "video", duration: 60,
      transcript,
      audioEnergy,
      segments: [],
    },
    { id: "broll1", name: "office.mp4", type: "video", duration: 12, segments: [] },
  ],
};

(async () => {
  const script = await DirectorEngine.formulateScript(request);
  console.log(`\n=== НАРРАТИВ ПОДКАСТ (${script.genre}, target=${script.targetDuration}s) ===`);
  let t = 0;
  for (const s of script.scenes) {
    console.log(`  ${t.toFixed(1).padStart(5)}→${(t + s.duration).toFixed(1).padStart(5)} ${s.phase.padEnd(7)} ${s.intent.padEnd(24)} src ${s.mainClip.sourceStart.toFixed(1)}–${s.mainClip.sourceEnd.toFixed(1)} zoom=${s.mainClip.zoom} broll=${s.bRolls.length}`);
    t += s.duration;
  }

  console.log("\n=== МЕТРИКИ ===");
  const climax = script.scenes.find(s => s.phase === "climax");
  if (climax) {
    const onPeak = climax.mainClip.sourceStart >= 36 && climax.mainClip.sourceStart <= 47;
    console.log(`  1. Кульминация речи: src=${climax.mainClip.sourceStart.toFixed(1)}с ${onPeak ? "✅ на эмоциональном пике (38-46с)" : "⚠️ вне пиковой зоны"}`);
  } else {
    console.log("  1. Кульминация речи ОТСУТСТВУЕТ ❌ (был главный баг)");
  }

  const teaser = script.scenes.find(s => s.intent === "Flash-forward Teaser");
  console.log(`  2. Flash-forward teaser: ${teaser ? "✅ добавлен (src " + teaser.mainClip.sourceStart.toFixed(1) + "с)" : "❌ отсутствует"}`);

  const usedSrc = script.scenes.map(s => [s.mainClip.sourceStart, s.mainClip.sourceEnd] as const);
  const covers = (a: number, b: number) => usedSrc.some(([s, e]) => s <= a + 0.2 && e >= b - 0.2);
  const fillerKept = covers(4.6, 5.0) || covers(14.5, 15.0) || covers(0.0, 1.4);
  console.log(`  3. Филлеры («ну», «эээ», «типа»): ${fillerKept ? "❌ попали в монтаж" : "✅ вырезаны"}`);

  const hook = script.scenes.find(s => s.phase === "hook" && s.intent !== "Flash-forward Teaser");
  const hookIsBlank = hook && hook.mainClip.sourceStart < 1.6;
  console.log(`  4. Хук: src=${hook?.mainClip.sourceStart.toFixed(1)}с ${hookIsBlank ? "❌ взят приветственный мусор" : "✅ селективный"}`);
})();
