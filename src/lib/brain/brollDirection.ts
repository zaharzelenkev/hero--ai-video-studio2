/**
 * B-ROLL DIRECTION — режиссёрские рекомендации по перебивкам.
 *
 * Правило профессионального монтажа: «показывай, а не рассказывай». Когда
 * спикер называет предмет, место или действие, зритель ОЖИДАЕТ это увидеть.
 * Здесь режиссёр решает, ЧТО должно быть на экране в каждой сцене, и только
 * потом ищет подходящий материал в проекте.
 *
 * Важное отличие от старой логики: рекомендация формулируется ДАЖЕ ЕСЛИ
 * подходящего материала нет (matchedAssetId = null). Тогда она остаётся
 * в плане как задача для пользователя — это честнее, чем молча подставить
 * случайный кадр.
 */

import type { BrollRecommendation } from "./directorPlan";
import type { AssetUnderstanding } from "./perception";

/**
 * Семантические группы «визуальных существительных»: слово из речи →
 * что зритель ожидает увидеть.
 *
 * `stems` — ОСНОВЫ слов, которые ищутся с учётом границы слова и русской
 * морфологии (окончание до 3 букв). Наивный поиск подстроки давал грубые
 * ложные срабатывания: «ока-ЗАЛ-ось» → спорт, «по-ЛЕЗ-но» → природа,
 * и ролик получал перебивку про спортзал под рассказ о воронке продаж.
 * Такая перебивка хуже её отсутствия — она разрушает доверие к монтажу.
 */
const VISUAL_TOPICS: Array<{ topic: string; stems: string[]; keywords: string[] }> = [
  { topic: "город", stems: ["город", "улиц", "мегаполис", "downtown", "city", "street"], keywords: ["city", "street", "город", "улиц"] },
  { topic: "люди", stems: ["люди", "людей", "человек", "команд", "коллег", "аудитор", "толп", "people", "crowd", "team"], keywords: ["people", "crowd", "люди", "команд"] },
  { topic: "деньги", stems: ["деньг", "деньги", "бюджет", "доход", "прибыл", "зарплат", "стоимост", "money", "budget", "revenue", "price"], keywords: ["money", "деньг", "бюджет", "cash"] },
  { topic: "работа", stems: ["работ", "офис", "ноутбук", "компьютер", "desk", "office", "laptop", "work"], keywords: ["office", "desk", "офис", "работ", "laptop"] },
  // «лес»/«гор»/«поле» — короткие и очень «липкие» основы (по-ЛЕЗ-но,
  // ока-ЗАЛ-ось, ПОЛЕ-зный): для них перечисляем точные словоформы, чтобы
  // рекомендация «покажи лес» не появлялась под словом «полезно».
  { topic: "природа", stems: ["природ", "лесу", "леса", "лесом", "лес", "горы", "горах", "гору", "поля", "полях", "озер", "река", "реки", "реке", "nature", "forest", "mountain", "lake"], keywords: ["nature", "forest", "природ", "лес", "гор"] },
  { topic: "море", stems: ["мор", "море", "моря", "океан", "пляж", "волн", "берег", "sea", "ocean", "beach", "wave"], keywords: ["sea", "ocean", "beach", "мор", "пляж", "волн"] },
  { topic: "дорога", stems: ["дорог", "машин", "автомобил", "трасс", "поездк", "road", "car", "drive", "highway"], keywords: ["road", "car", "дорог", "машин"] },
  { topic: "еда", stems: ["еда", "еды", "ресторан", "кофе", "завтрак", "обед", "блюд", "food", "coffee", "restaurant", "meal"], keywords: ["food", "coffee", "еда", "кофе", "ресторан"] },
  { topic: "спорт", stems: ["спорт", "трениров", "спортзал", "фитнес", "бега", "пробеж", "sport", "gym", "workout", "training"], keywords: ["sport", "gym", "спорт", "трениров"] },
  { topic: "дом", stems: ["дом", "дома", "квартир", "интерьер", "комнат", "home", "house", "apartment", "room"], keywords: ["home", "house", "дом", "квартир"] },
  { topic: "путешествие", stems: ["путешеств", "отпуск", "самолет", "самолёт", "аэропорт", "отел", "travel", "flight", "airport", "hotel", "trip"], keywords: ["travel", "flight", "путешеств", "отпуск"] },
  { topic: "экран", stems: ["экран", "сайт", "сайта", "приложен", "интерфейс", "телефон", "screen", "app", "website", "phone", "interface"], keywords: ["screen", "app", "экран", "сайт", "phone"] },
  { topic: "бизнес", stems: ["бизнес", "клиент", "продаж", "сделк", "перегов", "стартап", "business", "client", "sales", "startup", "deal"], keywords: ["business", "client", "бизнес", "клиент", "продаж"] },
  { topic: "обучение", stems: ["школ", "учеб", "книг", "курс", "лекц", "студент", "school", "book", "course", "lecture"], keywords: ["book", "school", "книг", "курс", "учеб"] },
  { topic: "семья", stems: ["семь", "семья", "дет", "дети", "родител", "мам", "пап", "свадьб", "family", "kids", "children", "wedding", "parents"], keywords: ["family", "kids", "семь", "дет", "свадьб"] },
  { topic: "животные", stems: ["собак", "кошк", "кот", "коты", "животн", "питомц", "dog", "cat", "pet", "animal"], keywords: ["dog", "cat", "собак", "кошк", "pet"] },
  { topic: "время суток", stems: ["закат", "рассвет", "ночь", "ночи", "утро", "утра", "вечер", "sunset", "sunrise", "night", "morning"], keywords: ["sunset", "night", "закат", "ночь", "утро"] },
];

