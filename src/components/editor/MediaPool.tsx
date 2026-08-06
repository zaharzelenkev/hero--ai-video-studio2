"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { importFilesAsAssets, pickFiles, MEDIA_ACCEPT } from "@/lib/editor/mediaImport";
import { ASSET_DND_TYPE } from "./TimelineV2";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { MediaAsset } from "@/lib/types";

type KindFilter = "all" | "video" | "audio" | "image";

const FILTERS: { id: KindFilter; label: string; icon: IconName }[] = [
  { id: "all", label: "Все", icon: "layers" },
  { id: "video", label: "Видео", icon: "video" },
  { id: "audio", label: "Аудио", icon: "music" },
  { id: "image", label: "Фото", icon: "image" },
];

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

const KIND_ICON: Record<MediaAsset["kind"], IconName> = {
  video: "film",
  audio: "music",
  image: "image",
};

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

  const counts = useMemo(() => {
    const list = project?.assets ?? [];
    return {
      all: list.length,
      video: list.filter((a) => a.kind === "video").length,
      audio: list.filter((a) => a.kind === "audio").length,
      image: list.filter((a) => a.kind === "image").length,
    };
  }, [project?.assets]);

  // Карта «ассет → сколько раз используется на таймлайне»: один проход по
  // клипам вместо O(ассетов × клипов) на каждый элемент списка.
  const usageMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const track of project?.tracks ?? []) {
      for (const clip of track.clips) {
        const assetId = (clip as { assetId?: string }).assetId;
        if (assetId) map.set(assetId, (map.get(assetId) ?? 0) + 1);
      }
    }
    return map;
  }, [project?.tracks]);

  const usageCount = useCallback((assetId: string) => usageMap.get(assetId) ?? 0, [usageMap]);

  if (!project) return <div className="p-3 text-xs text-slate-500">Проект не загружен</div>;

  return (
    <div className="flex h-full flex-col">
      {/* Импорт */}
      <div className="border-b border-white/[0.07] p-2">
        <button
          onClick={() => void importFromDevice()}
          disabled={busy}
          className={`btn btn-primary flex h-9 w-full items-center justify-center gap-2 px-3 text-xs ${busy ? "is-loading" : ""}`}
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
        {busy && (
          <div className="mt-1.5 flex items-center gap-1.5 truncate text-[10px] text-violet-300">
            <Icon name="upload" size={11} />
            Импорт: {status || "чтение файлов…"}
          </div>
        )}
      </div>

      {/* Фильтры + поиск */}
      <div className="flex items-center gap-1 border-b border-white/[0.07] px-2 py-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-all ${
              filter === f.id
                ? "bg-violet-500/25 text-violet-100 shadow-[0_0_10px_-4px_rgba(124,108,246,0.7)]"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <Icon name={f.icon} size={11} />
            {f.label}
            <span className="font-mono text-[8px] text-slate-500">{counts[f.id]}</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Icon name="search" size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск…"
            className="w-20 rounded-lg border border-white/[0.08] bg-black/40 py-1 pl-6 pr-2 text-[10px] text-slate-200 outline-none transition focus:border-violet-400/40 focus:w-28"
            aria-label="Поиск по медиатеке"
          />
        </div>
      </div>

      {/* Список */}
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
        className={`flex-1 overflow-y-auto p-2 custom-scrollbar transition-colors ${dropActive ? "bg-violet-500/10" : ""}`}
      >
        {assets.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.13] p-6 text-center text-[11px] text-slate-500">
            <Icon name="film" size={20} className="text-slate-600" />
            <span>
              Перетащите сюда видео, аудио или фото —<br />или нажмите «Добавить медиа».
            </span>
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
                className="group flex cursor-grab items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1.5 transition-all hover:border-violet-400/40 hover:bg-white/[0.06] hover:shadow-[0_4px_16px_-6px_rgba(124,108,246,0.35)] active:cursor-grabbing"
                title="Перетащите на таймлайн или дважды кликните"
              >
                <div className="media-thumb relative h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-white/[0.06]">
                  {asset.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500">
                      <Icon name={KIND_ICON[asset.kind]} size={16} strokeWidth={1.6} />
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 bg-black/75 px-1 font-mono text-[8px] text-white/85">
                    {humanDuration(asset.duration)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-slate-200">{asset.name}</div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
                    <span className="uppercase tracking-wide">{asset.kind}</span>
                    {asset.width ? <span>{asset.width}×{asset.height}</span> : null}
                    {usageCount(asset.id) > 0 && <span className="text-emerald-400">× {usageCount(asset.id)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => addClipFromAsset(asset.id)}
                    className="flex items-center justify-center rounded-md bg-violet-500/25 p-1 text-violet-100 transition hover:bg-violet-500/45"
                    title="Вставить на плейхед"
                  >
                    <Icon name="plus" size={10} strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={() => removeAsset(asset.id)}
                    className="flex items-center justify-center rounded-md bg-rose-500/20 p-1 text-rose-200 transition hover:bg-rose-500/40"
                    title="Удалить из проекта"
                  >
                    <Icon name="x" size={10} strokeWidth={2.2} />
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
