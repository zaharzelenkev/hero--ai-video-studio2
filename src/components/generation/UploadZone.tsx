"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { UploadedItem } from "./types";

const ACCEPTED = "video/*,image/*,audio/*";

function kindLabel(kind: UploadedItem["kind"]) {
  if (kind === "video") return "Видео";
  if (kind === "image") return "Фото";
  return "Аудио";
}

function formatDuration(sec?: number) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function UploadZone({
  items,
  onAdd,
  onRemove,
}: {
  items: UploadedItem[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || !fileList.length) return;
      onAdd(Array.from(fileList));
    },
    [onAdd],
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-[1.5px] border-dashed px-6 py-12 text-center transition-all duration-300 ${
          dragOver
            ? "border-violet-400 bg-violet-500/[0.08] shadow-[0_0_60px_-20px_rgba(124,108,246,0.5)]"
            : "border-white/[0.12] bg-white/[0.015] hover:border-violet-500/40 hover:bg-violet-500/[0.04]"
        }`}
      >
        <div
          className={`mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border transition-all duration-300 ${
            dragOver
              ? "border-violet-400/50 bg-violet-500/20 -translate-y-1"
              : "border-white/10 bg-white/[0.04]"
          }`}
        >
          <Icon name="upload" size={26} className={`transition-colors ${dragOver ? "text-violet-200" : "text-slate-400"}`} />
        </div>
        <p className="text-sm font-medium text-slate-200">
          Перетащите видео, фото или аудио сюда — или нажмите, чтобы выбрать файлы
        </p>
        <p className="mt-1.5 text-xs text-slate-500">MP4 · MOV · WEBM · JPG · PNG · MP3 · WAV</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300 hover:border-violet-500/40"
            >
              <div className="flex h-24 items-center justify-center overflow-hidden bg-black/40">
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnail} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <Icon name={item.kind === "audio" ? "music" : "image"} size={26} className="text-slate-500" />
                )}
              </div>
              <div className="px-2.5 py-2">
                <p className="truncate text-[11px] font-medium text-slate-200">{item.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                  <Icon name={item.kind === "video" ? "video" : item.kind === "audio" ? "music" : "image"} size={11} />
                  {kindLabel(item.kind)}
                  {item.duration ? `· ${formatDuration(item.duration)}` : ""}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="icon-btn absolute right-2 top-2 hidden h-7 w-7 bg-black/70 group-hover:flex hover:!bg-red-500/80 hover:!text-white"
                aria-label="Удалить"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
