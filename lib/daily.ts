import { WORD_BANK } from "./words.ts";

export const DAILY_CHALLENGE_WORDS = 50;
export const DAILY_CHALLENGE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DAILY_CHALLENGE_TIME_ZONE = "Asia/Kolkata";

export type DailyChallenge = {
  id: string;
  count: number;
};

export type DailyLeaderboardEntry = {
  id: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
  attempts: number;
  isYou?: boolean;
};

/** Every player rolls over to the next challenge together at midnight IST. */
export function dailyChallengeAt(timestamp: number): DailyChallenge {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_CHALLENGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    id: `${value.year}-${value.month}-${value.day}`,
    count: DAILY_CHALLENGE_WORDS,
  };
}

function seedFrom(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The same challenge id and count always produce the same ordered word list. */
export function generateDailyWords(challengeId: string, count: number): string[] {
  const random = randomFrom(seedFrom(`typeflow:${challengeId}:${count}`));
  const words: string[] = [];
  for (let index = 0; index < count; index++) {
    let word = WORD_BANK[Math.floor(random() * WORD_BANK.length)];
    let guard = 0;
    while (word === words.at(-1) && guard++ < 8) {
      word = WORD_BANK[Math.floor(random() * WORD_BANK.length)];
    }
    words.push(word);
  }
  return words;
}
