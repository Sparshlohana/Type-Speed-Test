import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";

import type { Mode } from "@/lib/engine";
import type { CharStats, Sample } from "@/lib/metrics";
import type { WeaknessSummary } from "@/lib/weakness";
import type { ProgressState } from "@/lib/progression";

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
  /** Legacy inline samples; new writes use result_samples. */
  samples?: Sample[];
  weaknesses?: WeaknessSummary;
};

export type ResultSamplesDoc = {
  _id: ObjectId;
  userId: string;
  clientId: string;
  ts: number;
  samples: Sample[];
};

export type PersonalBestDoc = {
  _id: ObjectId;
  userId: string;
  clientId: string;
  username: string;
  image: string | null;
  ts: number;
  modeKey: string;
  wpm: number;
  accuracy: number;
  consistency: number;
};

export type UserTypingAnalyticsDoc = {
  _id: ObjectId;
  userId: string;
  tests: number;
  keyAccuracy?: Record<string, { correct: number; attempts: number }>;
  keyErrors?: Record<string, number>;
  wordErrors?: Record<string, number>;
  processedResultIds: string[];
  updatedAt: Date;
};

export type UserProgressDoc = {
  _id: ObjectId;
  userId: string;
  revision: number;
  progress: ProgressState;
  updatedAt: Date;
};

export type GamePersonalBestDoc = {
  _id: ObjectId;
  userId: string;
  gameId: "typeraid" | "wordfall";
  clientId: string;
  username: string;
  image: string | null;
  score: number;
  wpm: number;
  accuracy: number;
  words: number;
  bestCombo: number;
  roomsCleared?: number;
  outcome?: "victory" | "defeat";
  wave?: number;
  missedWords?: number;
  durationMs: number;
  attempts: number;
  processedRunIds: string[];
  achievedAt: number;
  updatedAt: Date;
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
  expiresAt?: Date;
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
  resultSamples: Collection<ResultSamplesDoc>;
  personalBests: Collection<PersonalBestDoc>;
  userTypingAnalytics: Collection<UserTypingAnalyticsDoc>;
  userProgress: Collection<UserProgressDoc>;
  gamePersonalBests: Collection<GamePersonalBestDoc>;
  dailyChallengeResults: Collection<DailyChallengeDoc>;
}> {
  const db = await getDb();
  return {
    results: db.collection<ResultDoc>("results"),
    resultSamples: db.collection<ResultSamplesDoc>("result_samples"),
    personalBests: db.collection<PersonalBestDoc>("personal_bests"),
    userTypingAnalytics: db.collection<UserTypingAnalyticsDoc>("user_typing_analytics"),
    userProgress: db.collection<UserProgressDoc>("user_progress"),
    gamePersonalBests: db.collection<GamePersonalBestDoc>("game_personal_bests"),
    dailyChallengeResults: db.collection<DailyChallengeDoc>("daily_challenge_results"),
  };
}
