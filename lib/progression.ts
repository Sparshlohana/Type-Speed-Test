import type { StoredResult } from "./storage";
import type { GameRun } from "./db/game-storage";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROCESSED_RESULT_LIMIT = 200;

export type DailyGoalId = "tests" | "time" | "characters";

export type AchievementId =
  | "first_flow"
  | "tests_10"
  | "tests_50"
  | "tests_100"
  | "speed_40"
  | "speed_60"
  | "speed_80"
  | "speed_100"
  | "perfect_accuracy"
  | "streak_3"
  | "streak_7"
  | "streak_30"
  | "daily_triple"
  | "daily_7"
  | "practice_10"
  | "first_game"
  | "games_10"
  | "arcade_time_30"
  | "typeraid_victory"
  | "wordfall_wave_5"
  | "game_combo_20"
  | "level_5"
  | "level_10";

export type DailyProgress = {
  day: string;
  tests: number;
  durationMs: number;
  correctChars: number;
  claimed: DailyGoalId[];
};

export type ProgressState = {
  version: 1;
  xp: number;
  totalTests: number;
  totalDurationMs: number;
  totalCorrectChars: number;
  bestWpm: number;
  bestAccuracy: number;
  practiceTests: number;
  totalGames: number;
  totalGameDurationMs: number;
  typeRaidVictories: number;
  bestWordfallWave: number;
  bestGameCombo: number;
  dailyChallenges: number;
  dailyChallengeDays: string[];
  currentStreak: number;
  longestStreak: number;
  lastActiveDay: string | null;
  daily: DailyProgress;
  achievements: Partial<Record<AchievementId, number>>;
  processedResultIds: string[];
  processedGameRunIds: string[];
};

export type ProgressReward = {
  earnedXp: number;
  testXp: number;
  gameXp: number;
  dailyGoalXp: number;
  streakXp: number;
  achievementXp: number;
  completedGoals: DailyGoalId[];
  unlockedAchievements: AchievementId[];
  levelBefore: number;
  levelAfter: number;
};

export type DailyGoalDefinition = {
  id: DailyGoalId;
  title: string;
  description: string;
  target: number;
  xp: number;
  value: (daily: DailyProgress) => number;
  format: (value: number) => string;
};

export type AchievementDefinition = {
  id: AchievementId;
  title: string;
  description: string;
  symbol: string;
  xp: number;
};

export type AchievementProgress = {
  current: number;
  target: number;
  percent: number;
  label: string;
};

