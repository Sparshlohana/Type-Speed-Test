/**
 * The scar ledger — what your duels taught the app about your hands.
 *
 * A Nemesis duel already measures every key it attacked with, then used to throw the
 * result away at the end of the run. This keeps it, so losing to your rival on "k"
 * actually shows up in adaptive practice and in the stats page.
 *
 * It is deliberately NOT routed through `resultsStore`: that writes to the server and
 * feeds the WPM charts and XP, and a duel is not a typing test. Instead the ledger emits
 * one synthetic result-shaped row that both weakness readers already understand, so
 * `lib/weakness.ts` needs no changes at all.
 */

import type { KeyDuelCount } from "./games/nemesis";
import type { WeaknessSummary } from "./weakness";

export const NEMESIS_SCAR_KEY = "typeflow.nemesis.scars";
const SCAR_VERSION = 1;

/** Keys tracked at once; the least-missed are evicted first. */
const KEY_LIMIT = 40;
/** Counts halve once per completed bucket, so old duels stop haunting the profile. */
const DECAY_BUCKET_MS = 14 * 24 * 60 * 60 * 1000;
/** One catastrophic duel must not be able to hijack the profile. */
const DUEL_MISS_CAP = 60;
const DUEL_HIT_CAP = 400;
/**
 * Total error weight a ledger may contribute to a merged profile. Real typing results
 * are the primary signal; duels nudge the focus set, they do not own it.
 */
const EMIT_ERROR_BUDGET = 24;
const EMIT_KEY_LIMIT = 8;
/** Clean hits on a key before a duel counts as evidence the player took it back. */
const MASTERY_HITS = 12;

export type ScarEntry = { key: string; hits: number; misses: number; lastTs: number };

export type ScarLedger = {
  version: typeof SCAR_VERSION;
  updatedAt: number;
  duels: number;
  keys: Record<string, ScarEntry>;
};

export function emptyScarLedger(now = Date.now()): ScarLedger {
  return { version: SCAR_VERSION, updatedAt: now, duels: 0, keys: {} };
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sanitize(value: unknown, now: number): ScarLedger {
  if (!value || typeof value !== "object") return emptyScarLedger(now);
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== SCAR_VERSION) return emptyScarLedger(now);

  const keys: Record<string, ScarEntry> = {};
  const raw = candidate.keys;
  if (raw && typeof raw === "object") {
    for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (key.length !== 1 || !entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      keys[key] = {
        key,
        hits: finite(item.hits),
        misses: finite(item.misses),
        lastTs: finite(item.lastTs, now),
      };
    }
  }
  return {
    version: SCAR_VERSION,
    updatedAt: finite(candidate.updatedAt, now),
    duels: Math.floor(finite(candidate.duels)),
    keys,
  };
}

/** Halve every entry once per completed bucket since it was last touched. */
function decay(ledger: ScarLedger, now: number): ScarLedger {
  const keys: Record<string, ScarEntry> = {};
  for (const entry of Object.values(ledger.keys)) {
    const buckets = Math.floor(Math.max(0, now - entry.lastTs) / DECAY_BUCKET_MS);
    const factor = buckets === 0 ? 1 : 0.5 ** buckets;
    const hits = entry.hits * factor;
    const misses = entry.misses * factor;
    if (hits + misses < 1) continue;
    keys[entry.key] = { ...entry, hits, misses };
  }
  return { ...ledger, keys };
}

function prune(keys: Record<string, ScarEntry>): Record<string, ScarEntry> {
  const entries = Object.values(keys);
  if (entries.length <= KEY_LIMIT) return keys;
  return Object.fromEntries(
    entries
      .sort((a, b) => b.misses - a.misses || b.hits - a.hits)
      .slice(0, KEY_LIMIT)
      .map((entry) => [entry.key, entry]),
  );
}

/** Every read and write is guarded: a storage-blocked browser still duels normally. */
export function loadScarLedger(now = Date.now()): ScarLedger {
  if (typeof window === "undefined") return emptyScarLedger(now);
  try {
    const raw = window.localStorage.getItem(NEMESIS_SCAR_KEY);
    if (!raw) return emptyScarLedger(now);
    return decay(sanitize(JSON.parse(raw), now), now);
  } catch {
    return emptyScarLedger(now);
  }
}

