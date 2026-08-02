"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadZone from "./UploadZone";
import PromptForm from "./PromptForm";
import type { UploadedItem } from "./types";
import { inferKind, readAudioMeta, readImageMeta, readVideoMeta } from "@/lib/media";
import { parsePromptToStyle } from "@/lib/promptStyle";
import { autoEditToProject } from "@/lib/autoEdit";
import { renderProject } from "@/lib/render";
import { saveBlob, saveProject, listProjects, deleteProject } from "@/lib/db";
import { uid } from "@/lib/id";
import type { MediaAsset, Project } from "@/lib/types";
import { createProductionPlan } from "@/lib/production";
import { ensureMinDuration } from "@/lib/minDuration";
import { finalizePictureLock } from "@/lib/pictureLock";

type Stage = "idle" | "reading" | "generating" | "error";

export default function GenerationScreenV2() {
  const router = useRouter();
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [templateId, setTemplateId] = useState<import("@/lib/templates").TemplateId | "">("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progressLabel, setProgressLabel] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);

  useEffect(() => {
    listProjects().then(setRecentProjects).catch(() => {});
  }, []);

  const startDirector = async (mode: "basic" | "pro" = "basic") => {
    const { createEmptyProject } = await import("@/lib/factories");
    const { saveProject } = await import("@/lib/db");
    const p = createEmptyProject("Новый проект");
    await saveProject(p);
    setRecentProjects(await listProjects());
    try {
      localStorage.setItem(`montiq.director.mode.${p.id}`, mode);
    } catch {
      /* ignore */
    }
    router.push(`/director/${p.id}?mode=${mode}`);
  };

  const canGenerate = (items.length > 0 || prompt.trim().length > 5) && stage !== "generating" && stage !== "reading";
  const productionPlan = createProductionPlan({
    idea: prompt,
    templateId,
    assets: items.map((item) => ({ kind: item.kind, duration: item.duration || 0 })),
  });

  const onAdd = async (files: File[]) => {
    setStage("reading");
    const next: UploadedItem[] = [];
    for (const file of files) {
      const kind = inferKind(file);
      try {
        const meta =
          kind === "video" ? await readVideoMeta(file) : kind === "image" ? await readImageMeta(file) : await readAudioMeta(file);
        next.push({ id: uid("up"), file, kind, name: file.name, ...meta });
      } catch {
        next.push({ id: uid("up"), file, kind, name: file.name, duration: kind === "image" ? 4 : 0 });
      }
    }
    setItems((prev) => [...prev, ...next]);
    setStage("idle");
  };

  const onRemove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handleGenerate = async () => {
    
    setStage("generating");
    setErrorMsg("");
    setProgress(0);
    
    try {
      setProgressLabel("Готовим материалы...");
      const assets: MediaAsset[] = [];
      const filesByAssetId = new Map<string, File>();
      
      for (const item of items) {
        const blobKey = uid("blob");
        await saveBlob(blobKey, item.file);
        const asset: MediaAsset = {
          id: uid("asset"),
          name: item.name,
          kind: item.kind,
          mime: item.file.type || (item.kind === "video" ? "video/mp4" : item.kind === "audio" ? "audio/mpeg" : "image/jpeg"),
          blobKey,
          duration: item.duration || 0,
          width: item.width,
          height: item.height,
          thumbnail: item.thumbnail,
          createdAt: Date.now(),
        };
        assets.push(asset);
        filesByAssetId.set(asset.id, item.file);
      }

      setProgressLabel("Интеллектуальный анализ и создание монтажа...");
      const style = parsePromptToStyle(prompt);
      style.intelligentCuts = true; // Enable AI analysis
      style.autoSubtitles = true;
      style.templateId = templateId || "auto";
      
      let project;
      if (items.length > 0) {
        project = await autoEditToProject({
          title: prompt.slice(0, 40) || "Новый проект",
          assets,
          filesByAssetId,
          style,
          onProgress: setProgressLabel
        });
      } else {
        const { generateMagicVideo } = await import("@/lib/generators/magicGenerator");
        project = await generateMagicVideo(prompt, style, setProgressLabel, filesByAssetId);
      }
      
      // Keep the creative brief with the timeline: production decisions survive
      // the hand-off from planning to auto-edit, editorial and export.
      project.production = productionPlan;

      // Гарантируем, что ролик длится не меньше 10 секунд (слишком короткие
      // монтажи из 3–5 секунд выглядят обрывком, а не видео).
      ensureMinDuration(project, 10);

      // PICTURE LOCK — режим финальной сборки: после завершения автомонтажа
      // система проверяет длительность, ритм, длинные/короткие кадры, темп и
      // визуальную логику, автоматически исправляет проблемы и оставляет
      // отчёт в проекте. В редакторе монтаж появится в стадии «review» —
      // до подтверждения Picture Lock.
      setProgressLabel("Picture Lock: финальная проверка монтажа…");
      project = finalizePictureLock(project);

      // НЕ сохраняем проект здесь: иначе незавершённое видео сразу попадало бы
      // в «Ваши проекты», и клик по нему во время рендера прерывал генерацию и
      // открывал редактор с пустыми «Clip»-заглушками. Сохраняем проект только
      // ПОСЛЕ рендера — когда видео готово и пользователь видит экран «Ваше
      // видео создано».

      setProgressLabel("Подготовка видеодвижка...");
      const blob = await renderProject(
        project,
        (ratio) => {
          setProgress(ratio);
          setProgressLabel(`Рендеринг финального видео... ${Math.round(ratio * 100)}%`);
        },
        (msg) => {
           console.log("[FFmpeg Log]:", msg);
        }
      );

      const previewKey = uid("blob");
      await saveBlob(previewKey, blob);
      project.previewBlobKey = previewKey;
      await saveProject(project);
      setRecentProjects(await listProjects());

      // Redirect to success page
      router.push(`/success/${project.id}`);
    } catch (err) {
      console.error("Generation error:", err);
      if (err instanceof Error) console.error(err.stack);
      const raw = err instanceof Error ? err.message : "";
      const friendly = "Ошибка: " + raw;
      setErrorMsg(friendly);
      setStage("error");
    }
  };

  
  const busy = stage === "generating";

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12] text-slate-100">
      {/* Central pre-production control bar ABOVE the logo */}
      <div className="w-full border-b border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-3">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            {/* Бренд — сразу перед кнопками режимов */}
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-amber-400 text-sm shadow-lg">🎬</div>
              <div className="text-left">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-200">MONTIQ</div>
                <div className="-mt-0.5 text-[10px] font-semibold text-slate-400">AI Production Studio</div>
              </div>
            </div>
            <div className="hidden h-6 w-px bg-white/10 sm:block" />
            <div className="flex items-center gap-2">
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 lg:inline">
                AI Director
              </span>
              <button
                onClick={() => startDirector("basic")}
                className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/10 px-3.5 py-1.5 text-[11px] font-extrabold text-violet-100 transition hover:bg-violet-500/20 hover:brightness-110"
                title="Режиссёр сам ведёт вас вопросами в чате"
              >
                🧭 Базовый режим
              </button>
              <button
                onClick={() => startDirector("pro")}
                className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 text-[11px] font-extrabold text-slate-300 transition hover:bg-white/[0.06] hover:text-slate-100"
                title="Полный Production Workspace со всеми разделами"
              >
                🎬 Профессиональный режим
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <header className="mb-12 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/50">
              <span className="text-2xl">🎬</span>
            </div>
            <h1 className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
              MONTIQ
            </h1>
          </div>
          
          <p className="mb-2 text-lg font-semibold text-slate-300 sm:text-xl">
            AI Production Studio
          </p>
          
          <p className="mx-auto max-w-2xl text-sm text-slate-400 sm:text-base">
            От идеи и сценария — до финального экспорта. Пройдите все 12 этапов препродакшена с AI Director, затем монтируйте в профессиональном редакторе.
          </p>


        </header>

        {/* AI Director — separate production stage */}
        <div className="mb-10 flex justify-center">
          <button
            onClick={() => startDirector("basic")}
            className="group relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-left shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-[1.01] hover:border-violet-400/40 hover:bg-white/[0.04]"
            aria-label="Открыть AI Director"
          >
            <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-600/20 blur-[80px] transition-opacity duration-300 group-hover:bg-violet-600/30" />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-amber-500/10 blur-[90px]" />
            <div className="relative flex items-center gap-5">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-3xl shadow-2xl shadow-violet-900/50 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
                🎬
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <h2 className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-amber-200 bg-clip-text text-xl font-black tracking-tight text-transparent">
                    AI Director
                  </h2>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">
                  Начните не с монтажа, а с режиссуры. В базовом режиме режиссёр сам ведёт вас
                  вопросами в чате и собирает весь Production Blueprint; в профессиональном — открывается
                  полный Production Workspace со всеми разделами.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-extrabold text-white shadow-xl shadow-violet-900/40 transition-transform duration-300 group-hover:translate-x-1">
                Начать
                <span className="text-base leading-none">→</span>
              </div>
            </div>
          </button>
        </div>

        {/* Main Content */}
        <div className="mb-12 flex justify-center">
          {/* Upload Section */}
          <div className="w-full max-w-5xl">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 shadow-2xl backdrop-blur-sm sm:p-8">
              <UploadZone items={items} onAdd={onAdd} onRemove={onRemove} />
              <div className="mt-6">
                <PromptForm prompt={prompt} onChange={setPrompt} templateId={templateId} onTemplateChange={setTemplateId} />
              </div>

              {stage === "error" && (
                <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-center backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-2xl shadow-inner border border-red-500/20">
                    ⚠️
                  </div>
                  <h3 className="mb-2 text-base font-bold text-slate-200">Произошла заминка</h3>
                  <p className="mb-4 text-xs text-slate-400 max-w-sm">{errorMsg}</p>
                  <button
                    onClick={() => { setStage("idle"); setErrorMsg(""); }}
                    className="rounded-xl bg-white/10 px-6 py-2.5 text-xs font-semibold text-white transition-all hover:bg-white/20 active:scale-95"
                  >
                    Попробовать снова
                  </button>
                </div>
              )}

              {busy && (
                <div className="mt-4 space-y-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 transition-all duration-300 relative overflow-hidden"
                      style={{ width: `${Math.max(6, progress * 100)}%` }}
                    >
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                  </div>
                  <p className="text-center text-xs text-slate-400">{progressLabel}</p>
                </div>
              )}

              <button
                disabled={!canGenerate}
                onClick={handleGenerate}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-900/40 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-violet-900/50 focus:outline-none focus:ring-4 focus:ring-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {busy ? "🎬 Создаём ваше видео..." : items.length > 0 ? "🚀 Смонтировать видео" : "✨ Сгенерировать с нуля (AI)"}
              </button>
              
              <p className="mt-3 text-center text-[10px] text-slate-500">
                Все данные обрабатываются локально на вашем устройстве
              </p>
            </div>
          </div>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-bold text-slate-300">Ваши проекты</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {recentProjects.map((p) => (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm transition-all hover:border-violet-500/50 hover:bg-white/[0.05]"
                >
                  <button
                    onClick={() => router.push(`/editor/${p.id}`)}
                    className="block w-full text-left"
                  >
                    <div className="mb-3 flex h-20 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-3xl">
                      🎞️
                    </div>
                    <p className="mb-1 truncate text-xs font-semibold text-slate-200">{p.title || "Без названия"}</p>
                    <p className="text-[10px] text-slate-500">
                      {Math.round(p.duration)}с · {p.tracks.reduce((n, t) => n + t.clips.length, 0)} клипов
                    </p>
                  </button>
                  <button
                    onClick={async () => {
                      await deleteProject(p.id);
                      setRecentProjects(await listProjects());
                    }}
                    className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white backdrop-blur-sm group-hover:flex"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