export const DAILY_GOALS: readonly DailyGoalDefinition[] = [
  {
    id: "tests",
    title: "Three flows",
    description: "Complete 3 typing tests today.",
    target: 3,
    xp: 40,
    value: (daily) => daily.tests,
    format: (value) => `${Math.floor(value)} tests`,
  },
  {
    id: "time",
    title: "Focused minutes",
    description: "Practise for 3 minutes today.",
    target: 3 * 60 * 1000,
    xp: 40,
    value: (daily) => daily.durationMs,
    format: (value) => `${Math.floor(value / 60_000)}m ${Math.floor((value % 60_000) / 1000)}s`,
  },
  {
    id: "characters",
    title: "Clean volume",
    description: "Type 750 correct characters today.",
    target: 750,
    xp: 40,
    value: (daily) => daily.correctChars,
    format: (value) => `${Math.floor(value)} chars`,
  },
] as const;

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: "first_flow", title: "First Flow", description: "Complete your first test.", symbol: "01", xp: 50 },
  { id: "tests_10", title: "Warming Up", description: "Complete 10 tests.", symbol: "10", xp: 75 },
  { id: "tests_50", title: "In the Zone", description: "Complete 50 tests.", symbol: "50", xp: 150 },
  { id: "tests_100", title: "Centurion", description: "Complete 100 tests.", symbol: "100", xp: 300 },
  { id: "speed_40", title: "Cruising", description: "Reach 40 WPM.", symbol: "40", xp: 50 },
  { id: "speed_60", title: "Quick Current", description: "Reach 60 WPM.", symbol: "60", xp: 100 },
  { id: "speed_80", title: "Rapid Flow", description: "Reach 80 WPM.", symbol: "80", xp: 175 },
  { id: "speed_100", title: "Triple Digits", description: "Reach 100 WPM.", symbol: "100+", xp: 300 },
  { id: "perfect_accuracy", title: "Flawless", description: "Finish a substantial test at 100% accuracy.", symbol: "✓", xp: 150 },
  { id: "streak_3", title: "Spark", description: "Build a 3-day streak.", symbol: "3d", xp: 75 },
  { id: "streak_7", title: "On Fire", description: "Build a 7-day streak.", symbol: "7d", xp: 175 },
  { id: "streak_30", title: "Unstoppable", description: "Build a 30-day streak.", symbol: "30d", xp: 500 },
  { id: "daily_triple", title: "Daily Sweep", description: "Complete all three daily goals.", symbol: "3/3", xp: 100 },
  { id: "daily_7", title: "Daily Regular", description: "Complete 7 daily challenges.", symbol: "D7", xp: 150 },
  { id: "practice_10", title: "Deliberate", description: "Complete 10 adaptive practice sessions.", symbol: "P10", xp: 150 },
  { id: "first_game", title: "Insert Coin", description: "Complete your first arcade game.", symbol: "G1", xp: 50 },
  { id: "games_10", title: "Arcade Regular", description: "Complete 10 arcade games.", symbol: "G10", xp: 125 },
  { id: "arcade_time_30", title: "Game Time", description: "Spend 30 minutes playing arcade games.", symbol: "30m", xp: 175 },
  { id: "typeraid_victory", title: "Void Breaker", description: "Win a TypeRaid run.", symbol: "TR", xp: 150 },
  { id: "wordfall_wave_5", title: "Signal Keeper", description: "Reach wave 5 in Wordfall.", symbol: "W5", xp: 125 },
  { id: "game_combo_20", title: "Combo Current", description: "Build a 20-word combo in an arcade game.", symbol: "20x", xp: 125 },
  { id: "level_5", title: "Flow Builder", description: "Reach level 5.", symbol: "L5", xp: 150 },
  { id: "level_10", title: "Flow Master", description: "Reach level 10.", symbol: "L10", xp: 300 },
] as const;

export function progressDayKey(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function dayNumber(day: string): number {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / DAY_MS);
}

function emptyDaily(day: string): DailyProgress {
  return { day, tests: 0, durationMs: 0, correctChars: 0, claimed: [] };
}

export function createEmptyProgress(now = Date.now()): ProgressState {
  return {
    version: 1,
    xp: 0,
    totalTests: 0,
    totalDurationMs: 0,
    totalCorrectChars: 0,
    bestWpm: 0,
    bestAccuracy: 0,
    practiceTests: 0,
    totalGames: 0,
    totalGameDurationMs: 0,
    typeRaidVictories: 0,
    bestWordfallWave: 0,
    bestGameCombo: 0,
    dailyChallenges: 0,
    dailyChallengeDays: [],
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDay: null,
    daily: emptyDaily(progressDayKey(now)),
    achievements: {},
    processedResultIds: [],
    processedGameRunIds: [],
  };
}

function normalizeProgress(state: ProgressState): ProgressState {
  return {
    ...state,
    dailyChallengeDays: state.dailyChallengeDays ?? [],
    totalGames: state.totalGames ?? 0,
    totalGameDurationMs: state.totalGameDurationMs ?? 0,
    typeRaidVictories: state.typeRaidVictories ?? 0,
    bestWordfallWave: state.bestWordfallWave ?? 0,
    bestGameCombo: state.bestGameCombo ?? 0,
    processedGameRunIds: state.processedGameRunIds ?? [],
  };
}

export function progressForToday(state: ProgressState, now = Date.now()): ProgressState {
  const today = progressDayKey(now);
  const normalized = normalizeProgress(state);
  return normalized.daily.day === today ? normalized : { ...normalized, daily: emptyDaily(today) };
}

export function xpForNextLevel(level: number): number {
  return 200 + Math.max(0, level - 1) * 75;
}

export function xpAtLevel(level: number): number {
  const completedLevels = Math.max(0, level - 1);
  return completedLevels * 200 + (completedLevels * (completedLevels - 1) * 75) / 2;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpAtLevel(level + 1)) level++;
  return level;
}

