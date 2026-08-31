"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  analyze,
  backspace as applyBackspace,
  finish as applyFinish,
  modeKey,
  newTest,
  retry,
  typeChar,
  typeSpace,
  type Mode,
  type TestState,
} from "@/lib/engine";
import {
  accuracyFrom,
  consistencyFrom,
  rawWpmFrom,
  totalTypedChars,
  wpmFrom,
  type Sample,
} from "@/lib/metrics";
import { createResultId, personalBest, type StoredResult } from "@/lib/storage";
import { resultsStore } from "@/lib/store";
import { playSound } from "@/lib/sound";
import { summarizeWeaknesses } from "@/lib/weakness";

const TICK_MS = 100;

export type FinishedResult = {
  result: StoredResult;
  previousBest: number | null;
  isPersonalBest: boolean;
};

export type LiveStats = {
  wpm: number;
  raw: number;
  accuracy: number;
  errors: number;
  /** Seconds left in a timed test; `null` in word and quote modes. */
  remaining: number | null;
  /** Words committed / words required in word and quote modes; `null` when timed. */
  progress: { done: number; total: number } | null;
};

type Options = {
  mode: Mode;
  soundEnabled: boolean;
};

/** Snapshot of the numbers for a given state at a given elapsed time. */
function measure(snapshot: TestState, elapsedMs: number) {
  const chars = analyze(snapshot);
  return {
    chars,
    wpm: wpmFrom(chars.correct, elapsedMs),
    raw: rawWpmFrom(totalTypedChars(chars), elapsedMs),
    accuracy: accuracyFrom(snapshot.keystrokes, snapshot.errors),
  };
}

/**
 * Owns one run of the test. Mount this keyed by mode — a mode change is a new test,
 * and remounting is cheaper to reason about than resetting six pieces of state.
 */
export function useTypingTest({ mode, soundEnabled }: Options) {
  const [state, setState] = useState<TestState>(() => newTest(mode));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [finished, setFinished] = useState<FinishedResult | null>(null);

  // Mirrors of state the interval and event handlers read without re-subscribing.
  const stateRef = useRef(state);
  const samplesRef = useRef<Sample[]>([]);
  const soundRef = useRef(soundEnabled);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  const commit = useCallback((next: TestState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Score the run and hand it to the store. Called exactly once per test. */
  const finalize = useCallback(
    (snapshot: TestState, durationMs: number) => {
      const safeDuration = Math.max(1, durationMs);
      const final = measure(snapshot, safeDuration);

      // Guarantee at least one sample so very short runs still draw a graph.
      const finalSamples: Sample[] =
        samplesRef.current.length > 0
          ? samplesRef.current
          : [
              {
                t: Math.max(1, safeDuration / 1000),
                wpm: final.wpm,
                raw: final.raw,
                errors: snapshot.errors,
              },
            ];

      const result: StoredResult = {
        id: createResultId(),
        ts: Date.now(),
        mode,
        modeKey: modeKey(mode),
        durationMs: safeDuration,
        wpm: final.wpm,
        raw: final.raw,
        accuracy: final.accuracy,
        consistency: consistencyFrom(finalSamples),
        chars: final.chars,
        keystrokes: snapshot.keystrokes,
        errors: snapshot.errors,
        samples: finalSamples,
        weaknesses: summarizeWeaknesses(snapshot.keyMistakes, snapshot.wordMistakes),
      };

      const previous = personalBest(resultsStore.get().results, mode);
      resultsStore.add(result);

      samplesRef.current = finalSamples;
      setSamples(finalSamples);
      setElapsedMs(safeDuration);
      setFinished({
        result,
        previousBest: previous ? previous.wpm : null,
        isPersonalBest: !previous || result.wpm > previous.wpm,
      });
    },
    [mode],
  );

  const reset = useCallback(
    (next: TestState) => {
      samplesRef.current = [];
      setSamples([]);
      setElapsedMs(0);
      setFinished(null);
      commit(next);
    },
    [commit],
  );

  const restart = useCallback(() => reset(retry(stateRef.current)), [reset]);
  const startNewTest = useCallback(() => reset(newTest(mode)), [mode, reset]);

  // The clock. Subscribes to a timer while a test is in progress; every setState
  // below happens inside the interval callback, never in the effect body.
  useEffect(() => {
    if (state.status !== "running" || state.startedAt === null) return;
    const startedAt = state.startedAt;

    const tick = () => {
      const ms = performance.now() - startedAt;
      const snapshot = stateRef.current;

      // Fill in every whole second that has passed since the last sample.
      while (samplesRef.current.length < Math.floor(ms / 1000)) {
        const second = samplesRef.current.length + 1;
        const at = measure(snapshot, second * 1000);
        samplesRef.current = [
          ...samplesRef.current,
          { t: second, wpm: at.wpm, raw: at.raw, errors: snapshot.errors },
        ];
      }
      setSamples(samplesRef.current);

      if (mode.kind === "time" && ms >= mode.seconds * 1000) {
        const ended = applyFinish(snapshot);
        commit(ended);
        finalize(ended, mode.seconds * 1000);
        return;
      }
      setElapsedMs(ms);
    };

    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.status, state.startedAt, mode, commit, finalize]);

  /** Shared tail for the two input actions that can end a test on their own. */
  const advance = useCallback(
    (next: TestState, previous: TestState, now: number) => {
      if (next === previous) return;
      commit(next);

      if (soundRef.current && next.keystrokes > previous.keystrokes) {
        playSound(next.errors > previous.errors ? "error" : "key");
      }

      if (next.status === "finished" && previous.status !== "finished") {
        finalize(next, now - (next.startedAt ?? now));
      }
    },
    [commit, finalize],
  );

  const onChar = useCallback(
    (char: string) => {
      const now = performance.now();
      const previous = stateRef.current;
      advance(typeChar(previous, char, now), previous, now);
    },
    [advance],
  );

  const onSpace = useCallback(() => {
    const now = performance.now();
    const previous = stateRef.current;
    advance(typeSpace(previous, now), previous, now);
  }, [advance]);

  const onBackspace = useCallback(
    (wholeWord: boolean) => {
      commit(applyBackspace(stateRef.current, wholeWord));
    },
    [commit],
  );

  const live = useMemo<LiveStats>(() => {
    const snapshot = measure(state, elapsedMs);
    const remaining = mode.kind === "time" ? Math.max(0, mode.seconds - elapsedMs / 1000) : null;
    const progress =
      mode.kind === "time"
        ? null
        : { done: Math.min(state.wordIndex, state.target.length), total: state.target.length };

    return {
      wpm: snapshot.wpm,
      raw: snapshot.raw,
      accuracy: state.keystrokes === 0 ? 100 : snapshot.accuracy,
      errors: state.errors,
      remaining,
      progress,
    };
  }, [state, elapsedMs, mode]);

  return {
    state,
    live,
    samples,
    finished,
    elapsedMs,
    onChar,
    onSpace,
    onBackspace,
    restart,
    startNewTest,
  };
}
