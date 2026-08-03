"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useProjectStore } from "@/store/projectStore";
import { saveProject, saveBlob } from "@/lib/db";
import { uid } from "@/lib/id";
import {
  importFilesAsAssets,
  pickFiles,
  MEDIA_ACCEPT,
} from "@/lib/editor/mediaImport";
import { planFromDirector, flattenSections } from "@/lib/production";
import { parsePromptToStyle } from "@/lib/promptStyle";
import { ensureMinDuration } from "@/lib/minDuration";
import type {
  DirectorBrief,
  DirectorSections,
  PreProduction,
} from "@/lib/production";
import type { GenerationStyle, MediaAsset } from "@/lib/types";

interface Props {
  projectId: string;
  title: string;
  brief: DirectorBrief;
  preprod: PreProduction | null;
  sections: DirectorSections | null;
  /** Закрыть окно и остаться в AI Director. */
  onClose: () => void;
  /** Перейти в редактор (после монтажа или без него). */
  onEnterEditor: () => void;
}

/**
 * Файлы загруженных в этой сессии исходников — нужны движку для анализа
 * кадров/битов/речи. Держим на уровне модуля: окно монтируется заново при
 * каждом открытии, а загруженные файлы не должны теряться между открытиями.
 */
const sessionFilesByAssetId = new Map<string, File>();

/**
 * Окно «Исходники → Черновой монтаж».
 *
 * Открывается вместо прямого перехода в редактор: пользователь загружает
 * исходники (видео/фото/аудио) и нажимает «Черновой монтаж». Монтажный движок
 * (autoEditToProject) собирает черновой ролик ИЗ ВСЕХ загруженных материалов:
 * анализ кадров, распознавание речи, режиссёрский план, склейки по битам,
 * переходы, титры, выравнивание экспозиции, Picture Lock. Затем ролик
 * рендерится в предпросмотр и показывается окно превью с кнопкой
 * «В редактор» — пользователь видит черновик до перехода в редактор.
 */
