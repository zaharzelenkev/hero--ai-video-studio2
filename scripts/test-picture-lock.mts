/**
 * Регрессионный тест PICTURE LOCK (фиксация монтажа).
 *
 * Проверяет:
 *  - проверку длительности ролика и выравнивание под цель брифа;
 *  - анализ ритма (средний план, вариация темпа);
 *  - исправление слишком длинных кадров (обрезка/ускорение/разрез);
 *  - исправление слишком коротких кадров (дотягивание/удаление);
 *  - автоматическое выравнивание темпа по ритмической сетке;
 *  - контроль визуальной логики (дыры, jump cuts, переходы, титры за краем);
 *  - защиту речи: длинный кадр с репликами не режется по живому;
 *  - жизненный цикл: review → locked → unlock, идемпотентность финализации;
 *  - монтажную подпись: тайминг/склейки блокируются, цвет/звук/текст — нет.
 *
 * Запуск: npx tsx scripts/test-picture-lock.mts
 */
import {
  createAudioClip,
  createEmptyProject,
  createTextClip,
  createVideoClip,
} from "../src/lib/factories";
import type { Clip, MediaAsset, Project, SubtitleClip, VideoClip } from "../src/lib/types";
import {
  alignTempo,
  analyzePictureLock,
  clipIsStructuralEdit,
  finalizePictureLock,
  fixLongShots,
  fixPictureLock,
  isPictureLocked,
  lockPicture,
  mainShots,
  projectStructuralSignature,
  structuralSignature,
  timelineDurationOf,
  unlockPicture,
} from "../src/lib/pictureLock";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const asset = (id: string, kind: "video" | "image" | "audio", duration: number): MediaAsset => ({
  id,
  name: id,
  kind,
  mime: kind === "audio" ? "audio/wav" : kind === "image" ? "image/jpeg" : "video/mp4",
  blobKey: id,
  duration,
  width: 1920,
  height: 1080,
  createdAt: Date.now(),
});

/** Быстрый темп: maxShot 4.0, minShot 0.45, grid 0.25. */
function buildFixture(): Project {
  const p = createEmptyProject("picture-lock-test");
  p.style.pace = "fast";
  p.style.targetDuration = 15;
  const vTrack = p.tracks.find((t) => t.type === "video")!;
  const aTrack = p.tracks.find((t) => t.type === "audio")!;

  const vA = asset("vA", "video", 30);
  const vB = asset("vB", "video", 30);
  const img = asset("img", "image", 4);
  const music = asset("music", "audio", 60);
  p.assets = [vA, vB, img, music];

  const shot = (a: MediaAsset, start: number, duration: number, inPoint = 0): VideoClip =>
    createVideoClip({ trackId: vTrack.id, asset: a, start, duration, inPoint, outPoint: inPoint + duration });

  // A: слишком длинный кадр (20 с при лимите 4 с)
  const A = shot(vA, 0, 20, 0);
  // E: jump cut — тот же исходник и то же окно, что у A, сразу за ним
  const E = shot(vA, 20, 4, 0);
  // B: слишком короткий кадр-мигание (0.2 с при минимуме 0.45 с)
  const B = shot(vB, 24, 0.2, 0);
  // C: фото 2 с
  const C = shot(img, 24.2, 2, 0);
  // D: нормальный план 3 с, но с дырой 1.5 с после C
  const D = shot(vB, 27.7, 3, 0);

  vTrack.clips = [A, E, B, C, D] as Clip[];

  const musicClip = createAudioClip({ trackId: aTrack.id, asset: music, start: 0, duration: 30.7 });
  musicClip.loop = true;
  aTrack.clips = [musicClip];

  p.duration = 30.7;
  return p;
}

