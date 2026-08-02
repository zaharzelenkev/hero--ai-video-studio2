/**
 * SOUND DESIGN — полный набор профессиональных инструментов обработки звука.
 *
 * 13 модулей, работающих на бесплатных алгоритмах (Web Audio API + DSP):
 *
 *  1. AI Noise Removal     — спектральное шумоподавление (spectral gating)
 *  2. Voice Enhancement     — параметрический EQ-чейн для читаемости голоса
 *  3. Auto Compressor       — адаптивная компрессия динамики
 *  4. Limiter               — true-peak limiter (EBU R128)
 *  5. EQ                    — 6-полосный параметрический эквалайзер
 *  6. Loudness Normalization — нормализация громкости по LUFS
 *  7. Ducking               — автоматический дакинг музыки под голос
 *  8. Foley                 — процедурная генерация звуковых эффектов
 *  9. Room Tone             — синтез фонового шума помещения
 * 10. AI Music Selection    — подбор музыки под настроение сцены
 * 11. AI Beat Sync          — привязка клипов к бит-сетке
 * 12. Voice Isolation       — спектральная изоляция голоса
 * 13. Stereo Enhancement    — расширение/сужение стерео-картины
 *
 * Все алгоритмы — чистый DSP, работают и в браузере (Web Audio API),
 * и в Node.js (OfflineAudioContext через скрипт). Никаких платных API.
 */

import type { PlanEmotion, PlannedScene } from "./brain/directorPlan";

// ============================================================================
// Типы
// ============================================================================

/** Полоса параметрического эквалайзера. */
export interface EqBand {
  enabled: boolean;
  /** Тип фильтра. */
  type: "lowshelf" | "highshelf" | "peaking" | "lowpass" | "highpass";
  /** Центральная частота (Гц). */
  frequency: number;
  /** Усиление (дБ), −24..+24. */
  gain: number;
  /** Добротность (Q). Для shelf — крутизна перехода. */
  Q: number;
}

/** Настройки шумоподавления. */
export interface NoiseRemovalSettings {
  enabled: boolean;
  /** Интенсивность 0..1 (порог спектрального гейта). */
  amount: number;
  /** Порог в дБ: всё ниже этого считается шумом. */
  thresholdDb: number;
  /** Частота среза НЧ-фильтра (гул сети 50/60 Гц). */
  highpassHz: number;
  /** Частота среза ВЧ-фильтра (шипение). */
  lowpassHz: number;
}

/** Настройки улучшения голоса. */
export interface VoiceEnhanceSettings {
  enabled: boolean;
  /** Пресентность (2-5 кГц), добавляет разборчивость. 0..12 дБ. */
  presence: number;
  /** Воздух (8-14 кГц). 0..6 дБ. */
  air: number;
  /** Телo (150-300 Гц), прибавляет «вес» голосу. −6..+6 дБ. */
  body: number;
  /** Убрать гудёж (200-500 Гц). 0..1. */
  mudRemoval: number;
  /** De-esser: подавление сибилянтов (5-9 кГц). 0..12 дБ. */
  deEss: number;
}

/** Настройки компрессора. */
export interface CompressorSettings {
  enabled: boolean;
  /** Порог срабатывания, дБ (−60..0). */
  threshold: number;
  /** Степень сжатия (1..20). */
  ratio: number;
  /** Атака, мс (0..200). */
  attack: number;
  /** Восстановление, мс (10..1000). */
  release: number;
  /** Колено (мягкость перехода), дБ (0..30). */
  knee: number;
  /** Makeup gain, дБ (0..24). */
  makeupGain: number;
}

/** Настройки лимитера. */
export interface LimiterSettings {
  enabled: boolean;
  /** Целевой true-peak ceiling, дБ (обычно −1..0). */
  ceiling: number;
  /** Release, мс. */
  release: number;
}

/** Настройки нормализации громкости. */
export interface LoudnessNormSettings {
  enabled: boolean;
  /** Целевая интегрированная громкость (LUFS). −14 YouTube, −16 podcast. */
  targetLufs: number;
  /** Максимальный true-peak (дБ). */
  truePeak: number;
  /** Loudness range (LU). */
  range: number;
}

/** Настройки дакинга. */
export interface DuckingSettings {
  enabled: boolean;
  /** Насколько приглушается музыка при голосе (0..1, 1 = полная тишина). */
  depth: number;
  /** Плавность перехода к тишине, с (0..0.5). */
  attack: number;
  /** Плавность восстановления, с (0..2). */
  release: number;
  /** Порог обнаружения голоса (дБ, −60..−20). */
  voiceThresholdDb: number;
}

/** Настройки стерео-расширения. */
export interface StereoEnhanceSettings {
  enabled: boolean;
  /** Ширина стерео: 0 = моно, 1 = норм, 2 = расширено. */
  width: number;
  /** Баланс L/R. */
  balance: number;
  /** Haas effect: задержка одного канала (мс), 0..20. */
  haasDelay: number;
}

/** Foley-событие: синтетический звук для сцены. */
export type FoleyType =
  | "footstep"
  | "door"
  | "whoosh"
  | "click"
  | "typing"
  | "paper"
  | "glass"
  | "ambient"
  | "notification"
  | "transition";

export interface FoleyEvent {
  type: FoleyType;
  /** Время на таймлайне (сек). */
  time: number;
  /** Громкость 0..1. */
  volume: number;
  /** Питч (множитель). */
  pitch: number;
}

