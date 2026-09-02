"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getDailyLeaderboard,
  submitDailyResult,
  type DailyBoard,
} from "@/app/actions/daily";
import { TestRunner } from "@/components/typing/TestRunner";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import type { FinishedResult } from "@/hooks/useTypingTest";
import {
  DAILY_CHALLENGE_TIME_ZONE,
  dailyChallengeAt,
  markLocalDailyCompletion,
} from "@/lib/daily";
import type { Mode } from "@/lib/engine";
import { initialsOf, round } from "@/lib/format";

const EMPTY_BOARD: DailyBoard = { entries: [], yourRank: null };
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function DailyChallengePage() {
  const [challenge, setChallenge] = useState(() => dailyChallengeAt(Date.now()));
  const [board, setBoard] = useState<DailyBoard>(EMPTY_BOARD);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardUnavailable, setBoardUnavailable] = useState(false);
  const [submission, setSubmission] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mode = useMemo<Mode>(
    () => ({ kind: "daily", challengeId: challenge.id, count: challenge.count }),
    [challenge],
  );

  const refreshBoard = useCallback(async () => {
    setLoadingBoard(true);
    try {
      const next = await getDailyLeaderboard(challenge.id);
      setBoard(next);
      setBoardUnavailable(false);
    } catch {
      setBoardUnavailable(true);
    } finally {
      setLoadingBoard(false);
    }
  }, [challenge.id]);

  useEffect(() => {
    let cancelled = false;
    void getDailyLeaderboard(challenge.id)
      .then((next) => {
        if (cancelled) return;
        setBoard(next);
        setBoardUnavailable(false);
      })
      .catch(() => {
        if (!cancelled) setBoardUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingBoard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [challenge.id]);

  useEffect(() => {
    const shiftedNow = Date.now() + IST_OFFSET_MS;
    const untilMidnight = DAY_MS - (shiftedNow % DAY_MS);
    const timeout = window.setTimeout(() => {
      setChallenge(dailyChallengeAt(Date.now()));
      setBoard(EMPTY_BOARD);
      setLoadingBoard(true);
      setSubmission(null);
    }, untilMidnight + 100);
    return () => window.clearTimeout(timeout);
  }, [challenge.id]);

  const handleFinished = useCallback(
    (finished: FinishedResult) => {
      markLocalDailyCompletion(challenge.id);
      setSubmission("Submitting your best attempt…");
      setSubmitting(true);
      void submitDailyResult(finished.result)
        .then(async (response) => {
          if (!response.ok) {
            setSubmission(response.error);
            return;
          }
          if (!response.signedIn) {
            setSubmission("Result saved locally. Sign in to join the daily leaderboard.");
            return;
          }
          setSubmission(`Daily best recorded · rank #${response.rank}`);
          await refreshBoard();
        })
        .catch(() => {
          setSubmission("Result saved locally; the daily leaderboard is unavailable.");
        })
        .finally(() => {
          setSubmitting(false);
        });
    },
    [challenge.id, refreshBoard],
  );

  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: DAILY_CHALLENGE_TIME_ZONE,
  }).format(new Date(`${challenge.id}T00:00:00Z`));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <div className="grid gap-5 lg:grid-cols-[1fr_19rem] lg:items-end">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            {dateLabel}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
            Today&apos;s daily challenge
          </h1>
          <p className="mt-1 text-sm text-sub">
            {challenge.count} words · the same text for everyone · resets at 00:00 IST
          </p>
        </header>

        <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-sub">
            Your standing
          </p>
          {loadingBoard ? (
            <div className="mt-2 space-y-2">
              <LoadingStatus label="Loading your daily standing" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-44" />
            </div>
          ) : (
            <>
              <p className="mt-1 font-mono text-2xl font-semibold text-text">
                {board.yourRank ? `#${board.yourRank}` : "Unranked"}
              </p>
              <p className="mt-0.5 text-xs text-sub">Your best attempt today counts.</p>
            </>
          )}
        </div>
      </div>

      {submission ? (
        <div className="mt-5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-accent-soft px-4 py-2.5 text-xs text-text">
          {submitting ? (
            <>
              <LoadingStatus label="Submitting your daily result" />
              <Skeleton className="h-4 w-full max-w-xs bg-[color-mix(in_srgb,var(--accent)_22%,var(--surface))]" />
            </>
          ) : submission}
        </div>
      ) : null}

      <section className="mt-12">
        <TestRunner key={challenge.id} mode={mode} onFinished={handleFinished} />
      </section>

      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text">Today&apos;s leaderboard</h2>
            <p className="mt-0.5 text-xs text-sub">Best score per signed-in player.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoadingBoard(true);
              void refreshBoard();
            }}
            className="text-xs font-medium text-sub transition-colors hover:text-accent"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
          {loadingBoard ? (
            <div className="p-5">
              <LoadingStatus label="Loading daily leaderboard" />
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="grid min-w-[520px] grid-cols-[2rem_1fr_3rem_4rem_3rem] items-center gap-4 border-b border-border/60 py-3 last:border-0">
                  <Skeleton className="h-3 w-5" />
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                    <Skeleton className={`h-3 ${index % 2 ? "w-20" : "w-28"}`} />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : board.entries.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm font-medium text-text">
                {boardUnavailable ? "Leaderboard temporarily unavailable" : "No ranked attempts yet"}
              </p>
              <p className="mt-1 text-xs text-sub">
                {boardUnavailable
                  ? "You can still complete and share today’s challenge."
                  : "Sign in and be the first to set today’s pace."}
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.14em] text-sub">
                  <th className="px-5 py-3 font-medium">Rank</th>
                  <th className="px-5 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 text-right font-medium">WPM</th>
                  <th className="px-4 py-3 text-right font-medium">Accuracy</th>
                  <th className="px-5 py-3 text-right font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-border/60 last:border-0 ${entry.isYou ? "bg-accent-soft" : ""}`}
                  >
                    <td className={`px-5 py-3 font-mono ${index < 3 ? "text-accent" : "text-sub"}`}>
                      {index + 1}
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="grid h-7 w-7 place-items-center rounded-full border border-border bg-bg text-[10px] font-semibold text-sub"
                          style={entry.image ? {
                            backgroundImage: `url(${entry.image})`,
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                          } : undefined}
                        >
                          {entry.image ? null : initialsOf(entry.username)}
                        </span>
                        <span className="text-text">
                          {entry.username}{entry.isYou ? <span className="ml-2 text-xs text-accent">you</span> : null}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-text">{entry.wpm}</td>
                    <td className="px-4 py-3 text-right font-mono text-sub">{round(entry.accuracy, 1)}%</td>
                    <td className="px-5 py-3 text-right font-mono text-sub">{entry.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
