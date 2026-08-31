import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";

import type { Mode } from "@/lib/engine";
import type { CharStats, Sample } from "@/lib/metrics";
import type { WeaknessSummary } from "@/lib/weakness";

export type ResultDoc = {
  _id: ObjectId;
  userId: string;
  clientId: string;
  username: string;
  image: string | null;
  ts: number;
  mode: Mode;
  modeKey: string;
  durationMs: number;
  wpm: number;
  raw: number;
  accuracy: number;
  consistency: number;
  chars: CharStats;
  keystrokes: number;
  errors: number;
  samples: Sample[];
  weaknesses?: WeaknessSummary;
};

export type DailyChallengeDoc = {
  _id: ObjectId;
  challengeId: string;
  userId: string;
  clientId: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  attempts: number;
  updatedAt: number;
};

declare global {
  var typeflowMongoClient: MongoClient | undefined;
}

function getClient(): MongoClient {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required to use TypeFlow's server features.");
  }

  if (!globalThis.typeflowMongoClient) {
    globalThis.typeflowMongoClient = new MongoClient(uri);
  }
  return globalThis.typeflowMongoClient;
}

export async function getDb(): Promise<Db> {
  return getClient().db(process.env.MONGODB_DB || "typeflow");
}

export async function collections(): Promise<{
  results: Collection<ResultDoc>;
  dailyChallengeResults: Collection<DailyChallengeDoc>;
}> {
  const db = await getDb();
  return {
    results: db.collection<ResultDoc>("results"),
    dailyChallengeResults: db.collection<DailyChallengeDoc>("daily_challenge_results"),
  };
}