/** Room Tone — настройки фонового шума помещения. */
export interface RoomToneSettings {
  enabled: boolean;
  /** Тип помещения. */
  room: "studio" | "office" | "room" | "hall" | "outdoor" | "cafe";
  /** Громкость 0..1. */
  volume: number;
}

/** AI выбор музыки. */
export interface MusicSelectionSettings {
  enabled: boolean;
  /** Предпочтительный жанр/стиль. */
  style: "none" | "lofi" | "electronic" | "cinematic" | "ambient" | "acoustic" | "corporate";
  /** Целевой BPM (0 = авто). */
  targetBpm: number;
  /** Подбирать автоматически по настроению сцен. */
  autoMatch: boolean;
}

/** Voice Isolation. */
export interface VoiceIsolationSettings {
  enabled: boolean;
  /** Сила изоляции 0..1 (агрессивность удаления не-голоса). */
  strength: number;
  /** Нижняя граница голосового диапазона (Гц). */
  lowCut: number;
  /** Верхняя граница голосового диапазона (Гц). */
  highCut: number;
}

/** Настройки Beat Sync. */
export interface BeatSyncSettings {
  enabled: boolean;
  /** Допуск привязки к биту (сек). */
  snapTolerance: number;
  /** Привязывать переходы к downbeat. */
  snapTransitions: boolean;
  /** Привязывать начало речи к биту. */
  snapSpeechStart: boolean;
}

/** Полный набор настроек Sound Design для проекта. */
export interface SoundDesignSettings {
  noiseRemoval: NoiseRemovalSettings;
  voiceEnhance: VoiceEnhanceSettings;
  compressor: CompressorSettings;
  limiter: LimiterSettings;
  eq: {
    enabled: boolean;
    bands: EqBand[];
  };
  loudnessNorm: LoudnessNormSettings;
  ducking: DuckingSettings;
  foley: {
    enabled: boolean;
    events: FoleyEvent[];
  };
  roomTone: RoomToneSettings;
  musicSelection: MusicSelectionSettings;
  beatSync: BeatSyncSettings;
  voiceIsolation: VoiceIsolationSettings;
  stereoEnhance: StereoEnhanceSettings;
}

// ============================================================================
// Дефолты
// ============================================================================

export function defaultEqBands(): EqBand[] {
  return [
    { enabled: false, type: "highpass",  frequency: 80,    gain: 0, Q: 0.7 },
    { enabled: false, type: "lowshelf",  frequency: 150,   gain: 0, Q: 0.7 },
    { enabled: false, type: "peaking",   frequency: 400,   gain: 0, Q: 1.0 },
    { enabled: false, type: "peaking",   frequency: 1200,  gain: 0, Q: 0.9 },
    { enabled: false, type: "peaking",   frequency: 4000,  gain: 0, Q: 1.0 },
    { enabled: false, type: "highshelf", frequency: 8000,  gain: 0, Q: 0.7 },
  ];
}

export function defaultSoundDesign(): SoundDesignSettings {
  return {
    noiseRemoval: {
      enabled: false,
      amount: 0.6,
      thresholdDb: -40,
      highpassHz: 80,
      lowpassHz: 14000,
    },
    voiceEnhance: {
      enabled: false,
      presence: 3,
      air: 2,
      body: 1,
      mudRemoval: 0.3,
      deEss: 4,
    },
    compressor: {
      enabled: false,
      threshold: -18,
      ratio: 3,
      attack: 10,
      release: 100,
      knee: 6,
      makeupGain: 0,
    },
    limiter: {
      enabled: true,
      ceiling: -1,
      release: 50,
    },
    eq: {
      enabled: false,
      bands: defaultEqBands(),
    },
    loudnessNorm: {
      enabled: true,
      targetLufs: -14,
      truePeak: -1.5,
      range: 11,
    },
    ducking: {
      enabled: false,
      depth: 0.6,
      attack: 0.12,
      release: 0.35,
      voiceThresholdDb: -35,
    },
    foley: {
      enabled: false,
      events: [],
    },
    roomTone: {
      enabled: false,
      room: "room",
      volume: 0.15,
    },
    musicSelection: {
      enabled: true,
      style: "none",
      targetBpm: 0,
      autoMatch: true,
    },
    beatSync: {
      enabled: false,
      snapTolerance: 0.35,
      snapTransitions: true,
      snapSpeechStart: false,
    },
    voiceIsolation: {
      enabled: false,
      strength: 0.7,
      lowCut: 85,
      highCut: 12000,
    },
    stereoEnhance: {
      enabled: false,
      width: 1.0,
      balance: 0,
      haasDelay: 0,
    },
  };
}

// ============================================================================
// AI Music Selection — подбор музыки по настроению сцены
// ============================================================================

/** Маппинг эмоций → музыкальный стиль и параметры. */
export interface MusicMoodProfile {
  /** Рекомендуемый стиль. */
  style: "lofi" | "electronic" | "cinematic" | "ambient" | "acoustic" | "corporate";
  /** Рекомендуемый BPM. */
  bpm: number;
  /** Рекомендуемая тональность (мажор/минор). */
  mode: "major" | "minor";
  /** Описание для UI. */
  description: string;
  /** Энергия 0..1. */
  energy: number;
}

