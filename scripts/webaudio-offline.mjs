/**
 * Минимальный OfflineAudioContext на чистом JS — НЕ для продакшена,
 * а для прослушивания/анализа musicGenerator в Node: реализует ровно те
 * ноды, что использует синтезатор (Oscillator, Gain, BiquadFilter RBJ,
 * DynamicsCompressor, BufferSource), с покадровой автоматизацией параметров.
 * Точности хватает для измерения пиков, LUFS-подобного RMS и спектрального баланса.
 */

const TAU = Math.PI * 2;

// ---------- AudioParam ----------

class Param {
  constructor(sr, defaultValue = 0) {
    this.value = defaultValue;
    this.sr = sr;
    this.events = []; // {t, v, kind}
  }
  setValueAtTime(v, t) {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new Error('Param: bad value/time');
    this.events.push({ t, v, kind: 'set' });
  }
  linearRampToValueAtTime(v, t) {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new Error('Param: bad linear ramp');
    this.events.push({ t, v, kind: 'linear' });
  }
  exponentialRampToValueAtTime(v, t) {
    if (v <= 0 || !Number.isFinite(v)) throw new Error(`exponentialRamp to ${v}`);
    if (!Number.isFinite(t)) throw new Error('exponentialRamp: bad time');
    this.events.push({ t, v, kind: 'exp' });
  }
  setTargetAtTime(v, t, tc) {
    if (!(tc > 0)) throw new Error('setTargetAtTime: bad timeConstant');
    this.events.push({ t, v, kind: 'target', tc });
  }
  cancelScheduledValues(t) {
    this.events = this.events.filter((e) => e.t < t);
  }
  /**
   * Предрасчёт покадровой огибающей.
   * Семантика Web Audio: ramp(v, T) интерполирует ОТ текущего значения/времени
   * предыдущего события ДО T — т.е. действует в интервале [prevT, T].
   */
  bake(frames) {
    const out = new Float64Array(frames);
    const sr = this.sr;
    const evs = [...this.events].sort((a, b) => a.t - b.t);
    let prevT = 0;
    let prevV = this.value; // intrinsic value до первого события
    const fillHold = (fromT, toT, v) => {
      const a = Math.max(0, Math.floor(fromT * sr));
      const b = Math.min(frames, Math.ceil(toT * sr));
      for (let f = a; f < b; f++) out[f] = v;
    };
    for (const ev of evs) {
      if (ev.kind === 'set') {
        fillHold(prevT, ev.t, prevV);
        prevT = ev.t; prevV = ev.v;
      } else if (ev.kind === 'target') {
        // экспоненциальное приближение к цели до следующего события / конца
        const nextT = evs[evs.indexOf(ev) + 1]?.t ?? frames / sr;
        const a = Math.max(0, Math.floor(prevT * sr));
        const b = Math.min(frames, Math.ceil(Math.max(nextT, ev.t) * sr));
        for (let f = a; f < b; f++) {
          out[f] = ev.v + (prevV - ev.v) * Math.exp(-(f / sr - ev.t) / ev.tc);
        }
        prevT = nextT;
        prevV = evs[evs.indexOf(ev) + 1] ? out[Math.max(0, b - 1)] : prevV;
      } else {
        // linear/exp ramp: интервал [prevT, ev.t] от prevV к ev.v
        const a = Math.max(0, Math.floor(prevT * sr));
        const b = Math.min(frames, Math.ceil(ev.t * sr));
        const span = Math.max(1e-9, ev.t - prevT);
        for (let f = a; f < b; f++) {
          const k = (f / sr - prevT) / span;
          if (ev.kind === 'exp') {
            const va = Math.max(1e-8, prevV);
            out[f] = va * Math.pow(Math.max(1e-8, ev.v) / va, k);
          } else {
            out[f] = prevV + (ev.v - prevV) * k;
          }
        }
        prevT = ev.t; prevV = ev.v;
      }
    }
    fillHold(prevT, frames / sr, prevV);
    return out;
  }
}

// ---------- nodes ----------

class Node {
  constructor(ctx) { this.ctx = ctx; this.inputs = []; }
  connect(dest) { dest.inputs.push(this); return dest; } // Web Audio: возвращает dest (чейнинг)
  disconnect() { /* noop */ }
  render() { throw new Error('abstract'); }
}

