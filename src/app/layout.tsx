import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MONTIQ — AI-Powered Professional Video Editor",
  description:
    "Профессиональный видеоредактор нового поколения с интеллектуальным монтажом. Загрузите материалы — AI создаст готовый ролик. Доработайте в редакторе с продвинутыми инструментами: цветокоррекция, эффекты, звук, анимации.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-[#0b0b14] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
