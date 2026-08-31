"use server";

import { ObjectId } from "mongodb";

import {
  DAILY_CHALLENGE_ID_PATTERN,
  dailyChallengeAt,
  type DailyLeaderboardEntry,
} from "@/lib/daily";
import { collections } from "@/lib/db/mongo";
import { getUser } from "@/lib/server/session";
import { validateResult } from "@/lib/server/validate";

export type DailyBoard = {
  entries: DailyLeaderboardEntry[];
  yourRank: number | null;
};

export async function getDailyLeaderboard(challengeId: unknown): Promise<DailyBoard> {
  if (typeof challengeId !== "string" || !DAILY_CHALLENGE_ID_PATTERN.test(challengeId)) {
    return { entries: [], yourRank: null };
  }
  const [{ dailyChallengeResults }, user] = await Promise.all([collections(), getUser()]);
  const entries = await dailyChallengeResults
    .find({ challengeId })
    .sort({ wpm: -1, accuracy: -1 })
    .limit(50)
    .toArray();

  let yourRank: number | null = null;
  if (user) {
    const own = await dailyChallengeResults.findOne({ challengeId, userId: user.id });
    if (own) {
      const ahead = await dailyChallengeResults.countDocuments({
        challengeId,
        $or: [
          { wpm: { $gt: own.wpm } },
          { wpm: own.wpm, accuracy: { $gt: own.accuracy } },
        ],
      });
      yourRank = ahead + 1;
    }
  }

  return {
    entries: entries.map((entry) => ({
      id: entry.userId,
      username: entry.username,
      image: entry.image,
      wpm: Math.round(entry.wpm),
      accuracy: entry.accuracy,
      consistency: entry.consistency,
      attempts: entry.attempts,
      isYou: entry.userId === user?.id,
    })),
    yourRank,
  };
}

export type SubmitDailyResponse =
  | { ok: true; signedIn: false }
  | { ok: true; signedIn: true; rank: number }
  | { ok: false; error: string };

export async function submitDailyResult(input: unknown): Promise<SubmitDailyResponse> {
  const validation = validateResult(input);
  if (!validation.ok) return validation;
  const result = validation.value;
  if (result.mode.kind !== "daily") return { ok: false, error: "Not a daily challenge result." };

  const today = dailyChallengeAt(Date.now()).id;
  if (result.mode.challengeId !== today) {
    return { ok: false, error: "This daily challenge has ended." };
  }
  const user = await getUser();
  if (!user) return { ok: true, signedIn: false };

  const { dailyChallengeResults } = await collections();
  await dailyChallengeResults.updateOne(
    { challengeId: today, userId: user.id },
    {
      $set: { username: user.name || "TypeFlow user", image: user.image ?? null },
      $setOnInsert: {
        _id: new ObjectId(),
        challengeId: today,
        userId: user.id,
        clientId: result.id,
        wpm: result.wpm,
        accuracy: result.accuracy,
        consistency: result.consistency,
        durationMs: result.durationMs,
        updatedAt: Date.now(),
      },
      $inc: { attempts: 1 },
    },
    { upsert: true },
  );

  const current = await dailyChallengeResults.findOne({ challengeId: today, userId: user.id });
  const isBetter =
    current &&
    (result.wpm > current.wpm ||
      (result.wpm === current.wpm && result.accuracy > current.accuracy));
  if (current && isBetter) {
    await dailyChallengeResults.updateOne(
      { _id: current._id },
      {
        $set: {
          clientId: result.id,
          wpm: result.wpm,
          accuracy: result.accuracy,
          consistency: result.consistency,
          durationMs: result.durationMs,
          updatedAt: Date.now(),
        },
      },
    );
  }

  const score = isBetter ? result : current;
  if (!score) return { ok: false, error: "Daily result could not be saved." };
  const ahead = await dailyChallengeResults.countDocuments({
    challengeId: today,
    $or: [
      { wpm: { $gt: score.wpm } },
      { wpm: score.wpm, accuracy: { $gt: score.accuracy } },
    ],
  });
  return { ok: true, signedIn: true, rank: ahead + 1 };
}
