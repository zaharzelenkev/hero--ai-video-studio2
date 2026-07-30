export type SfxType = "pop" | "whoosh" | "riser" | "hit" | "swoosh" | "glitch" | "impact" | "ding";

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4);

  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: "audio/wav" });
}

export async function generateSfx(type: SfxType): Promise<Blob> {
  const sr = 44100;
  
  if (type === "pop") {
    const ctx = new OfflineAudioContext(1, sr * 0.15, sr);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, 0);
    osc.frequency.exponentialRampToValueAtTime(100, 0.1);
    gain.gain.setValueAtTime(0.8, 0);
    gain.gain.exponentialRampToValueAtTime(0.01, 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.15);
    const buffer = await ctx.startRendering();
    return audioBufferToWav(buffer);
  }
  
  if (type === "whoosh") {
    const dur = 0.5;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    const buffer = ctx.createBuffer(1, sr * dur, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(100, 0);
    filter.frequency.exponentialRampToValueAtTime(4000, dur / 2);
    filter.frequency.exponentialRampToValueAtTime(100, dur);
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, 0);
    gain.gain.exponentialRampToValueAtTime(0.8, dur / 2);
    gain.gain.exponentialRampToValueAtTime(0.01, dur);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(0);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  if (type === "hit") {
    const dur = 0.4;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(150, 0);
    osc.frequency.exponentialRampToValueAtTime(40, 0.2);
    gain.gain.setValueAtTime(1, 0);
    gain.gain.exponentialRampToValueAtTime(0.01, 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(dur);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  if (type === "riser") {
    const dur = 2.0;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(50, 0);
    osc.frequency.exponentialRampToValueAtTime(800, dur);
    gain.gain.setValueAtTime(0.01, 0);
    gain.gain.exponentialRampToValueAtTime(0.6, dur - 0.1);
    gain.gain.linearRampToValueAtTime(0.01, dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(dur);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  
  if (type === "swoosh") {
    const dur = 0.6;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    const buffer = ctx.createBuffer(1, sr * dur, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass";
    filter.frequency.setValueAtTime(100, 0);
    filter.frequency.exponentialRampToValueAtTime(800, dur / 2);
    filter.frequency.exponentialRampToValueAtTime(100, dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, 0);
    gain.gain.exponentialRampToValueAtTime(0.3, dur / 2);
    gain.gain.exponentialRampToValueAtTime(0.01, dur);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(0);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  if (type === "glitch") {
    const dur = 0.3;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    const osc = ctx.createOscillator(); osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, 0);
    osc.frequency.setValueAtTime(800, 0.1);
    osc.frequency.setValueAtTime(50, 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0); gain.gain.linearRampToValueAtTime(0.01, dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(dur);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  if (type === "impact") {
    const dur = 1.0;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(100, 0);
    osc.frequency.exponentialRampToValueAtTime(20, 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, 0); gain.gain.exponentialRampToValueAtTime(0.01, dur);
    
    // Add white noise punch
    const nBuf = ctx.createBuffer(1, sr * 0.1, sr);
    const nData = nBuf.getChannelData(0);
    for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = nBuf;
    const nFilter = ctx.createBiquadFilter(); nFilter.type = "lowpass"; nFilter.frequency.value = 500;
    const nGain = ctx.createGain(); nGain.gain.setValueAtTime(0.5, 0); nGain.gain.exponentialRampToValueAtTime(0.01, 0.1);
    noise.connect(nFilter).connect(nGain).connect(ctx.destination);
    noise.start(0);
    
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(dur);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  if (type === "ding") {
    const dur = 0.8;
    const ctx = new OfflineAudioContext(1, sr * dur, sr);
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, 0); gain.gain.exponentialRampToValueAtTime(0.01, dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(dur);
    const rendered = await ctx.startRendering();
    return audioBufferToWav(rendered);
  }

  throw new Error("Unknown SFX");
}
