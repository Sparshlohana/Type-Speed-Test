import "server-only";

import { unstable_cache } from "next/cache";

import { collections } from "@/lib/db/mongo";
import type { LeaderboardEntry } from "@/lib/leaderboard";

export const LEADERBOARD_CACHE_TAG = "leaderboards";

type RankedRow = {
  userId: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
};

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
