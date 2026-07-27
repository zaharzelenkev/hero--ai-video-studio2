"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadProject, loadBlob } from "@/lib/db";
import type { Project } from "@/lib/types";

export default function SuccessPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const proj = await loadProject(params.id);
        if (!proj) {
          router.push("/");
          return;
        }
        
        setProject(proj);
        
        if (proj.previewBlobKey) {
          const blob = await loadBlob(proj.previewBlobKey);
          if (blob) {
            setPreviewUrl(URL.createObjectURL(blob));
          }
        }
      } catch (error) {
        console.error("Failed to load project:", error);
        router.push("/");
      } finally {
        setLoading(false);
      }
    };
    
    load();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12]">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-violet-500/30 border-t-violet-500"></div>
          <p className="text-sm text-slate-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12] px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-4xl">
        {/* Success Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 text-5xl">
            🎉
          </div>
          
          <h1 className="mb-3 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
            Ваше видео готово!
          </h1>
          
          <p className="text-slate-400">
            MONTIQ успешно создал профессиональный монтаж из ваших материалов
          </p>
        </div>

        {/* Video Preview */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] shadow-2xl backdrop-blur-sm">
          {previewUrl ? (
            <div className="relative aspect-video bg-black">
              <video
                src={previewUrl}
                controls
                className="h-full w-full"
                autoPlay
                loop
              />
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center bg-black/50">
              <p className="text-sm text-slate-500">Превью недоступно</p>
            </div>
          )}
          
          {/* Video Info */}
          <div className="border-t border-white/10 p-6">
            <h2 className="mb-2 text-xl font-bold text-slate-200">{project.title}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <span>⏱️</span>
                <span>{Math.floor(project.duration / 60)}:{String(Math.floor(project.duration % 60)).padStart(2, "0")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🎬</span>
                <span>{project.tracks.reduce((n, t) => n + t.clips.length, 0)} клипов</span>
              </div>
              <div className="flex items-center gap-2">
                <span>📐</span>
                <span>{project.resolution.width}×{project.resolution.height}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🎨</span>
                <span>{project.assets.length} ассетов</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mb-8 space-y-4">
          <button
            onClick={() => router.push(`/editor/${project.id}`)}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-5 text-base font-bold text-white shadow-lg shadow-violet-900/40 transition-all hover:shadow-xl hover:shadow-violet-900/50"
          >
            <span className="mr-2 text-2xl">✂️</span>
            Открыть редактор MONTIQ
          </button>

          <div className="grid gap-4 sm:grid-cols-2">
            {previewUrl && (
              <a
                href={previewUrl}
                download={`${project.title || "montiq-video"}.mp4`}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur-sm transition-all hover:bg-white/10"
              >
                <span>⬇️</span>
                <span>Скачать видео</span>
              </a>
            )}
            
            <button
              onClick={() => router.push("/")}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur-sm transition-all hover:bg-white/10"
            >
              <span>🏠</span>
              <span>Создать новый проект</span>
            </button>
          </div>
        </div>

        {/* Features Highlight */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 p-6 backdrop-blur-sm">
          <h3 className="mb-4 text-lg font-bold text-slate-200">
            Что дальше? Доведите видео до совершенства в редакторе
          </h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-2xl">🎨</div>
              <h4 className="mb-1 text-sm font-semibold text-slate-200">Цветокоррекция</h4>
              <p className="text-xs text-slate-400">
                Профессиональная коррекция с LUT, кривыми, color wheels
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-2xl">✨</div>
              <h4 className="mb-1 text-sm font-semibold text-slate-200">Эффекты</h4>
              <p className="text-xs text-slate-400">
                25+ эффектов: blur, glitch, chroma key, motion blur
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-2xl">🎵</div>
              <h4 className="mb-1 text-sm font-semibold text-slate-200">Звук</h4>
              <p className="text-xs text-slate-400">
                EQ, компрессор, шумоподавление, voice enhance
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-2xl">📝</div>
              <h4 className="mb-1 text-sm font-semibold text-slate-200">Текст и титры</h4>
              <p className="text-xs text-slate-400">
                Кастомные шрифты, тени, обводки, анимации
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
