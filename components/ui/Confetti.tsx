"use client";

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

export function Confetti() {
  return (
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
  );
}
