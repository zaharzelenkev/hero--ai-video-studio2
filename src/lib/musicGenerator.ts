/**
 * AI Music Generator — procedural music with proper sound design
 *
 * Синтезирует саундтрек через OfflineAudioContext: настоящие ударные
 * (питч-свип бочки, шумовые снейры/хэты), басовые линии, сайдчейн-памп,
 * райзеры на границах секций и мастеринг через DynamicsCompressor.
 *
 * Стили: 'none' (нейтив), 'lofi', 'electronic', 'cinematic'
 */

type Style = 'none' | 'lofi' | 'electronic' | 'cinematic';

// ================== helpers ==================

/** MIDI note → Hz */
const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

interface OfflineCtor {
  new (channels: number, length: number, sampleRate: number): OfflineAudioContext;
}

function getOfflineCtor(): OfflineCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    OfflineAudioContext?: OfflineCtor;
    webkitOfflineAudioContext?: OfflineCtor;
  };
  return w.OfflineAudioContext || w.webkitOfflineAudioContext || null;
}

/** Профиль энергии по секциям ролика: интро → билд → пик → аутро */
function sectionEnergy(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  if (f < 0.12) return 0.35 + (f / 0.12) * 0.25;          // intro
  if (f < 0.5) return 0.6 + ((f - 0.12) / 0.38) * 0.3;    // build
  if (f < 0.85) return 1.0;                                // peak / drop
  return Math.max(0.4, 0.88 - ((f - 0.85) / 0.15) * 0.45); // outro
}

function makeNoiseBuffer(ctx: OfflineAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// ================== drums ==================

/** Бочка с питч-свипом 150→48 Гц + клик-атака — звучит как удар, а не «бип» */
function createKick(
  ctx: OfflineAudioContext, dest: AudioNode, time: number,
  opts: { gain?: number; decay?: number } = {},
): void {
  const gain = opts.gain ?? 0.85;
  const decay = opts.decay ?? 0.3;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.09);
  const g = ctx.createGain();
  // 2мс атака: убирает мгновенный скачок → нет цифрового «клика» и true-peak всплеска
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, time + decay);
  osc.connect(g); g.connect(dest);
  osc.start(time); osc.stop(time + decay + 0.05);

  // клик-атака для readability на маленьких динамиках телефона
  const click = ctx.createOscillator();
  click.type = 'square';
  click.frequency.value = 1500;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, time);
  cg.gain.exponentialRampToValueAtTime(gain * 0.12, time + 0.001);
  cg.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
  click.connect(cg); cg.connect(dest);
  click.start(time); click.stop(time + 0.03);
}

/** Снейр/клэп: шум через bandpass + тело 190 Гц */
function createSnare(
  ctx: OfflineAudioContext, noise: AudioBuffer, dest: AudioNode, time: number,
  opts: { gain?: number; clap?: boolean } = {},
): void {
  const gain = opts.gain ?? 0.5;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = opts.clap ? 1100 : 1800;
  bp.Q.value = opts.clap ? 1.1 : 0.9;
  const g = ctx.createGain();
  // у клэпа характерная «дробь» — три микро-атаки; события строго по времени
  const attacks = opts.clap ? [0, 0.014, 0.029] : [0];
  const maxAtk = attacks[attacks.length - 1];
  type Ev = { t: number; v: number; exp: boolean };
  const events: Ev[] = [];
  attacks.forEach((off, i) => {
    const amp = gain * (i === attacks.length - 1 ? 1 : 0.55);
    events.push({ t: time + off, v: amp, exp: false });
    events.push({ t: time + off + 0.02, v: Math.max(0.001, amp * 0.2), exp: true });
  });
  const tail = maxAtk + 0.18;
  events.push({ t: time + maxAtk + 0.03, v: gain * 0.35, exp: false });
  events.push({ t: time + tail, v: 0.001, exp: true });
  events.sort((a, b) => a.t - b.t);
  for (const ev of events) {
    if (ev.exp) g.gain.exponentialRampToValueAtTime(ev.v, ev.t);
    else g.gain.setValueAtTime(ev.v, ev.t);
  }
  src.connect(bp); bp.connect(g); g.connect(dest);
  src.start(time); src.stop(time + tail + 0.05);

  // тело
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(210, time);
  body.frequency.exponentialRampToValueAtTime(150, time + 0.08);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(gain * 0.5, time);
  bg.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
  body.connect(bg); bg.connect(dest);
  body.start(time); body.stop(time + 0.15);
}

