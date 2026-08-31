"use client";

import { useMemo, useSyncExternalStore } from "react";

import { TestRunner } from "@/components/typing/TestRunner";
import type { Mode } from "@/lib/engine";
import { resultsStore } from "@/lib/store";
import { aggregateWeaknesses } from "@/lib/weakness";

const PRACTICE_WORDS = 50;

function KeyLabel({ value }: { value: string }) {
  return (
    <kbd className="inline-grid min-w-7 place-items-center rounded-md border border-border bg-bg px-1.5 py-1 font-mono text-xs text-text">
      {value || "extra"}
    </kbd>
  );
}

export default function PracticePage() {
  const { results, hydrated } = useSyncExternalStore(
    resultsStore.subscribe,
    resultsStore.get,
    resultsStore.getServer,
  );
  const profile = useMemo(() => aggregateWeaknesses(results), [results]);
  const mode = useMemo<Mode>(
    () => ({
      kind: "practice",
      count: PRACTICE_WORDS,
      focusChars: profile.focusChars,
      focusWords: profile.focusWords,
    }),
    [profile.focusChars, profile.focusWords],
  );

  if (!hydrated) {
    return <div className="mx-auto w-full max-w-5xl px-5 py-14 text-sm text-sub">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 sm:py-14">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
          Adaptive training
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
          Practice what slows you down
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-sub">
          {profile.hasHistory
            ? "This set emphasizes mistakes from your latest 50 tests and adapts again after every session."
            : "Complete this starter set to build your weakness profile. Future sessions will target your mistakes."}
        </p>
      </header>

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
        <TestRunner mode={mode} />
      </section>
    </div>
  );
}
