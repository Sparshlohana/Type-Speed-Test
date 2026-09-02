"use server";

import { ObjectId } from "mongodb";
import { updateTag } from "next/cache";

import { collections, type ResultDoc } from "@/lib/db/mongo";
import {
  addToUserAnalytics,
  pruneUserStorage,
  storeResultSamples,
  toResultDocument,
  updatePersonalBest,
} from "@/lib/db/result-storage";
import { updateUserProgress } from "@/lib/db/progress-storage";
import { LEADERBOARD_CACHE_TAG } from "@/lib/server/leaderboard";
import { getUser, requireUser } from "@/lib/server/session";
import { validateResult } from "@/lib/server/validate";
import type { StoredResult } from "@/lib/storage";

export type SaveResultResponse =
  | { ok: true; signedIn: false }
  | { ok: true; signedIn: true; isPersonalBest: boolean }
  | { ok: false; error: string };

function fromDocument(doc: ResultDoc, samples = doc.samples ?? []): StoredResult {
  return {
    id: doc.clientId,
    ts: doc.ts,
    mode: doc.mode,
    modeKey: doc.modeKey,
    durationMs: doc.durationMs,
    wpm: doc.wpm,
    raw: doc.raw,
    accuracy: doc.accuracy,
    consistency: doc.consistency,
    chars: doc.chars,
    keystrokes: doc.keystrokes,
    errors: doc.errors,
    samples,
    weaknesses: doc.weaknesses,
  };
}

export async function saveResult(input: unknown): Promise<SaveResultResponse> {
  const validation = validateResult(input);
  if (!validation.ok) return validation;

  const user = await getUser();
  if (!user) return { ok: true, signedIn: false };

  const { results, personalBests } = await collections();
  const previousBest = await personalBests.findOne(
    { userId: user.id, modeKey: validation.value.modeKey },
    { projection: { wpm: 1 } },
  );

  const stored = await results.updateOne(
    { userId: user.id, clientId: validation.value.id },
    { $setOnInsert: { _id: new ObjectId(), ...toResultDocument(validation.value, user) } },
    { upsert: true },
  );
  const [isPersonalBest] = await Promise.all([
    updatePersonalBest(user, validation.value),
    storeResultSamples(user.id, [validation.value]),
  ]);
  if (stored.upsertedCount > 0) {
    await Promise.all([
      addToUserAnalytics(user.id, [validation.value]),
      updateUserProgress(user.id, [validation.value]),
    ]);
  }
  await pruneUserStorage(user.id);
  await results.updateOne(
    { userId: user.id, clientId: validation.value.id },
    { $unset: { samples: "" } },
  );
  if (isPersonalBest) updateTag(LEADERBOARD_CACHE_TAG);

  return {
    ok: true,
    signedIn: true,
    isPersonalBest: !previousBest || validation.value.wpm > previousBest.wpm,
  };
}

export async function syncLocalResults(inputs: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!Array.isArray(inputs)) return { ok: false, error: "Invalid result list." };
  if (inputs.length > 200) return { ok: false, error: "Too many results to sync." };

  const validated: StoredResult[] = [];
  for (const input of inputs) {
    const validation = validateResult(input);
    if (!validation.ok) return validation;
    validated.push(validation.value);
  }

  if (validated.length === 0) return { ok: true };
  const { results } = await collections();
  const retentionBoundary = await results
    .find({ userId: user.id }, { projection: { ts: 1 } })
    .sort({ ts: -1 })
    .skip(199)
    .limit(1)
    .next();
  // A stale browser must not resurrect history that the 200-result retention
  // policy already pruned. Personal bests still consider every valid local run.
  const retained = retentionBoundary
    ? validated.filter((result) => result.ts >= retentionBoundary.ts)
    : validated;
  if (retained.length > 0) await results.bulkWrite(
    retained.map((result) => ({
      updateOne: {
        filter: { userId: user.id, clientId: result.id },
        update: { $setOnInsert: { _id: new ObjectId(), ...toResultDocument(result, user) } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  const bestByMode = new Map<string, StoredResult>();
  for (const result of validated) {
    const current = bestByMode.get(result.modeKey);
    if (
      !current ||
      result.wpm > current.wpm ||
      (result.wpm === current.wpm && result.accuracy > current.accuracy)
    ) {
      bestByMode.set(result.modeKey, result);
    }
  }
  const bestUpdates = await Promise.all(
    [...bestByMode.values()].map((result) => updatePersonalBest(user, result)),
  );
  if (retained.length > 0) {
    await Promise.all([
      storeResultSamples(user.id, retained),
      addToUserAnalytics(user.id, retained),
      updateUserProgress(user.id, retained),
    ]);
    await results.updateMany(
      { userId: user.id, clientId: { $in: retained.map((result) => result.id) } },
      { $unset: { samples: "" } },
    );
  }
  await pruneUserStorage(user.id);
  if (bestUpdates.some(Boolean)) updateTag(LEADERBOARD_CACHE_TAG);
  return { ok: true };
}

export async function listResults(limit = 200): Promise<StoredResult[]> {
  const user = await requireUser();
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const { results } = await collections();
  const docs = await results
    .find({ userId: user.id }, { projection: { samples: 0 } })
    .sort({ ts: -1 })
    .limit(safeLimit)
    .toArray();
  return docs.map((doc) => fromDocument(doc));
}

/** Fetch the heavy per-second samples only when a user opens one result. */
export async function getResultDetails(clientId: unknown): Promise<StoredResult | null> {
  const user = await requireUser();
  if (typeof clientId !== "string" || clientId.length < 1 || clientId.length > 128) return null;
  const { results, resultSamples } = await collections();
  const [doc, detailed] = await Promise.all([
    results.findOne({ userId: user.id, clientId }),
    resultSamples.findOne({ userId: user.id, clientId }),
  ]);
  return doc ? fromDocument(doc, detailed?.samples ?? doc.samples ?? []) : null;
}

export async function clearResults(): Promise<void> {
  const user = await requireUser();
  const {
    results,
    resultSamples,
    personalBests,
    userTypingAnalytics,
    userProgress,
    gamePersonalBests,
    dailyChallengeResults,
  } = await collections();
  const writes = await Promise.all([
    results.deleteMany({ userId: user.id }),
    resultSamples.deleteMany({ userId: user.id }),
    personalBests.deleteMany({ userId: user.id }),
    userTypingAnalytics.deleteMany({ userId: user.id }),
    userProgress.deleteMany({ userId: user.id }),
    gamePersonalBests.deleteMany({ userId: user.id }),
    dailyChallengeResults.deleteMany({ userId: user.id }),
  ]);
  if (writes.some((write) => write.deletedCount > 0)) updateTag(LEADERBOARD_CACHE_TAG);
}
