import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MONTIQ (Монтикью) — AI Production Studio | Нейросетевая студия видеомонтажа",
  description:
    "MONTIQ (Монтикью) — автоматизированная AI Production Studio для создания и монтажа видео. Генерация видеороликов под ключ с помощью ИИ: от идеи и сценария до монтажа, звука, графики и экспорта.",
  keywords: [
    "montiq",
    "монтикью",
    "монтикю",
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
  },
  icons: {
    icon: "/montiq-logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="app-bg text-slate-100 antialiased">{children}</body>
    </html>
  );
}
