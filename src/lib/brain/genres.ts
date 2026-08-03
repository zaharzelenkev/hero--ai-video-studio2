/** Жанровые семейства: единая точка правды для ветвлений темпа/приёмов.
 *  Новые жанры (gaming, fitness, wedding...) наследуют правильную механику,
 *  а не проваливаются в дефолтный medium. 
 *  Расширено для поддержки 16 типов проектов MONTIQ.
 */
export const FAST_GENRES = new Set([
  "tiktok", "ad", "gaming", "fitness", "musicvideo",
  "commercial", "promo", "instagram-reel", "music-video", "vlog",
  "youtube", "shorts", "reels"
]);
export const SLOW_GENRES = new Set([
  "travel", "cinematic", "documentary", "luxury", "wedding", "realestate",
  "short-film", "podcast", "interview", "talking-head", "educational", "tutorial"
]);
/** Жанры «говорящей головы»: обязательный B-Roll, PIP-перебивки, teaser-хук, сохранение речи. */
export const TALKING_GENRES = new Set([
  "podcast", "interview", "vlog", "education", "youtube",
  "talking-head", "tutorial", "educational", "documentary", "short-film"
]);
/** Дополнительные семейства для профессиональных типов */
export const PODCAST_GENRES = new Set(["podcast", "interview", "talking-head"]);
export const VERTICAL_GENRES = new Set(["tiktok", "instagram-reel", "shorts", "reels", "music-video"]);
export const CINEMATIC_GENRES = new Set(["travel", "cinematic", "documentary", "short-film", "wedding"]);
