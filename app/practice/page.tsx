"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { TestRunner } from "@/components/typing/TestRunner";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import type { FinishedResult } from "@/hooks/useTypingTest";
import type { Mode } from "@/lib/engine";
import { resultsStore } from "@/lib/store";
import {
  aggregateWeaknesses,
  type WeaknessProfile,
  type WeaknessSummary,
} from "@/lib/weakness";

const PRACTICE_WORDS = 50;

function coachingMessage(
  profile: WeaknessProfile,
  latest?: WeaknessSummary,
): { title: string; body: string } {
  const latestErrors =
    (latest?.keys.reduce((sum, item) => sum + item.count, 0) ?? 0) +
    (latest?.words.reduce((sum, item) => sum + item.count, 0) ?? 0);
  if (latest && latestErrors === 0) {
    return {
      title: "Clean session",
      body: "No new mistakes. The next set keeps reinforcing your current focus so it becomes automatic.",
    };
  }

  if (!profile.hasHistory) {
    return {
      title: "Build your baseline",
      body: "Finish this set and your next practice will target your mistakes.",
    };
  }

  const key = profile.keyErrors[0];
  const word = profile.wordErrors[0];
  if (key?.expected) {
    return {
      title: `Focus on “${key.expected}”`,
      body: `You often hit “${key.actual}” instead${word ? `, especially around “${word.word}”` : ""}. Cleaner presses here mean fewer corrections and higher WPM.`,
    };
  }

  if (key) {
    return {
      title: "Finish words cleanly",
      body: "You sometimes type past the last letter. A cleaner space press will protect your rhythm and WPM.",
    };
  }

  return {
    title: word ? `Practice “${word.word}”` : "Accuracy unlocks speed",
    body: "Type for clean accuracy first. Fewer corrections will help your score climb.",
  };
}

function KeyLabel({ value }: { value: string }) {
  return (
    <kbd className="inline-grid min-w-7 place-items-center rounded-md border border-border bg-bg px-1.5 py-1 font-mono text-xs text-text">
      {value || "extra"}
    </kbd>
  );
}

export default function PracticePage() {
  const [latestFinished, setLatestFinished] = useState<FinishedResult | null>(null);
  const { results, hydrated } = useSyncExternalStore(
    resultsStore.subscribe,
    resultsStore.get,
    resultsStore.getServer,
  );
  const profile = useMemo(() => {
    const latest = latestFinished?.result;
    const current = latest
      ? [latest, ...results.filter((result) => result.id !== latest.id)]
      : results;
    return aggregateWeaknesses(current);
  }, [latestFinished, results]);
  const coaching = useMemo(
    () => coachingMessage(profile, latestFinished?.result.weaknesses),
    [latestFinished, profile],
  );
  const mode = useMemo<Mode>(
    () => ({
      kind: "practice",
      count: PRACTICE_WORDS,
      focusChars: profile.focusChars,
      focusWords: profile.focusWords,
    }),
    [profile.focusChars, profile.focusWords],
  );
  const handleFinished = useCallback((finished: FinishedResult) => {
    setLatestFinished(finished);
  }, []);

  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
        <LoadingStatus label="Loading adaptive practice" />
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-7 w-72 max-w-full" />
            <Skeleton className="mt-2 h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <div className="mt-10 space-y-3">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-11/12" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 sm:py-14">
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-end">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Adaptive training
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
            Practice what slows you down
          </h1>
          <p className="mt-1 text-sm text-sub">
            {profile.hasHistory
              ? "A focused set built from your recent mistakes."
              : "A starter set that learns where you need practice."}
          </p>
        </header>

        <aside className="relative overflow-hidden rounded-xl border border-border bg-surface px-4 py-3.5">
          <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            {latestFinished ? "Updated from latest test" : "Coach"}
          </p>
          <h2 className="mt-1 text-sm font-semibold text-text">{coaching.title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-sub">{coaching.body}</p>
        </aside>
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Current practice focus">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-sub">Focus keys</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.focusChars.map((char) => (
              <KeyLabel key={char} value={char} />
            ))}
          </div>
          {profile.keyErrors.length > 0 ? (
            <p className="mt-3 text-xs text-sub">
              Most common: {profile.keyErrors.slice(0, 3).map((item, index) => (
                <span key={`${item.expected}-${item.actual}`}>
                  {index > 0 ? " · " : ""}
                  <span className="font-mono text-text">
                    {item.expected || "extra"}→{item.actual}
                  </span>{" "}
                  ×{item.count}
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-sub">Problem words</p>
          {profile.wordErrors.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.wordErrors.slice(0, 6).map((item) => (
                <span
                  key={item.word}
                  className="rounded-md bg-error-soft px-2 py-1 font-mono text-xs text-error"
                >
                  {item.word} ×{item.count}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-sub">No problem words recorded yet.</p>
          )}
        </div>
      </section>

      <section className="mt-10 flex flex-1 flex-col justify-center">
        <TestRunner mode={mode} onFinished={handleFinished} />
      </section>
    </div>
  );
}
