"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { importFilesAsAssets, pickFiles, MEDIA_ACCEPT } from "@/lib/editor/mediaImport";
import { ASSET_DND_TYPE } from "./TimelineV2";
import { Icon } from "@/components/ui/Icon";
import type { MediaAsset } from "@/lib/types";

type KindFilter = "all" | "video" | "audio" | "image";

function humanDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useMediaImport() {
  const addAssets = useProjectStore((s) => s.addAssets);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const importFiles = useCallback(
    async (files: File[], options?: { addToTimeline?: boolean }) => {
      if (files.length === 0) return [] as MediaAsset[];
      setBusy(true);
      try {
        const assets = await importFilesAsAssets(files, (p) => setStatus(`${p.index}/${p.total} · ${p.name}`));
        addAssets(assets);
        if (options?.addToTimeline) {
          const store = useProjectStore.getState();
          let cursor = store.playhead;
          for (const asset of assets) {
            const clipId = store.addClipFromAsset(asset.id, { start: cursor });
            if (clipId) {
              const project = useProjectStore.getState().project;
              const clip = project?.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
              cursor += clip?.duration ?? 4;
            }
          }
        }
        return assets;
      } finally {
        setBusy(false);
        setStatus("");
      }
    },
    [addAssets],
  );

  const importFromDevice = useCallback(
    async (accept = MEDIA_ACCEPT, options?: { addToTimeline?: boolean }) => {
      const files = await pickFiles(accept);
      return importFiles(files, options);
    },
    [importFiles],
  );

  return { importFiles, importFromDevice, busy, status };
}

export default function MediaPool() {
  const project = useProjectStore((s) => s.project);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const { importFiles, importFromDevice, busy, status } = useMediaImport();
  const [filter, setFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  const assets = useMemo(() => {
    const list = project?.assets ?? [];
    return list
      .filter((a) => (filter === "all" ? true : a.kind === filter))
      .filter((a) => (query ? a.name.toLowerCase().includes(query.toLowerCase()) : true))
      .slice()
      .reverse();
  }, [project?.assets, filter, query]);

  const usageCount = useCallback(
    (assetId: string) =>
      project?.tracks.reduce(
        (n, t) => n + t.clips.filter((c) => (c as { assetId?: string }).assetId === assetId).length,
        0,
      ) ?? 0,
    [project],
  );

  if (!project) return <div className="p-3 text-xs text-slate-500">Проект не загружен</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 p-2">
        <button
          onClick={() => void importFromDevice()}
          disabled={busy}
          className="btn btn-primary flex h-9 w-full items-center justify-center gap-2 px-3 text-xs"
        >
          <Icon name="plus" size={15} />
          Добавить медиа с устройства
        </button>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <button
            onClick={() => void importFromDevice("video/*")}
            className="btn btn-ghost px-1 py-1.5 text-[10px]"
          >
            <Icon name="video" size={13} className="text-slate-400" />
            Видео
          </button>
          <button
            onClick={() => void importFromDevice("audio/*")}
            className="btn btn-ghost px-1 py-1.5 text-[10px]"
          >
            <Icon name="music" size={13} className="text-slate-400" />
            Аудио
          </button>
          <button
            onClick={() => void importFromDevice("image/*")}
            className="btn btn-ghost px-1 py-1.5 text-[10px]"
          >
            <Icon name="image" size={13} className="text-slate-400" />
            Фото
          </button>
        </div>
        {busy && <div className="mt-1.5 truncate text-[10px] text-violet-300">Импорт: {status || "чтение файлов…"}</div>}
      </div>

      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        {(["all", "video", "audio", "image"] as KindFilter[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-lg px-2 py-1 text-[10px] font-bold transition ${
              filter === k ? "bg-violet-500/25 text-violet-100" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {k === "all" ? "Все" : k === "video" ? "Видео" : k === "audio" ? "Аудио" : "Фото"}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          className="ml-auto w-24 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-violet-400/40"
          aria-label="Поиск по медиатеке"
        />
      </div>

      <div
        ref={dropRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length) void importFiles(files);
        }}
        className={`flex-1 overflow-y-auto p-2 ${dropActive ? "bg-violet-500/10" : ""}`}
      >
        {assets.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/15 p-6 text-center text-[11px] text-slate-500">
            Перетащите сюда видео, аудио или фото — или нажмите «Добавить медиа».
          </div>
        ) : (
          <div className="space-y-1.5">
            {assets.map((asset) => (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ASSET_DND_TYPE, asset.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDoubleClick={() => addClipFromAsset(asset.id)}
                className="group flex cursor-grab items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-1.5 transition hover:border-violet-400/40 hover:bg-white/[0.06] active:cursor-grabbing"
                title="Перетащите на таймлайн или дважды кликните"
              >
                <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded bg-black/60">
                  {asset.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base">
                      {asset.kind === "audio" ? "🎵" : asset.kind === "image" ? "🖼" : "🎬"}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 bg-black/70 px-1 font-mono text-[8px] text-white/80">
                    {humanDuration(asset.duration)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-slate-200">{asset.name}</div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                    <span className="uppercase">{asset.kind}</span>
                    {asset.width ? <span>{asset.width}×{asset.height}</span> : null}
                    {usageCount(asset.id) > 0 && <span className="text-emerald-400">× {usageCount(asset.id)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => addClipFromAsset(asset.id)}
                    className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[9px] font-bold text-violet-100 hover:bg-violet-500/40"
                    title="Вставить на плейхед"
                  >
                    ＋
                  </button>
                  <button
                    onClick={() => removeAsset(asset.id)}
                    className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-200 hover:bg-rose-500/40"
                    title="Удалить из проекта"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
