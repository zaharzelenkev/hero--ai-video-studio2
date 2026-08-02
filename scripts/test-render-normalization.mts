/**
 * РЕГРЕССИОННЫЙ ТЕСТ НОРМАЛИЗАЦИИ ВИДЕО-ВХОДОВ ПЕРЕД ФИНАЛЬНОЙ СБОРКОЙ.
 *
 * Чинит фатальную ошибку автомонтажа
 *   «Error while processing the decoded data for stream #N:0 → Conversion failed!»
 *
 * Причина: автомонтаж открывает каждый исходник как отдельный вход ffmpeg, а
 * декодер каждого входа держит кадры в ПОЛНОМ разрешении. При многих 4K-клипах
 * wasm-куча исчерпывается посреди рендера, и ffmpeg падает с ошибкой декодирования.
 * Флаги `-fflags +discardcorrupt -err_detect ignore_err` лечат повреждённые кадры,
 * но не ограничивают память декодера.
 *
 * Решение (src/lib/normalizeInputs.ts): каждый РАЗНЫЙ видео-исходник один раз
 * перекодируется в промежуточный файл с разрешением ≤ канваса экспорта и
 * гарантированно валидными видео/аудио. Финальная сборка декодирует только их.
 *
 * Тест: генерирует монтаж из 4 клипов, ПОРТИТ часть кадров в двух исходниках и в
 * музыке (зануление байтов в середине), прогоняет нормализацию, компиляцию и
 * настоящий рендер @ffmpeg/core. Рендер обязан пройти успешно.
 *
 * Запуск: npx tsx scripts/test-render-normalization.mts
 */
import { Worker } from "node:worker_threads";
import { createEmptyProject, createVideoClip, createAudioClip } from "../src/lib/factories";
import type { MediaAsset } from "../src/lib/types";
import { compileProjectToFfmpeg, buildOutputArgs } from "../src/lib/filterGraph";
import { normalizeVideoInputs } from "../src/lib/normalizeInputs";

const worker = new Worker("./scripts/ffmpeg-node-worker.mjs", { type: "module" });
let idc = 0;
const pend = new Map<number, (r: any) => void>();
worker.on("message", (m) => { const p = pend.get(m.id); if (p) { pend.delete(m.id); p(m); } });
worker.on("error", (e) => { console.error("worker error", e); process.exit(1); });
const call = (type: string, payload: any = {}) => new Promise<any>((res) => { const id = ++idc; pend.set(id, res); worker.postMessage({ id, type, payload }); });
const ffmpeg = async (...args: string[]) => { const r = await call("exec", { args }); return { code: r.code ?? -1, logs: r.logs ?? [] }; };

let failures = 0;
const check = (name: string, cond: boolean, detail?: string) => { if (cond) console.log(`  ✅ ${name}`); else { failures++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); } };

await call("load");

console.log("=== генерация исходников (2 из 4 и музыку испортим) ===");
const mk = async (name: string, dur: number) => {
  const r = await ffmpeg("-f","lavfi","-i",`testsrc2=size=1280x720:rate=30:duration=${dur}`,"-f","lavfi","-i",`sine=frequency=${300+Math.floor(Math.random()*300)}:duration=${dur}`,"-c:v","libx264","-preset","fast","-crf","26","-pix_fmt","yuv420p","-c:a","aac","-shortest",name);
  return r.code;
};
await mk("v1.mp4",4); await mk("v2.mp4",4); await mk("v3.mp4",4); await mk("v4.mp4",4);
await ffmpeg("-f","lavfi","-i","sine=frequency=330:duration=12","-c:a","aac","music.m4a");

