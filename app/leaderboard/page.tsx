"use client";

import { useEffect, useMemo, useState } from "react";

import { getLeaderboard } from "@/app/actions/leaderboard";
import { Segmented } from "@/components/ui/Segmented";
import { modeKey, modeLabel, type Mode } from "@/lib/engine";
import { initialsOf, round } from "@/lib/format";
import { LEADERBOARD_MODES, type LeaderboardEntry } from "@/lib/leaderboard";

const OPTIONS = LEADERBOARD_MODES.map((mode) => ({
  value: modeKey(mode),
  label: modeLabel(mode),
}));

type Board = { entries: LeaderboardEntry[]; yourRank: number | null };

export default function LeaderboardPage() {
  const [selected, setSelected] = useState(modeKey(LEADERBOARD_MODES[1]));
  const [board, setBoard] = useState<Board>({ entries: [], yourRank: null });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const mode = useMemo<Mode>(
    () => LEADERBOARD_MODES.find((item) => modeKey(item) === selected) ?? LEADERBOARD_MODES[1],
    [selected],
  );

  useEffect(() => {
    let cancelled = false;
    void getLeaderboard(selected)
      .then((next) => {
        if (!cancelled) setBoard(next);
      })
      .catch(() => {
        if (!cancelled) {
          setBoard({ entries: [], yourRank: null });
          setUnavailable(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Leaderboard</h1>
          <p className="mt-1 text-sm text-sub">
            {board.yourRank
              ? `You're ranked #${board.yourRank} for ${modeLabel(mode)}.`
              : `Finish a ${modeLabel(mode)} test while signed in to take a place on the board.`}
          </p>
        </div>
        <Segmented
          options={OPTIONS}
          value={selected}
          onChange={(value) => {
            setLoading(true);
            setUnavailable(false);
            setSelected(value);
          }}
          ariaLabel="Leaderboard mode"
          size="sm"
        />
      </header>

      <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-surface">
        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading leaderboard">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-lg bg-surface-hover" />
            ))}
          </div>
        ) : board.entries.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm font-medium text-text">
              {unavailable ? "The leaderboard is temporarily unavailable" : "Be the first to post a time"}
            </p>
            <p className="mt-1 text-xs text-sub">
              {unavailable
                ? "Your typing tests still save locally."
                : "Sign in with Google and finish this mode to claim the first spot."}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.14em] text-sub">
                <th className="px-5 py-3 font-medium">Rank</th>
                <th className="px-5 py-3 font-medium">Player</th>
                <th className="px-5 py-3 text-right font-medium">WPM</th>
                <th className="px-5 py-3 text-right font-medium">Accuracy</th>
                <th className="px-5 py-3 text-right font-medium">Consistency</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((entry, index) => (
                <tr
                  key={entry.id}
                  className={`border-b border-border/60 transition-colors duration-200 ease-[var(--ease)] last:border-0 hover:bg-surface-hover ${entry.isYou ? "bg-accent-soft" : ""}`}
                >
                  <td className="px-5 py-3">
                    <span className={`font-mono tabular-nums ${index < 3 ? "text-accent" : "text-sub"}`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${entry.isYou ? "bg-accent text-white" : "border border-border bg-bg text-sub"}`}
                        style={
                          entry.image
                            ? { backgroundImage: `url(${entry.image})`, backgroundPosition: "center", backgroundSize: "cover" }
                            : undefined
                        }
                      >
                        {entry.image ? null : initialsOf(entry.username)}
                      </span>
                      <span className={entry.isYou ? "font-medium text-text" : "text-text"}>
                        {entry.username}
                        {entry.isYou ? <span className="ml-2 text-xs text-accent">you</span> : null}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-text">
                    {entry.wpm}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-sub">
                    {round(entry.accuracy, 1)}%
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-sub">
                    {Math.round(entry.consistency)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