export default function DraftMontageModal({
  projectId,
  title,
  brief,
  preprod,
  sections,
  onClose,
  onEnterEditor,
}: Props) {
  const [uploaded, setUploaded] = useState<MediaAsset[]>([]);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  // Этапы: upload (загрузка) → building (монтаж + рендер превью) → preview
  const [phase, setPhase] = useState<"upload" | "building" | "preview">("upload");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Готовый предпросмотр чернового ролика.
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewStats, setPreviewStats] = useState("");

  // Освобождаем object URL предпросмотра при закрытии окна.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const existingAssets = useProjectStore((s) => s.project?.assets ?? []);

  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || importing || phase !== "upload") return;
      setImporting(true);
      setError("");
      try {
        const assets = await importFilesAsAssets(files, (p) =>
          setImportStatus(`${p.index}/${p.total} · ${p.name}`)
        );
        if (assets.length === 0) return;
        // Один ассет на один файл, порядок сохраняется.
        assets.forEach((a, i) => {
          if (i < files.length) sessionFilesByAssetId.set(a.id, files[i]);
        });
        useProjectStore.getState().addAssets(assets);
        setUploaded((prev) => [...prev, ...assets]);
      } catch (e: any) {
        setError("Не удалось импортировать файлы: " + (e?.message || ""));
      } finally {
        setImporting(false);
        setImportStatus("");
      }
    },
    [importing, phase]
  );

  const removeUploaded = (assetId: string) => {
    useProjectStore.getState().removeAsset(assetId);
    sessionFilesByAssetId.delete(assetId);
    setUploaded((prev) => prev.filter((a) => a.id !== assetId));
  };

  const allAssets = existingAssets;

  const startMontage = async () => {
    if (phase !== "upload") return;
    setError("");
    setProgressMsg("");
    const visual = allAssets.filter(
      (a) => a.kind === "video" || a.kind === "image"
    );
    if (visual.length === 0) {
      setError("Добавьте хотя бы одно видео или фото — без исходников монтаж невозможен.");
      return;
    }
    setPhase("building");
    try {
      const style = buildStyleFromBrief(brief);
      // Тяжёлый движок подгружаем только в момент запуска — страница AI Director
      // остаётся лёгкой, пока пользователь просто заполняет бриф.
      const { autoEditToProject } = await import("@/lib/autoEdit");
      const draft = await autoEditToProject({
        title,
        assets: allAssets,
        filesByAssetId: sessionFilesByAssetId,
        style,
        onProgress: (msg) => setProgressMsg(msg),
      });

      // Сохраняем тот же проект (тот же id), но с готовым черновым монтажом:
      // документы AI Director (бриф, препродакшен, разделы) и production-план
      // остаются в проекте для редактора.
      const store = useProjectStore.getState();
      const prevDirector = store.project?.director;
      draft.id = projectId;
      draft.title = title;
      draft.director = {
        version: 2,
        generatedAt: prevDirector?.generatedAt || Date.now(),
        updatedAt: Date.now(),
        status: "approved",
        brief,
        sections:
          sections ?? (preprod ? flattenSections(preprod, brief) : undefined) ?? {},
        preprod: preprod ?? undefined,
      };
      draft.production = planFromDirector(brief, allAssets);
      draft.updatedAt = Date.now();

      ensureMinDuration(draft, 10);
      await saveProject(draft);
      store.loadProject(draft);
      store.updateProject(() => draft);

      // Рендерим предпросмотр готового черновика (как на странице результата
      // генерации): после рендера показываем окно превью с кнопкой «В редактор».
      let renderedUrl = "";
      try {
        const { renderProject } = await import("@/lib/render");
        const blob = await renderProject(
          draft,
          (ratio) =>
            setProgressMsg(
              `Рендеринг предпросмотра… ${Math.round(ratio * 100)}%`
            ),
          (msg) => console.log("[DraftPreview]", msg)
        );
        const previewKey = uid("blob");
        await saveBlob(previewKey, blob);
        draft.previewBlobKey = previewKey;
        draft.updatedAt = Date.now();
        await saveProject(draft);
        store.loadProject(draft);
        store.updateProject(() => draft);
        renderedUrl = URL.createObjectURL(blob);
      } catch (e: any) {
        console.warn("Предпросмотр не отрендерился:", e);
        // Рендер не удался — всё равно показываем окно результата с кнопкой
        // «В редактор»: черновик уже сохранён и ждёт в редакторе.
      }

      const clipCount = draft.tracks.reduce(
        (sum, t) => sum + t.clips.length,
        0
      );
      setPreviewStats(
        `${Math.round(draft.duration || 0)}с · ${clipCount} клипов`
      );
      setPreviewUrl(renderedUrl);
      setPhase("preview");
    } catch (e: any) {
      console.error("Черновой монтаж не удался:", e);
      setError(
        "Черновой монтаж не удался: " +
          (e?.message || "неизвестная ошибка") +
          ". Попробуйте ещё раз."
      );
      setPhase("upload");
    }
  };

  const totalVisual = allAssets.filter(
    (a) => a.kind === "video" || a.kind === "image"
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
        void importFiles(files);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "building") onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-[24px] border border-white/[0.08] bg-[#0c0c16] shadow-2xl">
        {/* ------------------------------ header ------------------------------ */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div>
            <div className="eyebrow">Черновой монтаж</div>
            <h2 className="title mt-0.5 text-lg">
              {phase === "preview" ? "Черновик готов" : "Загрузите исходники"}
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
              {phase === "preview"
                ? "AI Director собрал ролик из всех прикреплённых материалов."
                : "AI Director соберёт черновой ролик из всех прикреплённых материалов — каждый исходник будет использован."}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={phase === "building"}
            className="icon-btn !h-8 !w-8 shrink-0 disabled:opacity-30"
            aria-label="Закрыть"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* --------------------------- preview ----------------------------- */}
          {phase === "preview" ? (
            <>
              {previewUrl ? (
                <video
                  src={previewUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="mx-auto max-h-[46vh] w-full rounded-2xl border border-white/[0.08] bg-black"
                />
              ) : (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-5 text-center text-[12px] leading-relaxed text-amber-100">
                  Предпросмотр не отрендерился, но черновой монтаж сохранён — откройте
                  редактор, чтобы посмотреть и поправить его.
                </div>
              )}
              {previewStats && (
                <div className="text-center text-[11px] font-semibold text-slate-400">
                  Черновой монтаж · {previewStats} · {allAssets.length} исходников
                </div>
              )}
              <div className="space-y-2 pt-1">
                <button
                  onClick={onEnterEditor}
                  className="btn btn-primary h-12 w-full text-sm font-extrabold shadow-lg shadow-violet-500/20 transition hover:shadow-violet-500/40"
                >
                  <Icon name="clapper" size={16} />
                  В редактор
                </button>
                <button
                  onClick={onClose}
                  className="w-full text-center text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
                >
                  Вернуться в AI Director
                </button>
              </div>
            </>
          ) : (
            <>
          {/* --------------------------- drop zone ---------------------------- */}
          <button
            onClick={() => void pickFiles(MEDIA_ACCEPT, true).then(importFiles)}
            disabled={importing || phase !== "upload"}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
              dragOver
                ? "border-violet-400/70 bg-violet-500/[0.08]"
                : "border-white/[0.12] bg-white/[0.02] hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
            } disabled:opacity-40`}
          >
            <Icon name="upload" size={26} className="text-violet-300" />
            <span className="text-[13px] font-bold text-slate-200">
              {importing ? `Импорт: ${importStatus || "чтение файлов…"}` : "Выбрать файлы или перетащить сюда"}
            </span>
            <span className="text-[11px] text-slate-500">
              Видео, фото, музыка — можно несколько сразу
            </span>
          </button>

          {/* ------------------------ uploaded sources ------------------------- */}
          {uploaded.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Загружено сейчас · {uploaded.length}
              </div>
              <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                {uploaded.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                      <Icon
                        name={a.kind === "video" ? "video" : a.kind === "audio" ? "music" : "image"}
                        size={15}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold text-slate-200">{a.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {a.kind === "video" ? "Видео" : a.kind === "audio" ? "Аудио" : "Фото"}
                        {a.duration ? ` · ${Math.round(a.duration)}с` : ""}
                        {a.width && a.height ? ` · ${a.width}×${a.height}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => removeUploaded(a.id)}
                      disabled={phase !== "upload"}
                      className="icon-btn !h-7 !w-7 disabled:opacity-30"
                      aria-label={`Убрать ${a.name}`}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {existingAssets.length > uploaded.length && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-slate-400">
              В проекте уже есть ещё {existingAssets.length - uploaded.length} материалов —
              они тоже войдут в монтаж.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
              {error}
            </div>
          )}

          {phase === "building" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] px-4 py-6 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center">
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-violet-400" style={{ animationDuration: "1.2s" }} />
                <div className="absolute inset-2 animate-spin rounded-full border border-transparent border-b-violet-500/50" style={{ animationDuration: "2s", animationDirection: "reverse" }} />
                <Icon name="clapper" size={22} className="text-violet-200" />
              </div>
              <div>
                <div className="text-[13px] font-bold text-slate-100">Собираю черновой монтаж…</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {progressMsg || "Интеллектуальный анализ материалов…"}
                </div>
              </div>
              <div className="h-1 w-56 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full w-full origin-left animate-shimmer rounded-full bg-gradient-to-r from-violet-500 to-violet-300" />
              </div>
            </div>
          )}

          {/* ----------------------------- actions ----------------------------- */}
          <div className="space-y-2">
            <button
              onClick={() => void startMontage()}
              disabled={phase !== "upload" || importing || totalVisual === 0}
              className="btn btn-primary h-12 w-full text-sm font-extrabold shadow-lg shadow-violet-500/20 transition hover:shadow-violet-500/40 disabled:opacity-40"
            >
              <Icon name="wand" size={16} />
              {phase === "building" ? "Монтаж в процессе…" : "Черновой монтаж"}
            </button>
            <button
              onClick={onEnterEditor}
              disabled={phase !== "upload"}
              className="w-full text-center text-[11px] font-semibold text-slate-500 transition hover:text-slate-300 disabled:opacity-30"
            >
              Открыть редактор без чернового монтажа
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Стиль чернового монтажа из брифа режиссёра: платформа → формат и шаблон,
 * темп → скорость склеек, настроение → цветокоррекция, хронометраж → таргет.
 * Включает максимально «умную» сборку (анализ кадров, речь, субтитры).
 */
