"use client";

import { useEffect } from "react";
import Link from "next/link";

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#0a0a12] via-[#0d0d16] to-[#0a0a12] px-4 text-center text-slate-100">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-red-500/10 text-5xl shadow-inner border border-red-500/20">
        😵
      </div>
      <h1 className="mb-3 text-2xl font-bold text-slate-200 sm:text-3xl">
        Что-то пошло не так
      </h1>
      <p className="mb-8 max-w-md text-sm text-slate-400">
        Произошла непредвиденная ошибка. Мы уже знаем о ней и скоро все исправим.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          onClick={() => reset()}
          className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-900/40 transition-all hover:scale-105 hover:shadow-xl hover:shadow-violet-900/50 active:scale-95"
        >
          Попробовать снова
        </button>
        <Link
          href="/"
          className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-slate-300 transition-all hover:bg-white/10 hover:text-white active:scale-95"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