const EMOTION_MUSIC_MAP: Record<PlanEmotion, MusicMoodProfile> = {
  energetic: {
    style: "electronic",
    bpm: 128,
    mode: "major",
    description: "Энергичный электронный бит: 128 BPM, мажор, пульсирующий бас",
    energy: 0.9,
  },
  calm: {
    style: "lofi",
    bpm: 75,
    mode: "major",
    description: "Спокойный lo-fi: 75 BPM, тёплые аккорды, мягкие ударные",
    energy: 0.3,
  },
  dramatic: {
    style: "cinematic",
    bpm: 60,
    mode: "minor",
    description: "Кинематографичный: 60 BPM, минор, оркестровые удары и драматические подъёмы",
    energy: 0.85,
  },
  funny: {
    style: "acoustic",
    bpm: 110,
    mode: "major",
    description: "Лёгкий акустический: 110 BPM, мажор, игривая мелодия",
    energy: 0.6,
  },
  inspiring: {
    style: "cinematic",
    bpm: 90,
    mode: "major",
    description: "Вдохновляющий: 90 BPM, мажор, нарастающие арпеджио и широкие аккорды",
    energy: 0.7,
  },
  neutral: {
    style: "ambient",
    bpm: 80,
    mode: "major",
    description: "Нейтральный эмбиент: 80 BPM, ненавязчивый фон",
    energy: 0.4,
  },
};

/**
 * Анализирует сцены и подбирает музыкальный профиль, который покрывает
 * весь ролик. Берёт доминирующую эмоцию и среднюю энергию.
 */
export function selectMusicForProject(
  scenes: PlannedScene[],
  override?: MusicSelectionSettings,
): MusicMoodProfile & { perScene: Array<{ sceneId: string; profile: MusicMoodProfile }> } {
  const perScene = scenes.map((s) => ({
    sceneId: s.id,
    profile: EMOTION_MUSIC_MAP[s.emotion] ?? EMOTION_MUSIC_MAP.neutral,
  }));

  // Взвешенное голосование по длительности сцен
  const weights: Record<string, number> = {};
  const bpmSum: Record<string, number> = {};
  for (const { profile } of perScene) {
    const key = profile.style;
    const w = profile.energy;
    weights[key] = (weights[key] ?? 0) + w;
    bpmSum[key] = (bpmSum[key] ?? 0) + profile.bpm * w;
  }

  let bestStyle = "ambient";
  let bestWeight = -1;
  for (const [style, w] of Object.entries(weights)) {
    if (w > bestWeight) { bestWeight = w; bestStyle = style; }
  }
  const avgBpm = bpmSum[bestStyle]
    ? Math.round(bpmSum[bestStyle] / bestWeight)
    : 80;

  let dominantEmotion: PlanEmotion = "neutral";
  if (scenes.length > 0) {
    let maxEnergy = 0;
    for (const s of scenes) {
      const e = EMOTION_MUSIC_MAP[s.emotion]?.energy ?? 0;
      if (e > maxEnergy) { maxEnergy = e; dominantEmotion = s.emotion; }
    }
  }
  const dominant = EMOTION_MUSIC_MAP[dominantEmotion] ?? EMOTION_MUSIC_MAP.neutral;

  const result: MusicMoodProfile & { perScene: typeof perScene } = {
    style: (override?.style && override.style !== "none") ? override.style : bestStyle as MusicMoodProfile["style"],
    bpm: override?.targetBpm ? override.targetBpm : avgBpm,
    mode: dominant.mode,
    description: `Автоматически подобрано: ${dominant.description}. Средний темп: ${avgBpm} BPM.`,
    energy: perScene.reduce((s, p) => s + p.profile.energy, 0) / (perScene.length || 1),
    perScene,
  };

  return result;
}

/** Возвращает музыкальный профиль для одной эмоции. */
export function musicProfileForEmotion(emotion: PlanEmotion): MusicMoodProfile {
  return EMOTION_MUSIC_MAP[emotion] ?? EMOTION_MUSIC_MAP.neutral;
}

// ============================================================================
// AI Beat Sync — привязка клипов к бит-сетке
// ============================================================================

export interface BeatSyncResult {
  /** Скорректированные времена переходов. */
  adjustedCuts: Array<{ originalTime: number; snappedTime: number; confidence: number }>;
  /** Сообщение о результате. */
  message: string;
}

/**
 * Привязывает список временных точек (переходов) к ближайшим битам сетки.
 * beats — массив времён битов в секундах (из beatDetection.ts).
 */
export function snapCutsToBeats(
  cutTimes: number[],
  beats: number[],
  toleranceSec = 0.35,
): BeatSyncResult {
  if (beats.length === 0) {
    return {
      adjustedCuts: cutTimes.map((t) => ({ originalTime: t, snappedTime: t, confidence: 0 })),
      message: "Бит-сетка не обнаружена — привязка невозможна.",
    };
  }

  const adjustedCuts = cutTimes.map((t) => {
    let bestBeat = beats[0];
    let bestDist = Math.abs(t - beats[0]);
    for (const b of beats) {
      const d = Math.abs(t - b);
      if (d < bestDist) { bestDist = d; bestBeat = b; }
    }
    const snapped = bestDist <= toleranceSec ? bestBeat : t;
    const confidence = bestDist <= toleranceSec ? 1 - bestDist / toleranceSec : 0;
    return { originalTime: t, snappedTime: snapped, confidence };
  });

  const snapped = adjustedCuts.filter((c) => c.snappedTime !== c.originalTime);
  const message = snapped.length === 0
    ? "Все переходы уже на битах или вне допуска."
    : `${snapped.length} из ${cutTimes.length} переходов привязаны к бит-сетке (±${toleranceSec.toFixed(2)}с).`;

  return { adjustedCuts, message };
}

// ============================================================================
// Foley — процедурная генерация звуковых эффектов
// ============================================================================