/** Хэт: шум через highpass; open — длинный затухающий */
function createHihat(
  ctx: OfflineAudioContext, noise: AudioBuffer, dest: AudioNode, time: number,
  opts: { gain?: number; open?: boolean } = {},
): void {
  const gain = opts.gain ?? 0.25;
  const decay = opts.open ? 0.28 : 0.05;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 1 + Math.random() * 0.1; // микро-вариации против «пулемёта»
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + decay);
  src.connect(hp); hp.connect(g); g.connect(dest);
  src.start(time); src.stop(time + decay + 0.05);
}

/** Райзер: шум с восходящим bandpass — связка билд→дроп */
function createRiser(
  ctx: OfflineAudioContext, noise: AudioBuffer, dest: AudioNode,
  start: number, dur: number, peak = 0.22,
): void {
  const t = Math.max(0, start);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(320, t);
  bp.frequency.exponentialRampToValueAtTime(5400, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.06);
  src.connect(bp); bp.connect(g); g.connect(dest);
  src.start(t); src.stop(t + dur + 0.1);
}

/** Кинематографичный «braam»-удар: расстроенные пилы с просадкой питча */
function createImpact(
  ctx: OfflineAudioContext, dest: AudioNode, time: number,
  opts: { midi?: number; gain?: number } = {},
): void {
  const base = hz(opts.midi ?? 38);
  const gain = opts.gain ?? 0.55;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, time);
  lp.frequency.exponentialRampToValueAtTime(120, time + 1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.025);
  g.gain.exponentialRampToValueAtTime(0.001, time + 1.8);
  lp.connect(g); g.connect(dest);
  for (const det of [-7, 0, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.02, time);
    osc.frequency.exponentialRampToValueAtTime(base, time + 0.35);
    osc.detune.value = det;
    osc.connect(lp);
    osc.start(time); osc.stop(time + 1.9);
  }
}

// ================== harmony ==================

/** Бас-нота: саб-синус + лёгкая пила через lowpass */
function createBass(
  ctx: OfflineAudioContext, dest: AudioNode, time: number,
  midiRoot: number, duration: number,
  opts: { gain?: number; cutoff?: number; slideFrom?: number } = {},
): void {
  const freq = hz(midiRoot);
  const gain = opts.gain ?? 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = opts.cutoff ?? 320;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.015);
  g.gain.setValueAtTime(gain, Math.max(time + 0.015, time + duration - 0.06));
  g.gain.exponentialRampToValueAtTime(0.001, time + duration);
  lp.connect(g); g.connect(dest);

  const sub = ctx.createOscillator();
  sub.type = 'sine';
  if (opts.slideFrom) {
    sub.frequency.setValueAtTime(hz(opts.slideFrom), Math.max(0, time - 0.01));
    sub.frequency.exponentialRampToValueAtTime(freq, time + 0.05);
  } else {
    sub.frequency.value = freq;
  }
  sub.connect(lp);
  sub.start(time); sub.stop(time + duration + 0.05);

  const mid = ctx.createOscillator();
  mid.type = 'sawtooth';
  mid.frequency.value = freq * 2;
  const mg = ctx.createGain();
  mg.gain.value = 0.25;
  mid.connect(mg); mg.connect(lp);
  mid.start(time); mid.stop(time + duration + 0.05);
}