/* ------------------------------------------------------------------ */
console.log("\n1. Анализ: проверки находят проблемы");
{
  const p = buildFixture();
  const report = analyzePictureLock(p);

  check("длительность не соответствует цели (30.7 vs 15)", report.durationOk === false, `ok=${report.durationOk}`);
  check("длинный кадр найден", report.longShots === 1, `longShots=${report.longShots}`);
  check("короткий кадр найден", report.shortShots === 1, `shortShots=${report.shortShots}`);
  check("дыра в монтаже найдена", report.issues.some((i) => i.kind === "visual-logic" && i.severity === "fail" && /Дыра/.test(i.message)));
  check("jump cut найден", report.issues.some((i) => i.kind === "visual-logic" && /jump cut/i.test(i.message)));
  check("ритм проанализирован (средний план > 0)", report.averageShot > 0, `avg=${report.averageShot}`);
  check("общий статус — не allOk", report.allOk === false);
}

/* ------------------------------------------------------------------ */
console.log("\n2. Исправления: длинные/короткие кадры, дыры, jump cut, длительность");
{
  const p = buildFixture();
  const { project: fixed, fixes } = fixPictureLock(p);

  check("исправления применены", fixes.length > 0, `fixes=${fixes.length}`);
  const shots = mainShots(fixed);
  const maxDur = Math.max(...shots.map((s) => s.duration));
  const minDur = Math.min(...shots.map((s) => s.duration));
  check("нет планов длиннее лимита 4.0 с", maxDur <= 4.0 + 0.02, `max=${maxDur.toFixed(2)}`);
  check("нет планов короче минимума 0.45 с", minDur >= 0.45 - 0.02, `min=${minDur.toFixed(2)}`);

  // Дыры закрыты: соседние планы стыкуются (с учётом перекрытий переходов).
  const sorted = [...shots].sort((a, b) => a.start - b.start);
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const overlap = sorted[i - 1].start + sorted[i - 1].duration - sorted[i].start;
    const allowed = sorted[i].transitionIn?.duration ?? 0;
    if (overlap < -0.05) gaps++;
  }
  check("дыр на основной дорожке не осталось", gaps === 0, `gaps=${gaps}`);

  // Jump cut исправлен: окно плана E сдвинуто вперёд по исходнику.
  const eShot = sorted.find((s) => s.assetId === "vA" && s.inPoint > 0.5);
  check("jump cut исправлен (окно сдвинуто)", !!eShot && eShot.inPoint >= 0.85, `inPoint=${eShot?.inPoint.toFixed(2)}`);

  const report = analyzePictureLock(fixed);
  check("длительность выровнена под цель 15 с", report.durationOk === true, `dur=${report.duration.toFixed(2)} target=${report.targetDuration}`);
  check("длинных/коротких кадров не осталось", report.longShots === 0 && report.shortShots === 0);
}

/* ------------------------------------------------------------------ */
console.log("\n3. Выравнивание темпа");
{
  const p = buildFixture();
  // Рваный ритм: 0.4 / 2.9 / 3.1 / 0.4 / 2.9 с.
  const vTrack = p.tracks.find((t) => t.type === "video")!;
  const vA = p.assets[0];
  const vB = p.assets[1];
  const durations = [0.4, 2.9, 3.1, 0.4, 2.9];
  let cursor = 0;
  vTrack.clips = durations.map((d, i) => {
    const c = createVideoClip({ trackId: vTrack.id, asset: i % 2 === 0 ? vA : vB, start: cursor, duration: d, inPoint: 0, outPoint: d });
    cursor += d;
    return c as Clip;
  });
  p.duration = cursor;

  const before = analyzePictureLock(p);
  const { project: aligned } = alignTempo(p);
  const after = analyzePictureLock(aligned);

  check("вариация темпа снизилась", after.tempoVariation < before.tempoVariation, `cv ${before.tempoVariation} → ${after.tempoVariation}`);
  const shots = mainShots(aligned);
  const allOnGrid = shots.every((s) => {
    const g = Math.round(s.duration / 0.25) * 0.25;
    return Math.abs(g - s.duration) < 0.001 + 1e-6;
  });
  check("все планы лежат на сетке 0.25 с", allOnGrid, shots.map((s) => s.duration.toFixed(2)).join(", "));
}

