import { MongoServerError, ObjectId } from "mongodb";

import {
  applyGameRunToProgress,
  applyResultToProgress,
  createEmptyProgress,
  progressForToday,
  type ProgressState,
} from "../progression.ts";
import type { StoredResult } from "../storage.ts";
import type { GameRun } from "./game-storage.ts";
import { collections } from "./mongo.ts";

const MAX_WRITE_RETRIES = 5;

/** Apply validated results with optimistic concurrency and result-id idempotency. */
export async function updateUserProgress(
  userId: string,
  results: readonly StoredResult[],
): Promise<ProgressState> {
  const chronological = [...results].sort((a, b) => a.ts - b.ts);
  const { userProgress } = await collections();

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const current = await userProgress.findOne({ userId });
    let progress = current?.progress ?? createEmptyProgress(chronological[0]?.ts ?? Date.now());
    for (const result of chronological) {
      progress = applyResultToProgress(progress, result).state;
    }
    progress = progressForToday(progress);

    if (!current) {
      try {
        await userProgress.insertOne({
          _id: new ObjectId(),
          userId,
          revision: 1,
          progress,
          updatedAt: new Date(),
        });
        return progress;
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) continue;
        throw error;
      }
    }

    const write = await userProgress.updateOne(
      { _id: current._id, revision: current.revision },
      {
        $set: { progress, updatedAt: new Date() },
        $inc: { revision: 1 },
      },
    );
    if (write.modifiedCount > 0) return progress;
  }

  throw new Error("Progress changed too quickly; retry the result sync.");
}

/** Apply one completed arcade run with the same optimistic concurrency used by tests. */
export async function updateUserGameProgress(
  userId: string,
  run: GameRun,
  completedAt = Date.now(),
): Promise<ReturnType<typeof applyGameRunToProgress>> {
  const { userProgress } = await collections();

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const current = await userProgress.findOne({ userId });
    const applied = applyGameRunToProgress(
      current?.progress ?? createEmptyProgress(completedAt),
      run,
      completedAt,
    );

    if (!current) {
      try {
        await userProgress.insertOne({
          _id: new ObjectId(),
          userId,
          revision: 1,
          progress: applied.state,
          updatedAt: new Date(),
        });
        return applied;
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) continue;
        throw error;
      }
    }

    const write = await userProgress.updateOne(
      { _id: current._id, revision: current.revision },
      {
        $set: { progress: applied.state, updatedAt: new Date() },
        $inc: { revision: 1 },
      },
    );
    if (write.modifiedCount > 0) return applied;
  }

  throw new Error("Progress changed too quickly; retry the game result.");
}

export async function readUserProgress(userId: string): Promise<ProgressState | null> {
  const { userProgress } = await collections();
  const document = await userProgress.findOne({ userId });
  return document ? progressForToday(document.progress) : null;
}