function save(ledger: ScarLedger): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NEMESIS_SCAR_KEY, JSON.stringify(ledger));
  } catch {
    // The duel already counted; only the lesson is forgotten.
  }
}

/** Fold one duel's key ledger in, capped so a single disastrous run cannot dominate. */
export function recordDuel(
  keyDuel: Record<string, KeyDuelCount>,
  now = Date.now(),
): ScarLedger {
  const current = loadScarLedger(now);
  const totals = Object.values(keyDuel).reduce(
    (sum, count) => ({ hits: sum.hits + count.hits, misses: sum.misses + count.misses }),
    { hits: 0, misses: 0 },
  );
  const hitScale = totals.hits > DUEL_HIT_CAP ? DUEL_HIT_CAP / totals.hits : 1;
  const missScale = totals.misses > DUEL_MISS_CAP ? DUEL_MISS_CAP / totals.misses : 1;

  const keys = { ...current.keys };
  for (const [rawKey, count] of Object.entries(keyDuel)) {
    const key = rawKey.toLocaleLowerCase();
    if (key.length !== 1) continue;
    const entry = keys[key] ?? { key, hits: 0, misses: 0, lastTs: now };
    keys[key] = {
      key,
      hits: entry.hits + count.hits * hitScale,
      misses: entry.misses + count.misses * missScale,
      lastTs: now,
    };
  }

  const next: ScarLedger = {
    version: SCAR_VERSION,
    updatedAt: now,
    duels: current.duels + 1,
    keys: prune(keys),
  };
  save(next);
  return next;
}

export function clearScarLedger(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NEMESIS_SCAR_KEY);
  } catch {
    // Nothing to do; the next write overwrites it anyway.
  }
}

/**
 * One result-shaped row carrying the ledger, scaled into its error budget.
 *
 * `expected` is set with an empty `actual`: a duel knows which key broke, never which
 * wrong key replaced it. Every reader of these rows has to handle that.
 */
export function scarResult(ledger: ScarLedger): { weaknesses: WeaknessSummary } | null {
  const entries = Object.values(ledger.keys);
  if (entries.length === 0) return null;

  const missed = entries.filter((entry) => entry.misses >= 0.5);
  const totalMisses = missed.reduce((sum, entry) => sum + entry.misses, 0);
  const scale = totalMisses > EMIT_ERROR_BUDGET ? EMIT_ERROR_BUDGET / totalMisses : 1;

  const keys = missed
    .sort((a, b) => b.misses - a.misses)
    .slice(0, EMIT_KEY_LIMIT)
    .map((entry) => ({
      expected: entry.key,
      actual: "",
      count: Math.max(1, Math.round(entry.misses * scale)),
    }));

  const keyAccuracy = entries
    .map((entry) => ({
      key: entry.key,
      correct: Math.round(entry.hits),
      attempts: Math.round(entry.hits + entry.misses),
    }))
    .filter((item) => item.attempts > 0);

  if (keys.length === 0 && keyAccuracy.length === 0) return null;
  return { weaknesses: { keys, words: [], keyAccuracy } };
}

export type ScarStats = {
  duels: number;
  keys: number;
  /** Keys the duels say are no longer a weapon: clean, and attacked often enough to mean it. */
  mastered: string[];
};

export function scarStats(ledger: ScarLedger): ScarStats {
  const entries = Object.values(ledger.keys);
  return {
    duels: ledger.duels,
    keys: entries.length,
    mastered: entries
      .filter((entry) => entry.misses < 0.5 && entry.hits >= MASTERY_HITS)
      .sort((a, b) => b.hits - a.hits)
      .map((entry) => entry.key),
  };
}

/** Has this key been proven clean across duels? Gates the identity's trophy wall. */
export function isKeyBroken(ledger: ScarLedger, key: string): boolean {
  const entry = ledger.keys[key.toLocaleLowerCase()];
  return Boolean(entry && entry.misses < 0.5 && entry.hits >= MASTERY_HITS);
}
