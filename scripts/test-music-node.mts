/**
 * Node smoke-test for src/lib/musicGenerator.ts.
 * Запускает generateProceduralMusic на СТРОГОМ моке Web Audio API:
 * мок бросает исключение на любых нарушениях реального API
 * (exponentialRamp ≤ 0, отрицательное время, NaN, нефинитные значения) —
 * именно такие ошибки в браузере тихо ломают рендер или падают исключением.
 *
 * Run: npx tsx scripts/test-music-node.mts
 */

import { generateProceduralMusic } from '../src/lib/musicGenerator';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ---------- strict Web Audio mock ----------

const stats = {
  oscStarts: 0,
  srcStarts: 0,
  filters: 0,
  automationEvents: 0,
  ramps: 0,
};

function assertTime(t: number, what: string): void {
  if (!Number.isFinite(t)) throw new Error(`${what}: non-finite time ${t}`);
  if (t < 0) throw new Error(`${what}: negative time ${t}`);
}
function assertVal(v: number, what: string): void {
  if (!Number.isFinite(v)) throw new Error(`${what}: non-finite value ${v}`);
}

class Param {
  value = 0;
  private lastT = -1;
  setValueAtTime(v: number, t: number): void {
    assertVal(v, 'setValueAtTime'); assertTime(t, 'setValueAtTime');
    stats.automationEvents++;
  }
  linearRampToValueAtTime(v: number, t: number): void {
    assertVal(v, 'linearRamp'); assertTime(t, 'linearRamp');
    stats.automationEvents++; stats.ramps++;
  }
  exponentialRampToValueAtTime(v: number, t: number): void {
    assertVal(v, 'exponentialRamp'); assertTime(t, 'exponentialRamp');
    if (v <= 0) throw new Error(`exponentialRampToValueAtTime to ${v} — в браузере это исключение`);
    if (t < this.lastT) throw new Error(`automation events out of order: ${t} after ${this.lastT}`);
    this.lastT = t;
    stats.automationEvents++; stats.ramps++;
  }
  setTargetAtTime(v: number, t: number, tc: number): void {
    assertVal(v, 'setTargetAtTime'); assertTime(t, 'setTargetAtTime');
    if (!(tc > 0)) throw new Error(`setTargetAtTime bad timeConstant ${tc}`);
    stats.automationEvents++;
  }
  cancelScheduledValues(_t: number): void { /* noop */ }
}

class NodeMock {
  connect(_dest?: unknown): void { /* graph ignored */ }
  disconnect(): void { /* noop */ }
}
class OscMock extends NodeMock {
  type = 'sine';
  frequency = new Param();
  detune = new Param();
  start(t = 0): void { assertTime(t, 'osc.start'); stats.oscStarts++; }
  stop(t = 0): void { assertTime(t, 'osc.stop'); }
}
class GainMock extends NodeMock { gain = new Param(); }
class FilterMock extends NodeMock {
  type = 'lowpass';
  frequency = new Param();
  Q = new Param();
  gain = new Param();
  constructor() { super(); stats.filters++; }
}
class CompMock extends NodeMock {
  threshold = new Param(); knee = new Param(); ratio = new Param();
  attack = new Param(); release = new Param();
}
class SrcMock extends NodeMock {
  buffer: { getChannelData(ch: number): Float32Array } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new Param();
  constructor() { super(); this.playbackRate.value = 1; }
  start(t = 0): void { assertTime(t, 'src.start'); stats.srcStarts++; }
  stop(t = 0): void { assertTime(t, 'src.stop'); }
}

