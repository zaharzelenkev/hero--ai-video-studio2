"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import EditorShellV2 from "@/components/editor/EditorShellV2";
import { Icon } from "@/components/ui/Icon";
import { useProjectStore } from "@/store/projectStore";
import { loadProject } from "@/lib/db";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const loadIntoStore = useProjectStore((s) => s.loadProject);
  const project = useProjectStore((s) => s.project);
  const [status, setStatus] = useState<"loading" | "not-found" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    loadProject(params.id)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setStatus("not-found");
          return;
        }
        loadIntoStore(p);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("not-found");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, loadIntoStore]);

  if (status === "loading") {
    return (
      <div className="app-bg flex h-screen items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-500/[0.12] shadow-[0_0_60px_-18px_rgba(124,108,246,0.6)]">
            <Icon name="clapper" size={34} strokeWidth={1.5} className="text-violet-200" />
            <div className="absolute inset-0 rounded-2xl border border-white/10" />
            <div className="absolute -inset-1 rounded-[20px] border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
          </div>
          <h2 className="title mb-2 text-xl">Загрузка рабочей среды</h2>
          <p className="text-sm text-slate-400">Подготавливаем инструменты Release Cut...</p>
        </div>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="app-bg flex h-screen flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          <Icon name="compass" size={34} className="text-slate-300" />
        </div>
        <div>
          <h1 className="title mb-2 text-xl text-slate-100">Проект не найден</h1>
          <p className="text-sm text-slate-400">Этот проект не существует или был удалён</p>
        </div>
        <Link href="/" className="btn btn-primary px-8 py-3.5 text-sm">
          <Icon name="arrow-left" size={16} />
          Вернуться на главную
        </Link>
      </div>
    );
  }

  if (!project) return null;

  return <EditorShellV2 />;
}
