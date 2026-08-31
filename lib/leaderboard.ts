export type LeaderboardEntry = {
  id: string;
  username: string;
  image: string | null;
  wpm: number;
  accuracy: number;
  consistency: number;
  isYou?: boolean;
};
