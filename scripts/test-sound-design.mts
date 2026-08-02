/**
 * Sound Design test suite
 *
 * Validates all 13 Sound Design modules work correctly:
 *   1. AI Noise Removal       — defaults, filter chain generation
 *   2. Voice Enhancement      — presets, EQ chain
 *   3. Auto Compressor        — settings
 *   4. Limiter                — settings
 *   5. EQ                     — 6-band parametric
 *   6. Loudness Normalization — LUFS targets
 *   7. Ducking                — settings
 *   8. Foley                  — generation (skip in Node)
 *   9. Room Tone              — generation (skip in Node)
 *  10. AI Music Selection     — mood-based selection
 *  11. AI Beat Sync           — snap to beats
 *  12. Voice Isolation        — filter settings
 *  13. Stereo Enhancement     — width/balance settings
 */

import {
  defaultSoundDesign,
  defaultEqBands,
  applySoundDesignPreset,
  selectMusicForProject,
  musicProfileForEmotion,
  snapCutsToBeats,
  buildSoundDesignFilters,
  type SoundDesignSettings,
  type SoundDesignPreset,
} from "../src/lib/soundDesign";

import type { PlannedScene } from "../src/lib/brain/directorPlan";

let pass = 0;
let fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${msg}`);
  } else {
    fail++;
    console.error(`  ❌ ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

// ─────────────────────────────────────────────────────────────────────────────
section("1. defaultSoundDesign()");
{
  const sd = defaultSoundDesign();
  assert(sd.noiseRemoval.enabled === false, "noiseRemoval disabled by default");
  assert(sd.voiceEnhance.enabled === false, "voiceEnhance disabled by default");
  assert(sd.compressor.enabled === false, "compressor disabled by default");
  assert(sd.limiter.enabled === true, "limiter enabled by default");
  assert(sd.loudnessNorm.enabled === true, "loudnessNorm enabled by default");
  assert(sd.loudnessNorm.targetLufs === -14, "default -14 LUFS (YouTube)");
  assert(sd.ducking.enabled === false, "ducking disabled by default");
  assert(sd.musicSelection.enabled === true, "music selection enabled by default");
  assert(sd.musicSelection.autoMatch === true, "autoMatch on by default");
  assert(sd.stereoEnhance.enabled === false, "stereoEnhance disabled by default");
  assert(sd.eq.bands.length === 6, "6 EQ bands");
  assert(sd.foley.events.length === 0, "no foley events by default");
  assert(sd.roomTone.room === "room", "default room is 'room'");
}

