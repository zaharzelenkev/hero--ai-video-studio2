"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UploadZone from "./UploadZone";
import PromptForm from "./PromptForm";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
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
          onProgress: setProgressLabel,
        });
      } else {
        const { generateMagicVideo } = await import("@/lib/generators/magicGenerator");
        project = await generateMagicVideo(prompt, style, setProgressLabel, filesByAssetId);
      }

      project.production = productionPlan;

      ensureMinDuration(project, 10);

      setProgressLabel("Picture Lock: финальная проверка монтажа…");
      project = finalizePictureLock(project);

      setProgressLabel("Подготовка видеодвижка...");
      const blob = await renderProject(
        project,
        (ratio) => {
          setProgress(ratio);
          setProgressLabel(`Рендеринг финального видео... ${Math.round(ratio * 100)}%`);
        },
        (msg) => {
          console.log("[FFmpeg Log]:", msg);
        },
      );

      const previewKey = uid("blob");
      await saveBlob(previewKey, blob);
      project.previewBlobKey = previewKey;
      await saveProject(project);
      setRecentProjects(await listProjects());

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
    <main className="app-bg min-h-screen text-slate-100">
      {/* ------------------------------ top bar ------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo size={34} />

          <div className="flex items-center gap-2">
            <span className="eyebrow hidden lg:inline">AI Director</span>
            <button
              onClick={() => startDirector("basic")}
              className="btn btn-ghost h-8 px-3.5 text-xs"
              title="Режиссёр сам ведёт вас вопросами в чате"
            >
              <Icon name="compass" size={15} className="text-violet-300" />
              <span className="hidden sm:inline">Базовый режим</span>
            </button>
            <button
              onClick={() => startDirector("pro")}
              className="btn btn-primary h-8 px-3.5 text-xs"
              title="Полный Production Workspace со всеми разделами"
            >
              <Icon name="clapper" size={15} />
              <span className="hidden sm:inline">Профессиональный режим</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        {/* ------------------------------ hero ------------------------------ */}
        <header className="mb-14 text-center">
          <div className="animate-fade-up">
            <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-violet-500/10 shadow-[0_0_50px_-14px_rgba(124,108,246,0.6)]">
              <Icon name="film" size={26} className="text-violet-300" />
            </div>
            <h1 className="title text-5xl sm:text-6xl">
              <span className="text-gradient">MONTIQ</span>
            </h1>
            <p className="mt-3 text-base font-medium text-slate-200 sm:text-lg">AI Production Studio</p>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
              От идеи и сценария — до финального экспорта. Пройдите препродакшен с AI&nbsp;Director,
              затем монтируйте в профессиональном редакторе.
            </p>
          </div>
        </header>

        {/* ------------------------------ AI Director ------------------------------ */}
        <div className="mb-12 flex justify-center">
          <button
            onClick={() => startDirector("basic")}
            className="group relative w-full max-w-5xl overflow-hidden rounded-[22px] border border-white/[0.08] surface-card p-6 text-left transition-all duration-300 hover:scale-[1.005] sm:p-7"
            style={{ transitionTimingFunction: "var(--ease-out)" }}
            aria-label="Открыть AI Director"
          >
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-600/25 blur-[90px] transition-opacity duration-500 group-hover:bg-violet-500/30" />
            <div className="pointer-events-none absolute -bottom-28 -left-14 h-56 w-56 rounded-full bg-violet-800/15 blur-[100px]" />

            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl overflow-hidden shadow-lg shadow-violet-500/20">
                <Image 
                  src="/director-icon.png" 
                  alt="AI Director" 
                  width={64} 
                  height={64} 
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2.5">
                  <h2 className="title text-xl">AI Director</h2>
                  <span className="badge badge-primary">Production Blueprint</span>
                </div>
                <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
                  Начните не с монтажа, а с режиссуры. В базовом режиме режиссёр ведёт вас вопросами в чате
                  и собирает весь Production Blueprint; в профессиональном — открывается полный Production
                  Workspace со всеми разделами.
                </p>
              </div>
              <div className="btn btn-primary shrink-0 px-5 py-3 text-sm">
                Начать
                <Icon name="arrow-right" size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </div>
            </div>
          </button>
        </div>

        {/* ------------------------------ main card ------------------------------ */}
        <div className="mb-12 flex justify-center">
          <div className="w-full max-w-5xl">
            <div className="surface-card rounded-[22px] p-6 sm:p-8">
              <UploadZone items={items} onAdd={onAdd} onRemove={onRemove} />
              <div className="mt-7">
                <PromptForm prompt={prompt} onChange={setPrompt} templateId={templateId} onTemplateChange={setTemplateId} />
              </div>

              {stage === "error" && (
                <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6 text-center animate-scale-in">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
                    <Icon name="alert" size={22} className="text-red-300" />
                  </div>
                  <h3 className="mb-2 text-base font-bold text-slate-100">Произошла заминка</h3>
                  <p className="mb-4 max-w-sm text-xs text-slate-400">{errorMsg}</p>
                  <button
                    onClick={() => {
                      setStage("idle");
                      setErrorMsg("");
                    }}
                    className="btn btn-ghost px-6 py-2.5 text-xs"
                  >
                    Попробовать снова
                  </button>
                </div>
              )}

              {busy && (
                <div className="mt-5 space-y-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="relative h-full overflow-hidden rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(6, progress * 100)}%`, background: "linear-gradient(90deg,#7c6cf6,#a78bfa)" }}
                    >
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                    </div>
                  </div>
                  <p className="text-center text-xs text-slate-400">{progressLabel}</p>
                </div>
              )}

              <button
                disabled={!canGenerate}
                onClick={handleGenerate}
                className={`btn btn-primary mt-7 h-12 w-full text-[15px] font-semibold ${busy ? "is-loading" : ""}`}
              >
                {busy ? (
                  "Создаём ваше видео"
                ) : items.length > 0 ? (
                  <>
                    <Icon name="wand" size={17} />
                    Смонтировать видео
                  </>
                ) : (
                  <>
                    <Icon name="zap" size={17} />
                    Сгенерировать с нуля (AI)
                  </>
                )}
              </button>

              <p className="mt-3.5 flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-500">
                <Icon name="lock" size={11} />
                Все данные обрабатываются локально на вашем устройстве
              </p>
            </div>
          </div>
        </div>

        {/* ------------------------------ recent projects ------------------------------ */}
        {recentProjects.length > 0 && (
          <section className="mx-auto max-w-5xl animate-fade-up">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="title text-lg text-slate-200">Ваши проекты</h2>
              <span className="badge badge-muted">{recentProjects.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {recentProjects.map((p) => (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition-all duration-300 hover:border-violet-500/40 hover:bg-white/[0.04]"
                >
                  <button onClick={() => router.push(`/editor/${p.id}`)} className="block w-full text-left">
                    <div className="mb-3 flex h-20 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/[0.14] to-violet-800/[0.08] border border-white/[0.05]">
                      <Icon name="film" size={28} className="text-violet-300/70" />
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
                    className="icon-btn absolute right-2 top-2 hidden h-6 w-6 bg-black/60 group-hover:flex"
                    aria-label="Удалить проект"
                  >
                    <Icon name="trash" size={13} />
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
