"use client";

import { evalParam } from "@/lib/keyframes";
import type { AudioClip, MediaAsset, Project } from "@/lib/types";
import type { SoundDesignSettings } from "@/lib/soundDesign";
import { defaultSoundDesign } from "@/lib/soundDesign";
import { mediaPool } from "./resourcePool";

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  analyser?: AnalyserNode;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Реальный аудио-микшер предпросмотра на Web Audio API:
 * громкость (в т.ч. по ключевым кадрам), фейды, 3-полосный эквалайзер,
 * панорама, компрессор, mute/solo треков и мастер-громкость.
 */
class AudioMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private voices = new Map<string, Voice>();
  private token = 0;
  private playing = false;
  private masterVolume = 1;
  private sd: SoundDesignSettings = defaultSoundDesign();

  context(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 1024;
      this.master.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Пиковый уровень мастера 0..1 — для индикатора громкости. */
  level(): number {
    if (!this.masterAnalyser) return 0;
    const data = new Uint8Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
    }
    return peak;
  }

  setMasterVolume(volume: number) {
    this.masterVolume = clamp(volume, 0, 1);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  /** Обновить настройки Sound Design (применяется к следующим play()). */
  setSoundDesign(sd: SoundDesignSettings) {
    this.sd = sd;
  }

  stop() {
    this.token += 1;
    this.playing = false;
    for (const voice of this.voices.values()) {
      try {
        voice.source.onended = null;
        voice.source.stop();
      } catch {
        /* ignore */
      }
      try {
        voice.source.disconnect();
        voice.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.voices.clear();
  }

  isPlaying() {
    return this.playing;
  }

  /** Запускает (или перезапускает) воспроизведение всех аудиоклипов от playhead. */
  play(project: Project, playhead: number, rate: number, masterVolume: number) {
    const ctx = this.context();
    if (!ctx) return;
    this.stop();
    this.playing = true;
    this.setMasterVolume(masterVolume);
    // Подтягиваем Sound Design из проекта при каждом play()
    this.sd = project.soundDesign ?? defaultSoundDesign();
    if (ctx.state === "suspended") void ctx.resume();

    const token = ++this.token;
    const soloTracks = project.tracks.filter((t) => t.solo);
    const assetsById = new Map(project.assets.map((a) => [a.id, a] as const));

    for (const track of project.tracks) {
      if (track.type !== "audio") continue;
      const audible = !track.muted && (soloTracks.length === 0 || track.solo === true);
      if (!audible) continue;
      for (const clip of track.clips) {
        if (clip.type !== "audio") continue;
        const audioClip = clip as AudioClip;
        if (audioClip.muted) continue;
        if (audioClip.start + audioClip.duration <= playhead) continue;
        const asset = assetsById.get(audioClip.assetId);
        if (!asset) continue;
        void this.scheduleClip(audioClip, asset, playhead, rate, token);
      }
    }
  }

  private async scheduleClip(
    clip: AudioClip,
    asset: MediaAsset,
    playhead: number,
    rate: number,
    token: number,
  ) {
    const ctx = this.context();
    if (!ctx || !this.master) return;
    const buffer = await mediaPool.audioBufferFor(asset, ctx);
    if (!buffer || token !== this.token || !this.playing) return;

    const clipSpeed = clip.speed ?? 1;
    const consumed = Math.max(0, playhead - clip.start);
    const remaining = clip.duration - consumed;
    if (remaining <= 0.01) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clamp(clipSpeed * rate, 0.0625, 16);
    if (clip.loop) {
      source.loop = true;
      source.loopStart = clip.inPoint;
      source.loopEnd = Math.max(clip.inPoint + 0.05, Math.min(buffer.duration, clip.outPoint || buffer.duration));
    }

    const gain = ctx.createGain();
    let node: AudioNode = source;

    // Эквалайзер: низ / середина / верх.
    if (clip.eqLow) {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 140;
      low.gain.value = clamp(clip.eqLow, -24, 24);
      node.connect(low);
      node = low;
    }
    if (clip.eqMid) {
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1200;
      mid.Q.value = 0.9;
      mid.gain.value = clamp(clip.eqMid, -24, 24);
      node.connect(mid);
      node = mid;
    }
    if (clip.eqHigh) {
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 6500;
      high.gain.value = clamp(clip.eqHigh, -24, 24);
      node.connect(high);
      node = high;
    }
    if (clip.denoise) {
      // Простой хай-пас + лёгкий лоу-пас режет гул и шипение.
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 90;
      node.connect(hp);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 12000;
      hp.connect(lp);
      node = lp;
    }
    if (clip.compressor?.enabled) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = clamp(clip.compressor.threshold, -100, 0);
      comp.ratio.value = clamp(clip.compressor.ratio, 1, 20);
      comp.attack.value = clamp((clip.compressor.attack ?? 5) / 1000, 0, 1);
      comp.release.value = clamp((clip.compressor.release ?? 50) / 1000, 0, 1);
      node.connect(comp);
      node = comp;
    }
    if (clip.pan && clip.pan.value !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(clip.pan.value, -1, 1);
      node.connect(panner);
      node = panner;
    }

    // ─── Sound Design: глобальная обработка ───
    const sd = this.sd;

    // Voice Isolation
    if (sd.voiceIsolation.enabled) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = sd.voiceIsolation.lowCut;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = sd.voiceIsolation.highCut;
      node.connect(hp); hp.connect(lp);
      node = lp;
    }

    // AI Noise Removal (realtime approximation: HP + LP)
    if (sd.noiseRemoval.enabled) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = sd.noiseRemoval.highpassHz;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = sd.noiseRemoval.lowpassHz;
      node.connect(hp); hp.connect(lp);
      node = lp;
    }

    // Voice Enhancement
    if (sd.voiceEnhance.enabled) {
      if (Math.abs(sd.voiceEnhance.presence) > 0.1) {
        const eq = ctx.createBiquadFilter();
        eq.type = "peaking"; eq.frequency.value = 3500; eq.Q.value = 1;
        eq.gain.value = clamp(sd.voiceEnhance.presence, -24, 24);
        node.connect(eq); node = eq;
      }
      if (sd.voiceEnhance.air > 0.1) {
        const eq = ctx.createBiquadFilter();
        eq.type = "highshelf"; eq.frequency.value = 10000;
        eq.gain.value = clamp(sd.voiceEnhance.air, -24, 24);
        node.connect(eq); node = eq;
      }
      if (sd.voiceEnhance.deEss > 0.5) {
        const eq = ctx.createBiquadFilter();
        eq.type = "peaking"; eq.frequency.value = 7000; eq.Q.value = 2;
        eq.gain.value = clamp(-sd.voiceEnhance.deEss, -24, 0);
        node.connect(eq); node = eq;
      }
    }

    // Sound Design Compressor (project-level)
    if (sd.compressor.enabled && !clip.compressor?.enabled) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = clamp(sd.compressor.threshold, -100, 0);
      comp.ratio.value = clamp(sd.compressor.ratio, 1, 20);
      comp.attack.value = clamp(sd.compressor.attack / 1000, 0, 1);
      comp.release.value = clamp(sd.compressor.release / 1000, 0, 1);
      comp.knee.value = sd.compressor.knee;
      node.connect(comp); node = comp;
    }

    // Stereo Enhancement (balance only — width needs mid/side, too heavy for realtime)
    if (sd.stereoEnhance.enabled && ctx.createStereoPanner && sd.stereoEnhance.balance !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(sd.stereoEnhance.balance, -1, 1);
      node.connect(panner); node = panner;
    }

    // Limiter (realtime via high-ratio compressor)
    if (sd.limiter.enabled) {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = sd.limiter.ceiling - 3;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = sd.limiter.release / 1000;
      lim.knee.value = 0;
      node.connect(lim); node = lim;
    }

    node.connect(gain);
    gain.connect(this.master);

    const startDelay = Math.max(0, (clip.start - playhead) / rate);
    const when = ctx.currentTime + startDelay;
    const offset = clamp(clip.inPoint + consumed * clipSpeed, 0, Math.max(0, buffer.duration - 0.01));
    const sourceSeconds = remaining * clipSpeed;

    // Огибающая громкости: ключевые кадры + фейды.
    const baseVolume = clip.volume?.value ?? 1;
    gain.gain.setValueAtTime(clamp(baseVolume, 0, 4), when);
    if (clip.volume?.keyframes?.length) {
      const step = 0.05;
      for (let t = 0; t <= remaining; t += step) {
        const local = consumed + t;
        const value = clamp(evalParam(clip.volume, local), 0, 4);
        gain.gain.setValueAtTime(value, when + t / rate);
      }
    }
    const fadeIn = clip.fadeIn ?? 0;
    if (fadeIn > 0 && consumed < fadeIn) {
      const from = clamp(consumed / fadeIn, 0, 1);
      gain.gain.setValueAtTime(baseVolume * from, when);
      gain.gain.linearRampToValueAtTime(baseVolume, when + (fadeIn - consumed) / rate);
    }
    const fadeOut = clip.fadeOut ?? 0;
    if (fadeOut > 0) {
      const fadeStart = Math.max(0, clip.duration - fadeOut - consumed);
      gain.gain.setValueAtTime(baseVolume, when + fadeStart / rate);
      gain.gain.linearRampToValueAtTime(0.0001, when + remaining / rate);
    }

    try {
      if (clip.loop) source.start(when, offset);
      else source.start(when, offset, sourceSeconds);
    } catch {
      return;
    }
    if (clip.loop) {
      try {
        source.stop(when + remaining / rate);
      } catch {
        /* ignore */
      }
    }

    source.onended = () => {
      this.voices.delete(clip.id);
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    this.voices.set(clip.id, { source, gain });
  }
}

export const audioMixer = new AudioMixer();
