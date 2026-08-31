import "server-only";

import type { Document } from "mongodb";
import { unstable_cache } from "next/cache";

import { collections } from "@/lib/db/mongo";
import type { LeaderboardEntry } from "@/lib/leaderboard";

export const LEADERBOARD_CACHE_TAG = "leaderboards";

type RankedRow = {
  _id: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
};

const bestPerUser: Document[] = [
  { $sort: { wpm: -1, accuracy: -1 } },
  {
    $group: {
      _id: "$userId",
      username: { $first: "$username" },
      image: { $first: "$image" },
      wpm: { $first: "$wpm" },
      accuracy: { $first: "$accuracy" },
      consistency: { $first: "$consistency" },
    },
  },
];

/** Shared board data is identical for every visitor, so avoid rebuilding it on every view. */
export const getTopLeaderboard = unstable_cache(
  async (modeKey: string): Promise<RankedRow[]> => {
    const { results } = await collections();
    return results
      .aggregate<RankedRow>([
        { $match: { modeKey } },
        ...bestPerUser,
        { $sort: { wpm: -1, accuracy: -1 } },
        { $limit: 50 },
      ])
      .toArray();
  },
  ["leaderboard-top"],
  { tags: [LEADERBOARD_CACHE_TAG], revalidate: 30 },
);

export async function getLeaderboardRank(
  modeKey: string,
  userId: string,
  topEntries: RankedRow[],
): Promise<number | null> {
  const visibleEntry = topEntries.find((entry) => entry._id === userId);
  if (visibleEntry) {
    return topEntries.filter(
      (entry) =>
        entry.wpm > visibleEntry.wpm ||
        (entry.wpm === visibleEntry.wpm && entry.accuracy > visibleEntry.accuracy),
    ).length + 1;
  }

  // Only players outside the visible top 50 need the more expensive exact-rank query.
  const { results } = await collections();
  const ownBest = await results.findOne(
    { userId, modeKey },
    { sort: { wpm: -1, accuracy: -1 }, projection: { wpm: 1, accuracy: 1 } },
  );
  if (!ownBest) return null;

  const rankRows = await results
    .aggregate<{ count: number }>([
      { $match: { modeKey } },
      ...bestPerUser,
      {
        $match: {
          $or: [
            { wpm: { $gt: ownBest.wpm } },
            { wpm: ownBest.wpm, accuracy: { $gt: ownBest.accuracy } },
          ],
        },
      },
      { $count: "count" },
    ])
    .toArray();
  return (rankRows[0]?.count ?? 0) + 1;
}

export function toLeaderboardEntries(
  entries: RankedRow[],
  userId?: string,
): LeaderboardEntry[] {
  return entries.map((entry) => ({
    id: entry._id,
    username: entry.username,
    image: entry.image,
    wpm: Math.round(entry.wpm),
    accuracy: entry.accuracy,
    consistency: entry.consistency,
    isYou: entry._id === userId,
  }));
}
