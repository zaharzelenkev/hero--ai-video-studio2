export type MusicStyle = "lofi" | "cinematic" | "electronic";

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
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

  const channelData = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let offset = 0;
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channelData[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: "audio/wav" });
}

function createKick(ctx: OfflineAudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
  gain.gain.setValueAtTime(1, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.5);
}

function createHihat(ctx: OfflineAudioContext, time: number, buffer: AudioBuffer) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 5000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(time);
}

function playChord(ctx: OfflineAudioContext, notes: number[], time: number, duration: number, type: OscillatorType = "sine", vol: number = 0.2) {
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.01, time);
  masterGain.gain.linearRampToValueAtTime(vol, time + 0.1);
  masterGain.gain.setValueAtTime(vol, time + duration - 0.5);
  masterGain.gain.linearRampToValueAtTime(0.01, time + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, time);
  filter.connect(masterGain);

  notes.forEach(note => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + duration);
  });
}

export async function generateProceduralMusic(style: MusicStyle, durationSeconds: number): Promise<Blob> {
  const sr = 44100;
  const dur = Math.ceil(durationSeconds) + 2; // small tail
  const ctx = new OfflineAudioContext(2, sr * dur, sr);

  // Pre-generate noise buffer for hi-hats/snares
  const noiseBuffer = ctx.createBuffer(1, sr * 2, sr);
  const nData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;

  if (style === "lofi") {
    const bpm = 80;
    const beatLen = 60 / bpm;
    // Chords: vi - IV - I - V (Am, F, C, G) mapped to MIDI notes
    const chords = [
      [57, 60, 64, 67], // Am7
      [53, 57, 60, 65], // Fmaj7
      [60, 64, 67, 71], // Cmaj7
      [55, 59, 62, 65]  // G7
    ];

    let beat = 0;
    while (beat * beatLen < dur) {
      const time = beat * beatLen;
      // Kick on 1 and 3.5
      if (beat % 4 === 0 || beat % 4 === 2.5) createKick(ctx, time);
      // Hihat every beat
      createHihat(ctx, time, noiseBuffer);
      // Chords every 4 beats
      if (beat % 4 === 0) {
        const chord = chords[Math.floor(beat / 4) % chords.length];
        playChord(ctx, chord, time, beatLen * 4, "sine", 0.3);
        // Vinyl noise bed
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = "lowpass";
        nFilter.frequency.value = 1000;
        const nGain = ctx.createGain();
        nGain.gain.value = 0.05;
        noise.connect(nFilter).connect(nGain).connect(ctx.destination);
        noise.start(time);
        noise.stop(time + beatLen * 4);
      }
      beat += 1;
    }
  } else if (style === "electronic") {
    const bpm = 120;
    const beatLen = 60 / bpm;
    // Arp bass
    const bassNotes = [36, 36, 48, 36, 39, 39, 51, 39]; // C2, C3, Eb2, Eb3
    
    let beat = 0;
    while (beat * beatLen < dur) {
      const time = beat * beatLen;
      // 4/4 Kick
      createKick(ctx, time);
      
      // 1/8 note arp
      for (let i = 0; i < 2; i++) {
        const arpTime = time + i * (beatLen / 2);
        const note = bassNotes[(beat * 2 + i) % bassNotes.length];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
        
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2000, arpTime);
        filter.frequency.exponentialRampToValueAtTime(100, arpTime + 0.2);
        
        gain.gain.setValueAtTime(0.4, arpTime);
        gain.gain.exponentialRampToValueAtTime(0.01, arpTime + 0.2);
        
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(arpTime);
        osc.stop(arpTime + 0.2);
      }
      beat += 1;
    }
  } else if (style === "cinematic") {
    // Hans Zimmer style: Slow brassy drones
    const chords = [
      [36, 43, 48, 55], // C minor power
      [32, 39, 44, 51], // Ab major
      [38, 45, 50, 57], // D minor
    ];
    let time = 0;
    let chordIdx = 0;
    while (time < dur) {
      const chord = chords[chordIdx % chords.length];
      const chordDur = 8;
      
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.01, time);
      masterGain.gain.linearRampToValueAtTime(0.4, time + 2); // Slow attack
      masterGain.gain.setValueAtTime(0.4, time + chordDur - 2);
      masterGain.gain.linearRampToValueAtTime(0.01, time + chordDur);
      
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, time);
      filter.frequency.linearRampToValueAtTime(1500, time + chordDur / 2);
      filter.frequency.linearRampToValueAtTime(400, time + chordDur);
      
      masterGain.connect(filter).connect(ctx.destination);
      
      chord.forEach(note => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        // slight detune for thickness
        osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12) * (1 + (Math.random() * 0.01 - 0.005));
        osc.connect(masterGain);
        osc.start(time);
        osc.stop(time + chordDur);
      });
      
      time += chordDur * 0.8; // overlap
      chordIdx++;
    }
  }

  const rendered = await ctx.startRendering();
  return audioBufferToWav(rendered);
}