/** Слова реплики, приведённые к нижнему регистру и очищенные от пунктуации. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я]+/i)
    .filter(Boolean);
}

/**
 * Совпадает ли токен с основой слова.
 *
 * Правило: токен ДОЛЖЕН начинаться с основы (границу слова уважаем), а хвост
 * после основы — не длиннее 3 символов (русское окончание: «море» → «морем»,
 * «деньги» → «деньгами» не пройдёт по длине, поэтому такие формы вынесены
 * в список основ отдельно). Так «зал» больше не находится в «оказалось».
 */
function tokenMatchesStem(token: string, stem: string): boolean {
  const s = stem.replace(/ё/g, "е");
  if (token === s) return true;
  // Основы ≤3 букв («мор», «дом», «кот», «лес») сравниваем ТОЛЬКО точно:
  // любое послабление немедленно ловит их внутри чужих слов
  // («по-лез-но», «мор-ально», «дом-инирует»).
  if (s.length <= 3) return false;
  if (!token.startsWith(s)) return false;
  // Русское окончание: до 3 символов после основы («деньг|ами», «город|ах»).
  return token.length - s.length <= 3;
}

/**
 * Находит визуальную тему в реплике.
 *
 * Возвращает тему с НАИБОЛЬШИМ числом совпавших слов: если в реплике есть и
 * «деньги», и «бизнес», зритель ждёт то, о чём сказано плотнее.
 */
export function detectVisualTopic(text: string): { topic: string; keywords: string[] } | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  let best: { topic: string; keywords: string[]; hits: number } | null = null;
  for (const t of VISUAL_TOPICS) {
    let hits = 0;
    for (const token of tokens) {
      if (t.stems.some((stem) => tokenMatchesStem(token, stem))) hits++;
    }
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { topic: t.topic, keywords: t.keywords, hits };
    }
  }
  return best ? { topic: best.topic, keywords: best.keywords } : null;
}

/** Оценка соответствия материала теме: совпадение по имени файла. */
function matchScore(asset: AssetUnderstanding, keywords: string[]): number {
  const name = asset.name.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length < 3) continue;
    if (name.includes(kw)) score += 60;
    // Русские слова склоняются: сравниваем по основе.
    const stem = kw.replace(/[а-яё]{0,3}$/i, "");
    if (stem.length >= 4 && name.includes(stem)) score += 25;
  }
  return score;
}

export interface BrollMatch {
  recommendation: BrollRecommendation;
  /** Подобранный материал (null — рекомендация без покрытия). */
  asset: AssetUnderstanding | null;
}

export interface RecommendBrollInput {
  /** Текст реплики (для нарратива) или описание сцены. */
  text: string;
  /** Доступные материалы-кандидаты (кроме основного). */
  pool: AssetUnderstanding[];
  /** Желаемая длительность перебивки (сек). */
  duration: number;
  /** Материал предыдущей перебивки — не повторяем подряд. */
  prevAssetId: string | null;
  /** Прикрываем ли слабый кадр основного ряда. */
  coversWeak: boolean;
  /** Нужен ли pattern interrupt (ритмическая перебивка). */
  patternInterrupt: boolean;
  /** LLM-подсказка (ключевое слово от модели). */
  llmKeyword?: string;
  /** Детерминированный рандом для выбора при паритете. */
  rand: (salt: string) => number;
  salt: string;
}

