/** A wrong printable key at the moment it was pressed. */
export type KeyMistake = {
  /** Empty when the user typed beyond the end of the target word. */
  expected: string;
  actual: string;
};

export type KeyErrorCount = KeyMistake & { count: number };
export type WordErrorCount = { word: string; count: number };
export type KeyAccuracyCount = { key: string; correct: number; attempts: number };
export type KeyAccuracyTracker = Record<string, KeyAccuracyCount>;

/** Compact analytics persisted with a completed result. */
export type WeaknessSummary = {
  keys: KeyErrorCount[];
  words: WordErrorCount[];
  /** Optional so results captured before per-key accuracy remain readable. */
  keyAccuracy?: KeyAccuracyCount[];
};

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Collapse one attempt's event history into a small, storage-friendly summary. */
export function summarizeWeaknesses(
  keyMistakes: readonly KeyMistake[],
  wordMistakes: readonly string[],
  keyAccuracy: readonly KeyAccuracyCount[] = [],
): WeaknessSummary {
  const keys = new Map<string, number>();
  const words = new Map<string, number>();

  for (const mistake of keyMistakes) {
    increment(keys, JSON.stringify([mistake.expected, mistake.actual]));
  }
  for (const word of wordMistakes) {
    if (word) increment(words, word.toLocaleLowerCase());
  }

  return {
    keys: [...keys.entries()]
      .map(([pair, count]) => {
        const [expected, actual] = JSON.parse(pair) as [string, string];
        return { expected, actual, count };
      })
      .sort((a, b) => b.count - a.count),
    words: [...words.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count),
    keyAccuracy: [...keyAccuracy].sort((a, b) => b.attempts - a.attempts),
  };
}

type ResultWithWeaknesses = { weaknesses?: WeaknessSummary };

export type FingerId =
  | "left-pinky"
  | "left-ring"
  | "left-middle"
  | "left-index"
  | "right-index"
  | "right-middle"
  | "right-ring"
  | "right-pinky"
  | "thumbs";

export type KeyWeakness = {
  key: string;
  count: number;
  share: number;
  finger: FingerId;
  correct: number;
  attempts: number;
  accuracy: number | null;
};

export type FingerWeakness = {
  id: FingerId;
  label: string;
  shortLabel: string;
  count: number;
  share: number;
  correct: number;
  attempts: number;
  accuracy: number | null;
};

export type WeaknessAnalytics = {
  keys: KeyWeakness[];
  keyErrors: KeyErrorCount[];
  wordErrors: WordErrorCount[];
  fingers: FingerWeakness[];
  totalKeyErrors: number;
  totalWordErrors: number;
  extraKeypresses: number;
  analyzedTests: number;
  accuracyTests: number;
  trackedCorrect: number;
  trackedAttempts: number;
  overallAccuracy: number | null;
  maxKeyErrors: number;
};

export type WeaknessProfile = {
  keyErrors: KeyErrorCount[];
  wordErrors: WordErrorCount[];
  focusChars: string[];
  focusWords: string[];
  totalErrors: number;
  hasHistory: boolean;
};

const FALLBACK_FOCUS = ["e", "r", "t", "i", "o", "n"];

const FINGER_META: readonly Pick<FingerWeakness, "id" | "label" | "shortLabel">[] = [
  { id: "left-pinky", label: "Left pinky", shortLabel: "L pinky" },
  { id: "left-ring", label: "Left ring", shortLabel: "L ring" },
  { id: "left-middle", label: "Left middle", shortLabel: "L middle" },
  { id: "left-index", label: "Left index", shortLabel: "L index" },
  { id: "right-index", label: "Right index", shortLabel: "R index" },
  { id: "right-middle", label: "Right middle", shortLabel: "R middle" },
  { id: "right-ring", label: "Right ring", shortLabel: "R ring" },
  { id: "right-pinky", label: "Right pinky", shortLabel: "R pinky" },
  { id: "thumbs", label: "Thumbs", shortLabel: "Thumbs" },
];

const FINGER_KEYS: Record<FingerId, string> = {
  "left-pinky": "`~1!qaz",
  "left-ring": "2@wsx",
  "left-middle": "3#edc",
  "left-index": "4$5%rftgvb",
  "right-index": "6^7&yuhjnm",
  "right-middle": "8*ik,<",
  "right-ring": "9(ol.>",
  "right-pinky": "0)-_=+p[{]}\\|;:'\"/?",
  thumbs: " ",
};

function normalizedKey(value: string): string {
  return value.length === 1 ? value.toLocaleLowerCase() : value;
}

/** Increment a compact per-key counter without retaining every correct keystroke. */
export function trackKeyAttempt(
  tracker: KeyAccuracyTracker,
  key: string,
  correct: boolean,
): KeyAccuracyTracker {
  const normalized = normalizedKey(key);
  const current = tracker[normalized] ?? { key: normalized, correct: 0, attempts: 0 };
  return {
    ...tracker,
    [normalized]: {
      key: normalized,
      correct: current.correct + (correct ? 1 : 0),
      attempts: current.attempts + 1,
    },
  };
}

export function fingerForKey(key: string): FingerId {
  const normalized = normalizedKey(key);
  return FINGER_META.find(({ id }) => FINGER_KEYS[id].includes(normalized))?.id ?? "right-pinky";
}

