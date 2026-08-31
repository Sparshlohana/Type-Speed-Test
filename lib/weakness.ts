/** A wrong printable key at the moment it was pressed. */
export type KeyMistake = {
  /** Empty when the user typed beyond the end of the target word. */
  expected: string;
  actual: string;
};

export type KeyErrorCount = KeyMistake & { count: number };
export type WordErrorCount = { word: string; count: number };

/** Compact analytics persisted with a completed result. */
export type WeaknessSummary = {
  keys: KeyErrorCount[];
  words: WordErrorCount[];
};

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Collapse one attempt's event history into a small, storage-friendly summary. */
export function summarizeWeaknesses(
  keyMistakes: readonly KeyMistake[],
  wordMistakes: readonly string[],
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
  };
}

type ResultWithWeaknesses = { weaknesses?: WeaknessSummary };

export type WeaknessProfile = {
  keyErrors: KeyErrorCount[];
  wordErrors: WordErrorCount[];
  focusChars: string[];
  focusWords: string[];
  totalErrors: number;
  hasHistory: boolean;
};

const FALLBACK_FOCUS = ["e", "r", "t", "i", "o", "n"];

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