/**
 * Формулирует рекомендацию по B-Roll и подбирает под неё материал.
 *
 * Приоритет причин: прикрыть брак → показать сказанное → взломать ритм →
 * дать кадру подышать. Так перебивка всегда решает конкретную задачу.
 */
export function recommendBroll(input: RecommendBrollInput): BrollMatch | null {
  const { text, pool, duration, prevAssetId, coversWeak, patternInterrupt, llmKeyword, rand, salt } = input;

  const detected = detectVisualTopic(text);
  const keywords = [
    ...(llmKeyword ? [llmKeyword.toLowerCase()] : []),
    ...(detected?.keywords ?? []),
  ];

  let subject: string;
  let purpose: BrollRecommendation["purpose"];
  let reason: string;

  if (coversWeak) {
    purpose = "cover-weak";
    subject = detected?.topic ?? llmKeyword ?? "любой сильный кадр";
    reason = "кадр основного ряда бракованный — прикрываем перебивкой, зритель не увидит проблему";
  } else if (detected) {
    purpose = "illustrate";
    subject = detected.topic;
    reason = `спикер говорит про «${detected.topic}» — зритель ждёт это увидеть (показывай, а не рассказывай)`;
  } else if (llmKeyword) {
    purpose = "illustrate";
    subject = llmKeyword;
    reason = `ключевой образ реплики: «${llmKeyword}» — иллюстрируем сказанное`;
  } else if (patternInterrupt) {
    purpose = "pattern-interrupt";
    subject = "контрастный кадр";
    reason = "Pattern Interrupt: ритм говорящей головы взламывается перебивкой, внимание возвращается";
  } else {
    purpose = "breathe";
    subject = "атмосферный кадр";
    reason = "длинная реплика — даём глазу отдохнуть от одного плана";
  }

  const recommendation: BrollRecommendation = {
    subject,
    purpose,
    duration: Math.round(duration * 100) / 100,
    matchedAssetId: null,
    reason,
  };

  if (pool.length === 0) return { recommendation, asset: null };

  // --- Подбор материала ---
  let best: AssetUnderstanding | null = null;
  let bestScore = -Infinity;
  for (const a of pool) {
    let score = matchScore(a, keywords);
    // Качество материала: перебивка не должна быть хуже основного ряда.
    score += a.meanAesthetic * 2 + a.meanQuality;
    if (a.assetId === prevAssetId) score -= 80;
    // Для pattern interrupt важна динамика, для иллюстрации — чистота кадра.
    if (purpose === "pattern-interrupt") score += a.dynamism * 25;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }

  // Семантическое совпадение подтверждено — берём именно его.
  const semanticHit = keywords.length > 0 && best !== null && matchScore(best, keywords) > 0;
  if (semanticHit && best) {
    recommendation.matchedAssetId = best.assetId;
    return { recommendation, asset: best };
  }

  // Совпадения по смыслу нет. Для «покажи сказанное» подставлять случайный
  // кадр — обман: перебивка про «море» с офисом делает ролик хуже. Оставляем
  // рекомендацию без покрытия, но только если проект богат материалом
  // (иначе перебивок не будет вовсе).
  if (purpose === "illustrate" && pool.length >= 3) {
    return { recommendation, asset: null };
  }

  const usable = pool.filter((a) => a.assetId !== prevAssetId);
  const base = usable.length > 0 ? usable : pool;
  const picked = base[Math.floor(rand(salt) * base.length) % base.length];
  const chosen = bestScore > 8 && best ? best : picked;
  recommendation.matchedAssetId = chosen.assetId;
  return { recommendation, asset: chosen };
}

/**
 * Рекомендации по B-Roll для ВИЗУАЛЬНОЙ сцены (без речи).
 * Здесь перебивка не иллюстрирует слова — она либо прикрывает слабый кадр,
 * либо ломает ритм. Возвращает пустой список, если сцена самодостаточна.
 */
export function recommendVisualBroll(opts: {
  phase: string;
  intent: string;
  duration: number;
}): BrollRecommendation[] {
  const out: BrollRecommendation[] = [];
  if (opts.intent.toLowerCase().includes("pattern interrupt")) {
    out.push({
      subject: "контрастный кадр",
      purpose: "pattern-interrupt",
      duration: Math.min(1.6, opts.duration),
      matchedAssetId: null,
      reason: "визуальный взлом ритма — контраст по крупности и цвету",
    });
  }
  return out;
}
