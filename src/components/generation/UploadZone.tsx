"use client";

import { useCallback, useRef, useState } from "react";
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? "border-violet-400 bg-violet-500/10" : "border-white/15 bg-white/[0.03] hover:border-white/25"
        }`}
      >
        <div className="mb-3 text-4xl">📥</div>
        <p className="text-sm font-medium text-slate-200">
          Перетащите видео, фото или аудио сюда — или нажмите, чтобы выбрать файлы
        </p>
        <p className="mt-1 text-xs text-slate-500">MP4, MOV, WEBM, JPG, PNG, MP3, WAV</p>
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
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div key={item.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <div className="flex h-24 items-center justify-center overflow-hidden bg-black/40">
                {item.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnail} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl">{item.kind === "audio" ? "🎵" : "🖼️"}</span>
                )}
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-slate-200">{item.name}</p>
                <p className="text-[10px] text-slate-500">
                  {kindLabel(item.kind)} {item.duration ? `· ${formatDuration(item.duration)}` : ""}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"
                aria-label="Удалить"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
