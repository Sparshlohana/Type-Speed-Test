"use client";

import type { GhostRaceState } from "@/hooks/useTypingTest";
import type { Status } from "@/lib/engine";

function opponentLabel(ghost: GhostRaceState): string {
  return ghost.opponent === "personal-best" ? "Personal best" : "Last attempt";
}

function RaceLane({
  label,
  progress,
  ghost = false,
}: {
  label: string;
  progress: number;
  ghost?: boolean;
}) {
  return (
    <div className="grid grid-cols-[42px_1fr] items-center gap-3">
      <span className={`text-[10px] font-medium uppercase tracking-[0.12em] ${ghost ? "text-sub" : "text-accent"}`}>
        {label}
      </span>
      <div className="relative h-1.5 overflow-visible rounded-full bg-surface-hover">
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ease-linear ${ghost ? "bg-sub/55" : "bg-accent"}`}
          style={{ width: `${progress}%` }}
        />
        <span
          aria-hidden
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface transition-[left] duration-100 ease-linear ${ghost ? "bg-sub" : "bg-accent"}`}
          style={{ left: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function GhostRace({
  race,
  typingStatus,
}: {
  race: GhostRaceState | null;
  typingStatus: Status;
}) {
  if (!race) return null;

  const source = opponentLabel(race);
  if (race.status !== "ready") {
    const message = race.status === "empty"
      ? "Complete this exact mode once to create a ghost."
      : race.status === "loading"
        ? "Loading your saved pace…"
        : "Your saved ghost could not be loaded.";
    return (
      <div className="rounded-xl border border-border bg-surface/70 px-4 py-3 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sub">
          Ghost race · {source}
        </p>
        <p className="mt-1 text-xs text-sub">{message}</p>
      </div>
    );
  }

  const playerProgress = Math.min(100, Math.max(0, race.playerChars / race.finishChars * 100));
  const ghostProgress = Math.min(100, Math.max(0, race.ghostChars / race.finishChars * 100));
  const gap = Math.round(race.playerChars - race.ghostChars);
  const status = typingStatus === "idle"
    ? `Start typing to chase ${Math.round(race.resultWpm)} WPM.`
    : race.ghostFinished && typingStatus === "running"
      ? "Your ghost has finished — keep going."
      : gap > 0
        ? `You're ${gap} character${gap === 1 ? "" : "s"} ahead.`
        : gap < 0
          ? `You're ${Math.abs(gap)} character${gap === -1 ? "" : "s"} behind.`
          : "You're neck and neck.";

  return (
    <div className="rounded-xl border border-border bg-surface/70 px-4 py-3" aria-live="polite">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sub">
          Ghost race · {source}
        </p>
        <p className="font-mono text-xs font-medium tabular-nums text-text">
          {Math.round(race.resultWpm)} WPM
        </p>
      </div>
      <div className="space-y-2.5">
        <RaceLane label="You" progress={playerProgress} />
        <RaceLane label="Ghost" progress={ghostProgress} ghost />
      </div>
      <p className="mt-3 text-center text-xs text-sub">{status}</p>
    </div>
  );
}
