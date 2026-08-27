/**
 * Pure scoring math. Nothing here touches React or the DOM, so the numbers can be
 * reasoned about (and unit tested) in isolation.
 *
 * Every division is guarded: an untouched test must score 0, never NaN.
 */

export type CharStats = {
  /** Characters typed that matched the target (includes credited word-separator spaces). */
  correct: number;
  /** Characters typed in a position that did not match the target. */
  incorrect: number;
  /** Characters typed past the end of a target word. */
  extra: number;
  /** Characters of a committed word the user never typed. */
  missed: number;
};

export type Sample = {
  /** Seconds since the test started. */
  t: number;
  wpm: number;
  raw: number;
  /** Cumulative incorrect keystrokes at this moment. */
  errors: number;
};

export const EMPTY_CHAR_STATS: CharStats = { correct: 0, incorrect: 0, extra: 0, missed: 0 };

/** A "word" is five characters — the standard convention behind WPM. */
const CHARS_PER_WORD = 5;

export function wpmFrom(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const minutes = elapsedMs / 60_000;
  return correctChars / CHARS_PER_WORD / minutes;
}

export function rawWpmFrom(typedChars: number, elapsedMs: number): number {
  return wpmFrom(typedChars, elapsedMs);
}

/**
 * Keystroke accuracy: how often the user hit the right key the first time.
 * Backspacing never repairs it, which is what makes it meaningful.
 */
export function accuracyFrom(keystrokes: number, errors: number): number {
  if (keystrokes <= 0) return 0;
  return clamp(((keystrokes - errors) / keystrokes) * 100, 0, 100);
}

/**
 * Consistency as 1 - coefficient of variation over the per-second WPM samples.
 * A perfectly even typist scores 100; wild bursts and stalls drag it down.
 */
export function consistencyFrom(samples: readonly Sample[]): number {
  const values = samples.map((s) => s.raw).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return clamp((1 - cv) * 100, 0, 100);
}

export function totalTypedChars(stats: CharStats): number {
  return stats.correct + stats.incorrect + stats.extra;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