/** Мягкий аккорд (lofi «электропиано»): треугольники с атакой и натуральным затуханием */
function playChord(
  ctx: OfflineAudioContext, dest: AudioNode, midis: number[], time: number,
  duration: number, opts: { gain?: number; attack?: number; type?: OscillatorType } = {},
): void {
  const perNote = (opts.gain ?? 0.22) / Math.sqrt(midis.length);
  for (const midi of midis) {
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.value = hz(midi);
    const g = ctx.createGain();
    const atk = opts.attack ?? 0.02;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(perNote, time + atk);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(g); g.connect(dest);
    osc.start(time); osc.stop(time + duration + 0.05);
  }
}

/** Арпеджио с фильтром, открывающимся к дропу */
function createArpNote(
  ctx: OfflineAudioContext, dest: AudioNode, midi: number, time: number,
  noteLen: number, cutoff: number, gain: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = hz(midi);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.Q.value = 4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + noteLen * 0.85);
  osc.connect(lp); lp.connect(g); g.connect(dest);
  osc.start(time); osc.stop(time + noteLen);
}

// ================== progressions (MIDI) ==================

interface Progression { roots: number[]; chords: number[][]; }

const LOFI_PROGS: Progression[] = [
  { roots: [33, 29, 36, 31], chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]] }, // Am7 Fmaj7 Cmaj7 G7
  { roots: [31, 36, 29, 33], chords: [[55, 59, 62, 66], [48, 52, 55, 59], [53, 57, 60, 64], [57, 60, 64, 67]] }, // G C F Am вариант
];
const ELECTRONIC_PROGS: Progression[] = [
  { roots: [38, 34, 41, 36], chords: [[57, 62, 65], [58, 62, 65], [57, 60, 65], [55, 60, 64]] }, // Dm Bb F C
  { roots: [36, 32, 39, 34], chords: [[55, 60, 63], [56, 60, 63], [55, 58, 63], [58, 62, 65]] }, // Cm Ab Eb Bb
];
const CINEMATIC_PROGS: Progression[] = [
  { roots: [36, 32, 39, 34], chords: [[48, 51, 55], [44, 48, 51], [51, 55, 58], [46, 50, 53]] }, // Cm Ab Eb Bb
  { roots: [38, 34, 41, 36], chords: [[50, 53, 57], [46, 50, 53], [45, 48, 53], [48, 52, 55]] }, // Dm Bb F C
];

const BPM: Record<Exclude<Style, 'none'>, number> = { lofi: 82, electronic: 124, cinematic: 94 };

/** Публичная BPM-таблица: ритм-сетка монтажа строится аналитически,
 *  ещё до того, как трек будет отрендерен (квантование склеек, флеши, дропы). */
export const STYLE_BPM = BPM;

/** Единая точка выбора жанра процедурного саундтрека по шаблону —
 *  и генерация, и ритм-сетка обязаны использовать ОДНУ маппинг-функцию,
 *  иначе монтаж пойдёт не в тот темп. */
export function proceduralStyleForTemplate(templateId: string): Exclude<Style, 'none'> {
  if (templateId === "travel" || templateId === "cinematic" || templateId === "luxury" || templateId === "documentary"
      || templateId === "wedding" || templateId === "realestate") return "cinematic";
  if (templateId === "podcast" || templateId === "hormozi" || templateId === "minimal"
      || templateId === "interview" || templateId === "education" || templateId === "food") return "lofi";
  return "electronic";
}

// ================== main generator ==================

