"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { loadProject, loadBlob } from "@/lib/db";
import type { Project } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";

export default function SuccessPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    let objectUrl = "";
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
            objectUrl = URL.createObjectURL(blob);
            setPreviewUrl(objectUrl);
          }
        }
      } catch (error) {
        console.error("Не удалось загрузить проект:", error);
        router.push("/");
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [params.id, router]);

  const downloadVideo = () => {
    if (!previewUrl || !project) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `${project.title || "release-cut-video"}.${project.exportSettings.format}`;
    a.click();
  };

  if (loading) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-5 inline-block h-12 w-12 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-500" style={{ borderTopColor: "var(--primary)" }} />
          <p className="text-sm text-slate-400">Загрузка вашего видео...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <main className="app-bg min-h-screen px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 shadow-[0_0_60px_-16px_rgba(52,211,153,0.6)]">
            <Icon name="check" size={30} className="text-emerald-300" />
          </div>
          <h1 className="title mb-4 text-4xl sm:text-5xl">
            <span className="text-gradient">Ваше видео успешно создано!</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-slate-300">
            Release cut проанализировал ваши материалы и создал профессиональный монтаж с AI
          </p>
        </div>

        {/* Video Preview Card */}
        <div className="mb-8 overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.02] shadow-[var(--shadow-pop)]">
          <div className="relative aspect-video bg-gradient-to-br from-black/80 to-black/50">
            {!showVideo && previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mb-6 inline-flex h-28 w-28 items-center justify-center rounded-full bg-white/[0.04] backdrop-blur-md">
                    <div
                      className="flex h-20 w-20 items-center justify-center rounded-full"
                      style={{
                        background: "linear-gradient(180deg,#8b7cff,#5c4bd8)",
                        boxShadow: "0 20px 50px -12px rgba(124,108,246,0.6), inset 0 1px 0 rgba(255,255,255,0.25)",
                      }}
                    >
                      <Icon name="play" size={30} className="ml-0.5 text-white" />
                    </div>
                  </div>
                  <p className="mb-6 text-sm text-slate-400">Ваше видео готово к просмотру</p>
                  <button
                    onClick={() => setShowVideo(true)}
                    className="btn btn-primary px-8 py-4 text-base"
                  >
                    <Icon name="play" size={17} />
                    Посмотреть видео
                  </button>
                </div>
              </div>
            )}

            {showVideo && previewUrl && <video src={previewUrl} controls autoPlay className="h-full w-full" />}

            {!previewUrl && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-slate-500">Превью недоступно</p>
                  <button
                    onClick={() => router.push(`/editor/${project.id}`)}
                    className="btn btn-ghost mt-4 px-4 py-2 text-xs"
                  >
                    Перейти в редактор
                    <Icon name="arrow-right" size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Info Bar */}
          <div className="border-t border-white/[0.08] p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="title mb-1 truncate text-2xl">{project.title}</h2>
              </div>
              {previewUrl && (
                <button
                  onClick={downloadVideo}
                  className="btn btn-ghost shrink-0 px-5 py-2.5 text-sm"
                >
                  <Icon name="download" size={15} />
                  Скачать
                </button>
              )}
            </div>

            {/* AI Features Used */}
            <div className="mb-6 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
              <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-200">
                <Icon name="sparkles" size={13} />
                Применённые AI-технологии
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
                <div className="flex items-center gap-1.5">
                  <Icon name="check" size={13} className="text-violet-400" />
                  <span>Интеллектуальные нарезки</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="check" size={13} className="text-violet-400" />
                  <span>Автоцветокоррекция</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="check" size={13} className="text-violet-400" />
                  <span>Музыкальная синхронизация</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="check" size={13} className="text-violet-400" />
                  <span>Оптимизация темпа</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="check" size={13} className="text-violet-400" />
                  <span>Picture Lock — фиксация монтажа</span>
                </div>
              </div>
            </div>

            {/* Picture Lock */}
            <div className="mb-6 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
              <div className="mb-1 flex items-center gap-2">
                <Icon name="lock" size={14} className="text-amber-300" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                  Режим финальной сборки
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-amber-100/70">
                Монтаж прошёл автоматическую проверку Picture Lock: длительность, ритм, длинные и короткие кадры,
                темп и визуальная логика. В редакторе вы можете просмотреть отчёт, исправить оставшееся вручную
                и подтвердить фиксацию монтажа — после этого изменяются только цвет, звук, титры и эффекты.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => router.push(`/editor/${project.id}`)}
                className="btn btn-primary flex-1 px-6 py-4 text-base"
              >
                <Icon name="clapper" size={17} />
                Открыть редактор Release cut
              </button>
              <button
                onClick={() => router.push("/")}
                className="btn btn-ghost flex items-center justify-center gap-2 px-6 py-4 text-base"
              >
                <Icon name="plus" size={16} />
                Создать новое видео
              </button>
            </div>
          </div>
        </div>

        {/* What's Next */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="surface-card p-6">
            <div className="mb-3 text-violet-300">
              <Icon name="scissors" size={26} />
            </div>
            <h3 className="title mb-2 text-sm">Точная настройка</h3>
            <p className="text-xs leading-relaxed text-slate-400">
              Откройте редактор для тонкой настройки каждого кадра, эффекта и перехода
            </p>
          </div>
          <div className="surface-card p-6">
            <div className="mb-3 text-violet-300">
              <Icon name="palette" size={26} />
            </div>
            <h3 className="title mb-2 text-sm">Цветокоррекция</h3>
            <p className="text-xs leading-relaxed text-slate-400">
              Примените профессиональные LUT, curves и color grading для идеального визуала
            </p>
          </div>
          <div className="surface-card p-6">
            <div className="mb-3 text-violet-300">
              <Icon name="music" size={26} />
            </div>
            <h3 className="title mb-2 text-sm">Звуковой дизайн</h3>
            <p className="text-xs leading-relaxed text-slate-400">
              Улучшите аудио с помощью EQ, компрессора и профессионального шумоподавления
            </p>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-12 text-center">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-violet-300"
          >
            <Icon name="arrow-left" size={14} />
            Вернуться на главную
          </button>
        </div>
      </div>
    </main>
  );
}
