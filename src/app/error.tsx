"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app error:", error);
  }, [error]);

  return (
    <div className="app-bg flex min-h-screen flex-col items-center justify-center px-4 text-center text-slate-100">
      <div className="animate-scale-in">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
          <Icon name="alert" size={36} className="text-red-300" />
        </div>
        <h1 className="title mb-3 text-2xl sm:text-3xl">Что-то пошло не так</h1>
        <p className="mb-8 max-w-md text-sm text-slate-400">
          Произошла непредвиденная ошибка. Мы уже знаем о ней и скоро все исправим.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button onClick={() => reset()} className="btn btn-primary px-8 py-3.5 text-sm">
            <Icon name="refresh" size={16} />
            Попробовать снова
          </button>
          <Link href="/" className="btn btn-ghost px-8 py-3.5 text-sm">
            <Icon name="home" size={16} />
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
