"use client";

import { useTween } from "@/hooks/useTween";

/** A number that counts toward its new value instead of snapping to it. */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 600,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
}) {
  const tweened = useTween(Number.isFinite(value) ? value : 0, duration);
  return (
    <span className="tabular-nums">
      {tweened.toFixed(decimals)}
      {suffix}
    </span>
  );
}