/* ------------------------------------------------------------------ */
console.log("\n3b. Speed-ramp: длинный кадр с рампой режется окном, а не скоростью");
{
  const p = buildFixture();
  const vTrack = p.tracks.find((t) => t.type === "video")!;
  const vA = p.assets[0];
  const long = createVideoClip({ trackId: vTrack.id, asset: vA, start: 0, duration: 12, inPoint: 0, outPoint: 12 });
  long.speedRamp = {
    enabled: true,
    keyframes: [
      { time: 0, speed: 1, easing: "linear" },
      { time: 6, speed: 1.6, easing: "linear" },
    ],
  };
  vTrack.clips = [long as Clip];
  const aTrack = p.tracks.find((t) => t.type === "audio");
  if (aTrack) aTrack.clips = [];
  p.duration = 12;

  const { project: fixed, fixes } = fixLongShots(p);
  const shot = mainShots(fixed)[0];
  check("ramp-кадр обрезан до лимита 4 с", shot.duration <= 4.0 + 0.02, `dur=${shot.duration.toFixed(2)}`);
  check("базовая скорость ramp-кадра не тронута", (shot.speed ?? 1) === 1, `speed=${shot.speed}`);
  check("ramp-кадр не разрезан (окна хватает)", mainShots(fixed).length === 1, `shots=${mainShots(fixed).length}`);
  check("правка обрезки применена", fixes.some((f) => /обрезан/.test(f.message)));
}

/* ------------------------------------------------------------------ */
console.log("\n4. Защита речи: длинный кадр с репликой не режется по живому");
{
  const p = buildFixture();
  const vTrack = p.tracks.find((t) => t.type === "video")!;
  const vA = p.assets[0];
  // Один длинный план 12 с, речь идёт до 11-й секунды.
  vTrack.clips = [createVideoClip({ trackId: vTrack.id, asset: vA, start: 0, duration: 12, inPoint: 0, outPoint: 12 }) as Clip];
  // Речь моделируется дорожкой субтитров (как её создаёт автомонтаж).
  let subTrack = p.tracks.find((t) => t.type === "subtitle");
  if (!subTrack) {
    subTrack = { id: "st", type: "subtitle", name: "Субтитры", clips: [], hidden: false, muted: false, locked: false };
    p.tracks.push(subTrack);
  }
  const sub: SubtitleClip = {
    id: "sub1",
    trackId: subTrack.id,
    type: "subtitle",
    name: "Субтитр",
    text: "Длинная реплика",
    start: 0.5,
    duration: 10.5,
    startTime: 0.5,
    endTime: 11,
  };
  subTrack.clips = [sub];
  // Дорожка музыки не должна растягивать таймлайн мимо видео.
  const aTrack = p.tracks.find((t) => t.type === "audio");
  if (aTrack) aTrack.clips = [];
  p.duration = 12;

  const { project: fixed, fixes } = fixPictureLock(p);
  const shot = mainShots(fixed)[0];
  check("кадр остался длиннее речи (≥ 11.35 с)", shot.duration >= 11.35 - 0.05, `dur=${shot.duration.toFixed(2)}`);
  check("речь не обрезана склейкой", fixes.some((f) => /11\.3\d с/.test(f.message) || /без обрезки/.test(f.message)), fixes.map((f) => f.message).join(" | "));
  const report = analyzePictureLock(fixed);
  check("длинный речевой кадр помечен warn, а не fail", report.issues.some((i) => i.kind === "long-shots" && i.severity === "warn" && /речь/.test(i.message)));
}

/* ------------------------------------------------------------------ */
console.log("\n5. Жизненный цикл Picture Lock");
{
  const p = buildFixture();
  const finalized = finalizePictureLock(p);
  check("финализация переводит в review", finalized.pictureLock?.stage === "review");
  check("отчёт сформирован", !!finalized.pictureLock?.report && finalized.pictureLock.report.issues.length > 0);

  const locked = lockPicture(finalized);
  check("lockPicture фиксирует монтаж", isPictureLocked(locked) && locked.pictureLock?.stage === "locked");
  check("lockedAt записан", typeof locked.pictureLock?.lockedAt === "number");

  const reFinalized = finalizePictureLock(locked);
  check("финализация не снимает подтверждённый lock", isPictureLocked(reFinalized));

  const unlocked = unlockPicture(locked);
  check("unlockPicture возвращает к review", unlocked.pictureLock?.stage === "review" && !isPictureLocked(unlocked));

  // Идемпотентность: повторная финализация не плодит правки.
  const second = finalizePictureLock(finalized);
  const secondReport = second.pictureLock?.report;
  const firstReport = finalized.pictureLock?.report;
  check("повторная финализация не добавляет правок", (secondReport?.fixes.length ?? 0) === 0, `fixes=${secondReport?.fixes.length}`);
  check("отчёт стабилен между финализациями", secondReport?.issues.length === firstReport?.issues.length);
}

