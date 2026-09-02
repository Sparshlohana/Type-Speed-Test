import { MongoServerError, ObjectId } from "mongodb";

import { collections, type GamePersonalBestDoc } from "./mongo.ts";
import type { ResultOwner } from "./result-storage.ts";

export const GAME_RUN_ID_LIMIT = 20;

export type GameId = "typeraid";

export type GameRun = {
  clientId: string;
  gameId: GameId;
  score: number;
  wpm: number;
  accuracy: number;
  words: number;
  bestCombo: number;
  roomsCleared: number;
  outcome: "victory" | "defeat";
  durationMs: number;
};

function scoreFields(
  run: GameRun,
  user: ResultOwner,
  achievedAt: number,
): Omit<GamePersonalBestDoc, "_id" | "attempts" | "processedRunIds" | "updatedAt"> {
  return {
    userId: user.id,
    gameId: run.gameId,
    clientId: run.clientId,
    username: user.name || "TypeFlow user",
    image: user.image ?? null,
    score: run.score,
    wpm: run.wpm,
    accuracy: run.accuracy,
    words: run.words,
    bestCombo: run.bestCombo,
    roomsCleared: run.roomsCleared,
    outcome: run.outcome,
    durationMs: run.durationMs,
    achievedAt,
  };
}

/** Count a run once and retain only the player's best score for each game. */
export async function updateGamePersonalBest(
  user: ResultOwner,
  run: GameRun,
): Promise<boolean> {
  const { gamePersonalBests } = await collections();
  const now = Date.now();
  const candidate = scoreFields(run, user, now);

  try {
    const initialized = await gamePersonalBests.updateOne(
      { userId: user.id, gameId: run.gameId },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          ...candidate,
          attempts: 1,
          processedRunIds: [run.clientId],
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    if (initialized.upsertedCount > 0) return true;
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
  }

  const registered = await gamePersonalBests.updateOne(
    { userId: user.id, gameId: run.gameId, processedRunIds: { $ne: run.clientId } },
    {
      $inc: { attempts: 1 },
      $push: { processedRunIds: { $each: [run.clientId], $slice: -GAME_RUN_ID_LIMIT } },
      $set: { updatedAt: new Date() },
    },
  );
  if (registered.modifiedCount === 0) return false;

  const improved = await gamePersonalBests.updateOne(
    {
      userId: user.id,
      gameId: run.gameId,
      $or: [
        { score: { $lt: run.score } },
        { score: run.score, accuracy: { $lt: run.accuracy } },
        { score: run.score, accuracy: run.accuracy, durationMs: { $gt: run.durationMs } },
      ],
    },
    { $set: candidate },
  );

  if (improved.modifiedCount === 0) {
    await gamePersonalBests.updateOne(
      { userId: user.id, gameId: run.gameId },
      { $set: { username: candidate.username, image: candidate.image } },
    );
  }
  return improved.modifiedCount > 0;
}
