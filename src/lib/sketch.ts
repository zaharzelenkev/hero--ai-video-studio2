/**
 * Локальный генератор эскизов раскадровки.
 *
 * Бесплатный вариант: без обращений к внешним API (Pollinations/Stable Horde требуют
 * интернет и часто блокируют CORS / имеют нестабильное качество), мы рисуем
 * стилизованные SVG-эскизы по описанию кадра. Это работает 100% локально в браузере,
 * не требует ключей и даёт стабильный результат, который режиссёр может использовать
 * как черновик визуализации.
 *
 * При необходимости к ним можно добавлять платные/внешние генераторы сверху.
 */

export interface SketchInput {
  shotSize: string;
  composition: string;
  lighting: string;
  mood: string;
  color: string;
  cameraMovement: string;
  description: string;
}

function pickPalette(colorHint: string, mood: string): { bg: string; mid: string; accent: string; dark: string; light: string } {
  const c = (colorHint + " " + mood).toLowerCase();
  if (/тепл|золот|закат|warm|gold|sunset/.test(c)) return { bg: "#2a1410", mid: "#c76a3a", accent: "#ffd089", dark: "#120a08", light: "#ffe5c2" };
  if (/холод|син|голуб|cool|blue|night|ночь/.test(c)) return { bg: "#0e1a2b", mid: "#3e6ba8", accent: "#9ec8ff", dark: "#050912", light: "#d7e6ff" };
  if (/драм|тёмн|dramatic|dark|noir|нуар/.test(c)) return { bg: "#141414", mid: "#353535", accent: "#d4af37", dark: "#000", light: "#f0e7c9" };
  if (/пастель|нежн|pastel|soft|dream/.test(c)) return { bg: "#2b2030", mid: "#b388b6", accent: "#ffd1e1", dark: "#140f18", light: "#fdeaf2" };
  if (/природ|зел|лес|nature|green|forest/.test(c)) return { bg: "#102214", mid: "#3d7a3a", accent: "#c7e8a0", dark: "#06100a", light: "#e2f2c8" };
  if (/футур|неон|cyber|tech|фиолет/.test(c)) return { bg: "#130a26", mid: "#6b2fbf", accent: "#29e7ff", dark: "#070312", light: "#c6b7ff" };
  return { bg: "#1a1620", mid: "#6d5a8c", accent: "#f0b96b", dark: "#08060d", light: "#f4e6d2" };
}

function compositionToLayout(composition: string, shotSize: string): { subjectW: number; subjectH: number; subjectX: number; subjectY: number; framing: string } {
  const c = composition.toLowerCase();
  const s = shotSize.toLowerCase();
  let subjectW = 0.4;
  let subjectH = 0.6;
  let subjectX = 0.5;
  let subjectY = 0.55;
  let framing = "center";

  if (/ecu|крайне крупн|детал/.test(s)) { subjectW = 0.45; subjectH = 0.45; subjectY = 0.5; framing = "ecu"; }
  else if (/cu|крупн/.test(s)) { subjectW = 0.35; subjectH = 0.55; subjectY = 0.5; framing = "cu"; }
  else if (/ms|средн/.test(s)) { subjectW = 0.32; subjectH = 0.72; subjectY = 0.6; framing = "ms"; }
  else if (/ws|wide|общ|дальн/.test(s)) { subjectW = 0.22; subjectH = 0.45; subjectY = 0.68; framing = "ws"; }
  else if (/els|сверх.?общ/.test(s)) { subjectW = 0.12; subjectH = 0.28; subjectY = 0.74; framing = "els"; }

  if (/трет|third|правил/.test(c)) { subjectX = 0.32; }
  else if (/справа|right/.test(c)) { subjectX = 0.75; }
  else if (/слева|left/.test(c)) { subjectX = 0.25; }
  else if (/центр|center/.test(c)) { subjectX = 0.5; }
  else if (/симметр|symmetr/.test(c)) { subjectX = 0.5; }

  if (/верх|top|низ|bottom|нижн/.test(c)) {
    subjectY = /верх|top/.test(c) ? 0.3 : 0.78;
  }
  return { subjectW, subjectH, subjectX, subjectY, framing };
}