class Osc extends Node {
  constructor(ctx) {
    super(ctx);
    this.type = 'sine';
    this.frequency = new Param(ctx.sampleRate, 440);
    this.detune = new Param(ctx.sampleRate, 0);
    this._start = 0; this._stop = Infinity; this._phase = 0;
  }
  start(t = 0) { if (!Number.isFinite(t) || t < 0) throw new Error('osc.start bad'); this._start = t; }
  stop(t = 0) { this._stop = t; }
  render() {
    const { sampleRate: sr, _frames: frames } = this.ctx;
    const out = new Float64Array(frames);
    const f0 = sr > 0 ? this._start : 0;
    const s = Math.max(0, Math.floor(this._start * sr));
    const e = Math.min(frames, Math.ceil(this._stop * sr));
    if (s >= e) { this.cached = out; return this.cached; }
    const freq = this.frequency.bake(frames);
    let ph = this._phase;
    for (let i = s; i < e; i++) {
      ph += (freq[i] * TAU) / sr;
      if (ph > TAU * 4096) ph -= TAU * 4096;
      const p = ph % TAU;
      let v;
      switch (this.type) {
        case 'square': v = p < Math.PI ? 1 : -1; break;
        case 'sawtooth': v = (p / Math.PI) - 1; break;
        case 'triangle': v = p < Math.PI ? (p / Math.PI) * 2 - 1 : 3 - (p / Math.PI) * 2; break;
        default: v = Math.sin(p);
      }
      out[i] = v;
    }
    this.cached = out; return this.cached;
  }
}

class Gain extends Node {
  constructor(ctx) { super(ctx); this.gain = new Param(ctx.sampleRate, 1); }
  render() {
    const frames = this.ctx._frames;
    const g = this.gain.bake(frames);
    const out = new Float64Array(frames);
    for (const inp of this.inputs) {
      const x = inp.render();
      for (let i = 0; i < frames; i++) out[i] += x[i] * g[i];
    }
    return out;
  }
}

const BIQUAD_KIND = { lowpass: 0, highpass: 1, bandpass: 2 };

