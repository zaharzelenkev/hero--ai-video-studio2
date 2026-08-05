import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Release cut — AI Production Studio | Нейросетевая студия видеомонтажа",
  description:
    "Release cut — автоматизированная AI Production Studio для создания и монтажа видео. Генерация видеороликов под ключ с помощью ИИ: от идеи и сценария до монтажа, звука, графики и экспорта.",
  keywords: [
    "Release cut",
    "AI Production Studio",
    "нейросеть для видео",
    "видеомонтаж нейросеть",
    "AI видеомонтаж",
    "создание видео ИИ",
    "автоматический монтаж видео",
    "AI студия видео",
    "генерация видео",
    "нейросетевой видеомонтаж",
    "видеоролики под ключ",
  ],
  verification: {
    google: "7b9c1L_pGpyyvpEFdQXVAXOf27TsG-ri6fRVnQwngTE",
    yandex: "7469cca07f01d265",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="app-bg text-slate-100 antialiased">{children}</body>
    </html>
  );
}