function cameraMotionArrow(movement: string): string {
  const m = movement.toLowerCase();
  if (/зум.*в|zoom.?in|наезд/.test(m)) return "zoom-in";
  if (/зум.*вых|zoom.?out|отъезд/.test(m)) return "zoom-out";
  if (/панор.*прав|pan.?right|вправо/.test(m)) return "pan-right";
  if (/панор.*лев|pan.?left|влево/.test(m)) return "pan-left";
  if (/трекинг|tracking|след|долли|dolly/.test(m)) return "tracking";
  if (/кран|crane|вверх/.test(m)) return "crane-up";
  if (/стедикам|steadicam|плавн/.test(m)) return "float";
  if (/ручн|handheld|тряск/.test(m)) return "shake";
  if (/статич|static|штатив|tripod/.test(m)) return "static";
  return "static";
}

function lightingLayers(lighting: string, pal: ReturnType<typeof pickPalette>, w: number, h: number): string {
  const l = lighting.toLowerCase();
  let overlay = "";
  if (/контр|contour|rim|back.?light/.test(l)) {
    overlay += `<ellipse cx="${w * 0.5}" cy="${h * 0.35}" rx="${w * 0.6}" ry="${h * 0.28}" fill="${pal.light}" opacity="0.25" />`;
  }
  if (/боков|side/.test(l)) {
    overlay += `<rect x="0" y="0" width="${w * 0.5}" height="${h}" fill="url(#sideShade)" />`;
  }
  if (/низк|low.?key|жёстк|hard|драм/.test(l)) {
    overlay += `<rect x="0" y="0" width="${w}" height="${h}" fill="#000" opacity="0.35" />`;
    overlay += `<radialGradient id="spot" cx="50%" cy="55%" r="50%"><stop offset="0%" stop-color="${pal.light}" stop-opacity="0.6"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    overlay += `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#spot)" />`;
  }
  if (/высок|high.?key|мягк|soft|днев|day/.test(l)) {
    overlay += `<rect x="0" y="0" width="${w}" height="${h}" fill="${pal.light}" opacity="0.18" />`;
  }
  if (/неон|neon|фиолет|син/.test(l)) {
    overlay += `<rect x="0" y="0" width="${w}" height="${h}" fill="${pal.accent}" opacity="0.15" style="mix-blend-mode:screen" />`;
  }
  if (/контраст|contrast|силуэт/.test(l)) {
    overlay += `<rect x="0" y="0" width="${w}" height="${h}" fill="#000" opacity="0.55" />`;
  }
  return overlay;
}

/**
 * Генерирует эскиз кадра в формате SVG (как data URL).
 * Возвращает строку data:image/svg+xml;utf8,...
 */
