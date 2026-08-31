"use server";

import { ObjectId, type OptionalId } from "mongodb";

import { collections, type ResultDoc } from "@/lib/db/mongo";
import { getUser, requireUser } from "@/lib/server/session";
import { validateResult } from "@/lib/server/validate";
import type { StoredResult } from "@/lib/storage";

export type SaveResultResponse =
  | { ok: true; signedIn: false }
  | { ok: true; signedIn: true; isPersonalBest: boolean }
  | { ok: false; error: string };

function toDocument(result: StoredResult, user: Awaited<ReturnType<typeof requireUser>>): OptionalId<ResultDoc> {
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
    samples: result.samples,
    weaknesses: result.weaknesses,
  };
}

function fromDocument(doc: ResultDoc): StoredResult {
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
    samples: doc.samples ?? [],
    weaknesses: doc.weaknesses,
  };
}

export async function saveResult(input: unknown): Promise<SaveResultResponse> {
  const validation = validateResult(input);
  if (!validation.ok) return validation;

  const user = await getUser();
  if (!user) return { ok: true, signedIn: false };

  const { results } = await collections();
  const previousBest = await results.findOne(
    { userId: user.id, modeKey: validation.value.modeKey },
    { sort: { wpm: -1, accuracy: -1 }, projection: { wpm: 1 } },
  );

  await results.updateOne(
    { userId: user.id, clientId: validation.value.id },
    { $setOnInsert: { _id: new ObjectId(), ...toDocument(validation.value, user) } },
    { upsert: true },
  );

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
  await results.bulkWrite(
    validated.map((result) => ({
      updateOne: {
        filter: { userId: user.id, clientId: result.id },
        update: { $setOnInsert: { _id: new ObjectId(), ...toDocument(result, user) } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
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
  return docs.map(fromDocument);
}

/** Fetch the heavy per-second samples only when a user opens one result. */
export async function getResultDetails(clientId: unknown): Promise<StoredResult | null> {
  const user = await requireUser();
  if (typeof clientId !== "string" || clientId.length < 1 || clientId.length > 128) return null;
  const { results } = await collections();
  const doc = await results.findOne({ userId: user.id, clientId });
  return doc ? fromDocument(doc) : null;
}

export async function clearResults(): Promise<void> {
  const user = await requireUser();
  const { results } = await collections();
  await results.deleteMany({ userId: user.id });
}