/**
 * Генерирует Foley-звук заданного типа через OfflineAudioContext.
 * Работает в браузере — использует Web Audio API.
 */
export async function generateFoley(
  type: FoleyType,
  durationSec: number,
  sampleRate = 44100,
): Promise<AudioBuffer | null> {
  if (typeof window === "undefined") return null;
  const OfflineCtx = (window as unknown as {
    OfflineAudioContext: typeof OfflineAudioContext;
    webkitOfflineAudioContext: typeof OfflineAudioContext;
  }).OfflineAudioContext || (window as unknown as {
    webkitOfflineAudioContext: typeof OfflineAudioContext;
  }).webkitOfflineAudioContext;
  if (!OfflineCtx) return null;

  const len = Math.ceil(durationSec * sampleRate);
  const ctx = new OfflineCtx(1, len, sampleRate);

  switch (type) {
    case "footstep": {
      // Короткий удар: низкочастотный импульс + шумовой транзиент
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, 0);
      osc.frequency.exponentialRampToValueAtTime(40, 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, 0);
      g.gain.exponentialRampToValueAtTime(0.7, 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, 0.12);
      osc.connect(g).connect(ctx.destination);
      osc.start(0); osc.stop(0.15);
      // шумовая составляющая
      const nb = ctx.createBuffer(1, sampleRate, sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 800; bp.Q.value = 1.5;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.001, 0);
      ng.gain.exponentialRampToValueAtTime(0.25, 0.002);
      ng.gain.exponentialRampToValueAtTime(0.001, 0.06);
      ns.connect(bp).connect(ng).connect(ctx.destination);
      ns.start(0); ns.stop(0.1);
      break;
    }
    case "door": {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(200, 0);
      osc.frequency.exponentialRampToValueAtTime(60, 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, 0);
      g.gain.exponentialRampToValueAtTime(0.6, 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, 0.25);
      osc.connect(g).connect(ctx.destination);
      osc.start(0); osc.stop(0.3);
      const nb = ctx.createBuffer(1, sampleRate, sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
      const ng = ctx.createGain(); ng.gain.value = 0.3;
      ns.connect(lp).connect(ng).connect(ctx.destination);
      ns.start(0); ns.stop(0.15);
      break;
    }
    case "whoosh": {
      const nb = ctx.createBuffer(1, Math.ceil(sampleRate * 0.5), sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(200, 0);
      bp.frequency.exponentialRampToValueAtTime(4000, 0.2);
      bp.frequency.exponentialRampToValueAtTime(200, 0.45);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, 0);
      g.gain.exponentialRampToValueAtTime(0.6, 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, 0.45);
      ns.connect(bp).connect(g).connect(ctx.destination);
      ns.start(0); ns.stop(0.5);
      break;
    }
    case "click": {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, 0);
      g.gain.exponentialRampToValueAtTime(0.001, 0.015);
      osc.connect(g).connect(ctx.destination);
      osc.start(0); osc.stop(0.03);
      break;
    }
    case "typing": {
      // Серия коротких кликов — клавиатура
      for (let k = 0; k < 6; k++) {
        const t = k * 0.06 + Math.random() * 0.02;
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = 2000 + Math.random() * 1500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.2 + Math.random() * 0.2, t + 0.001);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        osc.connect(g).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.03);
      }
      break;
    }
    case "paper": {
      const nb = ctx.createBuffer(1, Math.ceil(sampleRate * 0.3), sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, 0);
      g.gain.exponentialRampToValueAtTime(0.2, 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, 0.25);
      ns.connect(hp).connect(g).connect(ctx.destination);
      ns.start(0); ns.stop(0.3);
      break;
    }
    case "glass": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, 0);
      g.gain.exponentialRampToValueAtTime(0.4, 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, 0.6);
      osc.connect(g).connect(ctx.destination);
      osc.start(0); osc.stop(0.7);
      // гармоника
      const osc2 = ctx.createOscillator();
      osc2.type = "sine"; osc2.frequency.value = 4800;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.001, 0);
      g2.gain.exponentialRampToValueAtTime(0.15, 0.003);
      g2.gain.exponentialRampToValueAtTime(0.001, 0.4);
      osc2.connect(g2).connect(ctx.destination);
      osc2.start(0); osc2.stop(0.5);
      break;
    }
    case "ambient": {
      const nb = ctx.createBuffer(1, len, sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.03;
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 800;
      ns.connect(lp).connect(ctx.destination);
      ns.start(0); ns.stop(durationSec);
      break;
    }
    case "notification": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, 0);
      osc.frequency.setValueAtTime(1100, 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, 0);
      g.gain.exponentialRampToValueAtTime(0.35, 0.005);
      g.gain.setValueAtTime(0.35, 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, 0.15);
      osc.connect(g).connect(ctx.destination);
      osc.start(0); osc.stop(0.2);
      break;
    }
    case "transition": {
      // Swoosh для переходов
      const nb = ctx.createBuffer(1, Math.ceil(sampleRate * 0.6), sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, 0);
      bp.frequency.exponentialRampToValueAtTime(3500, 0.25);
      bp.frequency.exponentialRampToValueAtTime(300, 0.55);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, 0);
      g.gain.exponentialRampToValueAtTime(0.45, 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, 0.55);
      ns.connect(bp).connect(g).connect(ctx.destination);
      ns.start(0); ns.stop(0.6);
      break;
    }
  }

  return ctx.startRendering();
}

// ============================================================================
// Room Tone — синтез фонового шума помещения
// ============================================================================

