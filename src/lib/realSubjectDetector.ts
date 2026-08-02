/**
 * DETECTOR REAL-WORLD SUBJECT — эвристика: относится ли промпт к РЕАЛЬНОМУ объекту.
 *
 * В создателе ИИ-видео сценарий (Groq LLM) сам помечает сцену `imageType: "real"`
 * для существующих мест/вещей и `imageType: "ai"` для абстракций. Но когда ключа
 * Groq нет (или LLM ошибся), нужен страховочный детектор: если в промпте есть явное
 * указание на реальную достопримечательность/город/страну — берём настоящее фото,
 * а не выдумку. Это покрыто unit-тестами (test-real-subject.mts).
 */

// Слова-маркеры реальных достопримечательностей/типов объектов.
const REAL_WORDS = new Set([
  "tower", "towers", "eiffel", "taj", "mahal", "colosseum", "collosseum", "pyramid",
  "pyramids", "sphinx", "acropolis", "parthenon", "kremlin", "red square", "wall",
  "great wall", "petra", "machu", "picchu", "statue", "liberty", "christ", "redeemer",
  "big ben", "stonehenge", "fuji", "everest", "kilimanjaro", "grand canyon", "niagara",
  "venice", "canal", "moscow", "paris", "london", "rome", "new york", "dubai",
  "tokyo", "kyoto", "bali", "santorini", "amsterdam", "barcelona", "berlin", "istanbul",
  "prague", "vienna", "milan", "florence", "bangkok", "cairo", "mexico", "rio",
  "sydney", "opera house", "golden gate", "brooklyn", "empire state", "burj",
  "angkor", "hagia", "sophia", "alhambra", "neuschwanstein", "notre", "dame",
  "sagrada", "familia", "leaning", "pisa", "mount", "lake", "river", "waterfall",
  "island", "beach", "desert", "forest", "mountains", "volcano", "fjord", "city",
  "cathedral", "mosque", "temple", "castle", "palace", "square", "monument", "museum",
  "bridge", "park", "harbor", "harbour", "old town", "china", "japan", "india",
  "italy", "france", "spain", "usa", "russia", "germany", "england", "egypt", "brazil",
  "turkey", "greece", "thailand", "vietnam", "morocco", "peru", "argentina", "canada",
  "australia", "switzerland", "norway", "iceland", "portugal", "poland", "ukraine",
  // Русские маркеры (запрос пользователя может быть на русском — режим без ключа).
  "эйфелева", "башня", "кремль", "красная площадь", "москва", "париж", "лондон",
  "рим", "нью-йорк", "дубай", "токио", "киото", "санторини", "барселона", "берлин",
  "стамбул", "прага", "венеция", "каир", "пекин", "мехико", "рио", "сидней",
  "пирамиды", "колизей", "тадж", "махал", "статуя", "свободы", "акрополь",
  "стена", "византии", "собор", "мечеть", "храм", "замок", "дворец", "площадь",
  "памятник", "музей", "мост", "парк", "гора", "эверест", "фудзи", "озеро", "река",
  "водопад", "остров", "пляж", "пустыня", "лес", "вулкан", "фьорд", "город",
  "китай", "япония", "индия", "италия", "франция", "испания", "россия", "германия",
  "англия", "египет", "бразилия", "турция", "греция", "тайланд", "вьетнам",
  "марокко", "перу", "аргентина", "канада", "австралия", "швейцария", "норвегия",
  "исландия", "португалия", "польша", "украина", "беларусь", "америка",
]);

// Слова, указывающие на АБСТРАКТНЫЙ/вымышленный контент (перебивают реальность).
const ABSTRACT_WORDS = new Set([
  "cyberpunk", "futuristic", "sci-fi", "sci fi", "fantasy", "abstract", "cartoon",
  "anime", "3d render", "concept", "illustration", "surreal", "dystopian", "utopian",
  "apocalyptic", "magical", "alien", "space station", "hologram", "neon", "dream",
  "mythical", "dragon", "robot", "android", "ghost", "vampire", "wizard", "superhero",
  // русские абстракции
  "киберпанк", "футуристический", "фэнтези", "абстракц", "мультяшн", "аниме",
  "концепт", "сюрреалист", "антиутопия", "магическ", "инопланетн", "голограмм",
  "неонов", "мифическ", "дракон", "робот", "призрак", "вампир", "супергерой",
]);

/**
 * true если промпт почти наверняка про конкретный реальный объект/место —
 * в этом случае лучше искать настоящее фото, чем генерировать.
 */
export function looksLikeRealWorldSubject(prompt: string): boolean {
  const p = (prompt || "").toLowerCase().trim();
  if (p.length < 3) return false;

  // Вымышленный контент явно указан — не считаем реальным.
  for (const w of ABSTRACT_WORDS) {
    if (p.includes(w)) return false;
  }

  // 1. Явное упоминание известной достопримечательности / типа реального места.
  for (const w of REAL_WORDS) {
    if (p.includes(w)) return true;
  }

  // 2. Собственное имя (слово с заглавной буквы не в начале фразы) — почти всегда
  //    конкретный реальный объект (например «Башня в Париже» без названия — нет,
  //    но «Cologne Cathedral», «Burj Khalifa» — да).
  const tokens = prompt.split(/\s+/).filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.length >= 3 && /^[A-ZÀ-ÿ][a-zà-ÿ]+$/.test(t)) return true;
  }

  return false;
}
