import nextEnv from "@next/env";

import { collections } from "./mongo.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

export async function createIndexes(): Promise<void> {
  const {
    results,
    resultSamples,
    personalBests,
    userTypingAnalytics,
    userProgress,
    gamePersonalBests,
    dailyChallengeResults,
  } = await collections();
  await results.createIndexes([
    { key: { userId: 1, ts: -1 }, name: "results_user_history" },
    {
      key: { userId: 1, clientId: 1 },
      name: "results_user_client_unique",
      unique: true,
    },
  ]);
  const legacyLeaderboardIndex = (await results.indexes()).some(
    (index) => index.name === "results_leaderboard",
  );
  if (legacyLeaderboardIndex) await results.dropIndex("results_leaderboard");
  await resultSamples.createIndexes([
    {
      key: { userId: 1, clientId: 1 },
      name: "result_samples_user_client_unique",
      unique: true,
    },
    { key: { userId: 1, ts: -1 }, name: "result_samples_user_history" },
  ]);
  await personalBests.createIndexes([
    {
      key: { userId: 1, modeKey: 1 },
      name: "personal_bests_user_mode_unique",
      unique: true,
    },
    {
      key: { modeKey: 1, wpm: -1, accuracy: -1 },
      name: "personal_bests_leaderboard",
    },
  ]);
  await userTypingAnalytics.createIndex(
    { userId: 1 },
    { name: "user_typing_analytics_user_unique", unique: true },
  );
  await userProgress.createIndex(
    { userId: 1 },
    { name: "user_progress_user_unique", unique: true },
  );
  await gamePersonalBests.createIndexes([
    {
      key: { userId: 1, gameId: 1 },
      name: "game_personal_bests_user_game_unique",
      unique: true,
    },
    {
      key: { gameId: 1, score: -1, accuracy: -1, durationMs: 1 },
      name: "game_personal_bests_leaderboard",
    },
  ]);
  await dailyChallengeResults.createIndexes([
    {
      key: { challengeId: 1, userId: 1 },
      name: "daily_challenge_user_unique",
      unique: true,
    },
    {
      key: { challengeId: 1, wpm: -1, accuracy: -1 },
      name: "daily_challenge_leaderboard",
    },
    {
      key: { expiresAt: 1 },
      name: "daily_challenge_expiry",
      expireAfterSeconds: 0,
    },
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createIndexes()
    .then(() => {
      console.log("TypeFlow MongoDB indexes are ready.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
