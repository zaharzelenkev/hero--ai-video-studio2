import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MONTIQ — AI Production Studio",
  description:
    "AI Production Studio для полного цикла создания видео: от идеи, сценария и режиссуры до анализа материалов, монтажа, финального звука, графики и экспорта.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-[#0b0b14] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
