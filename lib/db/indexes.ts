import nextEnv from "@next/env";

import { collections } from "./mongo.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

export async function createIndexes(): Promise<void> {
  const { results } = await collections();
  await results.createIndexes([
    { key: { userId: 1, ts: -1 }, name: "results_user_history" },
    {
      key: { modeKey: 1, wpm: -1, accuracy: -1 },
      name: "results_leaderboard",
    },
    {
      key: { userId: 1, clientId: 1 },
      name: "results_user_client_unique",
      unique: true,
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
