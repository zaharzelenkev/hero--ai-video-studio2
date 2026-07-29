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

  const canGenerate = (items.length > 0 || prompt.trim().length > 5) && stage !== "generating" && stage !== "reading";

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
        project = await generateMagicVideo(prompt, style, setProgressLabel);
      }
      
      await saveProject(project);
      setRecentProjects(await listProjects());

      setProgressLabel("Подготовка видеодвижка...");
      const blob = await renderProject(
        project,
        (ratio) => {
          setProgress(ratio);
          setProgressLabel(`Рендеринг финального видео... ${Math.round(ratio * 100)}%`);
        },
        () => {}
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
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12] px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
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
            AI-Powered Professional Video Editor
          </p>
          
          <p className="mx-auto max-w-2xl text-sm text-slate-400 sm:text-base">
            Загрузите материалы — искусственный интеллект создаст профессиональный монтаж.<br />
            Доработайте результат в редакторе с продвинутыми инструментами.
          </p>


        </header>

        {/* Main Content */}
        <div className="mb-12 flex justify-center">
          {/* Upload Section */}
          <div className="w-full max-w-2xl">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 shadow-2xl backdrop-blur-sm">
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
