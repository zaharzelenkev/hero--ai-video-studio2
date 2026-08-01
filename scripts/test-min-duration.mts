import { createEmptyProject, createVideoClip, createTrack, createTextClip, createAudioClip } from "../src/lib/factories";
import { ensureMinDuration, MIN_VIDEO_SECONDS } from "../src/lib/minDuration";
import { compileProjectToFfmpeg } from "../src/lib/filterGraph";
import type { MediaAsset, Project } from "../src/lib/types";

function buildShortProject(dur: number): Project {
  const p = createEmptyProject("test");
  const videoTrack = p.tracks.find((t) => t.type === "video")!;
  const audioTrack = p.tracks.find((t) => t.type === "audio")!;
  const textTrack = p.tracks.find((t) => t.type === "text")!;
  const asset: MediaAsset = {
    id: "v1", name: "v", kind: "video", mime: "video/mp4", blobKey: "v1", duration: dur, createdAt: Date.now(), hasAudio: true,
  };
  p.assets = [asset];
  const clip = createVideoClip({ trackId: videoTrack.id, asset, start: 0, duration: dur, inPoint: 0, outPoint: dur });
  clip.speed = 1;
  clip.scale.value = 1;
  clip.scale.keyframes = [
    { id: "k1", time: 0, value: 1, easing: "linear" },
    { id: "k2", time: dur, value: 1.2, easing: "linear" },
  ];
  clip.opacity.value = 1;
  clip.opacity.keyframes = [
    { id: "o1", time: 0, value: 0, easing: "linear" },
    { id: "o2", time: 0.5, value: 1, easing: "linear" },
    { id: "o3", time: dur, value: 1, easing: "linear" },
  ];
  videoTrack.clips.push(clip);

  const txt = createTextClip({ trackId: textTrack.id, start: 0, duration: dur, text: "Hello" });
  textTrack.clips.push(txt);

  const a = createAudioClip({
    trackId: audioTrack.id,
    asset: { ...asset, kind: "audio", mime: "audio/wav", id: "a1", blobKey: "a1" },
    start: 0,
    duration: dur,
  });
  a.loop = true;
  audioTrack.clips.push(a);

  p.duration = dur;
  return p;
}

function videoTrackTotal(p: Project): number {
  const vt = p.tracks.find((t) => t.type === "video");
  if (!vt) return 0;
  let max = 0;
  for (const c of vt.clips) max = Math.max(max, c.start + c.duration);
  return max;
}

let failures = 0;
for (const dur of [3, 4.5, 5, 8, 9.9, 10, 12]) {
  const p = buildShortProject(dur);
  ensureMinDuration(p, MIN_VIDEO_SECONDS);
  const total = videoTrackTotal(p);
  const comp = compileProjectToFfmpeg(p, p.exportSettings, () => "asset.mp4");
  const clip = p.tracks.find((t) => t.type === "video")!.clips[0] as any;
  const lastKf = clip.scale.keyframes[clip.scale.keyframes.length - 1].time;
  const okDur = total >= MIN_VIDEO_SECONDS - 0.001;
  const okFfmpeg = comp.totalDuration >= MIN_VIDEO_SECONDS - 0.001;
  const okKf = Math.abs(lastKf - clip.duration) < 0.001;
  const okSpeed = clip.speed >= 0 && clip.speed <= 1;
  if (!(okDur && okFfmpeg && okKf && okSpeed)) failures++;
  console.log(
    `in=${dur}s -> dur=${p.duration.toFixed(2)}s videoTotal=${total.toFixed(3)}s ffmpeg=${comp.totalDuration.toFixed(3)}s ` +
      `speed=${(clip.speed || 1).toFixed(3)} lastKf=${lastKf.toFixed(3)} ${okDur && okFfmpeg && okKf && okSpeed ? "✅" : "❌"}`,
  );
}

if (failures > 0) {
  console.error(`\n❌ MIN DURATION: ${failures} проверок не прошли`);
  process.exit(1);
} else {
  console.log(`\n✅ MIN DURATION: ВСЕ ПРОВЕРКИ ПРОШЛИ`);
}