function generateStyleMusic(
  style: Exclude<Style, 'none'>, duration: number, hashSeed: number,
): Promise<AudioBuffer> | null {
  const Ctor = getOfflineCtor();
  if (!Ctor) return null;
  const sampleRate = 44100;
  const ctx = new Ctor(2, Math.ceil(duration * sampleRate), sampleRate);

  // мастер-чейн: bus → dyn(динамическая арка) → glue comp → лимитер → out
  const bus = ctx.createGain();
  const dyn = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -17;
  comp.knee.value = 18;
  // ratio умеренный: медленные рампы арки иначе «съедаются» компрессором
  comp.ratio.value = 2.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  // потолок -2.2 dBFS: запас под inter-sample пики — AAC-кодек ffmpeg
  // не уйдёт в true-peak клиппинг при перекодировании
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2.2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.0005;
  limiter.release.value = 0.05;
  bus.connect(dyn); dyn.connect(comp); comp.connect(limiter); limiter.connect(ctx.destination);

  // динамическая арка ролика: громкость следует за секционной энергией
  // (интро тише, кульминация громче — ролик «дышит»)
  {
    dyn.gain.setValueAtTime(0.5, 0);
    for (let t = 0; t < duration; t += 2) {
      dyn.gain.linearRampToValueAtTime(0.5 + 0.5 * sectionEnergy((t + 2) / duration), t + 2);
    }
  }

  const noise = makeNoiseBuffer(ctx);
  const bpm = BPM[style];
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;
  const progBar = (p: Progression, t: number): number => Math.floor(t / barDur) % p.roots.length;
  const prog = (style === 'lofi' ? LOFI_PROGS : style === 'electronic' ? ELECTRONIC_PROGS : CINEMATIC_PROGS)[hashSeed % 2];

  // сайдчейн-шина для electronic: гармония «дышит» от каждой бочки
  let harmonyBus: AudioNode = bus;
  if (style === 'electronic') {
    const pump = ctx.createGain();
    pump.gain.value = 1;
    harmonyBus = pump;
    pump.connect(bus);
    const totalBeats = Math.floor(duration / beatDur);
    for (let b = 0; b < totalBeats; b++) {
      const t = b * beatDur;
      pump.gain.setValueAtTime(0.24, t);
      pump.gain.linearRampToValueAtTime(1, t + 0.26);
    }
  }

  const energyAt = (t: number): number => sectionEnergy(t / duration);

  // ---------- ударные ----------
  {
    const totalBeats = Math.floor(duration / beatDur);
    for (let b = 0; b < totalBeats; b++) {
      const t = b * beatDur;
      const e = energyAt(t);
      const barPos = b % 4;
      if (style === 'electronic') {
        createKick(ctx, bus, t, { gain: 0.22 + 0.68 * e });
        if ((barPos === 1 || barPos === 3) && e > 0.45) {
          createSnare(ctx, noise, bus, t, { gain: 0.1 + 0.5 * e, clap: true });
        }
        // offbeat open hat появляется по мере разгона
        if (e > 0.5) {
          createHihat(ctx, noise, bus, t + beatDur / 2, { gain: 0.06 + 0.2 * e, open: true });
        }
      } else if (style === 'lofi') {
        if (barPos === 0 || (barPos === 2 && e > 0.55) || (barPos === 3 && e > 0.8 && (b >> 2) % 2 === 1)) {
          createKick(ctx, bus, t, { gain: 0.35 + 0.4 * e, decay: 0.24 });
        }
        if (barPos === 1 || barPos === 3) {
          createSnare(ctx, noise, bus, t, { gain: 0.15 + 0.3 * e });
        }
        // свингованные 1/8 хэты: оффбит откладывается на ~10% доли
        const swing = beatDur * 0.09;
        createHihat(ctx, noise, bus, t, { gain: 0.14 + 0.06 * e });
        createHihat(ctx, noise, bus, t + beatDur / 2 + swing, { gain: 0.09 + 0.05 * e });
      } else {
        // cinematic: разреженный пульс + бумы на сильные доли при высокой энергии
        if (barPos === 0) {
          createKick(ctx, bus, t, { gain: 0.3 + 0.4 * e, decay: 0.42 });
        }
        if (e > 0.75 && barPos === 2) {
          createKick(ctx, bus, t, { gain: 0.3, decay: 0.3 });
        }
        if (e > 0.85) {
          createHihat(ctx, noise, bus, t + beatDur / 2, { gain: 0.07 });
        }
      }
    }
  }

  // ---------- бас ----------
  {
    const totalBars = Math.ceil(duration / barDur);
    let prevRoot: number | undefined;
    for (let bar = 0; bar < totalBars; bar++) {
      const t = bar * barDur;
      if (t >= duration) break;
      const e = energyAt(t);
      const root = prog.roots[bar % prog.roots.length];
      if (style === 'electronic') {
        // качающие 1/8: корень/октава; в интро — только четверти
        for (let s = 0; s < 8; s++) {
          if (e < 0.5 && s % 2 === 1) continue;
          const st = t + s * beatDur / 2;
          if (st >= duration) break;
          const midi = root + (s % 4 === 3 ? 12 : 0);
          createBass(ctx, harmonyBus, st, midi, beatDur * 0.42, { gain: 0.16 + 0.36 * e, cutoff: 200 + 500 * e });
        }
      } else if (style === 'lofi') {
        const walk = bar % 2 === 1 ? root + 7 : root + 12; // квинта/октава на слабые такты
        createBass(ctx, bus, t, root, beatDur * 1.8, { gain: 0.24 + 0.26 * e, slideFrom: prevRoot });
        createBass(ctx, bus, t + beatDur * 2.5, walk, beatDur * 1.2, { gain: 0.15 + 0.18 * e });
      } else {
        // cinematic: длинные сабы на такт
        createBass(ctx, bus, t, root, barDur * 0.95, { gain: 0.3 + 0.2 * e });
      }
      prevRoot = root;
    }
  }

  // ---------- гармония / арпеджио ----------
  {
    const totalBars = Math.ceil(duration / barDur);
    if (style === 'lofi') {
      for (let bar = 0; bar < totalBars; bar++) {
        const t = bar * barDur;
        if (t >= duration) break;
        const e = energyAt(t);
        playChord(ctx, bus, prog.chords[bar % prog.chords.length], t, barDur * 0.92, { gain: 0.2 + 0.24 * e });
        // ответная фраза верхним голосом на чётных тактах
        if (bar % 2 === 1 && e > 0.5) {
          const ch = prog.chords[bar % prog.chords.length];
          playChord(ctx, bus, [ch[0] + 12, ch[2] + 12], t + beatDur * 2.5, beatDur * 1.3, { gain: 0.12, attack: 0.06 });
        }
      }
    } else if (style === 'electronic') {
      const sixteenth = beatDur / 4;
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      const totalSteps = Math.ceil(duration / sixteenth);
      for (let s = 0; s < totalSteps; s++) {
        const t = s * sixteenth;
        const e = energyAt(t);
        if (e < 0.45 && s % 2 === 1) continue; // в интро арп редкий
        const chord = prog.chords[progBar(prog, t)];
        const oct = (Math.floor(s / 8) % 2) * 12;
        const midi = chord[pattern[s % pattern.length] % chord.length] + 12 + oct;
        createArpNote(ctx, harmonyBus, midi, t, sixteenth, 500 + e * 4800, 0.06 + 0.1 * e);
      }
      // пэд под арпом
      for (let bar = 0; bar < totalBars; bar++) {
        const t = bar * barDur;
        if (t >= duration) break;
        const e = energyAt(t);
        playChord(ctx, harmonyBus, prog.chords[bar % prog.chords.length], t, barDur, { gain: 0.05 + 0.09 * e, attack: beatDur, type: 'sawtooth' });
      }
    } else {
      // cinematic: дроны + верхнее легато + braam-удары в узлах секций
      for (let bar = 0; bar < totalBars; bar++) {
        const t = bar * barDur;
        if (t >= duration) break;
        const e = energyAt(t);
        playChord(ctx, bus, prog.chords[bar % prog.chords.length], t, barDur * 1.05, { gain: 0.16 + 0.12 * e, attack: barDur * 0.3, type: 'sawtooth' });
        if (e > 0.6 && bar % 2 === 0) {
          const ch = prog.chords[bar % prog.chords.length];
          playChord(ctx, bus, [ch[0] + 24], t + beatDur * 1.5, beatDur * 2.4, { gain: 0.07, attack: 0.3 });
        }
      }
      for (const f of [0.12, 0.5, 0.85]) {
        createImpact(ctx, bus, f * duration + 0.01, { midi: prog.roots[0], gain: f === 0.5 ? 0.6 : 0.45 });
      }
    }
  }

  // ---------- райзеры перед сменой секций ----------
  {
    const marks: Array<{ at: number; len: number }> = [
      { at: 0.12 * duration, len: Math.min(3, 4 * barDur) },
      { at: 0.5 * duration, len: Math.min(4, 6 * barDur) },
      ...(style !== 'cinematic' ? [{ at: 0.85 * duration, len: Math.min(2.5, 3 * barDur) }] : []),
    ];
    for (const m of marks) {
      if (m.at - m.len > 1) {
        createRiser(ctx, noise, bus, m.at - m.len, m.len, style === 'lofi' ? 0.08 : 0.2);
      }
    }
  }

  // ---------- текстуры ----------
  if (style === 'lofi') {
    const crackle = ctx.createBufferSource();
    crackle.buffer = noise;
    crackle.loop = true;
    crackle.playbackRate.value = 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0.014;
    crackle.connect(lp); lp.connect(hp); hp.connect(g); g.connect(bus);
    crackle.start(0);
  }
  if (style === 'cinematic') {
    // широкий airy-шум как «воздух» в аутро
    const air = ctx.createBufferSource();
    air.buffer = noise; air.loop = true; air.playbackRate.value = 0.5;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5000; bp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.012;
    air.connect(bp); bp.connect(g); g.connect(bus);
    air.start(0);
  }

  return ctx.startRendering();
}