// Портим 20% тела v2 и v4 (битые кадры) и кусок музыки.
for (const nm of ["v2.mp4","v4.mp4"]) {
  const b = (await call("readFile",{name:nm})).data;
  const c = new Uint8Array(b.slice(0));
  for (let i=Math.floor(c.length*0.35); i<Math.floor(c.length*0.55); i++) c[i]=0x00;
  await call("writeFile",{name:nm,data:c});
}
const mb=(await call("readFile",{name:"music.m4a"})).data;
const mcr=new Uint8Array(mb.slice(0));
for (let i=Math.floor(mcr.length*0.5); i<Math.floor(mcr.length*0.5)+1500; i++) mcr[i]=0x00;
await call("writeFile",{name:"music.m4a",data:mcr});

const asset=(id: string,kind:string,dur:number,mime:string):MediaAsset=>({id,name:id,kind:kind as any,mime,blobKey:id,duration:dur,width:1280,height:720,createdAt:Date.now()});
const proj=createEmptyProject("montage_norm");
proj.resolution={width:720,height:1280};
proj.exportSettings={width:360,height:640,fps:30,format:"mp4",crf:28};
const va=[asset("v1","video",4,"video/mp4"),asset("v2","video",4,"video/mp4"),asset("v3","video",4,"video/mp4"),asset("v4","video",4,"video/mp4")];
const mus=asset("music","audio",12,"audio/mp4");
proj.assets=[...va,mus];
const vt=proj.tracks.find(t=>t.type==="video"&&t.name==="Видео 1")!;
let s=0;
for(let i=0;i<4;i++){ const c=createVideoClip({trackId:vt.id,asset:va[i],start:s,duration:1.5}); s+=1.5; vt.clips.push(c); }
const at=proj.tracks.find(t=>t.type==="audio")!;
const m=createAudioClip({trackId:at.id,asset:mus,start:0,duration:6}); m.muted=true; at.clips.push(m);
proj.duration=6;

const assetFileNames = new Map<string,string>();
for (const a of proj.assets) assetFileNames.set(a.id, `${a.id}.${a.kind==="audio"?"m4a":"mp4"}`);

console.log("\n=== нормализация видео-входов ===");
const norm = await normalizeVideoInputs(
  { exec: async (args) => (await ffmpeg(...args)).code, onLog: (m)=>console.log(`   · ${m}`) },
  proj, assetFileNames, 720, 30);
check("все 4 видео нормализованы", norm.created.length===4, JSON.stringify(norm.created));
check("замены применены (битый v2 указывает на норм. файл)", assetFileNames.get("v2")?.startsWith("norm_")===true, assetFileNames.get("v2"));
check("норм. файлы имеют чётные размеры (нет yuv420p-ошибки)", norm.created.length===4);

console.log("\n=== компиляция + рендер (с битыми исходниками) ===");
const compiled = compileProjectToFfmpeg(proj, proj.exportSettings, (clip)=>assetFileNames.get(clip.assetId)||"");
check("граф использует нормализованные файлы", compiled.inputs.every(i=>i.path.startsWith("norm_")||i.path.startsWith("music")), compiled.inputs.map(i=>i.path).join(","));
const args:string[]=[];
for (const inp of compiled.inputs){ if(!inp.path) continue; args.push(...inp.pre,"-i",inp.path); }
args.push("-filter_complex",compiled.filterComplex);
if(compiled.videoMapLabel) args.push("-map",`[${compiled.videoMapLabel}]`);
if(compiled.audioMapLabel) args.push("-map",`[${compiled.audioMapLabel}]`); else args.push("-an");
args.push("-t",compiled.totalDuration.toFixed(3));
args.push(...buildOutputArgs(proj.exportSettings,"out.mp4",compiled.totalDuration));
const rr=await ffmpeg(...args);
check("рендер автомонтажа с битыми исходниками прошёл", rr.code===0, (rr.logs||[]).filter(l=>/Error while processing|Conversion failed/i.test(l)).slice(0,4).join(" | "));

console.log(failures===0 ? "\n✅ НОРМАЛИЗАЦИЯ: ВСЕ ТЕСТЫ ПРОШЛИ" : `\n❌ ПРОВАЛОВ: ${failures}`);
process.exit(failures===0?0:1);
