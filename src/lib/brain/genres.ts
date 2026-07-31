/** Жанровые семейства: единая точка правды для ветвлений темпа/приёмов.
 *  Новые жанры (gaming, fitness, wedding...) наследуют правильную механику,
 *  а не проваливаются в дефолтный medium. */
export const FAST_GENRES = new Set(["tiktok", "ad", "gaming", "fitness", "musicvideo"]);
export const SLOW_GENRES = new Set(["travel", "cinematic", "documentary", "luxury", "wedding", "realestate"]);
/** Жанры «говорящей головы»: обязательный B-Roll, PIP-перебивки, teaser-хук. */
export const TALKING_GENRES = new Set(["podcast", "interview", "vlog", "education", "youtube"]);
