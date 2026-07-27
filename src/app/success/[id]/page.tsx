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
  const [showVideo, setShowVideo] = useState(false);

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

    return () => {
      // Cleanup preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [params.id, router]);

  const downloadVideo = () => {
    if (!previewUrl || !project) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `${project.title || "montiq-video"}.${project.exportSettings.format}`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12]">
        <div className="text-center">
          <div className="mb-4 inline-block h-16 w-16 animate-spin rounded-full border-4 border-violet-500/20 border-t-violet-500"></div>
          <p className="text-sm text-slate-400">Загрузка вашего видео...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12] px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl">
        {/* Celebration Header */}
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 text-6xl animate-bounce">
            🎉
          </div>
          
          <h1 className="mb-4 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">
            Ваше видео успешно создано!
          </h1>
          
          <p className="mx-auto max-w-2xl text-lg text-slate-300">
            MONTIQ проанализировал ваши материалы и создал профессиональный монтаж с AI
          </p>
        </div>

        {/* Video Preview Card */}
        <div className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] shadow-2xl backdrop-blur-sm">
          {/* Preview Area */}
          <div className="relative aspect-video bg-gradient-to-br from-black/80 to-black/50">
            {!showVideo && previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mb-6 inline-flex h-32 w-32 items-center justify-center rounded-full bg-white/5 backdrop-blur-sm">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-4xl shadow-lg shadow-violet-500/50">
                      🎬
                    </div>
                  </div>
                  <p className="mb-6 text-sm text-slate-400">Ваше видео готово к просмотру</p>
                  <button
                    onClick={() => setShowVideo(true)}
                    className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-violet-900/40 transition-all hover:scale-105 hover:shadow-xl hover:shadow-violet-900/50"
                  >
                    <span className="text-2xl">▶</span>
                    <span>Посмотреть видео</span>
                  </button>
                </div>
              </div>
            )}
            
            {showVideo && previewUrl && (
              <video
                src={previewUrl}
                controls
                autoPlay
                className="h-full w-full"
              />
            )}
            
            {!previewUrl && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Превью недоступно</p>
                  <button
                    onClick={() => router.push(`/editor/${project.id}`)}
                    className="mt-4 text-sm text-violet-400 hover:text-violet-300"
                  >
                    Перейти в редактор →
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Info Bar */}
          <div className="border-t border-white/10 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="mb-2 text-2xl font-bold text-slate-200">{project.title}</h2>
                <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>⏱️</span>
                    <span>
                      {Math.floor(project.duration / 60)}:{String(Math.floor(project.duration % 60)).padStart(2, "0")} мин
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🎬</span>
                    <span>{project.tracks.reduce((n, t) => n + t.clips.length, 0)} клипов</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📐</span>
                    <span>{project.exportSettings.width}×{project.exportSettings.height}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🎨</span>
                    <span>{project.exportSettings.fps} FPS</span>
                  </div>
                </div>
              </div>
              
              {previewUrl && (
                <button
                  onClick={downloadVideo}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-white/10 hover:border-violet-500/50"
                >
                  <span>💾</span>
                  <span>Скачать</span>
                </button>
              )}
            </div>

            {/* AI Features Used */}
            <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
                ✨ Применённые AI-технологии
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
                <div className="flex items-center gap-1">
                  <span className="text-violet-400">✓</span>
                  <span>Интеллектуальные нарезки</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-violet-400">✓</span>
                  <span>Автоцветокоррекция</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-violet-400">✓</span>
                  <span>Музыкальная синхронизация</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-violet-400">✓</span>
                  <span>Оптимизация темпа</span>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => router.push(`/editor/${project.id}`)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-900/40 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-violet-900/50"
              >
                <span className="text-xl">🎨</span>
                <span>Открыть редактор MONTIQ</span>
              </button>
              
              <button
                onClick={() => router.push("/")}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-base font-semibold text-slate-300 transition-all hover:bg-white/10 hover:border-violet-500/50"
              >
                <span>➕</span>
                <span>Создать новое видео</span>
              </button>
            </div>
          </div>
        </div>

        {/* What's Next Section */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
            <div className="mb-3 text-3xl">✂️</div>
            <h3 className="mb-2 text-sm font-bold text-slate-200">Точная настройка</h3>
            <p className="text-xs text-slate-400">
              Откройте редактор для тонкой настройки каждого кадра, эффекта и перехода
            </p>
          </div>
          
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
            <div className="mb-3 text-3xl">🎨</div>
            <h3 className="mb-2 text-sm font-bold text-slate-200">Цветокоррекция</h3>
            <p className="text-xs text-slate-400">
              Примените профессиональные LUT, curves и color grading для идеального визуала
            </p>
          </div>
          
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm">
            <div className="mb-3 text-3xl">🎵</div>
            <h3 className="mb-2 text-sm font-bold text-slate-200">Звуковой дизайн</h3>
            <p className="text-xs text-slate-400">
              Улучшите аудио с помощью EQ, компрессора и профессионального шумоподавления
            </p>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-12 text-center">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-slate-500 hover:text-violet-400 transition-colors"
          >
            ← Вернуться на главную
          </button>
        </div>
      </div>
    </main>
  );
}
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