export function buildStyleFromBrief(brief: DirectorBrief): GenerationStyle {
  const rawPrompt = [
    brief.idea,
    brief.goal ? `Цель: ${brief.goal}` : "",
    brief.audience ? `Аудитория: ${brief.audience}` : "",
    brief.platform ? `Платформа: ${brief.platform}` : "",
    brief.duration ? `Хронометраж: ${brief.duration} сек` : "",
    brief.style ? `Стиль: ${brief.style}` : "",
    brief.mood ? `Настроение: ${brief.mood}` : "",
    brief.tempo ? `Темп: ${brief.tempo}` : "",
    brief.keyMessage ? `Ключевая мысль: ${brief.keyMessage}` : "",
    brief.callToAction ? `CTA: ${brief.callToAction}` : "",
    brief.references ? `Референсы: ${brief.references}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  const style = parsePromptToStyle(rawPrompt);
  const plat = (brief.platform || "").toLowerCase();
  const ideaMood = `${brief.idea} ${brief.style} ${brief.mood}`.toLowerCase();

  // Темп из брифа
  if (/очень быстр|быстр|динамич|энергич|драйв/.test(brief.tempo)) style.pace = "fast";
  else if (/спокойн|медлен|плавн|лирич|задумчив/.test(brief.tempo)) style.pace = "slow";
  else if (/средн/.test(brief.tempo)) style.pace = "medium";

  // Настроение/стиль → цветокоррекция (учёт «ё» в «тёплый» и т.п.)
  if (/ч[её]рно-бел|ч\/б|монохром|black and white/.test(ideaMood)) {
    style.colorGrade = "bw";
    style.bw = true;
  } else if (/т[её]пл|warm|закат|уют/.test(ideaMood)) {
    style.colorGrade = "warm";
  } else if (/холод|cool|ночн|ледян|холодн/.test(ideaMood)) {
    style.colorGrade = "cool";
  } else if (/кино|cinematic|фильм/.test(ideaMood)) {
    style.colorGrade = "cinematic";
  } else if (/ретро|винтаж|vintage/.test(ideaMood)) {
    style.colorGrade = "vintage";
  } else if (/ярк|сочн|vivid|насыщен/.test(ideaMood)) {
    style.colorGrade = "vivid";
  }

  // Платформа → тип контента (шаблон монтажа подберёт движок)
  if (/tiktok|тикток|reels|shorts|шортс|клип|вертикаль|9:16|vk|вк клип/.test(plat)) {
    style.contentType = "tiktok";
  } else if (/youtube|ютуб/.test(plat)) {
    style.contentType = "youtube";
  } else if (/кино|документ/.test(plat)) {
    style.contentType = "documentary";
  } else if (/презентаци/.test(plat)) {
    style.contentType = "presentation";
  } else if (/instagram|инстаграм/.test(plat)) {
    style.contentType = "shorts";
  }
  if (/подкаст|интервью|разговор/.test(ideaMood)) style.contentType = "podcast";
  if (/свадьб|wedding/.test(ideaMood)) style.contentType = "wedding";
  if (/путешеств|travel|тревел/.test(ideaMood)) style.contentType = "travel";
  if (/обуч|курс|урок|tutorial/.test(ideaMood)) style.contentType = "educational";
  if (/реклам|продаж|бренд/.test(ideaMood)) style.contentType = "ad";

  const dur = parseInt(brief.duration, 10);
  if (Number.isFinite(dur) && dur > 0) style.targetDuration = dur;

  // Всегда максимально умная сборка: анализ кадров, распознавание речи,
  // субтитры, синхронизация с битами музыки, полное покрытие исходников.
  style.intelligentCuts = true;
  style.emotionDetection = true;
  style.autoSubtitles = true;
  style.beatSync = true;
  style.kenBurns = true;
  style.addCaptions = true;
  style.templateId = "auto";
  return style;
}
