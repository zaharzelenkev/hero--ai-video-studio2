"use client";

import Link from "next/link";
import { Icon } from "./Icon";

/**
 * MONTIQ brand mark — a refined clapperboard in deep violet with a soft glow,
 * followed by a wordmark. Used across landing, editor and director surfaces.
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
    <>
      <span
        className="relative flex shrink-0 items-center justify-center rounded-xl"
        style={{
          width: size,
          height: size,
          background:
            "linear-gradient(180deg, #8b7cff 0%, #5c4bd8 100%)",
          boxShadow: "0 8px 24px -6px rgba(124,108,246,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        <Icon name="clapper" size={Math.round(size * 0.52)} strokeWidth={1.6} className="text-white" />
        <span
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)" }}
        />
      </span>
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
    </>
  );

  if (href === "/") {
    return (
      <Link
        href={href}
        className="group flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-90"
        aria-label="MONTIQ — на главную"
      >
        {mark}
      </Link>
    );
  }
  return <div className="flex items-center gap-2.5">{mark}</div>;
}