class OfflineCtxMock {
  sampleRate: number;
  destination = new NodeMock();
  currentTime = 0;
  private channels: number;
  private frames: number;
  constructor(channels: number, length: number, sampleRate: number) {
    if (!(length > 0)) throw new Error('OfflineAudioContext: bad length');
    this.channels = channels; this.frames = length; this.sampleRate = sampleRate;
  }
  createOscillator(): OscMock { return new OscMock(); }
  createGain(): GainMock { return new GainMock(); }
  createBiquadFilter(): FilterMock { return new FilterMock(); }
  createDynamicsCompressor(): CompMock { return new CompMock(); }
  createBufferSource(): SrcMock { return new SrcMock(); }
  createBuffer(ch: number, len: number, sr: number): { getChannelData(i: number): Float32Array } {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
  startRendering(): Promise<unknown> {
    const sr = this.sampleRate;
    // каналы аллоцируем один раз — энкодер WAV вызывает getChannelData на каждый сэмпл
    const channels: Float32Array[] = [];
    for (let c = 0; c < this.channels; c++) {
      const d = new Float32Array(this.frames);
      for (let i = 0; i < this.frames; i += 997) d[i] = Math.sin((i / sr) * 440 * Math.PI * 2) * 0.5;
      channels.push(d);
    }
    return Promise.resolve({
      numberOfChannels: this.channels,
      sampleRate: sr,
      length: this.frames,
      getChannelData: (ch: number): Float32Array => channels[Math.min(ch, channels.length - 1)],
    });
  }
}

(globalThis as unknown as { window: unknown }).window = {
  OfflineAudioContext: OfflineCtxMock,
};

// ---------- tests ----------

async function main(): Promise<void> {
  console.log('🎵 musicGenerator smoke test (strict WebAudio mock)');

  const styles = ['lofi', 'electronic', 'cinematic'] as const;
  for (const style of styles) {
    for (const duration of [12, 60, 95.4]) {
      const before = { ...stats };
      let blob: Blob | null = null;
      let err: unknown = null;
      try {
        blob = await generateProceduralMusic(style, duration, 3);
      } catch (e) { err = e; }
      check(`${style} ${duration}s: без исключений`, !err, err ? String(err) : '');
      check(`${style} ${duration}s: WAV создан`, !!blob && (blob?.size ?? 0) > 44,
        blob ? `${(blob.size / 1e6).toFixed(2)}MB` : 'null');
      const expected = 44 + Math.ceil(duration * 44100) * 2 * 2;
      check(`${style} ${duration}s: размер = header + frames*2ch*16bit`,
        !!blob && Math.abs(blob.size - expected) < 8,
        blob ? `size=${blob.size} expected=${expected}` : '');
      const osc = stats.oscStarts - before.oscStarts;
      const src = stats.srcStarts - before.srcStarts;
      check(`${style} ${duration}s: осцилляторы запланированы`, osc > 20, `${osc} osc, ${src} src`);
    }
  }

  // плотность: у electronic бочек ≈ bpm*dur/60 → по 1 осциллятору тела+клик каждый
  {
    const before = stats.oscStarts;
    await generateProceduralMusic('electronic', 60, 1);
    const osc = stats.oscStarts - before;
    check('electronic 60s: плотность ≥ 124 bpm эквивалента', osc > 124 * 3, `${osc} osc/min`);
  }

  // автоматизация: райзеры/сайдчейн/фейды дают много ramp-событий, все валидные
  check('ramp-события присутствуют (фейды, свипы, сайдчейн)', stats.ramps > 500, `${stats.ramps}`);
  check('comp/фильтры построены', stats.filters > 100, `${stats.filters} filters`);

  // ---------- SFX: реальный рендер через JS DSP ----------
  console.log('\n🔊 SFX: рендер через JS DSP + метрики');
  const { OfflineAudioContextJS } = await import('./webaudio-offline.mjs');
  (globalThis as unknown as { OfflineAudioContext: unknown }).OfflineAudioContext = OfflineAudioContextJS;
  const { generateSfx } = await import('../src/lib/sfx');
  const sfxTypes = ['pop', 'whoosh', 'riser', 'hit', 'swoosh', 'glitch', 'impact', 'ding'] as const;
  for (const type of sfxTypes) {
    let blob: Blob | null = null;
    let err: unknown = null;
    try { blob = await generateSfx(type); } catch (e) { err = e; }
    check(`sfx ${type}: без исключений`, !err, err ? String(err) : '');
    if (!blob) { failures++; continue; }
    const dv = new DataView(await blob.arrayBuffer());
    const frames = (dv.byteLength - 44) / 2;
    const pcm = new Float64Array(frames);
    let peak = 0;
    for (let i = 0; i < frames; i++) {
      pcm[i] = dv.getInt16(44 + i * 2, true) / 0x8000;
      const a = Math.abs(pcm[i]);
      if (a > peak) peak = a;
    }
    const rms = (from: number, to: number): number => {
      let s = 0; const a = Math.floor(frames * from); const b = Math.floor(frames * to);
      for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
      return Math.sqrt(s / Math.max(1, b - a));
    };
    check(`sfx ${type}: слышно`, rms(0, 1) > 0.02, `rms=${rms(0, 1).toFixed(3)}`);
    check(`sfx ${type}: без перегруза`, peak <= 1.0, `peak=${peak.toFixed(3)}`);
    if (type === 'riser') {
      // райзер обязан крещендировать: конец громче начала минимум в 3 раза
      const head = rms(0, 0.2); const tail = rms(0.75, 0.97);
      check('sfx riser: крещендо ×3', tail > Math.max(0.05, head * 3), `начало ${head.toFixed(3)} → финал ${tail.toFixed(3)}`);
    }
  }

  console.log(failures === 0 ? '\n✅ musicGenerator: все проверки пройдены' : `\n❌ ${failures} провалов`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
