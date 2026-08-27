"use client";

import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { formatSeconds } from "@/lib/format";
import type { LiveStats as LiveStatsValue } from "@/hooks/useTypingTest";

function Stat({
  label,
  children,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-[68px] flex-col items-center gap-0.5 sm:items-start">
      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-sub">{label}</span>
      <span
        className={`font-mono text-xl font-semibold tabular-nums sm:text-2xl ${accent ? "text-accent" : "text-text"}`}
      >
        {children}
      </span>
    </div>
  );
}

export function LiveStats({ live, visible }: { live: LiveStatsValue; visible: boolean }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center justify-center gap-6 transition-opacity duration-300 ease-[var(--ease)] sm:gap-10"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <Stat label="WPM" accent>
        <AnimatedNumber value={live.wpm} duration={280} />
      </Stat>
      <Stat label="Accuracy">
        <AnimatedNumber value={live.accuracy} decimals={0} duration={280} suffix="%" />
      </Stat>
      <Stat label="Errors">
        <AnimatedNumber value={live.errors} duration={200} />
      </Stat>
      {live.remaining !== null ? (
        <Stat label="Time">{formatSeconds(live.remaining)}</Stat>
      ) : (
        <Stat label="Words">
          {live.progress ? `${live.progress.done}/${live.progress.total}` : "—"}
        </Stat>
      )}
    </div>
  );
}
