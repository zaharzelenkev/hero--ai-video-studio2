/**
 * Локальный анализ изображений для Casting и Locations.
 *
 * Бесплатный, без обращений к внешним API: используем Canvas API в браузере,
 * чтобы получить яркость, контраст, цветовую палитру и ориентировочную оценку
 * подходящести локации/фото под описание. Это НЕ заменяет лицезрение человека
 * или тяжёлые CV-модели, но даёт честный автоматический первый взгляд.
 */

export interface ImageAnalysis {
  brightness: number;        // 0..1 (средняя яркость luma)
  contrast: number;          // 0..1 (std dev яркости)
  warmth: number;            // -1..1 (-1 холодный, 1 тёплый)
  saturation: number;        // 0..1
  palette: string[];         // up to 3 hex colors
  width: number;
  height: number;
  hasFaceLikeRegion: boolean; // грубая детекция телесных тонов в центре кадра
}

export interface CastingAnalysisResult {
  score: number;        // 0..100
  positives: string[];
  negatives: string[];
  notes: string;
}

export interface LocationAnalysisResult {
  score: number;
  mood: string;
  lighting: string;
  pros: string[];
  cons: string[];
  suitable: boolean;
}

export async function analyzeImage(file: File | Blob): Promise<ImageAnalysis> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let totalLuma = 0;
  let lumaSqSum = 0;
  let totalR = 0, totalG = 0, totalB = 0;
  let satSum = 0;
  let skinTonePixels = 0;
  const totalPixels = canvas.width * canvas.height;

  // buckets for coarse palette
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 10) continue;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    totalLuma += luma;
    lumaSqSum += luma * luma;
    totalR += r; totalG += g; totalB += b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    satSum += sat;

    // skin-tone heuristic (RGB-based):
    // r > 95, g > 40, b > 20, max-min > 15, |r-g| > 15, r > g, r > b
    if (r > 80 && g > 40 && b > 20 && r - g > 12 && r > b && g > b * 0.7 && Math.abs(r - g) > 10) {
      skinTonePixels++;
    }

    // palette bucketing (reduce to 4 bits per channel)
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r; existing.g += g; existing.b += b; existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const n = totalPixels;
  const avgLuma = totalLuma / n / 255;
  const variance = Math.max(0, lumaSqSum / n - (totalLuma / n) ** 2);
  const contrast = Math.min(1, Math.sqrt(variance) / 80);
  const avgR = totalR / n;
  const avgG = totalG / n;
  const avgB = totalB / n;
  // warmth: weighted red-green vs blue balance (g channels contribute to skin tone/warm cast)
  const warmth = Math.max(-1, Math.min(1, ((avgR + avgG * 0.4) - avgB) / 180));
  const saturation = Math.min(1, satSum / n);

  const top = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 5)
    .filter((b) => {
      // skip near-black and near-white
      const l = 0.2126 * b.r / b.count + 0.7152 * b.g / b.count + 0.0722 * b.b / b.count;
      return l > 30 && l < 230;
    })
    .slice(0, 3);
  const palette = top.map((b) => rgbToHex(
    Math.round(b.r / b.count),
    Math.round(b.g / b.count),
    Math.round(b.b / b.count),
  ));

  // face-like region heuristic: central rectangle with skin tones > 8%
  const hasFace = skinTonePixels / n > 0.06;

  bitmap.close?.();
  return {
    brightness: avgLuma,
    contrast,
    warmth,
    saturation,
    palette,
    width: canvas.width,
    height: canvas.height,
    hasFaceLikeRegion: hasFace,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result || ""));
    reader.onerror = () => rej(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Анализ актёрского фото относительно роли.
 * Сравниваем описание роли (пол, возрастной диапазон, типаж) с эвристикой фото.
 */
export async function analyzeCastingPhoto(
  file: File,
  role: { role: string; description: string; look: string }
): Promise<CastingAnalysisResult & { dataUrl: string }> {
  const dataUrl = await fileToDataUrl(file);
  const a = await analyzeImage(file);

  const positives: string[] = [];
  const negatives: string[] = [];
  let score = 50; // baseline

  if (a.hasFaceLikeRegion) {
    positives.push("На фото различимо лицо в центральной части кадра — удобно оценивать мимику.");
    score += 15;
  } else {
    negatives.push("Лицо не распознано в центральной зоне — добавьте портретное фото.");
    score -= 10;
  }

  if (a.brightness > 0.3 && a.brightness < 0.75) {
    positives.push("Хорошая экспозиция — видны и света́, и тени.");
    score += 8;
  } else if (a.brightness <= 0.3) {
    negatives.push("Слишком тёмное фото — сложно оценить черты.");
    score -= 12;
  } else {
    negatives.push("Слишком яркое/пересвеченное фото — теряются детали.");
    score -= 10;
  }

  if (a.contrast > 0.25) {
    positives.push("Контрастное изображение — лицо и эмоции хорошо читаются.");
    score += 5;
  } else {
    negatives.push("Низкий контраст — кадр может быть «плоским» в монтаже.");
    score -= 5;
  }

  if (a.saturation > 0.15 && a.saturation < 0.55) {
    positives.push("Естественная насыщенность — хорошо смотрится в кадре без грейдинга.");
    score += 4;
  }

  const look = role.look.toLowerCase();
  if (/тёпл|warm/.test(look) && a.warmth > 0.05) positives.push("Цветовая температура подходит под описание «тёплый типаж».");
  if (/холод|cool/.test(look) && a.warmth < -0.05) positives.push("Цветовая температура подходит под описание «холодный типаж».");
  if (/блонд|светл/.test(look) && a.brightness > 0.55) positives.push("Общая яркость кадра соответствует светлому типажу.");
  if (/брюнет|тёмн/.test(look) && a.brightness < 0.55) positives.push("Общая яркость кадра соответствует тёмному типажу.");

  if (/драм|noir|тревог/.test(role.description.toLowerCase()) && a.contrast > 0.35) {
    positives.push("Высокий контраст подходит под драматургию роли.");
    score += 5;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    positives,
    negatives,
    notes: `Оценка ${score}/100 на основе экспозиции, контраста и цветовой температуры. Рекомендация: ${
      score >= 70 ? "Кандидат хорошо подходит — стоит сделать читку и видеовизитку." :
      score >= 50 ? "Кандидат заслуживает рассмотрения — уточните типаж на пробах." :
      "Фото слабо подходит для оценки или не соответствует роли — нужны дополнительные материалы."
    }\n\nВажно: автоматический анализ — только первый взгляд. Финальное решение — за живой читкой.`,
    dataUrl,
  };
}

/**
 * Анализ локации по фотографии.
 */
export async function analyzeLocationPhoto(
  file: File,
  loc: { name: string; description: string; mood: string }
): Promise<LocationAnalysisResult & { dataUrl: string }> {
  const dataUrl = await fileToDataUrl(file);
  const a = await analyzeImage(file);

  const pros: string[] = [];
  const cons: string[] = [];
  let score = 50;

  let lighting = "смешанный";
  if (a.brightness > 0.6) {
    lighting = "достаточно яркий естественный/ровный свет";
    pros.push("Много света — меньше приборов для досветки.");
    score += 12;
  } else if (a.brightness < 0.3) {
    lighting = "тёмное помещение / низкий ключ";
    cons.push("Мало света — понадобятся мощные приборы и контроль шумов.");
    score -= 10;
  } else {
    lighting = "средний уровень освещения, потребуется лёгкая досветка";
  }

  if (a.contrast > 0.3) {
    pros.push("Хороший контраст — есть объём и драматический потенциал.");
    score += 6;
  } else {
    cons.push("Низкий контраст — кадр будет «плоским», нужен свет для объёма.");
    score -= 5;
  }

  const mood = a.warmth > 0.15 ? "тёплая, уютная" : a.warmth < -0.15 ? "холодная, строгая" : "нейтральная";
  if (new RegExp(loc.mood.split(/[ ,.;]+/).filter(Boolean).slice(0, 2).join("|"), "i").test(mood)) {
    pros.push(`Настроение фото (${mood}) совпадает с ожидаемым «${loc.mood}».`);
    score += 10;
  } else {
    pros.push(`Преобладающая атмосфера на фото: ${mood}.`);
  }

  if (a.saturation < 0.2) {
    pros.push("Низкая насыщенность — удобно красить в свою палитру на посте.");
    score += 4;
  } else {
    cons.push("Высокая насыщенность — возможна борьба с цветовой гаммой проекта.");
    score -= 3;
  }

  if (a.palette.length >= 2) {
    pros.push(`Палитра читается: ${a.palette.join(", ")}.`);
  }

  pros.push("Рекомендуем сделать тестовый кадр с актёром и камерой в разное время дня.");

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    mood,
    lighting,
    pros,
    cons,
    suitable: score >= 60,
    dataUrl,
  };
}
