import { MongoServerError, ObjectId, type OptionalId } from "mongodb";

import type { StoredResult } from "../storage.ts";
import type { WeaknessSummary } from "../weakness.ts";
import type { Sample } from "../metrics.ts";
import {
  collections,
  type PersonalBestDoc,
  type ResultDoc,
  type UserTypingAnalyticsDoc,
} from "./mongo.ts";

export const RESULT_HISTORY_LIMIT = 200;
export const SAMPLE_HISTORY_LIMIT = 20;
export const MAX_STORED_SAMPLE_POINTS = 120;
export const WORD_ANALYTICS_LIMIT = 100;
export const KEY_ERROR_ANALYTICS_LIMIT = 200;
export const DAILY_RETENTION_DAYS = 90;

export type ResultOwner = {
  id: string;
  name: string;
  image?: string | null;
};

/** Preserve the full curve endpoints while bounding unusually long custom tests. */
export function compactSamples(samples: readonly Sample[]): Sample[] {
  if (samples.length <= MAX_STORED_SAMPLE_POINTS) return [...samples];
  return Array.from({ length: MAX_STORED_SAMPLE_POINTS }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (samples.length - 1)) / (MAX_STORED_SAMPLE_POINTS - 1),
    );
    return samples[sourceIndex];
  });
}

export function toResultDocument(
  result: StoredResult,
  user: ResultOwner,
): OptionalId<ResultDoc> {
  return {
    userId: user.id,
    clientId: result.id,
    username: user.name || "TypeFlow user",
    image: user.image ?? null,
    ts: result.ts,
    mode: result.mode,
    modeKey: result.modeKey,
    durationMs: result.durationMs,
    wpm: result.wpm,
    raw: result.raw,
    accuracy: result.accuracy,
    consistency: result.consistency,
    chars: result.chars,
    keystrokes: result.keystrokes,
    errors: result.errors,
    weaknesses: result.weaknesses,
  };
}

function analyticsToken(value: string): string {
  const token = [...value]
    .map((character) => character.codePointAt(0)?.toString(16) ?? "0")
    .join("_");
  return token || "empty";
}

function addWeaknessIncrements(
  increments: Record<string, number>,
  weakness: WeaknessSummary | undefined,
): void {
  const add = (path: string, count: number) => {
    increments[path] = (increments[path] ?? 0) + count;
  };
  if (!weakness) return;
  for (const item of weakness.keyAccuracy ?? []) {
    const token = analyticsToken(item.key);
    add(`keyAccuracy.k_${token}.correct`, item.correct);
    add(`keyAccuracy.k_${token}.attempts`, item.attempts);
  }
  for (const item of weakness.keys) {
    add(
      `keyErrors.e_${analyticsToken(item.expected)}_a_${analyticsToken(item.actual)}`,
      item.count,
    );
  }
  for (const item of weakness.words) {
    add(`wordErrors.w_${analyticsToken(item.word)}`, item.count);
  }
}

function analyticsIncrements(results: readonly StoredResult[]): Record<string, number> {
  const increments: Record<string, number> = { tests: results.length };
  for (const result of results) {
    addWeaknessIncrements(increments, result.weaknesses);
  }
  return increments;
}

async function trimAnalyticsMap(
  userId: string,
  field: "keyErrors" | "wordErrors",
  values: Record<string, number>,
  limit: number,
): Promise<void> {
  const excess = Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .slice(limit);
  if (excess.length === 0) return;
  const unset = Object.fromEntries(
    excess.map(([key]) => [`${field}.${key}`, "" as const]),
  ) as Record<string, "">;
  const { userTypingAnalytics } = await collections();
  await userTypingAnalytics.updateOne({ userId }, { $unset: unset });
}

/** Add new tests to the bounded cumulative analytics document for one user. */
export async function addToUserAnalytics(
  userId: string,
  results: readonly StoredResult[],
): Promise<void> {
  if (results.length === 0) return;
  const { userTypingAnalytics } = await collections();
  await userTypingAnalytics.updateOne(
    { userId },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        userId,
        tests: 0,
        keyAccuracy: {},
        keyErrors: {},
        wordErrors: {},
        processedResultIds: [],
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );
  await userTypingAnalytics.bulkWrite(
    results.map((result) => ({
      updateOne: {
        filter: { userId, processedResultIds: { $ne: result.id } },
        update: {
          $inc: analyticsIncrements([result]),
          $set: { updatedAt: new Date() },
          $push: {
            processedResultIds: {
              $each: [result.id],
              $slice: -RESULT_HISTORY_LIMIT,
            },
          },
        },
      },
    })),
    { ordered: true },
  );

  const analytics = await userTypingAnalytics.findOne(
    { userId },
    { projection: { keyErrors: 1, wordErrors: 1 } },
  );
  if (!analytics) return;
  await Promise.all([
    trimAnalyticsMap(
      userId,
      "keyErrors",
      analytics.keyErrors ?? {},
      KEY_ERROR_ANALYTICS_LIMIT,
    ),
    trimAnalyticsMap(
      userId,
      "wordErrors",
      analytics.wordErrors ?? {},
      WORD_ANALYTICS_LIMIT,
    ),
  ]);
}