export function levelProgress(state: ProgressState): {
  level: number;
  current: number;
  required: number;
  percent: number;
} {
  const level = levelForXp(state.xp);
  const current = state.xp - xpAtLevel(level);
  const required = xpForNextLevel(level);
  return { level, current, required, percent: Math.min(100, (current / required) * 100) };
}

function testXp(result: StoredResult): number {
  const volume = Math.min(30, Math.floor(result.chars.correct / 50) * 5);
  const time = Math.min(25, Math.floor(result.durationMs / 30_000) * 5);
  const accuracy = result.accuracy >= 100 ? 25 : result.accuracy >= 98 ? 15 : result.accuracy >= 95 ? 8 : 0;
  const difficulty =
    (result.mode.kind === "time" || result.mode.kind === "words") && result.mode.difficulty === "hard"
      ? 10
      : 0;
  return 20 + volume + time + accuracy + difficulty;
}

/** Every completed run earns participation XP; performance only adds bonuses. */
function gameXp(run: GameRun): number {
  const time = Math.min(20, Math.floor(run.durationMs / 30_000) * 5);
  const volume = Math.min(20, Math.floor(run.words / 10) * 5);
  const accuracy = run.accuracy >= 98 ? 15 : run.accuracy >= 90 ? 8 : 0;
  const victory = run.gameId === "typeraid" && run.outcome === "victory" ? 15 : 0;
  return 20 + time + volume + accuracy + victory;
}

function achievementReached(
  id: AchievementId,
  state: ProgressState,
  result?: StoredResult,
): boolean {
  switch (id) {
    case "first_flow": return state.totalTests >= 1;
    case "tests_10": return state.totalTests >= 10;
    case "tests_50": return state.totalTests >= 50;
    case "tests_100": return state.totalTests >= 100;
    case "speed_40": return state.bestWpm >= 40;
    case "speed_60": return state.bestWpm >= 60;
    case "speed_80": return state.bestWpm >= 80;
    case "speed_100": return state.bestWpm >= 100;
    case "perfect_accuracy": return result?.accuracy === 100 && result.keystrokes >= 50;
    case "streak_3": return state.longestStreak >= 3;
    case "streak_7": return state.longestStreak >= 7;
    case "streak_30": return state.longestStreak >= 30;
    case "daily_triple": return state.daily.claimed.length === DAILY_GOALS.length;
    case "daily_7": return state.dailyChallenges >= 7;
    case "practice_10": return state.practiceTests >= 10;
    case "first_game": return state.totalGames >= 1;
    case "games_10": return state.totalGames >= 10;
    case "arcade_time_30": return state.totalGameDurationMs >= 30 * 60 * 1000;
    case "typeraid_victory": return state.typeRaidVictories >= 1;
    case "wordfall_wave_5": return state.bestWordfallWave >= 5;
    case "game_combo_20": return state.bestGameCombo >= 20;
    case "level_5": return levelForXp(state.xp) >= 5;
    case "level_10": return levelForXp(state.xp) >= 10;
  }
}

