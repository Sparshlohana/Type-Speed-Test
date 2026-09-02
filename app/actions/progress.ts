"use server";

import { collections } from "@/lib/db/mongo";
import { readUserProgress, updateUserProgress } from "@/lib/db/progress-storage";
import { requireUser } from "@/lib/server/session";
import type { StoredResult } from "@/lib/storage";

export async function getProgress() {
  const user = await requireUser();
  const existing = await readUserProgress(user.id);
  if (existing) return existing;

  const { results } = await collections();
  const documents = await results.find({ userId: user.id }).sort({ ts: 1 }).toArray();
  const stored: StoredResult[] = documents.map((document) => ({
    id: document.clientId,
    ts: document.ts,
    mode: document.mode,
    modeKey: document.modeKey,
    durationMs: document.durationMs,
    wpm: document.wpm,
    raw: document.raw,
    accuracy: document.accuracy,
    consistency: document.consistency,
    chars: document.chars,
    keystrokes: document.keystrokes,
    errors: document.errors,
    samples: [],
    weaknesses: document.weaknesses,
  }));
  return updateUserProgress(user.id, stored);
}