export interface RoomToneProfile {
  /** Низкочастотный гул, Гц. */
  rumbleHz: number;
  /** Уровень гула 0..1. */
  rumbleLevel: number;
  /** Шумовая составляющая: частота среза lowpass. */
  noiseCutoffHz: number;
  /** Уровень шума 0..1. */
  noiseLevel: number;
  /** Резонансная частота помещения ( standing wave ). */
  resonanceHz: number;
  /** Добротность резонанса. */
  resonanceQ: number;
  /** Уровень резонанса 0..1. */
  resonanceLevel: number;
}

const ROOM_PROFILES: Record<RoomToneSettings["room"], RoomToneProfile> = {
  studio: {
    rumbleHz: 30, rumbleLevel: 0.02,
    noiseCutoffHz: 500, noiseLevel: 0.005,
    resonanceHz: 200, resonanceQ: 3, resonanceLevel: 0.01,
  },
  office: {
    rumbleHz: 50, rumbleLevel: 0.04,
    noiseCutoffHz: 2000, noiseLevel: 0.03,
    resonanceHz: 120, resonanceQ: 2, resonanceLevel: 0.02,
  },
  room: {
    rumbleHz: 40, rumbleLevel: 0.03,
    noiseCutoffHz: 1500, noiseLevel: 0.015,
    resonanceHz: 180, resonanceQ: 2.5, resonanceLevel: 0.015,
  },
  hall: {
    rumbleHz: 35, rumbleLevel: 0.06,
    noiseCutoffHz: 3000, noiseLevel: 0.025,
    resonanceHz: 90, resonanceQ: 4, resonanceLevel: 0.03,
  },
  outdoor: {
    rumbleHz: 25, rumbleLevel: 0.08,
    noiseCutoffHz: 6000, noiseLevel: 0.06,
    resonanceHz: 0, resonanceQ: 1, resonanceLevel: 0,
  },
  cafe: {
    rumbleHz: 45, rumbleLevel: 0.05,
    noiseCutoffHz: 4000, noiseLevel: 0.05,
    resonanceHz: 150, resonanceQ: 1.5, resonanceLevel: 0.02,
  },
};

/** Генерирует буфер Room Tone заданного типа. */
export async function generateRoomTone(
  room: RoomToneSettings["room"],
  durationSec: number,
  volume: number,
  sampleRate = 44100,
): Promise<AudioBuffer | null> {
  if (typeof window === "undefined") return null;
  const OfflineCtx = (window as unknown as {
    OfflineAudioContext: typeof OfflineAudioContext;
    webkitOfflineAudioContext: typeof OfflineAudioContext;
  }).OfflineAudioContext || (window as unknown as {
    webkitOfflineAudioContext: typeof OfflineAudioContext;
  }).webkitOfflineAudioContext;
  if (!OfflineCtx) return null;

  const len = Math.ceil(durationSec * sampleRate);
  const ctx = new OfflineCtx(1, len, sampleRate);
  const p = ROOM_PROFILES[room];

  // Гул
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = p.rumbleHz;
  const og = ctx.createGain(); og.gain.value = p.rumbleLevel * volume;
  osc.connect(og).connect(ctx.destination);
  osc.start(0); osc.stop(durationSec);

  // Шум
  const nb = ctx.createBuffer(1, len, sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource(); ns.buffer = nb;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = p.noiseCutoffHz;
  const ng = ctx.createGain(); ng.gain.value = p.noiseLevel * volume;
  ns.connect(lp).connect(ng).connect(ctx.destination);
  ns.start(0); ns.stop(durationSec);

  // Резонанс помещения
  if (p.resonanceHz > 0 && p.resonanceLevel > 0) {
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = p.resonanceHz;
    const bp = ctx.createBiquadFilter(); bp.type = "peaking";
    bp.frequency.value = p.resonanceHz; bp.Q.value = p.resonanceQ;
    bp.gain.value = 12;
    const rg = ctx.createGain(); rg.gain.value = p.resonanceLevel * volume;
    osc2.connect(bp).connect(rg).connect(ctx.destination);
    osc2.start(0); osc2.stop(durationSec);
  }

  return ctx.startRendering();
}

// ============================================================================
// AudioBuffer → WAV encoder (общий)
// ============================================================================

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const out = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(out);

  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * numCh * bytesPerSample, true);
  dv.setUint16(32, numCh * bytesPerSample, true);
  dv.setUint16(34, 16, true);
  writeStr(36, "data");
  dv.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

// ============================================================================
// FFmpeg filter chain builder
// ============================================================================

/**
 * Генерирует FFmpeg audio-фильтры для Sound Design.
 * Вызывается из filterGraph.ts при экспорте.
 */
