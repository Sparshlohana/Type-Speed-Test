import type { GhostOpponent, StoredResult } from "./storage";

const CHARS_PER_WORD = 5;
const SECONDS_PER_MINUTE = 60;

/** Pick an opponent only from attempts made in the exact same mode. */
export function selectGhostResult(
  results: readonly StoredResult[],
  selectedModeKey: string,
  opponent: GhostOpponent,
): StoredResult | null {
  const matching = results.filter((result) => result.modeKey === selectedModeKey);
  if (matching.length === 0) return null;

  if (opponent === "last-attempt") {
    return matching.reduce((latest, result) => result.ts > latest.ts ? result : latest);
  }

  return matching.reduce((best, result) => {
    if (result.wpm !== best.wpm) return result.wpm > best.wpm ? result : best;
    return result.accuracy > best.accuracy ? result : best;
  });
}

function correctCharsAtSample(t: number, wpm: number): number {
  return wpm * CHARS_PER_WORD * t / SECONDS_PER_MINUTE;
}

/**
 * Reconstruct the ghost's cumulative correct-character pace at an elapsed time.
 * Samples store cumulative WPM, so converting them back to characters and
 * interpolating produces a smooth, stable replay without storing every keystroke.
 */
export function ghostCorrectCharsAt(result: StoredResult, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;

  const durationSeconds = Math.max(0.001, result.durationMs / 1000);
  const elapsedSeconds = Math.min(elapsedMs / 1000, durationSeconds);
  const finalChars = Math.max(0, result.chars.correct);
  const points = [
    { t: 0, chars: 0 },
    ...result.samples
      .filter((sample) => sample.t > 0 && sample.t < durationSeconds)
      .map((sample) => ({
        t: sample.t,
        chars: Math.min(finalChars, Math.max(0, correctCharsAtSample(sample.t, sample.wpm))),
      }))
      .sort((a, b) => a.t - b.t),
    { t: durationSeconds, chars: finalChars },
  ];

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    if (elapsedSeconds > next.t) continue;
    const previous = points[index - 1];
    const span = next.t - previous.t;
    if (span <= 0) return next.chars;
    const progress = (elapsedSeconds - previous.t) / span;
    return previous.chars + (next.chars - previous.chars) * progress;
  }

  return finalChars;
}
