import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Release Cut — AI Production Studio | Нейросетевая студия видеомонтажа",
  description:
    "Release Cut — автоматизированная AI Production Studio для создания и монтажа видео. Генерация видеороликов под ключ с помощью ИИ: от идеи и сценария до монтажа, звука, графики и экспорта.",
  keywords: [
    "Release Cut",
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
    "релиз кат",
    "релиз кут",
    "release cut",
    "release kut",
    "релиз кат студия",
    "релиз кут видео",
    "AI монтаж релиз кат",
    "нейросеть релиз кут",
  ],
  verification: {
    google: "7b9c1L_pGpyyvpEFdQXVAXOf27TsG-ri6fRVnQwngTE",
    yandex: "a5a8f994bd3432f5",
  },
  icons: {
    icon: "/favicon.png",
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
