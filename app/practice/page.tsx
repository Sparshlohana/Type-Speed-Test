"use client";

import { useMemo, useSyncExternalStore } from "react";

import { TestRunner } from "@/components/typing/TestRunner";
import type { Mode } from "@/lib/engine";
import { resultsStore } from "@/lib/store";
import { aggregateWeaknesses, type WeaknessProfile } from "@/lib/weakness";

const PRACTICE_WORDS = 50;

function coachingMessage(profile: WeaknessProfile): { title: string; body: string } {
  if (!profile.hasHistory) {
    return {
      title: "First, let’s find what is slowing you down",
      body: "Type this starter set naturally. As you make mistakes, TypeFlow will learn which keys and words need work, then build future sessions around them. Improving those weak spots will reduce corrections and help both your accuracy and WPM rise.",
    };
  }

  const key = profile.keyErrors[0];
  const word = profile.wordErrors[0];
  if (key?.expected) {
    return {
      title: `Your biggest opportunity is the “${key.expected}” key`,
      body: `In recent tests, you pressed “${key.actual}” instead of “${key.expected}” ${key.count} ${key.count === 1 ? "time" : "times"}${word ? `, and “${word.word}” has been a difficult word` : ""}. Those mistakes interrupt your rhythm and cost time through corrections. Focus on clean, deliberate presses in this session—fewer errors will improve accuracy and let your WPM increase naturally.`,
    };
  }

  if (key) {
    return {
      title: "You tend to type past the end of words",
      body: `This happened ${key.count} ${key.count === 1 ? "time" : "times"} in recent tests. Ease off slightly as you finish each word and aim for a clean space press. Removing these extra keystrokes will preserve your rhythm and improve both accuracy and WPM.`,
    };
  }

  return {
    title: word ? `The word “${word.word}” is slowing you down` : "Accuracy is your next speed gain",
    body: "This session repeats the words that have interrupted your rhythm. Type them deliberately before trying to go faster. Once they become automatic, you will spend less time correcting mistakes and your score can improve.",
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
  const { results, hydrated } = useSyncExternalStore(
    resultsStore.subscribe,
    resultsStore.get,
    resultsStore.getServer,
  );
  const profile = useMemo(() => aggregateWeaknesses(results), [results]);
  const coaching = useMemo(() => coachingMessage(profile), [profile]);
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

      <aside className="mt-6 rounded-xl border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-accent-soft p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
          What this means for you
        </p>
        <h2 className="mt-2 text-base font-semibold text-text">{coaching.title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-sub">{coaching.body}</p>
      </aside>

      <section className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Current practice focus">
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
