"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import EditorShellV2 from "@/components/editor/EditorShellV2";
import { useProjectStore } from "@/store/projectStore";
import { loadProject } from "@/lib/db";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const loadIntoStore = useProjectStore((s) => s.loadProject);
  const project = useProjectStore((s) => s.project);
  const [status, setStatus] = useState<"loading" | "not-found" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
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
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12]">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-violet-500/30 border-t-violet-500"></div>
          <p className="text-sm text-slate-400">Открываем проект MONTIQ...</p>
        </div>
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12] text-center">
        <div className="text-6xl">😔</div>
        <div>
          <h1 className="mb-2 text-xl font-bold text-slate-200">Проект не найден</h1>
          <p className="text-sm text-slate-400">Этот проект не существует или был удалён</p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:shadow-xl"
        >
          ← Вернуться на главную
        </Link>
      </div>
    );
  }

  if (!project) return null;

  return <EditorShellV2 />;
}
