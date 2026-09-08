/**
 * A short record of the duels you have actually fought.
 *
 * The identity carries a win/loss tally; this carries the shape of the rivalry — what
 * each duel cost, which keys you took back in it, and whether you are on a run. Streaks
 * are always derived from the entries rather than stored, so they cannot drift out of
 * sync with the record they summarise.
 */

export const NEMESIS_HISTORY_KEY = "typeflow.nemesis.history";
const HISTORY_VERSION = 1;
const HISTORY_LIMIT = 30;

export type DuelRecord = {
  ts: number;
  level: number;
  outcome: "victory" | "defeat";
  score: number;
  wpm: number;
  accuracy: number;
  words: number;
  bestCombo: number;
  /** Keys this duel proved clean. */
  brokenKeys: string[];
  signature: string;
};

type HistoryEnvelope = { version: number; data: DuelRecord[] };

function sanitize(value: unknown): DuelRecord[] {
  if (!value || typeof value !== "object") return [];
  const envelope = value as HistoryEnvelope;
  if (envelope.version !== HISTORY_VERSION || !Array.isArray(envelope.data)) return [];
  return envelope.data
    .filter((entry): entry is DuelRecord =>
      Boolean(entry)
      && typeof entry === "object"
      && typeof entry.ts === "number"
      && Number.isFinite(entry.ts)
      && (entry.outcome === "victory" || entry.outcome === "defeat"))
    .map((entry) => ({
      ...entry,
      brokenKeys: Array.isArray(entry.brokenKeys)
        ? entry.brokenKeys.filter((key): key is string => typeof key === "string")
        : [],
    }))
    .slice(0, HISTORY_LIMIT);
}

export function loadDuelHistory(): DuelRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NEMESIS_HISTORY_KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Newest first, capped. Returns the new history so callers need not re-read storage. */
export function recordDuelResult(record: DuelRecord): DuelRecord[] {
  const history = [record, ...loadDuelHistory()].slice(0, HISTORY_LIMIT);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        NEMESIS_HISTORY_KEY,
        JSON.stringify({ version: HISTORY_VERSION, data: history } satisfies HistoryEnvelope),
      );
    } catch {
      // The duel still counted everywhere else; only its diary entry is lost.
    }
  }
  return history;
}

export type DuelStreak = {
  /** Positive for consecutive wins, negative for consecutive losses, 0 with no history. */
  current: number;
  best: number;
};

export function duelStreak(history: readonly DuelRecord[]): DuelStreak {
  if (history.length === 0) return { current: 0, best: 0 };

  const leading = history[0].outcome;
  let current = 0;
  for (const record of history) {
    if (record.outcome !== leading) break;
    current++;
  }

  let best = 0;
  let run = 0;
  for (const record of history) {
    run = record.outcome === "victory" ? run + 1 : 0;
    best = Math.max(best, run);
  }

  return { current: leading === "victory" ? current : -current, best };
}
