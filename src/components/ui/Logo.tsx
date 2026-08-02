"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * MONTIQ brand mark — the official logo file (public/montiq-logo.png).
 * If the brand team ships a new asset, replace public/montiq-logo.png —
 * every surface (landing, editor, director, project page) picks it up.
 */
export function Logo({
  size = 36,
  href = "/",
  showText = true,
}: {
  size?: number;
  href?: string;
  showText?: boolean;
}) {
  const mark = (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl"
      style={{
        width: size,
        height: size,
        boxShadow: "0 8px 24px -6px rgba(124,108,246,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
      }}
    >
      <Image
        src="/montiq-logo.png"
        alt="MONTIQ"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        draggable={false}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
      />
    </span>
  );

  if (href === "/") {
    return (
      <Link
        href={href}
        className="group flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-90"
        aria-label="MONTIQ — на главную"
      >
        {mark}
        {showText && (
          <span className="flex flex-col leading-none">
            <span className="font-extrabold tracking-tight" style={{ fontSize: size * 0.42 }}>
              MONTIQ
            </span>
            <span
              className="uppercase tracking-[0.26em] font-medium"
              style={{ fontSize: Math.max(8, size * 0.2), color: "var(--text-3)" }}
            >
              AI Production Studio
            </span>
          </span>
        )}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      {mark}
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="font-extrabold tracking-tight" style={{ fontSize: size * 0.42 }}>
            MONTIQ
          </span>
          <span
            className="uppercase tracking-[0.26em] font-medium"
            style={{ fontSize: Math.max(8, size * 0.2), color: "var(--text-3)" }}
          >
            AI Production Studio
          </span>
        </span>
      )}
    </div>
  );
}
