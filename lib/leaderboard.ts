import type { Mode } from "./engine";

export type LeaderboardEntry = {
  id: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
  isYou?: boolean;
};

export const LEADERBOARD_MODES: Mode[] = [
  { kind: "time", seconds: 15 },
  { kind: "time", seconds: 30 },
  { kind: "time", seconds: 60 },
];
