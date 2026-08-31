"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

const COLORS = ["var(--accent)", "#22c55e", "#f59e0b", "#38bdf8", "var(--error)"];
const PIECES = Array.from({ length: 48 }, (_, index) => ({
  id: index,
  left: (index * 37 + 7) % 100,
  delay: (index % 12) * 45,
  duration: 1_050 + (index % 7) * 95,
  drift: ((index * 29) % 180) - 90,
  spin: 360 + (index % 5) * 180,
  color: COLORS[index % COLORS.length],
  round: index % 4 === 0,
}));

type ConfettiStyle = CSSProperties & {
  "--confetti-left": string;
  "--confetti-delay": string;
  "--confetti-duration": string;
  "--confetti-drift": string;
  "--confetti-spin": string;
  "--confetti-color": string;
};

export function Confetti({ label }: { label: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 3_200);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-20 z-[51] -translate-x-1/2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-bg/95 px-5 py-3 text-center shadow-[var(--shadow)] backdrop-blur-md"
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">
          New personal best
        </p>
        <p className="mt-1 whitespace-nowrap text-sm font-semibold text-text">{label}</p>
      </div>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {PIECES.map((piece) => (
          <span
            key={piece.id}
            className={`confetti-piece ${piece.round ? "rounded-full" : "rounded-[1px]"}`}
            style={{
              "--confetti-left": `${piece.left}%`,
              "--confetti-delay": `${piece.delay}ms`,
              "--confetti-duration": `${piece.duration}ms`,
              "--confetti-drift": `${piece.drift}px`,
              "--confetti-spin": `${piece.spin}deg`,
              "--confetti-color": piece.color,
            } as ConfettiStyle}
          />
        ))}
      </div>
    </>
  );
}