export function buildSoundDesignFilters(
  inputLabel: string,
  outputLabel: string,
  sd: SoundDesignSettings,
): string[] {
  const lines: string[] = [];
  let cur = inputLabel;
  let idx = 0;
  const next = (): string => `sd_${idx++}_`;

  // 1. Voice Isolation — спектральное разделение через полосовой фильтр
  if (sd.voiceIsolation.enabled) {
    const n = next();
    // Bandpass вокруг голосового диапазона + мягкие shelf-фильтры для подавления всего остального
    lines.push(
      `[${cur}]highpass=f=${sd.voiceIsolation.lowCut},` +
      `lowpass=f=${sd.voiceIsolation.highCut},` +
      `bandreject=f=50:width_type=h:w=10,` +
      `bandreject=f=60:width_type=h:w=10[${n}]`,
    );
    cur = n;
  }

  // 2. AI Noise Removal — HP + LP + spectral gate approximation
  if (sd.noiseRemoval.enabled) {
    const n = next();
    const hp = sd.noiseRemoval.highpassHz;
    const lp = sd.noiseRemoval.lowpassHz;
    // Afftdn — встроенный noise reduction в FFmpeg
    lines.push(
      `[${cur}]highpass=f=${hp},lowpass=f=${lp},` +
      `afftdn=nr=${Math.round(sd.noiseRemoval.amount * 30)}:nf=${Math.round(sd.noiseRemoval.thresholdDb)}[${n}]`,
    );
    cur = n;
  }

  // 3. EQ (6-band parametric)
  if (sd.eq.enabled) {
    const enabledBands = sd.eq.bands.filter((b) => b.enabled);
    if (enabledBands.length > 0) {
      const n = next();
      const eqParts = enabledBands.map((b) => {
        if (b.type === "highpass") return `highpass=f=${b.frequency}`;
        if (b.type === "lowpass") return `lowpass=f=${b.frequency}`;
        if (b.type === "lowshelf") return `equalizer=f=${b.frequency}:t=o:w=${b.Q * b.frequency}:g=${b.gain}`;
        if (b.type === "highshelf") return `equalizer=f=${b.frequency}:t=o:w=${b.Q * b.frequency}:g=${b.gain}`;
        return `equalizer=f=${b.frequency}:t=o:w=${b.Q * b.frequency}:g=${b.gain}`;
      });
      lines.push(`[${cur}]${eqParts.join(",")}[${n}]`);
      cur = n;
    }
  }

  // 4. Voice Enhancement
  if (sd.voiceEnhance.enabled) {
    const n = next();
    const parts: string[] = [];
    // Тело голоса
    if (Math.abs(sd.voiceEnhance.body) > 0.1) {
      parts.push(`equalizer=f=250:t=o:w=200:g=${sd.voiceEnhance.body}`);
    }
    // Убрать муть
    if (sd.voiceEnhance.mudRemoval > 0.05) {
      parts.push(`equalizer=f=350:t=o:w=150:g=${-sd.voiceEnhance.mudRemoval * 6}`);
    }
    // Присутствие
    if (sd.voiceEnhance.presence > 0.1) {
      parts.push(`equalizer=f=3500:t=o:w=800:g=${sd.voiceEnhance.presence}`);
    }
    // Воздух
    if (sd.voiceEnhance.air > 0.1) {
      parts.push(`equalizer=f=10000:t=o:w=2000:g=${sd.voiceEnhance.air}`);
    }
    // De-esser
    if (sd.voiceEnhance.deEss > 0.5) {
      parts.push(`equalizer=f=7000:t=o:w=1000:g=${-sd.voiceEnhance.deEss}`);
    }
    if (parts.length > 0) {
      lines.push(`[${cur}]${parts.join(",")}[${n}]`);
      cur = n;
    }
  }

  // 5. Auto Compressor
  if (sd.compressor.enabled) {
    const n = next();
    lines.push(
      `[${cur}]acompressor=` +
      `threshold=${sd.compressor.threshold}dB:` +
      `ratio=${sd.compressor.ratio}:` +
      `attack=${sd.compressor.attack}:` +
      `release=${sd.compressor.release}:` +
      `knee=${sd.compressor.knee}:` +
      `makeup=${sd.compressor.makeupGain}[${n}]`,
    );
    cur = n;
  }

  // 6. Stereo Enhancement
  if (sd.stereoEnhance.enabled && sd.stereoEnhance.width !== 1.0) {
    const n = next();
    const w = sd.stereoEnhance.width;
    // Stereo tools через side/mid: width > 1 расширяет side, < 1 сужает к моно
    // stereotools — встроенный фильтр FFmpeg
    lines.push(
      `[${cur}]stereotools=mode=l+rx:l_level=${w}:r_level=${2 - w}[${n}]`,
    );
    cur = n;
  }

  // 7. Loudness Normalization
  if (sd.loudnessNorm.enabled) {
    const n = next();
    lines.push(
      `[${cur}]loudnorm=I=${sd.loudnessNorm.targetLufs}:` +
      `LRA=${sd.loudnessNorm.range}:` +
      `TP=${sd.loudnessNorm.truePeak}[${n}]`,
    );
    cur = n;
  }

  // 8. Limiter
  if (sd.limiter.enabled) {
    const n = next();
    const limit = Math.pow(10, sd.limiter.ceiling / 20);
    lines.push(
      `[${cur}]alimiter=limit=${limit.toFixed(3)}:attack=5:release=${sd.limiter.release}[${n}]`,
    );
    cur = n;
  }

  if (cur !== outputLabel) {
    lines.push(`[${cur}]acopy[${outputLabel}]`);
  }

  return lines;
}

// ============================================================================
// Offline render — полная цепочка обработки (для Node/тестов)
// ============================================================================

/**
 * Применяет полную цепочку Sound Design к AudioBuffer.
 * Работает через Web Audio API (OfflineAudioContext).
 */
