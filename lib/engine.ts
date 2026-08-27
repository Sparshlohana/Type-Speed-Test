/**
 * The typing test state machine.
 *
 * Deliberately a plain object plus pure transitions — React only ever renders the
 * result, so the rules of the test are readable in one file and testable without a DOM.
 */

import { EMPTY_CHAR_STATS, type CharStats, type Sample } from "./metrics";
import { generateWords, quoteToWords, randomQuote, type Quote, type QuoteLength } from "./words";

export type Mode =
  | { kind: "time"; seconds: number }
  | { kind: "words"; count: number }
  | { kind: "quote"; length: QuoteLength };

export type Status = "idle" | "running" | "finished";

export type TestState = {
  /** Words the user is asked to type. */
  target: string[];
  /** What the user actually typed, indexed alongside `target`. */
  typed: string[];
  /** Index of the word being typed. The caret always sits at the end of `typed[wordIndex]`. */
  wordIndex: number;
  status: Status;
  /** `performance.now()` at the first keystroke. */
  startedAt: number | null;
  /** Every printable keystroke. Never decremented — backspace does not undo history. */
  keystrokes: number;
  /** Keystrokes that were wrong when they were made. Never decremented. */
  errors: number;
  /** Attribution for quote mode, so the results screen can credit the source. */
  quote: Quote | null;
};

export const DEFAULT_MODE: Mode = { kind: "time", seconds: 30 };

/** Words generated for a timed test — enough that nobody types past the end. */
const TIMED_WORD_BUFFER = 60;
const WORDS_PER_SECOND_ALLOWANCE = 4;

export function modeKey(mode: Mode): string {
  switch (mode.kind) {
    case "time":
      return `time:${mode.seconds}`;
    case "words":
      return `words:${mode.count}`;
    case "quote":
      return `quote:${mode.length}`;
  }
}

export function modeLabel(mode: Mode): string {
  switch (mode.kind) {
    case "time":
      return `${mode.seconds}s`;
    case "words":
      return `${mode.count} words`;
    case "quote":
      return `${mode.length} quote`;
  }
}

/** Build the target word list for a mode. Timed tests get a generous buffer. */
export function buildTest(mode: Mode): { target: string[]; quote: Quote | null } {
  switch (mode.kind) {
    case "time":
      return {
        target: generateWords(TIMED_WORD_BUFFER + mode.seconds * WORDS_PER_SECOND_ALLOWANCE),
        quote: null,
      };
    case "words":
      return { target: generateWords(mode.count), quote: null };
    case "quote": {
      const quote = randomQuote(mode.length);
      return { target: quoteToWords(quote), quote };
    }
  }
}

export function createState(target: string[], quote: Quote | null = null): TestState {
  return {
    target,
    typed: [""],
    wordIndex: 0,
    status: "idle",
    startedAt: null,
    keystrokes: 0,
    errors: 0,
    quote,
  };
}

export function newTest(mode: Mode): TestState {
  const { target, quote } = buildTest(mode);
  return createState(target, quote);
}

/** Same words, fresh attempt — what the "Try Again" button does. */
export function retry(state: TestState): TestState {
  return createState(state.target, state.quote);
}

export function typedAt(state: TestState, index: number): string {
  return state.typed[index] ?? "";
}

/** True when the target has no more words to type. */
function isLastWord(state: TestState): boolean {
  return state.wordIndex >= state.target.length - 1;
}

function start(state: TestState, now: number): TestState {
  if (state.status !== "idle") return state;
  return { ...state, status: "running", startedAt: now };
}

export function typeChar(state: TestState, char: string, now: number): TestState {
  if (state.status === "finished") return state;
  const started = start(state, now);

  const current = typedAt(started, started.wordIndex);
  const targetWord = started.target[started.wordIndex] ?? "";
  const isCorrect = current.length < targetWord.length && targetWord[current.length] === char;

  const typed = started.typed.slice();
  typed[started.wordIndex] = current + char;

  const next: TestState = {
    ...started,
    typed,
    keystrokes: started.keystrokes + 1,
    errors: started.errors + (isCorrect ? 0 : 1),
  };

  // Finishing the final word of a fixed-length test ends it without needing a trailing space.
  const finishesTest =
    next.target.length > 0 && isLastWord(next) && typed[next.wordIndex] === targetWord;

  return finishesTest ? { ...next, status: "finished" } : next;
}

export function typeSpace(state: TestState, now: number): TestState {
  if (state.status === "finished") return state;
  const started = start(state, now);

  const current = typedAt(started, started.wordIndex);
  // A leading space is a no-op rather than an error — it never advances the test.
  if (current.length === 0) return started;

  const targetWord = started.target[started.wordIndex] ?? "";
  const wordIsPerfect = current === targetWord;

  const typed = started.typed.slice();
  const wordIndex = started.wordIndex + 1;
  if (typed[wordIndex] === undefined) typed[wordIndex] = "";

  const next: TestState = {
    ...started,
    typed,
    wordIndex,
    keystrokes: started.keystrokes + 1,
    errors: started.errors + (wordIsPerfect ? 0 : 1),
  };

  return wordIndex >= next.target.length ? { ...next, status: "finished" } : next;
}

/** Backspace. `wholeWord` handles Ctrl/Alt+Backspace. */
export function backspace(state: TestState, wholeWord = false): TestState {
  if (state.status === "finished") return state;

  const current = typedAt(state, state.wordIndex);
  if (current.length > 0) {
    const typed = state.typed.slice();
    typed[state.wordIndex] = wholeWord ? "" : current.slice(0, -1);
    return { ...state, typed };
  }

  // Empty word: step back into the previous one, caret at its end.
  if (state.wordIndex === 0) return state;
  const wordIndex = state.wordIndex - 1;
  if (!wholeWord) return { ...state, wordIndex };

  const typed = state.typed.slice();
  typed[wordIndex] = "";
  return { ...state, typed, wordIndex };
}

export function finish(state: TestState): TestState {
  if (state.status !== "running") return state;
  return { ...state, status: "finished" };
}

/**
 * Character-level scoring over everything typed so far.
 *
 * A committed word credits one extra character for the space that followed it — the
 * separator is real work, and counting it is what keeps WPM comparable to other tools.
 */
export function analyze(state: TestState): CharStats {
  if (state.status === "idle" && state.keystrokes === 0) return EMPTY_CHAR_STATS;

  let correct = 0;
  let incorrect = 0;
  let extra = 0;
  let missed = 0;

  const lastIndex = Math.min(state.wordIndex, state.target.length - 1);
  for (let i = 0; i <= lastIndex; i++) {
    const targetWord = state.target[i] ?? "";
    const typedWord = typedAt(state, i);
    const overlap = Math.min(targetWord.length, typedWord.length);

    for (let j = 0; j < overlap; j++) {
      if (typedWord[j] === targetWord[j]) correct++;
      else incorrect++;
    }
    if (typedWord.length > targetWord.length) extra += typedWord.length - targetWord.length;

    const isCommitted = i < state.wordIndex;
    if (isCommitted) {
      if (typedWord.length < targetWord.length) missed += targetWord.length - typedWord.length;
      // Credit (or fault) the separator that committed this word.
      if (typedWord === targetWord) correct++;
      else incorrect++;
    }
  }

  return { correct, incorrect, extra, missed };
}

/** Words fully committed so far — drives the word-mode progress readout. */
export function wordsCompleted(state: TestState): number {
  return Math.min(state.wordIndex, state.target.length);
}

export type { CharStats, Sample };
