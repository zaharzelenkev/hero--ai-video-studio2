/**
 * Audition-тест: РЕАЛЬНО рендерит musicGenerator через JS DSP
 * (scripts/webaudio-offline.mjs) и проверяет качество звука метриками:
 * клиппинг, громкость, динамическая арка, спектральный баланс по секциям.
 *
 * Run: npx tsx scripts/test-music-audition.mts
 */

import { OfflineAudioContextJS } from './webaudio-offline.mjs';

(globalThis as unknown as { window: unknown }).window = {
  OfflineAudioContext: OfflineAudioContextJS,
};

const { generateProceduralMusic } = await import('../src/lib/musicGenerator');

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function parseWav(buf: ArrayBuffer): Float32Array {
  const dv = new DataView(buf);
  const frames = (buf.byteLength - 44) / 4; // 2ch * 16bit
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const l = dv.getInt16(44 + i * 4, true) / 0x8000;
    const r = dv.getInt16(44 + i * 4 + 2, true) / 0x8000;
    out[i] = (l + r) / 2;
  }
  return out;
}

const db = (rms: number): number => 20 * Math.log10(Math.max(1e-9, rms));
function rms(x: Float32Array, from: number, to: number): number {
  let s = 0; const a = Math.max(0, Math.floor(from)); const b = Math.min(x.length, Math.floor(to));
  if (b <= a) return 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / (b - a));
}
/** HF-прокси: средняя энергия разностного сигнала (верхние частоты) */
function hf(x: Float32Array, from: number, to: number): number {
  let s = 0; const a = Math.max(1, Math.floor(from)); const b = Math.min(x.length, Math.floor(to));
  if (b <= a) return 0;
  for (let i = a; i < b; i++) { const d = x[i] - x[i - 1]; s += d * d; }
  return Math.sqrt(s / (b - a));
}
/** LF-прокси: энергия скользящего среднего (низкие частоты) */
function lf(x: Float32Array, from: number, to: number): number {
  const W = 64;
  let s = 0; let acc = 0;
  const a = Math.max(W, Math.floor(from)); const b = Math.min(x.length, Math.floor(to));
  if (b <= a) return 0;
  for (let i = 0; i < a; i++) acc += x[i];
  for (let i = a; i < b; i++) {
    acc += x[i] - x[i - W];
    const m = acc / W;
    s += m * m;
  }
  return Math.sqrt(s / (b - a));
}

async function main(): Promise<void> {
  const sr = 44100;
  const DUR = 12;
  console.log('🎧 audition: рендер через JS DSP + анализ\n');
  const styles = [
    // arcDb — жанрово корректная арка: lofi держит ровный «чил», electronic/cinematic строят
    { name: 'lofi' as const, hfGain: 1.05, arcDb: 1.5 },
    { name: 'electronic' as const, hfGain: 1.25, arcDb: 2.0 },
    { name: 'cinematic' as const, hfGain: 1.0, arcDb: 2.0 },
  ];

  for (const { name, hfGain, arcDb } of styles) {
    const t0 = Date.now();
    const blob = await generateProceduralMusic(name, DUR, 3);
    const wav = parseWav(await blob!.arrayBuffer());
    console.log(`— ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s рендер)`);

    // пики / клиппинг
    let peak = 0; let clipped = 0;
    for (let i = 0; i < wav.length; i++) {
      const a = Math.abs(wav[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
    }
    check(`${name}: нет цифрового клиппинга`, clipped / wav.length < 0.001,
      `${((clipped / wav.length) * 100).toFixed(3)}% сэмплов, peak=${peak.toFixed(3)}`);
    check(`${name}: peak в музыкальном диапазоне`, peak > 0.45 && peak <= 1.001, peak.toFixed(3));

    // громкость
    const overall = db(rms(wav, 0, wav.length));
    check(`${name}: громкость нормированная (-26..-10 dBFS RMS)`, overall > -26 && overall < -10, `${overall.toFixed(1)} dB`);

    // динамическая арка: пиковая секция громче интро
    const introDb = db(rms(wav, sr * 0.1, sr * DUR * 0.12));
    const peakDb = db(rms(wav, sr * DUR * 0.6, sr * DUR * 0.84));
    check(`${name}: арка интро→пик ≥ +${arcDb} dB`, peakDb - introDb >= arcDb, `intro ${introDb.toFixed(1)} → peak ${peakDb.toFixed(1)} dB`);

    // спектральное развитие: верха открываются к пику
    const hfIntro = hf(wav, sr * 0.1, sr * DUR * 0.12);
    const hfPeak = hf(wav, sr * DUR * 0.6, sr * DUR * 0.84);
    check(`${name}: верха растут к пику (×${hfGain})`, hfPeak > hfIntro * hfGain,
      `intro ${hfIntro.toFixed(4)} → peak ${hfPeak.toFixed(4)}`);

    // бас присутствует
    const lfAll = lf(wav, sr, wav.length);
    check(`${name}: низкие присутствуют`, lfAll > 0.005, `LF rms ${lfAll.toFixed(4)}`);

    // кривая громкости для визуальной оценки
    const bars: string[] = [];
    for (let w = 0; w < DUR; w++) {
      const v = db(rms(wav, w * sr, (w + 1) * sr));
      bars.push('▁▂▃▄▅▆▇█'[Math.max(0, Math.min(7, Math.round((v + 34) / 4)))]);
    }
    console.log(`  громкость по секундам: ${bars.join('')}\n`);
  }

  console.log(failures === 0 ? '✅ audition: все метрики в норме' : `❌ ${failures} провалов`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
