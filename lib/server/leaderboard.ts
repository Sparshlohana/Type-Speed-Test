import "server-only";

import { unstable_cache } from "next/cache";

import { collections } from "@/lib/db/mongo";
import type { GameLeaderboardEntry, LeaderboardEntry } from "@/lib/leaderboard";
import type { GameId } from "@/lib/db/game-storage";

export const LEADERBOARD_CACHE_TAG = "leaderboards";

type RankedRow = {
  userId: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
};

type GameRankedRow = Omit<GameLeaderboardEntry, "id" | "isYou"> & { userId: string; durationMs: number };

/** Shared board data is identical for every visitor, so avoid rebuilding it on every view. */
export const getTopLeaderboard = unstable_cache(
  async (modeKey: string): Promise<RankedRow[]> => {
    const { personalBests } = await collections();
    return personalBests
      .find(
        { modeKey },
        { projection: { _id: 0, userId: 1, username: 1, image: 1, wpm: 1, accuracy: 1, consistency: 1 } },
      )
      .sort({ wpm: -1, accuracy: -1 })
      .limit(50)
      .toArray();
  },
  ["leaderboard-top-v2"],
  { tags: [LEADERBOARD_CACHE_TAG], revalidate: 30 },
);

export async function getLeaderboardRank(
  modeKey: string,
  userId: string,
  topEntries: RankedRow[],
): Promise<number | null> {
  const visibleEntry = topEntries.find((entry) => entry.userId === userId);
  if (visibleEntry) {
    return topEntries.filter(
      (entry) =>
        entry.wpm > visibleEntry.wpm ||
        (entry.wpm === visibleEntry.wpm && entry.accuracy > visibleEntry.accuracy),
    ).length + 1;
  }

  // Only players outside the visible top 50 need the more expensive exact-rank query.
  const { personalBests } = await collections();
  const ownBest = await personalBests.findOne(
    { userId, modeKey },
    { sort: { wpm: -1, accuracy: -1 }, projection: { wpm: 1, accuracy: 1 } },
  );
  if (!ownBest) return null;

  const ahead = await personalBests.countDocuments({
    modeKey,
    $or: [
      { wpm: { $gt: ownBest.wpm } },
      { wpm: ownBest.wpm, accuracy: { $gt: ownBest.accuracy } },
    ],
  });
  return ahead + 1;
}

export function toLeaderboardEntries(
  entries: RankedRow[],
  userId?: string,
): LeaderboardEntry[] {
  return entries.map((entry) => ({
    id: entry.userId,
    username: entry.username,
    image: entry.image,
    wpm: Math.round(entry.wpm),
    accuracy: entry.accuracy,
    consistency: entry.consistency,
    isYou: entry.userId === userId,
  }));
}

export const getTopGameLeaderboard = unstable_cache(
  async (gameId: GameId): Promise<GameRankedRow[]> => {
    const { gamePersonalBests } = await collections();
    return gamePersonalBests
      .find(
        { gameId },
        {
          projection: {
            _id: 0,
            userId: 1,
            username: 1,
            image: 1,
            score: 1,
            wpm: 1,
            accuracy: 1,
            words: 1,
            bestCombo: 1,
            roomsCleared: 1,
            outcome: 1,
            wave: 1,
            missedWords: 1,
            attempts: 1,
            durationMs: 1,
          },
        },
      )
      .sort({ score: -1, accuracy: -1, durationMs: 1 })
      .limit(50)
      .toArray();
  },
  ["game-leaderboard-top-v1"],
  { tags: [LEADERBOARD_CACHE_TAG], revalidate: 30 },
);

export async function getGameLeaderboardRank(
  gameId: GameId,
  userId: string,
  topEntries: GameRankedRow[],
): Promise<number | null> {
  const visible = topEntries.find((entry) => entry.userId === userId);
  if (visible) {
    return topEntries.filter(
      (entry) =>
        entry.score > visible.score ||
        (entry.score === visible.score && entry.accuracy > visible.accuracy) ||
        (entry.score === visible.score && entry.accuracy === visible.accuracy && entry.durationMs < visible.durationMs),
    ).length + 1;
  }

  const { gamePersonalBests } = await collections();
  const own = await gamePersonalBests.findOne(
    { userId, gameId },
    { projection: { score: 1, accuracy: 1, durationMs: 1 } },
  );
  if (!own) return null;
  const ahead = await gamePersonalBests.countDocuments({
    gameId,
    $or: [
      { score: { $gt: own.score } },
      { score: own.score, accuracy: { $gt: own.accuracy } },
      { score: own.score, accuracy: own.accuracy, durationMs: { $lt: own.durationMs } },
    ],
  });
  return ahead + 1;
}

export function toGameLeaderboardEntries(
  entries: GameRankedRow[],
  userId?: string,
): GameLeaderboardEntry[] {
  return entries.map((entry) => ({
    id: entry.userId,
    username: entry.username,
    image: entry.image,
    score: entry.score,
    wpm: entry.wpm,
    accuracy: entry.accuracy,
    words: entry.words,
    bestCombo: entry.bestCombo,
    roomsCleared: entry.roomsCleared,
    outcome: entry.outcome,
    wave: entry.wave,
    missedWords: entry.missedWords,
    attempts: entry.attempts,
    isYou: entry.userId === userId,
  }));
}