class Biquad extends Node {
  constructor(ctx) {
    super(ctx);
    this.type = 'lowpass';
    this.frequency = new Param(ctx.sampleRate, 350);
    this.Q = new Param(ctx.sampleRate, 1);
    this.gain = new Param(ctx.sampleRate, 0);
    this._b0 = 1; this._b1 = 0; this._b2 = 0; this._a1 = 0; this._a2 = 0;
    this._x1 = 0; this._x2 = 0; this._y1 = 0; this._y2 = 0;
  }
  _coeffs(freq, q) {
    const kind = BIQUAD_KIND[this.type] ?? 0;
    const w0 = TAU * Math.min(freq, this.ctx.sampleRate * 0.45) / this.ctx.sampleRate;
    const cosw = Math.cos(w0); const sinw = Math.sin(w0);
    const alpha = sinw / (2 * Math.max(0.001, q));
    let b0; let b1; let b2;
    if (kind === 0) { b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = b0; }
    else if (kind === 1) { b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha;
    this._b0 = b0 / a0; this._b1 = b1 / a0; this._b2 = b2 / a0;
    this._a1 = (-2 * cosw) / a0; this._a2 = (1 - alpha) / a0;
  }
  render() {
    const frames = this.ctx._frames;
    const inputSum = new Float64Array(frames);
    for (const inp of this.inputs) {
      const x = inp.render();
      for (let i = 0; i < frames; i++) inputSum[i] += x[i];
    }
    const out = new Float64Array(frames);
    const freq = this.frequency.bake(frames);
    const q = this.Q.bake(frames);
    const BLOCK = 64;
    for (let b0 = 0; b0 < frames; b0 += BLOCK) {
      this._coeffs(freq[Math.min(b0, frames - 1)], q[Math.min(b0, frames - 1)]);
      const end = Math.min(frames, b0 + BLOCK);
      for (let i = b0; i < end; i++) {
        const x = inputSum[i];
        const y = this._b0 * x + this._b1 * this._x1 + this._b2 * this._x2 - this._a1 * this._y1 - this._a2 * this._y2;
        this._x2 = this._x1; this._x1 = x; this._y2 = this._y1; this._y1 = y;
        out[i] = y;
      }
    }
    return out;
  }
}

class Compressor extends Node {
  constructor(ctx) {
    super(ctx);
    this.threshold = new Param(ctx.sampleRate, -24);
    this.knee = new Param(ctx.sampleRate, 30);
    this.ratio = new Param(ctx.sampleRate, 12);
    this.attack = new Param(ctx.sampleRate, 0.003);
    this.release = new Param(ctx.sampleRate, 0.25);
  }
  render() {
    const frames = this.ctx._frames;
    const sr = this.ctx.sampleRate;
    const x = new Float64Array(frames);
    for (const inp of this.inputs) {
      const s = inp.render();
      for (let i = 0; i < frames; i++) x[i] += s[i];
    }
    const out = new Float64Array(frames);
    const thr = this.threshold.bake(frames);
    const ratio = this.ratio.bake(frames);
    const atk = Math.exp(-1 / (this.attack.value * sr));
    const rel = Math.exp(-1 / (this.release.value * sr));
    let env = 0;
    for (let i = 0; i < frames; i++) {
      const lvl = Math.abs(x[i]);
      env = lvl > env ? atk * env + (1 - atk) * lvl : rel * env + (1 - rel) * lvl;
      const db = 20 * Math.log10(Math.max(1e-9, env));
      const over = db - thr[i];
      let gr = 0;
      if (over > 0) gr = over * (1 / Math.max(1, ratio[i]) - 1);
      out[i] = x[i] * Math.pow(10, gr / 20);
    }
    return out;
  }
}

class BufferSource extends Node {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    this.loop = false;
    this.loopStart = 0; this.loopEnd = 0;
    this.playbackRate = new Param(ctx.sampleRate, 1);
    this._start = 0; this._stop = Infinity;
  }
  start(t = 0) { if (!Number.isFinite(t) || t < 0) throw new Error('src.start bad'); this._start = t; }
  stop(t = 0) { this._stop = t; }
  render() {
    const { sampleRate: sr, _frames: frames } = this.ctx;
    const out = new Float64Array(frames);
    if (!this.buffer) return out;
    const data = this.buffer.getChannelData(0);
    const bufLen = data.length;
    const loopEnd = this.loop && this.loopEnd > 0 ? Math.min(bufLen, this.loopEnd * sr) : bufLen;
    const loopStart = this.loop ? this.loopStart * sr : 0;
    const rate = this.playbackRate.value || 1;
    const s = Math.max(0, Math.floor(this._start * sr));
    const e = Math.min(frames, Math.ceil(this._stop * sr));
    let pos = 0;
    for (let i = s; i < e; i++) {
      const idx = loopStart + (pos % Math.max(1, loopEnd - loopStart));
      out[i] = data[Math.floor(idx) % bufLen] ?? 0;
      pos += rate;
      if (!this.loop && pos >= bufLen) break;
    }
    return out;
  }
}

class Destination extends Node {
  render() {
    const frames = this.ctx._frames;
    const out = new Float64Array(frames);
    for (const inp of this.inputs) {
      const x = inp.render();
      for (let i = 0; i < frames; i++) out[i] += x[i];
    }
    return out;
  }
}

export class OfflineAudioContextJS {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.sampleRate = sampleRate;
    this._frames = length;
    this.destination = new Destination(this);
    this.currentTime = 0;
  }
  createOscillator() { return new Osc(this); }
  createGain() { return new Gain(this); }
  createBiquadFilter() { return new Biquad(this); }
  createDynamicsCompressor() { return new Compressor(this); }
  createBufferSource() { return new BufferSource(this); }
  createBuffer(channels, length, sampleRate) {
    const chans = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (c) => chans[Math.min(c, channels - 1)],
    };
  }
  startRendering() {
    const mono = this.destination.render();
    const left = new Float32Array(this._frames);
    for (let i = 0; i < this._frames; i++) left[i] = Math.max(-1.05, Math.min(1.05, mono[i]));
    const self = this;
    return Promise.resolve({
      numberOfChannels: self.numberOfChannels,
      sampleRate: self.sampleRate,
      length: self._frames,
      getChannelData: () => left,
    });
  }
}