export function applyResultToProgress(
  current: ProgressState,
  result: StoredResult,
): { state: ProgressState; reward: ProgressReward } {
  current = normalizeProgress(current);
  const levelBefore = levelForXp(current.xp);
  if (current.processedResultIds.includes(result.id)) {
    return {
      state: current,
      reward: {
        earnedXp: 0,
        testXp: 0,
        gameXp: 0,
        dailyGoalXp: 0,
        streakXp: 0,
        achievementXp: 0,
        completedGoals: [],
        unlockedAchievements: [],
        levelBefore,
        levelAfter: levelBefore,
      },
    };
  }

  const day = progressDayKey(result.ts);
  const historical = current.lastActiveDay !== null && dayNumber(day) < dayNumber(current.lastActiveDay);
  const previousDailyChallengeDays = current.dailyChallengeDays ?? [];
  const dailyChallengeDays = result.mode.kind === "daily" && !previousDailyChallengeDays.includes(day)
    ? [...previousDailyChallengeDays, day].slice(-7)
    : previousDailyChallengeDays;
  const dailyChallenges = current.dailyChallenges + (
    result.mode.kind === "daily" && !previousDailyChallengeDays.includes(day) ? 1 : 0
  );
  if (historical) {
    let state: ProgressState = {
      ...current,
      xp: current.xp + testXp(result),
      totalTests: current.totalTests + 1,
      totalDurationMs: current.totalDurationMs + result.durationMs,
      totalCorrectChars: current.totalCorrectChars + result.chars.correct,
      bestWpm: Math.max(current.bestWpm, result.wpm),
      bestAccuracy: Math.max(current.bestAccuracy, result.accuracy),
      practiceTests: current.practiceTests + (result.mode.kind === "practice" ? 1 : 0),
      dailyChallenges,
      dailyChallengeDays,
      processedResultIds: [...current.processedResultIds, result.id].slice(-PROCESSED_RESULT_LIMIT),
    };
    const unlockedAchievements: AchievementId[] = [];
    let achievementXp = 0;
    for (let pass = 0; pass < 3; pass++) {
      const newlyUnlocked = ACHIEVEMENTS.filter(
        (achievement) =>
          !state.achievements[achievement.id] &&
          !unlockedAchievements.includes(achievement.id) &&
          achievementReached(achievement.id, state, result),
      );
      if (newlyUnlocked.length === 0) break;
      for (const achievement of newlyUnlocked) {
        unlockedAchievements.push(achievement.id);
        achievementXp += achievement.xp;
        state = {
          ...state,
          xp: state.xp + achievement.xp,
          achievements: { ...state.achievements, [achievement.id]: result.ts },
        };
      }
    }
    return {
      state,
      reward: {
        earnedXp: testXp(result) + achievementXp,
        testXp: testXp(result),
        gameXp: 0,
        dailyGoalXp: 0,
        streakXp: 0,
        achievementXp,
        completedGoals: [],
        unlockedAchievements,
        levelBefore,
        levelAfter: levelForXp(state.xp),
      },
    };
  }
  const daily = current.daily.day === day ? current.daily : emptyDaily(day);
  const firstTestToday = current.lastActiveDay !== day;
  const consecutive =
    firstTestToday && current.lastActiveDay !== null && dayNumber(day) - dayNumber(current.lastActiveDay) === 1;
  const currentStreak = firstTestToday
    ? consecutive ? current.currentStreak + 1 : 1
    : current.currentStreak;
  const nextDaily: DailyProgress = {
    ...daily,
    tests: daily.tests + 1,
    durationMs: daily.durationMs + result.durationMs,
    correctChars: daily.correctChars + result.chars.correct,
  };
  const completedGoals = DAILY_GOALS
    .filter((goal) => !daily.claimed.includes(goal.id) && goal.value(nextDaily) >= goal.target)
    .map((goal) => goal.id);
  nextDaily.claimed = [...daily.claimed, ...completedGoals];

  const earnedTestXp = testXp(result);
  const dailyGoalXp = DAILY_GOALS
    .filter((goal) => completedGoals.includes(goal.id))
    .reduce((sum, goal) => sum + goal.xp, 0);
  const streakXp = firstTestToday ? Math.min(100, currentStreak * 5) : 0;
  let state: ProgressState = {
    ...current,
    xp: current.xp + earnedTestXp + dailyGoalXp + streakXp,
    totalTests: current.totalTests + 1,
    totalDurationMs: current.totalDurationMs + result.durationMs,
    totalCorrectChars: current.totalCorrectChars + result.chars.correct,
    bestWpm: Math.max(current.bestWpm, result.wpm),
    bestAccuracy: Math.max(current.bestAccuracy, result.accuracy),
    practiceTests: current.practiceTests + (result.mode.kind === "practice" ? 1 : 0),
    dailyChallenges,
    dailyChallengeDays,
    currentStreak,
    longestStreak: Math.max(current.longestStreak, currentStreak),
    lastActiveDay: day,
    daily: nextDaily,
    processedResultIds: [...current.processedResultIds, result.id].slice(-PROCESSED_RESULT_LIMIT),
  };

  const unlockedAchievements: AchievementId[] = [];
  let achievementXp = 0;
  for (let pass = 0; pass < 3; pass++) {
    const newlyUnlocked = ACHIEVEMENTS.filter(
      (achievement) =>
        !state.achievements[achievement.id] &&
        !unlockedAchievements.includes(achievement.id) &&
        achievementReached(achievement.id, state, result),
    );
    if (newlyUnlocked.length === 0) break;
    for (const achievement of newlyUnlocked) {
      unlockedAchievements.push(achievement.id);
      achievementXp += achievement.xp;
      state = {
        ...state,
        xp: state.xp + achievement.xp,
        achievements: { ...state.achievements, [achievement.id]: result.ts },
      };
    }
  }

  const levelAfter = levelForXp(state.xp);
  return {
    state,
    reward: {
      earnedXp: earnedTestXp + dailyGoalXp + streakXp + achievementXp,
      testXp: earnedTestXp,
      gameXp: 0,
      dailyGoalXp,
      streakXp,
      achievementXp,
      completedGoals,
      unlockedAchievements,
      levelBefore,
      levelAfter,
    },
  };
}

