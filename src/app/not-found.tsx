import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export default function NotFound() {
  return (
    <div className="app-bg flex min-h-screen flex-col items-center justify-center px-4 text-center text-slate-100">
      <div className="animate-scale-in">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          <Icon name="compass" size={36} className="text-slate-300" />
        </div>
        <h1 className="title mb-3 text-2xl sm:text-3xl">Страница не найдена</h1>
        <p className="mb-8 max-w-md text-sm text-slate-400">
          Похоже, вы перешли по неверной ссылке или страница была удалена.
        </p>
        <Link href="/" className="btn btn-primary px-8 py-3.5 text-sm">
          <Icon name="arrow-left" size={16} />
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