/* ------------------------------------------------------------------ */
console.log("\n6. Монтажная подпись: что блокируется после Picture Lock");
{
  const p = buildFixture();
  const shot = mainShots(p)[0];

  const colorEdit = { ...shot, color: { ...shot.color, saturation: { value: 0.5, keyframes: [] } } };
  check("изменение цвета — НЕ монтажная правка", clipIsStructuralEdit(shot, colorEdit) === false);

  const volumeEdit = { ...shot, volume: { value: 0.3, keyframes: [] } };
  check("изменение громкости — НЕ монтажная правка", clipIsStructuralEdit(shot, volumeEdit) === false);

  const textEdit = { ...shot, name: "Новое имя" };
  check("переименование — НЕ монтажная правка", clipIsStructuralEdit(shot, textEdit) === false);

  const durationEdit = { ...shot, duration: shot.duration - 1 };
  check("изменение длительности — монтажная правка", clipIsStructuralEdit(shot, durationEdit) === true);

  const startEdit = { ...shot, start: shot.start + 1 };
  check("изменение старта — монтажная правка", clipIsStructuralEdit(shot, startEdit) === true);

  const inPointEdit = { ...shot, inPoint: shot.inPoint + 1, outPoint: shot.outPoint + 1 };
  check("изменение in/out — монтажная правка", clipIsStructuralEdit(shot, inPointEdit) === true);

  const speedEdit = { ...shot, speed: 1.5, duration: shot.duration / 1.5 };
  check("изменение скорости — монтажная правка", clipIsStructuralEdit(shot, speedEdit) === true);

  const transitionEdit = { ...shot, transitionIn: { type: "crossfade" as const, duration: 0.5 } };
  check("изменение перехода — монтажная правка", clipIsStructuralEdit(shot, transitionEdit) === true);

  const effectsEdit = { ...shot, effects: ["glow"], cameraMotion: "zoom-in" as const, flipH: true };
  check("эффекты/Ken Burns/флип — НЕ монтажная правка", clipIsStructuralEdit(shot, effectsEdit) === false);

  const sigBefore = projectStructuralSignature(p);
  const withEmptyTrack = { ...p, tracks: [...p.tracks, { id: "empty", type: "text" as const, name: "Титры 2", clips: [], hidden: false, muted: false, locked: false }] };
  check("пустая дорожка не меняет монтажную подпись", projectStructuralSignature(withEmptyTrack) === sigBefore);

  const sigA = structuralSignature(shot);
  const sigB = structuralSignature(durationEdit);
  check("подпись различается для разных монтажей", sigA !== sigB);
}

/* ------------------------------------------------------------------ */
console.log("\n7. Сквозной сценарий автомонтажа (finalizePictureLock)");
{
  const p = buildFixture();
  const out = finalizePictureLock(p);
  const report = out.pictureLock?.report;
  check("проект в review после финализации", out.pictureLock?.stage === "review");
  check("длительность в отчёте совпадает с таймлайном", !!report && Math.abs(report.duration - timelineDurationOf(out)) < 0.01, `report=${report?.duration} actual=${timelineDurationOf(out)}`);
  check("после финализации проверки пройдены", !!report && report.allOk === true, `allOk=${report?.allOk}`);
  check("зафиксированы исправления в отчёте", !!report && report.fixes.length > 0, `fixes=${report?.fixes.length}`);
}

if (failures > 0) {
  console.error(`\n❌ PICTURE LOCK: ${failures} проверок не прошли`);
  process.exit(1);
} else {
  console.log("\n✅ PICTURE LOCK: ВСЕ ПРОВЕРКИ ПРОШЛИ");
}