export function applyGameRunToProgress(
  current: ProgressState,
  run: GameRun,
  completedAt = Date.now(),
): { state: ProgressState; reward: ProgressReward } {
  current = normalizeProgress(current);
  const levelBefore = levelForXp(current.xp);
  if (current.processedGameRunIds.includes(run.clientId)) {
    return {
      state: current,
      reward: {
        earnedXp: 0, testXp: 0, gameXp: 0, dailyGoalXp: 0, streakXp: 0,
        achievementXp: 0, completedGoals: [], unlockedAchievements: [], levelBefore, levelAfter: levelBefore,
      },
    };
  }

  const day = progressDayKey(completedAt);
  const historical = current.lastActiveDay !== null && dayNumber(day) < dayNumber(current.lastActiveDay);
  const earnedGameXp = gameXp(run);
  const daily = current.daily.day === day ? current.daily : emptyDaily(day);
  const firstActivityToday = !historical && current.lastActiveDay !== day;
  const consecutive = firstActivityToday && current.lastActiveDay !== null
    && dayNumber(day) - dayNumber(current.lastActiveDay) === 1;
  const currentStreak = historical
    ? current.currentStreak
    : firstActivityToday ? consecutive ? current.currentStreak + 1 : 1 : current.currentStreak;
  const nextDaily: DailyProgress = historical
    ? daily
    : { ...daily, durationMs: daily.durationMs + run.durationMs };
  const completedGoals = historical
    ? []
    : DAILY_GOALS
      .filter((goal) => !daily.claimed.includes(goal.id) && goal.value(nextDaily) >= goal.target)
      .map((goal) => goal.id);
  nextDaily.claimed = [...daily.claimed, ...completedGoals];
  const dailyGoalXp = DAILY_GOALS
    .filter((goal) => completedGoals.includes(goal.id))
    .reduce((sum, goal) => sum + goal.xp, 0);
  const streakXp = firstActivityToday ? Math.min(100, currentStreak * 5) : 0;

  let state: ProgressState = {
    ...current,
    xp: current.xp + earnedGameXp + dailyGoalXp + streakXp,
    totalDurationMs: current.totalDurationMs + run.durationMs,
    totalGames: current.totalGames + 1,
    totalGameDurationMs: current.totalGameDurationMs + run.durationMs,
    typeRaidVictories: current.typeRaidVictories + (run.gameId === "typeraid" && run.outcome === "victory" ? 1 : 0),
    bestWordfallWave: Math.max(current.bestWordfallWave, run.gameId === "wordfall" ? run.wave : 0),
    bestGameCombo: Math.max(current.bestGameCombo, run.bestCombo),
    currentStreak,
    longestStreak: Math.max(current.longestStreak, currentStreak),
    lastActiveDay: historical ? current.lastActiveDay : day,
    daily: historical ? current.daily : nextDaily,
    processedGameRunIds: [...current.processedGameRunIds, run.clientId].slice(-PROCESSED_RESULT_LIMIT),
  };

  const unlockedAchievements: AchievementId[] = [];
  let achievementXp = 0;
  for (let pass = 0; pass < 3; pass++) {
    const newlyUnlocked = ACHIEVEMENTS.filter(
      (achievement) => !state.achievements[achievement.id]
        && !unlockedAchievements.includes(achievement.id)
        && achievementReached(achievement.id, state),
    );
    if (newlyUnlocked.length === 0) break;
    for (const achievement of newlyUnlocked) {
      unlockedAchievements.push(achievement.id);
      achievementXp += achievement.xp;
      state = {
        ...state,
        xp: state.xp + achievement.xp,
        achievements: { ...state.achievements, [achievement.id]: completedAt },
      };
    }
  }

  return {
    state,
    reward: {
      earnedXp: earnedGameXp + dailyGoalXp + streakXp + achievementXp,
      testXp: 0,
      gameXp: earnedGameXp,
      dailyGoalXp,
      streakXp,
      achievementXp,
      completedGoals,
      unlockedAchievements,
      levelBefore,
      levelAfter: levelForXp(state.xp),
    },
  };
}