// ─────────────────────────────────────────────────────────────────────────────
section("2. defaultEqBands()");
{
  const bands = defaultEqBands();
  assert(bands.length === 6, "returns 6 bands");
  assert(bands[0].type === "highpass", "first band is highpass");
  assert(bands[5].type === "highshelf", "last band is highshelf");
  for (const b of bands) {
    assert(b.enabled === false, `band at ${b.frequency}Hz disabled`);
    assert(b.gain === 0, `band at ${b.frequency}Hz gain is 0`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section("3. Presets");
{
  const presets: SoundDesignPreset[] = [
    "podcast", "youtube", "cinematic", "interview",
    "documentary", "social-short", "voiceover", "music-video", "ambient",
  ];
  for (const p of presets) {
    const patch = applySoundDesignPreset(p);
    assert(typeof patch === "object", `preset "${p}" returns object`);
    assert(Object.keys(patch).length > 0, `preset "${p}" has settings`);
  }

  // Podcast specifics
  const podcast = applySoundDesignPreset("podcast");
  assert(podcast.noiseRemoval?.enabled === true, "podcast: noiseRemoval on");
  assert(podcast.voiceEnhance?.enabled === true, "podcast: voiceEnhance on");
  assert(podcast.loudnessNorm?.targetLufs === -16, "podcast: -16 LUFS");

  // YouTube specifics
  const yt = applySoundDesignPreset("youtube");
  assert(yt.loudnessNorm?.targetLufs === -14, "youtube: -14 LUFS");
  assert(yt.ducking?.enabled === true, "youtube: ducking on");

  // Cinematic specifics
  const cine = applySoundDesignPreset("cinematic");
  assert(cine.stereoEnhance?.enabled === true, "cinematic: stereo enhance on");
  assert(cine.roomTone?.enabled === true, "cinematic: room tone on");
}

// ─────────────────────────────────────────────────────────────────────────────
section("4. AI Music Selection — emotion mapping");
{
  const emotions = ["energetic", "calm", "dramatic", "funny", "inspiring", "neutral"] as const;
  for (const emo of emotions) {
    const profile = musicProfileForEmotion(emo);
    assert(profile.style !== "", `${emo}: has style`);
    assert(profile.bpm > 0, `${emo}: BPM > 0 (${profile.bpm})`);
    assert(profile.energy >= 0 && profile.energy <= 1, `${emo}: energy 0..1`);
    assert(profile.description.length > 0, `${emo}: has description`);
  }

  // Specific checks
  assert(musicProfileForEmotion("energetic").style === "electronic", "energetic → electronic");
  assert(musicProfileForEmotion("calm").style === "lofi", "calm → lofi");
  assert(musicProfileForEmotion("dramatic").mode === "minor", "dramatic → minor");
  assert(musicProfileForEmotion("inspiring").mode === "major", "inspiring → major");
}

// ─────────────────────────────────────────────────────────────────────────────
section("5. AI Music Selection — project-level");
{
  // Simulate scenes
  const scenes: PlannedScene[] = [
    { id: "s1", phase: "hook", goal: "Зацепить", intent: "", emotion: "energetic", targetIntensity: 0.8, pace: "fast", duration: 5, source: {} as any, bRolls: [], captions: [], music: { level: 0.8, role: "lead", ducking: false, accent: true, reason: "" }, colorMood: { mood: "warm", saturation: 0.2, contrast: 0.1, temperature: 0.1, brightness: 0, reason: "" }, brollRecommendations: [], why: "" } as any,
    { id: "s2", phase: "setup", goal: "Контекст", intent: "", emotion: "calm", targetIntensity: 0.4, pace: "medium", duration: 10, source: {} as any, bRolls: [], captions: [], music: { level: 0.5, role: "support", ducking: true, accent: false, reason: "" }, colorMood: { mood: "neutral", saturation: 0, contrast: 0, temperature: 0, brightness: 0, reason: "" }, brollRecommendations: [], why: "" } as any,
    { id: "s3", phase: "climax", goal: "Пик", intent: "", emotion: "dramatic", targetIntensity: 1.0, pace: "fast", duration: 8, source: {} as any, bRolls: [], captions: [], music: { level: 1.0, role: "lead", ducking: false, accent: true, reason: "" }, colorMood: { mood: "dark", saturation: 0.3, contrast: 0.2, temperature: -0.1, brightness: -0.1, reason: "" }, brollRecommendations: [], why: "" } as any,
  ];

  const result = selectMusicForProject(scenes);
  assert(result.style !== "", "auto-selects a style");
  assert(result.bpm > 0, `BPM > 0: ${result.bpm}`);
  assert(result.perScene.length === 3, "per-scene profiles for 3 scenes");
  assert(result.perScene[0].profile.style === "electronic", "s1 (energetic) → electronic");
  assert(result.perScene[1].profile.style === "lofi", "s2 (calm) → lofi");
  assert(result.perScene[2].profile.style === "cinematic", "s3 (dramatic) → cinematic");

  // Override
  const overridden = selectMusicForProject(scenes, { enabled: true, style: "ambient", targetBpm: 120, autoMatch: false });
  assert(overridden.style === "ambient", "override: style = ambient");
  assert(overridden.bpm === 120, "override: bpm = 120");
}

// ─────────────────────────────────────────────────────────────────────────────
section("6. AI Beat Sync — snap to beats");
{
  const beats = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
  const cuts = [0.1, 1.05, 2.6, 3.9]; // near beats

  const result = snapCutsToBeats(cuts, beats, 0.35);
  assert(result.adjustedCuts.length === 4, "returns 4 adjusted cuts");
  assert(result.adjustedCuts[0].snappedTime === 0, "0.1 → 0 (within tolerance)");
  assert(result.adjustedCuts[1].snappedTime === 1.0, "1.05 → 1.0 (within tolerance)");
  assert(result.adjustedCuts[2].snappedTime === 2.5, "2.6 → 2.5 (within tolerance)");
  assert(result.adjustedCuts[3].snappedTime === 4.0, "3.9 → 4.0 (within tolerance)");

  // Outside tolerance
  const farCuts = [0.8]; // between 0.5 and 1.0, 0.3 away from nearest (1.0 = 0.2 away, 0.5 = 0.3 away)
  const farResult = snapCutsToBeats(farCuts, beats, 0.15);
  assert(farResult.adjustedCuts[0].snappedTime === 0.8, "0.8 stays at 0.8 (outside ±0.15 tolerance)");

  // Empty beats
  const emptyResult = snapCutsToBeats([1, 2, 3], [], 0.35);
  assert(emptyResult.adjustedCuts.length === 3, "handles empty beats gracefully");
  assert(emptyResult.adjustedCuts[0].snappedTime === 1, "no change without beats");
}

// ─────────────────────────────────────────────────────────────────────────────
section("7. FFmpeg filter chain builder");
{
  const sd = defaultSoundDesign();

  // All disabled except limiter
  const filters = buildSoundDesignFilters("in", "out", sd);
  assert(filters.length > 0, "produces filters even with defaults");
  assert(filters.some(f => f.includes("alimiter")), "includes limiter");
  assert(filters.some(f => f.includes("loudnorm")), "includes loudnorm");

  // With noise removal
  sd.noiseRemoval.enabled = true;
  sd.noiseRemoval.highpassHz = 100;
  sd.noiseRemoval.lowpassHz = 12000;
  const filters2 = buildSoundDesignFilters("in", "out", sd);
  assert(filters2.some(f => f.includes("highpass=f=100")), "noise removal: highpass at 100Hz");
  assert(filters2.some(f => f.includes("lowpass=f=12000")), "noise removal: lowpass at 12kHz");
  assert(filters2.some(f => f.includes("afftdn")), "noise removal: afftdn filter");

  // With voice isolation
  sd.voiceIsolation.enabled = true;
  sd.voiceIsolation.lowCut = 100;
  sd.voiceIsolation.highCut = 10000;
  const filters3 = buildSoundDesignFilters("in", "out", sd);
  assert(filters3.some(f => f.includes("bandreject=f=50")), "voice isolation: bandreject 50Hz (hum)");
  assert(filters3.some(f => f.includes("bandreject=f=60")), "voice isolation: bandreject 60Hz (hum)");

  // With EQ
  sd.eq.enabled = true;
  sd.eq.bands[0].enabled = true;
  sd.eq.bands[0].gain = -6;
  const filters4 = buildSoundDesignFilters("in", "out", sd);
  assert(filters4.some(f => f.includes("highpass=f=80")), "EQ: highpass band");

  // With compressor
  sd.compressor.enabled = true;
  sd.compressor.threshold = -20;
  sd.compressor.ratio = 4;
  const filters5 = buildSoundDesignFilters("in", "out", sd);
  assert(filters5.some(f => f.includes("acompressor")), "includes acompressor");
  assert(filters5.some(f => f.includes("threshold=-20dB")), "compressor threshold = -20");
}

// ─────────────────────────────────────────────────────────────────────────────
section("8. Preset integration");
{
  for (const presetName of ["podcast", "youtube", "cinematic", "interview", "social-short"] as SoundDesignPreset[]) {
    const patch = applySoundDesignPreset(presetName);
    const sd = { ...defaultSoundDesign(), ...patch };

    // Verify all required fields are present
    assert(sd.noiseRemoval !== undefined, `${presetName}: noiseRemoval exists`);
    assert(sd.compressor !== undefined, `${presetName}: compressor exists`);
    assert(sd.limiter !== undefined, `${presetName}: limiter exists`);
    assert(sd.loudnessNorm !== undefined, `${presetName}: loudnessNorm exists`);

    // Verify limiter is always enabled (protection)
    assert(sd.limiter.enabled === true, `${presetName}: limiter always on`);

    // Generate FFmpeg filters — should not throw
    try {
      const filters = buildSoundDesignFilters("in", "out", sd);
      assert(filters.length > 0, `${presetName}: generates FFmpeg filters`);
    } catch (e) {
      assert(false, `${presetName}: filter generation failed — ${e}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section("9. Edge cases");
{
  // Empty project
  const emptySd = defaultSoundDesign();
  const filters = buildSoundDesignFilters("in", "out", emptySd);
  assert(filters.length > 0, "empty settings still produce limiter + loudnorm");

  // All enabled at once
  const allOn: SoundDesignSettings = {
    ...defaultSoundDesign(),
    noiseRemoval: { ...defaultSoundDesign().noiseRemoval, enabled: true },
    voiceEnhance: { ...defaultSoundDesign().voiceEnhance, enabled: true },
    compressor: { ...defaultSoundDesign().compressor, enabled: true },
    eq: { ...defaultSoundDesign().eq, enabled: true, bands: defaultEqBands().map(b => ({ ...b, enabled: true, gain: 3 })) },
    voiceIsolation: { ...defaultSoundDesign().voiceIsolation, enabled: true },
    stereoEnhance: { ...defaultSoundDesign().stereoEnhance, enabled: true, width: 1.5 },
  };
  try {
    const f = buildSoundDesignFilters("in", "out", allOn);
    assert(f.length > 5, "all-on: produces many filter stages");
  } catch (e) {
    assert(false, `all-on filter generation failed: ${e}`);
  }

  // Beat sync with single beat
  const single = snapCutsToBeats([1.0, 2.0], [1.0], 0.5);
  assert(single.adjustedCuts.length === 2, "single beat: returns all cuts");

  // Music selection with empty scenes
  const emptyMusic = selectMusicForProject([]);
  assert(emptyMusic.perScene.length === 0, "empty scenes: no per-scene profiles");
  assert(emptyMusic.bpm > 0, "empty scenes: still has default BPM");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`Sound Design: ${pass} passed, ${fail} failed`);
console.log("═".repeat(50));

if (fail > 0) {
  process.exit(1);
}