// ================== public API ==================

/** Главная функция — генерирует музыку заданного стиля */
export async function generateProceduralMusic(
  style: Style,
  duration: number,
  hashSeed: number,
): Promise<Blob | null> {
  if (style === 'none') return null;
  try {
    const buf = await generateStyleMusic(style, duration, hashSeed);
    if (!buf) return null;
    return audioBufferToWav(buf);
  } catch (err) {
    console.warn('[MusicGen] procedural generation failed:', err);
    return null;
  }
}

/** Микс пользовательского трека через мастер (для звуковых эффектов обработки) */
export async function mixUserMusic(buffer: ArrayBuffer, duration: number): Promise<Blob | null> {
  try {
    const Ctor = getOfflineCtor();
    if (!Ctor) return null;
    const sampleRate = 44100;
    const ctx = new Ctor(2, Math.ceil(duration * sampleRate), sampleRate);

    const audioCtx = new AudioContext();
    let decoded: AudioBuffer;
    try {
      decoded = await audioCtx.decodeAudioData(buffer);
    } finally {
      void audioCtx.close().catch(() => { /* ignore */ });
    }

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(ctx.destination);

    const src = ctx.createBufferSource();
    src.buffer = decoded;
    if (decoded.duration < duration - 0.5) {
      src.loop = true;
      src.loopEnd = decoded.duration;
    }
    src.connect(comp);
    src.start(0);

    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  } catch {
    return null;
  }
}

// ================== WAV encoder ==================

function audioBufferToWav(buffer: AudioBuffer): Blob {
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
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * numCh * bytesPerSample, true);
  dv.setUint16(32, numCh * bytesPerSample, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

// ================== API для autoEdit ==================

/** Создать ducking-кривую на гейне (вызывается при миксе) */
export function applyDucking(
  gainNode: GainNode,
  ctx: BaseAudioContext,
  audioSegments: Array<{ sourceStart: number; sourceEnd: number }>,
  musicOffset: number = 0,
  mediaSpeed: number = 1,
): void {
  const duckAmount = 0.16;
  const attack = 0.12;
  const release = 0.25;
  const t0 = Math.max(0, ctx.currentTime);

  gainNode.gain.setValueAtTime(1, t0);

  const sorted = [...audioSegments].sort((a, b) => a.sourceStart - b.sourceStart);

  for (const seg of sorted) {
    const start = (seg.sourceStart - musicOffset) / mediaSpeed;
    const end = (seg.sourceEnd - musicOffset) / mediaSpeed;
    if (end <= 0) continue;

    gainNode.gain.setTargetAtTime(duckAmount, Math.max(0, start), attack);
    gainNode.gain.setTargetAtTime(1, Math.max(0, end), release);
  }
}
