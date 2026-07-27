"use client";

import { useEffect, useMemo, useState } from "react";
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

type Stage = "idle" | "reading" | "generating" | "result" | "error";

export default function GenerationScreen() {
  const router = useRouter();
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progressLabel, setProgressLabel] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultProjectId, setResultProjectId] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);

  useEffect(() => {
    listProjects().then(setRecentProjects).catch(() => {});
  }, [stage]);

  const canGenerate = items.length > 0 && stage !== "generating" && stage !== "reading";

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
    if (!items.length) return;
    setStage("generating");
    setErrorMsg("");
    setProgress(0);
    try {
      setProgressLabel("Готовим материалы…");
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

      setProgressLabel("Собираем монтаж из ваших материалов…");
      const style = parsePromptToStyle(prompt);
      const project = await autoEditToProject({
        title: prompt.slice(0, 40) || "Новый проект",
        assets,
        filesByAssetId,
        style,
      });
      await saveProject(project);

      setProgressLabel("Готовим видеодвижок…");
      const blob = await renderProject(
        project,
        (ratio) => {
          setProgress(ratio);
          setProgressLabel(`Собираем результат… ${Math.round(ratio * 100)}%`);
        },
        () => {},
      );

      const previewKey = uid("blob");
      await saveBlob(previewKey, blob);
      project.previewBlobKey = previewKey;
      await saveProject(project);

      setResultUrl(URL.createObjectURL(blob));
      setResultProjectId(project.id);
      setStage("result");
    } catch (err) {
      console.error(err);
      const raw = err instanceof Error ? err.message : "";
      const friendly =
        raw.includes("fetch") || raw.includes("network")
          ? "Не удалось загрузить видеодвижок — проверьте подключение к интернету и попробуйте ещё раз."
          : raw || "Не удалось собрать видео. Попробуйте ещё раз.";
      setErrorMsg(friendly);
      setStage("error");
    }
  };

  const reset = () => {
    setStage("idle");
    setResultUrl(null);
    setResultProjectId(null);
    setItems([]);
    setPrompt("");
  };

  const busy = stage === "generating";

  const stepIndicator = useMemo(
    () => (
      <div className="mb-8 flex items-center gap-3 text-xs text-slate-400">
        <StepDot active={stage !== "result"} label="1. Материалы и описание" />
        <div className="h-px w-8 bg-white/10" />
        <StepDot active={stage === "result"} label="2. Результат" />
        <div className="h-px w-8 bg-white/10" />
        <span className="text-slate-500">3. Профессиональный редактор</span>
      </div>
    ),
    [stage],
  );

  return (
    <main className="min-h-screen bg-[#0b0b14] px-4 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-3xl font-black uppercase tracking-[0.08em] text-violet-400 sm:text-5xl">AI Video Studio</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Загрузите материалы — мы соберём из них готовое видео</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Автоматический монтаж из ваших клипов, фото и музыки — а если что-то захочется изменить, доработайте
            результат вручную в профессиональном редакторе: таймлайн, цвет, эффекты, звук и титры.
          </p>
        </header>

        {stepIndicator}

        {stage !== "result" && (
          <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6 shadow-2xl">
            <UploadZone items={items} onAdd={onAdd} onRemove={onRemove} />
            <PromptForm prompt={prompt} onChange={setPrompt} />

            {stage === "error" && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {errorMsg}
              </div>
            )}

            {busy && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                    style={{ width: `${Math.max(6, progress * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">{progressLabel}</p>
              </div>
            )}

            <button
              disabled={!canGenerate}
              onClick={handleGenerate}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Собираем видео…" : "🎬 Собрать видео"}
            </button>
            <p className="text-center text-[11px] text-slate-500">
              Материалы обрабатываются прямо на вашем устройстве и никуда не отправляются.
            </p>
          </div>
        )}

        {stage === "result" && resultUrl && (
          <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Готово! Вот результат автоматического монтажа</h2>
            <video src={resultUrl} controls className="w-full rounded-xl border border-white/10 bg-black" />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => resultProjectId && router.push(`/editor/${resultProjectId}`)}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40"
              >
                ✂️ Редактировать видео
              </button>
              <a
                href={resultUrl}
                download="ai-video-preview.mp4"
                className="rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-slate-200 hover:bg-white/5"
              >
                ⬇️ Скачать
              </a>
              <button onClick={reset} className="rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-slate-400 hover:bg-white/5">
                Начать заново
              </button>
            </div>
          </div>
        )}

        {recentProjects.length > 0 && (
          <section className="mt-10">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Ваши проекты</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {recentProjects.map((p) => (
                <div key={p.id} className="group relative rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <button onClick={() => router.push(`/editor/${p.id}`)} className="block w-full text-left">
                    <div className="mb-2 flex h-16 items-center justify-center rounded-lg bg-black/40 text-2xl">🎞️</div>
                    <p className="truncate text-xs font-medium text-slate-200">{p.title || "Без названия"}</p>
                    <p className="text-[10px] text-slate-500">{Math.round(p.duration)}с · {p.tracks.reduce((n, t) => n + t.clips.length, 0)} клипов</p>
                  </button>
                  <button
                    onClick={async () => {
                      await deleteProject(p.id);
                      setRecentProjects(await listProjects());
                    }}
                    className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"
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

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${active ? "text-violet-300" : ""}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-violet-400" : "bg-slate-600"}`} />
      {label}
    </div>
  );
}