export function generateSketchDataUrl(input: SketchInput, index: number): string {
  const w = 640;
  const h = 360;
  const pal = pickPalette(input.color, input.mood);
  const layout = compositionToLayout(input.composition, input.shotSize);
  const motion = cameraMotionArrow(input.cameraMovement);

  const subjX = layout.subjectX * w;
  const subjY = layout.subjectY * h;
  const subjW = layout.subjectW * w;
  const subjH = layout.subjectH * h;

  // Person silhouette (simplified): head + body
  const headR = Math.min(subjW, subjH) * (layout.framing === "ecu" ? 0.55 : 0.18);
  const headCy = subjY - (layout.framing === "ecu" || layout.framing === "cu" ? 0 : subjH * 0.32);

  let subject = "";
  if (layout.framing === "ecu" || layout.framing === "cu") {
    // Just a head
    subject = `
      <ellipse cx="${subjX}" cy="${headCy}" rx="${headR}" ry="${headR * 1.15}" fill="${pal.mid}" />
      <ellipse cx="${subjX - headR * 0.3}" cy="${headCy - headR * 0.1}" rx="${headR * 0.08}" ry="${headR * 0.05}" fill="${pal.dark}" />
      <ellipse cx="${subjX + headR * 0.3}" cy="${headCy - headR * 0.1}" rx="${headR * 0.08}" ry="${headR * 0.05}" fill="${pal.dark}" />
      <path d="M ${subjX - headR * 0.2} ${headCy + headR * 0.2} Q ${subjX} ${headCy + headR * 0.35} ${subjX + headR * 0.2} ${headCy + headR * 0.2}" stroke="${pal.dark}" stroke-width="2" fill="none" />
    `;
  } else {
    // head + shoulders / body
    subject = `
      <rect x="${subjX - subjW * 0.5}" y="${subjY - subjH * 0.05}" width="${subjW}" height="${subjH}" rx="${subjW * 0.25}" fill="${pal.mid}" />
      <ellipse cx="${subjX}" cy="${headCy}" rx="${headR}" ry="${headR * 1.15}" fill="${pal.light}" />
    `;
  }

  // Rule-of-thirds grid
  const grid = `
    <line x1="${w / 3}" y1="0" x2="${w / 3}" y2="${h}" stroke="#fff" stroke-opacity="0.12" stroke-dasharray="3 4" />
    <line x1="${(2 * w) / 3}" y1="0" x2="${(2 * w) / 3}" y2="${h}" stroke="#fff" stroke-opacity="0.12" stroke-dasharray="3 4" />
    <line x1="0" y1="${h / 3}" x2="${w}" y2="${h / 3}" stroke="#fff" stroke-opacity="0.12" stroke-dasharray="3 4" />
    <line x1="0" y1="${(2 * h) / 3}" x2="${w}" y2="${(2 * h) / 3}" stroke="#fff" stroke-opacity="0.12" stroke-dasharray="3 4" />
  `;

  // Horizon / ground line for wide shots
  let horizon = "";
  if (layout.framing === "ws" || layout.framing === "els") {
    const gy = h * 0.72;
    horizon = `
      <rect x="0" y="${gy}" width="${w}" height="${h - gy}" fill="${pal.dark}" opacity="0.55"/>
      <line x1="0" y1="${gy}" x2="${w}" y2="${gy}" stroke="${pal.accent}" stroke-opacity="0.3"/>
    `;
  }

  // Motion arrows overlay
  const motionArrow = (() => {
    const color = "#ffd166";
    switch (motion) {
      case "zoom-in":
        return `<g stroke="${color}" stroke-width="3" fill="none" opacity="0.85">
          <rect x="${w * 0.18}" y="${h * 0.18}" width="${w * 0.64}" height="${h * 0.64}" />
          <rect x="${w * 0.35}" y="${h * 0.35}" width="${w * 0.3}" height="${h * 0.3}" />
          <path d="M${w * 0.18} ${h * 0.18} L${w * 0.35} ${h * 0.35} M${w * 0.82} ${h * 0.18} L${w * 0.65} ${h * 0.35} M${w * 0.18} ${h * 0.82} L${w * 0.35} ${h * 0.65} M${w * 0.82} ${h * 0.82} L${w * 0.65} ${h * 0.65}" />
        </g>`;
      case "zoom-out":
        return `<g stroke="${color}" stroke-width="3" fill="none" opacity="0.85">
          <rect x="${w * 0.18}" y="${h * 0.18}" width="${w * 0.64}" height="${h * 0.64}" />
          <rect x="${w * 0.35}" y="${h * 0.35}" width="${w * 0.3}" height="${h * 0.3}" />
          <path d="M${w * 0.35} ${h * 0.35} L${w * 0.18} ${h * 0.18} M${w * 0.65} ${h * 0.35} L${w * 0.82} ${h * 0.18} M${w * 0.35} ${h * 0.65} L${w * 0.18} ${h * 0.82} M${w * 0.65} ${h * 0.65} L${w * 0.82} ${h * 0.82}" />
        </g>`;
      case "pan-right":
        return `<g stroke="${color}" stroke-width="4" fill="${color}" opacity="0.85">
          <path d="M${w * 0.2} ${h * 0.5} L${w * 0.8} ${h * 0.5}" />
          <path d="M${w * 0.8} ${h * 0.5} L${w * 0.72} ${h * 0.42} M${w * 0.8} ${h * 0.5} L${w * 0.72} ${h * 0.58}" />
        </g>`;
      case "pan-left":
        return `<g stroke="${color}" stroke-width="4" fill="${color}" opacity="0.85">
          <path d="M${w * 0.8} ${h * 0.5} L${w * 0.2} ${h * 0.5}" />
          <path d="M${w * 0.2} ${h * 0.5} L${w * 0.28} ${h * 0.42} M${w * 0.2} ${h * 0.5} L${w * 0.28} ${h * 0.58}" />
        </g>`;
      case "tracking":
        return `<g stroke="${color}" stroke-width="3" fill="none" opacity="0.85">
          <path d="M${w * 0.1} ${h * 0.6} Q${w * 0.5} ${h * 0.4} ${w * 0.9} ${h * 0.6}" />
          <circle cx="${w * 0.5}" cy="${h * 0.5}" r="4" fill="${color}"/>
        </g>`;
      case "crane-up":
        return `<g stroke="${color}" stroke-width="4" fill="${color}" opacity="0.85">
          <path d="M${w * 0.5} ${h * 0.8} L${w * 0.5} ${h * 0.2}" />
          <path d="M${w * 0.5} ${h * 0.2} L${w * 0.42} ${h * 0.3} M${w * 0.5} ${h * 0.2} L${w * 0.58} ${h * 0.3}" />
        </g>`;
      case "shake":
        return `<g stroke="${color}" stroke-width="2" fill="none" opacity="0.7">
          <path d="M${w * 0.1} ${h * 0.1} L${w * 0.15} ${h * 0.15} L${w * 0.1} ${h * 0.2} L${w * 0.2} ${h * 0.18} L${w * 0.18} ${h * 0.1}" />
          <path d="M${w * 0.85} ${h * 0.85} L${w * 0.9} ${h * 0.8} L${w * 0.85} ${h * 0.75} L${w * 0.78} ${h * 0.8}" />
        </g>`;
      case "float":
        return `<g stroke="${color}" stroke-width="2" fill="none" opacity="0.7" stroke-dasharray="4 4">
          <path d="M${w * 0.1} ${h * 0.3} Q${w * 0.3} ${h * 0.25} ${w * 0.5} ${h * 0.3} T${w * 0.9} ${h * 0.3}" />
        </g>`;
      default:
        return "";
    }
  })();

  // Vignette
  const vignette = `<radialGradient id="vig${index}" cx="50%" cy="55%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/></radialGradient><rect x="0" y="0" width="${w}" height="${h}" fill="url(#vig${index})" />`;

  // Top label bar
  const label = `
    <rect x="0" y="0" width="${w}" height="26" fill="#000" opacity="0.6"/>
    <text x="10" y="18" font-family="ui-monospace, Menlo, monospace" font-size="13" fill="#ffe08a" font-weight="700">SHOT ${String(index).padStart(2, "0")} · ${input.shotSize.toUpperCase()}</text>
    <text x="${w - 10}" y="18" font-family="ui-monospace, Menlo, monospace" font-size="11" fill="#fff" text-anchor="end" opacity="0.85">${input.cameraMovement}</text>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal.bg}"/>
      <stop offset="100%" stop-color="${pal.dark}"/>
    </linearGradient>
    <linearGradient id="sideShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg${index})"/>
  ${horizon}
  <!-- ambient accent circle -->
  <circle cx="${w * 0.82}" cy="${h * 0.22}" r="${w * 0.12}" fill="${pal.accent}" opacity="0.18"/>
  ${subject}
  ${grid}
  ${lightingLayers(input.lighting, pal, w, h)}
  ${motionArrow}
  ${vignette}
  ${label}
</svg>`;

  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