function personalBestDocument(result: StoredResult, user: ResultOwner): OptionalId<PersonalBestDoc> {
  return {
    userId: user.id,
    clientId: result.id,
    username: user.name || "TypeFlow user",
    image: user.image ?? null,
    ts: result.ts,
    modeKey: result.modeKey,
    wpm: result.wpm,
    accuracy: result.accuracy,
    consistency: result.consistency,
  };
}

/** Keep exactly one race-safe best score for every user and mode. */
export async function updatePersonalBest(
  user: ResultOwner,
  result: StoredResult,
): Promise<boolean> {
  const { personalBests } = await collections();
  const candidate = personalBestDocument(result, user);
  try {
    const initialized = await personalBests.updateOne(
      { userId: user.id, modeKey: result.modeKey },
      { $setOnInsert: { _id: new ObjectId(), ...candidate } },
      { upsert: true },
    );
    if (initialized.upsertedCount > 0) return true;
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
  }

  const improved = await personalBests.updateOne(
    {
      userId: user.id,
      modeKey: result.modeKey,
      $or: [
        { wpm: { $lt: result.wpm } },
        { wpm: result.wpm, accuracy: { $lt: result.accuracy } },
      ],
    },
    { $set: candidate },
  );
  if (improved.modifiedCount > 0) return true;

  await personalBests.updateOne(
    { userId: user.id, modeKey: result.modeKey },
    { $set: { username: candidate.username, image: candidate.image } },
  );
  return false;
}

export async function storeResultSamples(
  userId: string,
  results: readonly StoredResult[],
): Promise<void> {
  const withSamples = results.filter((result) => result.samples.length > 0);
  if (withSamples.length === 0) return;
  const { resultSamples } = await collections();
  await resultSamples.bulkWrite(
    withSamples.map((result) => ({
      updateOne: {
        filter: { userId, clientId: result.id },
        update: {
          $set: { ts: result.ts, samples: compactSamples(result.samples) },
          $setOnInsert: { _id: new ObjectId(), userId, clientId: result.id },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

/** Bound both summary history and the more expensive graph sample history. */
export async function pruneUserStorage(userId: string): Promise<void> {
  const { results, resultSamples } = await collections();
  const [oldResults, oldSamples] = await Promise.all([
    results
      .find({ userId }, { projection: { _id: 1 } })
      .sort({ ts: -1 })
      .skip(RESULT_HISTORY_LIMIT)
      .toArray(),
    resultSamples
      .find({ userId }, { projection: { _id: 1 } })
      .sort({ ts: -1 })
      .skip(SAMPLE_HISTORY_LIMIT)
      .toArray(),
  ]);
  await Promise.all([
    oldResults.length > 0
      ? results.deleteMany({ _id: { $in: oldResults.map((result) => result._id) } })
      : Promise.resolve(),
    oldSamples.length > 0
      ? resultSamples.deleteMany({ _id: { $in: oldSamples.map((sample) => sample._id) } })
      : Promise.resolve(),
  ]);
}

export function aggregateWeaknessSummaries(
  weaknesses: readonly (WeaknessSummary | undefined)[],
): Pick<UserTypingAnalyticsDoc, "tests" | "keyAccuracy" | "keyErrors" | "wordErrors"> {
  const increments: Record<string, number> = { tests: weaknesses.length };
  for (const weakness of weaknesses) addWeaknessIncrements(increments, weakness);
  const keyAccuracy: Record<string, { correct: number; attempts: number }> = {};
  const keyErrors: Record<string, number> = {};
  const wordErrors: Record<string, number> = {};
  for (const [path, count] of Object.entries(increments)) {
    if (path === "tests") continue;
    const [field, token, metric] = path.split(".");
    if (field === "keyAccuracy" && metric) {
      keyAccuracy[token] ??= { correct: 0, attempts: 0 };
      keyAccuracy[token][metric as "correct" | "attempts"] += count;
    } else if (field === "keyErrors") keyErrors[token] = count;
    else if (field === "wordErrors") wordErrors[token] = count;
  }
  const limitedKeyErrors = Object.fromEntries(
    Object.entries(keyErrors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, KEY_ERROR_ANALYTICS_LIMIT),
  );
  const limitedWordErrors = Object.fromEntries(
    Object.entries(wordErrors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, WORD_ANALYTICS_LIMIT),
  );
  return {
    tests: weaknesses.length,
    keyAccuracy,
    keyErrors: limitedKeyErrors,
    wordErrors: limitedWordErrors,
  };
}