/** Build a complete, filter-friendly view of persisted mistake signals. */
export function buildWeaknessAnalytics(
  results: readonly ResultWithWeaknesses[],
): WeaknessAnalytics {
  const keyPairs = new Map<string, KeyErrorCount>();
  const keyCounts = new Map<string, number>();
  const wordCounts = new Map<string, number>();
  const accuracyCounts = new Map<string, { correct: number; attempts: number }>();
  let extraKeypresses = 0;
  let analyzedTests = 0;
  let accuracyTests = 0;

  for (const result of results) {
    if (!result.weaknesses) continue;
    analyzedTests++;
    if (result.weaknesses.keyAccuracy) {
      accuracyTests++;
      for (const item of result.weaknesses.keyAccuracy) {
        const key = normalizedKey(item.key);
        const current = accuracyCounts.get(key) ?? { correct: 0, attempts: 0 };
        accuracyCounts.set(key, {
          correct: current.correct + item.correct,
          attempts: current.attempts + item.attempts,
        });
      }
    }
    for (const item of result.weaknesses.keys) {
      const id = JSON.stringify([item.expected, item.actual]);
      const current = keyPairs.get(id);
      keyPairs.set(id, { ...item, count: (current?.count ?? 0) + item.count });
      if (!item.expected) {
        extraKeypresses += item.count;
        continue;
      }
      const key = normalizedKey(item.expected);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + item.count);
    }
    for (const item of result.weaknesses.words) {
      wordCounts.set(item.word, (wordCounts.get(item.word) ?? 0) + item.count);
    }
  }

  const totalKeyErrors = [...keyPairs.values()].reduce((sum, item) => sum + item.count, 0);
  const totalWordErrors = [...wordCounts.values()].reduce((sum, count) => sum + count, 0);
  const allKeys = new Set([...keyCounts.keys(), ...accuracyCounts.keys()]);
  const keys = [...allKeys]
    .map((key) => {
      const count = keyCounts.get(key) ?? 0;
      const tracked = accuracyCounts.get(key) ?? { correct: 0, attempts: 0 };
      return {
        key,
        count,
        share: totalKeyErrors > 0 ? count / totalKeyErrors : 0,
        finger: fingerForKey(key),
        correct: tracked.correct,
        attempts: tracked.attempts,
        accuracy: tracked.attempts > 0 ? (tracked.correct / tracked.attempts) * 100 : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const fingerCounts = new Map<FingerId, { correct: number; attempts: number }>();
  for (const key of keys) {
    const current = fingerCounts.get(key.finger) ?? { correct: 0, attempts: 0 };
    fingerCounts.set(key.finger, {
      correct: current.correct + key.correct,
      attempts: current.attempts + key.attempts,
    });
  }

  const trackedCorrect = [...accuracyCounts.values()].reduce((sum, item) => sum + item.correct, 0);
  const trackedAttempts = [...accuracyCounts.values()].reduce((sum, item) => sum + item.attempts, 0);

  return {
    keys,
    keyErrors: [...keyPairs.values()].sort((a, b) => b.count - a.count),
    wordErrors: [...wordCounts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count),
    fingers: FINGER_META.map((finger) => {
      const tracked = fingerCounts.get(finger.id) ?? { correct: 0, attempts: 0 };
      const count = tracked.attempts - tracked.correct;
      const trackedMisses = trackedAttempts - trackedCorrect;
      return {
        ...finger,
        count,
        share: trackedMisses > 0 ? count / trackedMisses : 0,
        ...tracked,
        accuracy: tracked.attempts > 0 ? (tracked.correct / tracked.attempts) * 100 : null,
      };
    }),
    totalKeyErrors,
    totalWordErrors,
    extraKeypresses,
    analyzedTests,
    accuracyTests,
    trackedCorrect,
    trackedAttempts,
    overallAccuracy: trackedAttempts > 0 ? (trackedCorrect / trackedAttempts) * 100 : null,
    maxKeyErrors: Math.max(0, ...keys.map((key) => key.count)),
  };
}

/** Combine recent attempts into the focus used by the adaptive practice generator. */
export function aggregateWeaknesses(
  results: readonly ResultWithWeaknesses[],
  resultLimit = 50,
): WeaknessProfile {
  const keyCounts = new Map<string, KeyErrorCount>();
  const wordCounts = new Map<string, number>();

  for (const result of results.slice(0, resultLimit)) {
    for (const item of result.weaknesses?.keys ?? []) {
      const id = JSON.stringify([item.expected, item.actual]);
      const current = keyCounts.get(id);
      keyCounts.set(id, { ...item, count: (current?.count ?? 0) + item.count });
    }
    for (const item of result.weaknesses?.words ?? []) {
      wordCounts.set(item.word, (wordCounts.get(item.word) ?? 0) + item.count);
    }
  }

  const keyErrors = [...keyCounts.values()].sort((a, b) => b.count - a.count);
  const wordErrors = [...wordCounts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
  const focusChars = [...new Set(
    keyErrors
      .map((item) => item.expected.toLocaleLowerCase())
      .filter((char) => char.length === 1 && char.trim().length === 1),
  )].slice(0, 6);

  return {
    keyErrors: keyErrors.slice(0, 8),
    wordErrors: wordErrors.slice(0, 8),
    focusChars: focusChars.length > 0 ? focusChars : FALLBACK_FOCUS,
    focusWords: wordErrors.slice(0, 12).map((item) => item.word),
    totalErrors:
      keyErrors.reduce((sum, item) => sum + item.count, 0) +
      wordErrors.reduce((sum, item) => sum + item.count, 0),
    hasHistory: keyErrors.length > 0 || wordErrors.length > 0,
  };
}
