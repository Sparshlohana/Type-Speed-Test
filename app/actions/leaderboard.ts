"use server";

import type { Document } from "mongodb";

import { collections } from "@/lib/db/mongo";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { getUser } from "@/lib/server/session";

const MODE_KEY_PATTERN = /^(time|words|quote):[a-z0-9-]+$/;

type RankedRow = {
  _id: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
};

export async function getLeaderboard(
  modeKey: string,
): Promise<{ entries: LeaderboardEntry[]; yourRank: number | null }> {
  if (!MODE_KEY_PATTERN.test(modeKey)) return { entries: [], yourRank: null };

  const [{ results }, user] = await Promise.all([collections(), getUser()]);
  const bestPerUser: Document[] = [
    { $match: { modeKey } },
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

  const entries = await results
    .aggregate<RankedRow>([
      ...bestPerUser,
      { $sort: { wpm: -1, accuracy: -1 } },
      { $limit: 50 },
    ])
    .toArray();

  let yourRank: number | null = null;
  if (user) {
    const ownBest = await results.findOne(
      { userId: user.id, modeKey },
      { sort: { wpm: -1, accuracy: -1 }, projection: { wpm: 1, accuracy: 1 } },
    );
    if (ownBest) {
      const rankRows = await results
        .aggregate<{ count: number }>([
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
      yourRank = (rankRows[0]?.count ?? 0) + 1;
    }
  }

  return {
    entries: entries.map((entry) => ({
      id: entry._id,
      username: entry.username,
      image: entry.image,
      wpm: Math.round(entry.wpm),
      accuracy: entry.accuracy,
      consistency: entry.consistency,
      isYou: entry._id === user?.id,
    })),
    yourRank,
  };
}
