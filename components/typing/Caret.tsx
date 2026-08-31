"use client";

import type { CaretStyle } from "@/lib/storage";

export type CaretPosition = { left: number; top: number; height: number; width: number };

export function Caret({
  position,
  style,
  smooth,
  blinking,
  visible,
}: {
  position: CaretPosition | null;
  style: CaretStyle;
  smooth: boolean;
  /** Pauses the blink while the user is actively typing. */
  blinking: boolean;
  visible: boolean;
}) {
  if (!position || !visible) return null;

  const geometry =
    style === "block"
      ? { width: Math.max(position.width, 8), height: position.height, top: position.top }
      : style === "underline"
        ? { width: Math.max(position.width, 8), height: 2, top: position.top + position.height - 2 }
        : { width: 2, height: position.height, top: position.top };

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute rounded-full bg-accent ${blinking ? "caret-blink" : ""}`}
      style={{
        left: position.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
        opacity: style === "block" ? 0.35 : 1,
        transition: smooth
          ? "left 110ms var(--ease), top 140ms var(--ease), height 110ms var(--ease)"
          : "none",
      }}
    />
  );
}

/** A saved run's position, drawn directly over the character it is currently typing. */
export function GhostCaret({
  position,
  visible,
}: {
  position: CaretPosition | null;
  visible: boolean;
}) {
  if (!position || !visible) return null;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-[1] rounded-[3px] border border-dashed border-sub/80 bg-sub/10 transition-[left,top,width] duration-100 ease-linear"
      style={{
        left: position.left - 2,
        top: position.top - 1,
        width: Math.max(position.width + 4, 10),
        height: position.height + 2,
      }}
    >
      <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-sub shadow-[0_0_0_2px_var(--bg)]" />
    </span>
  );
}
