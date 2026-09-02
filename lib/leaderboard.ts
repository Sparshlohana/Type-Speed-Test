export type LeaderboardEntry = {
  id: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
  isYou?: boolean;
};

export type GameLeaderboardEntry = {
  id: string;
  username: string;
  image: string | null;
  score: number;
  wpm: number;
  accuracy: number;
  words: number;
  bestCombo: number;
  roomsCleared: number;
  outcome: "victory" | "defeat";
  attempts: number;
  isYou?: boolean;
};