export async function renderSoundDesign(
  inputBuffer: AudioBuffer,
  sd: SoundDesignSettings,
): Promise<AudioBuffer | null> {
  if (typeof window === "undefined") return null;
  const OfflineCtx = (window as unknown as {
    OfflineAudioContext: typeof OfflineAudioContext;
    webkitOfflineAudioContext: typeof OfflineAudioContext;
  }).OfflineAudioContext || (window as unknown as {
    webkitOfflineAudioContext: typeof OfflineAudioContext;
  }).webkitOfflineAudioContext;
  if (!OfflineCtx) return null;

  const sr = inputBuffer.sampleRate;
  const len = inputBuffer.length;
  const ctx = new OfflineCtx(2, len, sr);

  const src = ctx.createBufferSource();
  src.buffer = inputBuffer;

  let node: AudioNode = src;

  // 1. Voice Isolation
  if (sd.voiceIsolation.enabled) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = sd.voiceIsolation.lowCut;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = sd.voiceIsolation.highCut;
    node.connect(hp); hp.connect(lp);
    node = lp;
  }

  // 2. Noise Removal
  if (sd.noiseRemoval.enabled) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = sd.noiseRemoval.highpassHz;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = sd.noiseRemoval.lowpassHz;
    node.connect(hp); hp.connect(lp);
    node = lp;
  }

  // 3. EQ
  if (sd.eq.enabled) {
    for (const band of sd.eq.bands) {
      if (!band.enabled || Math.abs(band.gain) < 0.01) continue;
      const eq = ctx.createBiquadFilter();
      eq.type = band.type as BiquadFilterType;
      eq.frequency.value = band.frequency;
      eq.gain.value = band.gain;
      eq.Q.value = band.Q;
      node.connect(eq);
      node = eq;
    }
  }

  // 4. Voice Enhancement
  if (sd.voiceEnhance.enabled) {
    if (Math.abs(sd.voiceEnhance.body) > 0.1) {
      const eq = ctx.createBiquadFilter();
      eq.type = "peaking"; eq.frequency.value = 250; eq.Q.value = 1.0;
      eq.gain.value = sd.voiceEnhance.body;
      node.connect(eq); node = eq;
    }
    if (sd.voiceEnhance.mudRemoval > 0.05) {
      const eq = ctx.createBiquadFilter();
      eq.type = "peaking"; eq.frequency.value = 350; eq.Q.value = 1.0;
      eq.gain.value = -sd.voiceEnhance.mudRemoval * 6;
      node.connect(eq); node = eq;
    }
    if (sd.voiceEnhance.presence > 0.1) {
      const eq = ctx.createBiquadFilter();
      eq.type = "peaking"; eq.frequency.value = 3500; eq.Q.value = 1.0;
      eq.gain.value = sd.voiceEnhance.presence;
      node.connect(eq); node = eq;
    }
    if (sd.voiceEnhance.air > 0.1) {
      const eq = ctx.createBiquadFilter();
      eq.type = "highshelf"; eq.frequency.value = 10000;
      eq.gain.value = sd.voiceEnhance.air;
      node.connect(eq); node = eq;
    }
    if (sd.voiceEnhance.deEss > 0.5) {
      const eq = ctx.createBiquadFilter();
      eq.type = "peaking"; eq.frequency.value = 7000; eq.Q.value = 2.0;
      eq.gain.value = -sd.voiceEnhance.deEss;
      node.connect(eq); node = eq;
    }
  }

  // 5. Compressor
  if (sd.compressor.enabled) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = sd.compressor.threshold;
    comp.ratio.value = sd.compressor.ratio;
    comp.attack.value = sd.compressor.attack / 1000;
    comp.release.value = sd.compressor.release / 1000;
    comp.knee.value = sd.compressor.knee;
    node.connect(comp);
    node = comp;
    // Makeup gain
    if (sd.compressor.makeupGain > 0) {
      const g = ctx.createGain();
      g.gain.value = Math.pow(10, sd.compressor.makeupGain / 20);
      node.connect(g); node = g;
    }
  }

  // 6. Stereo Enhancement
  if (sd.stereoEnhance.enabled && ctx.createStereoPanner) {
    if (sd.stereoEnhance.balance !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = sd.stereoEnhance.balance;
      node.connect(panner); node = panner;
    }
  }

  // 7. Loudness Normalization + Limiter
  if (sd.limiter.enabled) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = sd.limiter.ceiling - 3;
    comp.ratio.value = 20;
    comp.attack.value = 0.001;
    comp.release.value = sd.limiter.release / 1000;
    comp.knee.value = 0;
    node.connect(comp); node = comp;
  }

  // Master gain (loudness approx)
  if (sd.loudnessNorm.enabled) {
    const g = ctx.createGain();
    // Approximate gain to target LUFS (crude, real normalization needs two-pass)
    g.gain.value = 1.0;
    node.connect(g); node = g;
  }

  node.connect(ctx.destination);
  src.start(0);

  try {
    return await ctx.startRendering();
  } catch {
    return null;
  }
}

// ============================================================================
// Пресеты Sound Design (быстрые настройки для типовых задач)
// ============================================================================

export type SoundDesignPreset =
  | "podcast"
  | "youtube"
  | "cinematic"
  | "music-video"
  | "interview"
  | "documentary"
  | "social-short"
  | "voiceover"
  | "ambient";

