"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Segmented, type SegmentOption } from "@/components/ui/Segmented";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { modeKey, modeLabel, type Difficulty, type Mode } from "@/lib/engine";
import { initialsOf, round } from "@/lib/format";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import type { QuoteLength } from "@/lib/words";

type BoardKind = "time" | "words" | "quote";
type TimeOption = "15" | "30" | "60" | "custom";
type Board = { entries: LeaderboardEntry[]; yourRank: number | null };

const TYPE_OPTIONS: SegmentOption<BoardKind>[] = [
  { value: "time", label: "Timed" },
  { value: "words", label: "Words" },
  { value: "quote", label: "Quotes" },
];

const TIME_OPTIONS: SegmentOption<TimeOption>[] = [
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "custom", label: "Custom" },
];

const WORD_OPTIONS: SegmentOption<"25" | "50" | "100">[] = [
  { value: "25", label: "25 words" },
  { value: "50", label: "50 words" },
  { value: "100", label: "100 words" },
];

const QUOTE_OPTIONS: SegmentOption<QuoteLength>[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

const DIFFICULTY_OPTIONS: SegmentOption<Difficulty>[] = [
  { value: "easy", label: "Easy" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Hard" },
];

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sub">
      {children}
    </p>
  );
}

export default function LeaderboardPage() {
  const [kind, setKind] = useState<BoardKind>("time");
  const [timeOption, setTimeOption] = useState<TimeOption>("30");
  const [customSeconds, setCustomSeconds] = useState(45);
  const [customSecondsInput, setCustomSecondsInput] = useState("45");
  const [wordCount, setWordCount] = useState<"25" | "50" | "100">("50");
  const [quoteLength, setQuoteLength] = useState<QuoteLength>("medium");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [board, setBoard] = useState<Board>({ entries: [], yourRank: null });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const mode = useMemo<Mode>(() => {
    if (kind === "time") {
      return {
        kind,
        seconds: timeOption === "custom" ? customSeconds : Number(timeOption),
        difficulty,
      };
    }
    if (kind === "words") return { kind, count: Number(wordCount), difficulty };
    return { kind, length: quoteLength };
  }, [customSeconds, difficulty, kind, quoteLength, timeOption, wordCount]);
  const selected = modeKey(mode);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/leaderboard?modeKey=${encodeURIComponent(selected)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Leaderboard request failed");
        return (await response.json()) as Board;
      })
      .then((next) => {
        setBoard(next);
        setUnavailable(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBoard({ entries: [], yourRank: null });
        setUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected]);

  const prepareChange = () => {
    setLoading(true);
    setUnavailable(false);
  };

  const commitCustomSeconds = () => {
    const parsed = Number.parseInt(customSecondsInput, 10);
    const seconds = Number.isFinite(parsed) ? Math.min(600, Math.max(5, parsed)) : customSeconds;
    setCustomSecondsInput(String(seconds));
    if (seconds !== customSeconds) {
      prepareChange();
      setCustomSeconds(seconds);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Leaderboard</h1>
        {loading ? (
          <div className="mt-2">
            <LoadingStatus label="Loading your leaderboard standing" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        ) : (
          <p className="mt-1 text-sm text-sub">
            {board.yourRank
              ? `You're ranked #${board.yourRank} for ${modeLabel(mode)}.`
              : `Finish a ${modeLabel(mode)} test while signed in to take a place on this board.`}
          </p>
        )}
      </header>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="overflow-x-auto pb-1">
            <FilterLabel>Test type</FilterLabel>
            <Segmented
              options={TYPE_OPTIONS}
              value={kind}
              onChange={(value) => {
                prepareChange();
                setKind(value);
              }}
              ariaLabel="Leaderboard test type"
              size="sm"
            />
          </div>

          <div className="overflow-x-auto pb-1">
            <FilterLabel>{kind === "time" ? "Duration" : kind === "words" ? "Length" : "Quote length"}</FilterLabel>
            {kind === "time" ? (
              <Segmented
                options={TIME_OPTIONS}
                value={timeOption}
                onChange={(value) => {
                  prepareChange();
                  setTimeOption(value);
                }}
                ariaLabel="Timed leaderboard duration"
                size="sm"
              />
            ) : kind === "words" ? (
              <Segmented
                options={WORD_OPTIONS}
                value={wordCount}
                onChange={(value) => {
                  prepareChange();
                  setWordCount(value);
                }}
                ariaLabel="Word leaderboard length"
                size="sm"
              />
            ) : (
              <Segmented
                options={QUOTE_OPTIONS}
                value={quoteLength}
                onChange={(value) => {
                  prepareChange();
                  setQuoteLength(value);
                }}
                ariaLabel="Quote leaderboard length"
                size="sm"
              />
            )}
            {kind === "time" && timeOption === "custom" ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-sub">
                Duration
                <span className="inline-flex items-center rounded-lg border border-border bg-bg px-2 py-1">
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={customSecondsInput}
                    onChange={(event) => setCustomSecondsInput(event.target.value)}
                    onBlur={commitCustomSeconds}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitCustomSeconds();
                        event.currentTarget.blur();
                      }
                    }}
                    className="w-12 bg-transparent text-right font-mono text-text outline-none"
                  />
                  <span className="ml-1">seconds</span>
                </span>
              </label>
            ) : null}
          </div>

          {kind !== "quote" ? (
            <div className="overflow-x-auto pb-1">
              <FilterLabel>Difficulty</FilterLabel>
              <Segmented
                options={DIFFICULTY_OPTIONS}
                value={difficulty}
                onChange={(value) => {
                  prepareChange();
                  setDifficulty(value);
                }}
                ariaLabel="Leaderboard difficulty"
                size="sm"
              />
            </div>
          ) : (
            <div className="flex items-end pb-1 text-xs text-sub">
              Quote difficulty is separated by length.
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-1 border-t border-border/70 pt-3 text-xs text-sub sm:flex-row sm:items-center sm:justify-between">
          <span>
            Viewing <strong className="font-medium text-text">{modeLabel(mode)}</strong> only
          </span>
          <span>
            <Link href="/daily" className="transition-colors hover:text-accent">Daily</Link> has its own board · Adaptive practice is personal
          </span>
        </div>
      </section>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        {loading ? (
          <div className="p-5">
            <LoadingStatus label="Loading leaderboard" />
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="grid min-w-[480px] grid-cols-[2rem_1fr_3rem_4rem_4rem] items-center gap-4 border-b border-border/60 py-3 last:border-0">
                <Skeleton className="h-3 w-5" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <Skeleton className={`h-3 ${index % 2 ? "w-24" : "w-32"}`} />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : board.entries.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm font-medium text-text">
              {unavailable ? "The leaderboard is temporarily unavailable" : "Be the first on this board"}
            </p>
            <p className="mt-1 text-xs text-sub">
              {unavailable
                ? "Your typing tests still save locally."
                : `Sign in and finish a ${modeLabel(mode)} test to claim the first spot.`}
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
                        style={entry.image ? {
                          backgroundImage: `url(${entry.image})`,
                          backgroundPosition: "center",
                          backgroundSize: "cover",
                        } : undefined}
                      >
                        {entry.image ? null : initialsOf(entry.username)}
                      </span>
                      <span className={entry.isYou ? "font-medium text-text" : "text-text"}>
                        {entry.username}
                        {entry.isYou ? <span className="ml-2 text-xs text-accent">you</span> : null}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-text">{entry.wpm}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-sub">{round(entry.accuracy, 1)}%</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-sub">{Math.round(entry.consistency)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