export function buildProgressFromResults(results: readonly StoredResult[]): ProgressState {
  let state = createEmptyProgress(results[0]?.ts ?? Date.now());
  for (const result of [...results].sort((a, b) => a.ts - b.ts)) {
    state = applyResultToProgress(state, result).state;
  }
  return progressForToday(state);
}

export function achievementById(id: AchievementId): AchievementDefinition {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? ACHIEVEMENTS[0];
}

/** Current lifetime progress toward an achievement, suitable for compact UI cards. */
export function achievementProgress(
  id: AchievementId,
  state: ProgressState,
): AchievementProgress {
  let current: number;
  let target: number;
  let unit: string;

  switch (id) {
    case "first_flow": current = state.totalTests; target = 1; unit = "test"; break;
    case "tests_10": current = state.totalTests; target = 10; unit = "tests"; break;
    case "tests_50": current = state.totalTests; target = 50; unit = "tests"; break;
    case "tests_100": current = state.totalTests; target = 100; unit = "tests"; break;
    case "speed_40": current = state.bestWpm; target = 40; unit = "WPM"; break;
    case "speed_60": current = state.bestWpm; target = 60; unit = "WPM"; break;
    case "speed_80": current = state.bestWpm; target = 80; unit = "WPM"; break;
    case "speed_100": current = state.bestWpm; target = 100; unit = "WPM"; break;
    case "perfect_accuracy": current = state.bestAccuracy; target = 100; unit = "% accuracy"; break;
    case "streak_3": current = state.longestStreak; target = 3; unit = "days"; break;
    case "streak_7": current = state.longestStreak; target = 7; unit = "days"; break;
    case "streak_30": current = state.longestStreak; target = 30; unit = "days"; break;
    case "daily_triple": current = state.daily.claimed.length; target = 3; unit = "goals today"; break;
    case "daily_7": current = state.dailyChallenges; target = 7; unit = "daily challenges"; break;
    case "practice_10": current = state.practiceTests; target = 10; unit = "practice tests"; break;
    case "first_game": current = state.totalGames; target = 1; unit = "game"; break;
    case "games_10": current = state.totalGames; target = 10; unit = "games"; break;
    case "arcade_time_30": current = state.totalGameDurationMs; target = 30 * 60 * 1000; unit = "ms played"; break;
    case "typeraid_victory": current = state.typeRaidVictories; target = 1; unit = "victory"; break;
    case "wordfall_wave_5": current = state.bestWordfallWave; target = 5; unit = "wave"; break;
    case "game_combo_20": current = state.bestGameCombo; target = 20; unit = "combo"; break;
    case "level_5": current = levelForXp(state.xp); target = 5; unit = "level"; break;
    case "level_10": current = levelForXp(state.xp); target = 10; unit = "level"; break;
  }

  current = state.achievements[id] ? target : Math.min(current, target);
  if (id === "arcade_time_30") {
    return {
      current,
      target,
      percent: Math.min(100, (current / target) * 100),
      label: `${Math.floor(current / 60_000)} / 30 min played`,
    };
  }
  const shown = Number.isInteger(current) ? current : Math.round(current * 10) / 10;
  return {
    current,
    target,
    percent: Math.min(100, (current / target) * 100),
    label: `${shown} / ${target} ${unit}`,
  };
}