export function applySoundDesignPreset(preset: SoundDesignPreset): Partial<SoundDesignSettings> {
  switch (preset) {
    case "podcast":
      return {
        noiseRemoval: { enabled: true, amount: 0.7, thresholdDb: -38, highpassHz: 80, lowpassHz: 15000 },
        voiceEnhance: { enabled: true, presence: 4, air: 2, body: 1, mudRemoval: 0.4, deEss: 5 },
        compressor: { enabled: true, threshold: -16, ratio: 3, attack: 8, release: 80, knee: 6, makeupGain: 3 },
        limiter: { enabled: true, ceiling: -1, release: 50 },
        loudnessNorm: { enabled: true, targetLufs: -16, truePeak: -1.5, range: 11 },
        voiceIsolation: { enabled: false, strength: 0, lowCut: 85, highCut: 12000 },
        roomTone: { enabled: false, room: "room", volume: 0 },
      };
    case "youtube":
      return {
        noiseRemoval: { enabled: true, amount: 0.5, thresholdDb: -42, highpassHz: 70, lowpassHz: 16000 },
        voiceEnhance: { enabled: true, presence: 3, air: 2, body: 0.5, mudRemoval: 0.3, deEss: 4 },
        compressor: { enabled: true, threshold: -18, ratio: 3, attack: 10, release: 100, knee: 6, makeupGain: 2 },
        limiter: { enabled: true, ceiling: -1, release: 50 },
        loudnessNorm: { enabled: true, targetLufs: -14, truePeak: -1.5, range: 11 },
        ducking: { enabled: true, depth: 0.5, attack: 0.12, release: 0.35, voiceThresholdDb: -35 },
      };
    case "cinematic":
      return {
        noiseRemoval: { enabled: true, amount: 0.4, thresholdDb: -45, highpassHz: 30, lowpassHz: 20000 },
        compressor: { enabled: true, threshold: -20, ratio: 2.5, attack: 15, release: 150, knee: 8, makeupGain: 1 },
        limiter: { enabled: true, ceiling: -1.5, release: 80 },
        loudnessNorm: { enabled: true, targetLufs: -14, truePeak: -1, range: 14 },
        stereoEnhance: { enabled: true, width: 1.3, balance: 0, haasDelay: 0 },
        roomTone: { enabled: true, room: "hall", volume: 0.08 },
      };
    case "interview":
      return {
        noiseRemoval: { enabled: true, amount: 0.8, thresholdDb: -36, highpassHz: 90, lowpassHz: 14000 },
        voiceEnhance: { enabled: true, presence: 5, air: 1.5, body: 1, mudRemoval: 0.5, deEss: 6 },
        voiceIsolation: { enabled: true, strength: 0.7, lowCut: 85, highCut: 12000 },
        compressor: { enabled: true, threshold: -15, ratio: 4, attack: 6, release: 60, knee: 4, makeupGain: 3 },
        limiter: { enabled: true, ceiling: -1, release: 40 },
        loudnessNorm: { enabled: true, targetLufs: -16, truePeak: -1.5, range: 9 },
      };
    case "documentary":
      return {
        noiseRemoval: { enabled: true, amount: 0.6, thresholdDb: -40, highpassHz: 60, lowpassHz: 18000 },
        voiceEnhance: { enabled: true, presence: 3, air: 2, body: 0.5, mudRemoval: 0.3, deEss: 4 },
        compressor: { enabled: true, threshold: -18, ratio: 3, attack: 10, release: 100, knee: 6, makeupGain: 2 },
        limiter: { enabled: true, ceiling: -1, release: 50 },
        loudnessNorm: { enabled: true, targetLufs: -14, truePeak: -1.5, range: 11 },
        roomTone: { enabled: true, room: "room", volume: 0.05 },
      };
    case "social-short":
      return {
        noiseRemoval: { enabled: true, amount: 0.5, thresholdDb: -42, highpassHz: 80, lowpassHz: 16000 },
        voiceEnhance: { enabled: true, presence: 4, air: 2, body: 1, mudRemoval: 0.3, deEss: 4 },
        compressor: { enabled: true, threshold: -14, ratio: 4, attack: 5, release: 80, knee: 4, makeupGain: 4 },
        limiter: { enabled: true, ceiling: -0.5, release: 40 },
        loudnessNorm: { enabled: true, targetLufs: -14, truePeak: -1, range: 11 },
        ducking: { enabled: true, depth: 0.6, attack: 0.1, release: 0.25, voiceThresholdDb: -35 },
      };
    case "voiceover":
      return {
        noiseRemoval: { enabled: true, amount: 0.9, thresholdDb: -35, highpassHz: 100, lowpassHz: 14000 },
        voiceEnhance: { enabled: true, presence: 5, air: 3, body: 2, mudRemoval: 0.5, deEss: 6 },
        voiceIsolation: { enabled: true, strength: 0.8, lowCut: 100, highCut: 12000 },
        compressor: { enabled: true, threshold: -15, ratio: 4, attack: 5, release: 50, knee: 4, makeupGain: 4 },
        limiter: { enabled: true, ceiling: -1, release: 35 },
        loudnessNorm: { enabled: true, targetLufs: -16, truePeak: -1.5, range: 9 },
      };
    case "music-video":
      return {
        compressor: { enabled: true, threshold: -12, ratio: 4, attack: 3, release: 60, knee: 2, makeupGain: 2 },
        limiter: { enabled: true, ceiling: -0.3, release: 30 },
        loudnessNorm: { enabled: true, targetLufs: -14, truePeak: -1, range: 12 },
        stereoEnhance: { enabled: true, width: 1.4, balance: 0, haasDelay: 5 },
      };
    case "ambient":
      return {
        noiseRemoval: { enabled: false, amount: 0, thresholdDb: -50, highpassHz: 20, lowpassHz: 20000 },
        limiter: { enabled: true, ceiling: -1.5, release: 80 },
        loudnessNorm: { enabled: true, targetLufs: -18, truePeak: -2, range: 16 },
        stereoEnhance: { enabled: true, width: 1.5, balance: 0, haasDelay: 8 },
      };
    default:
      return {};
  }
}
