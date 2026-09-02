import type { Difficulty } from "../words";

export const WORDFALL_MAX_LIVES = 5;
export const WORDFALL_WAVE_MS = 20_000;

export type FallingWord = {
  id: number;
  text: string;
  y: number;
  x: number;
  speed: number;
};

export type WordfallPhase = "menu" | "playing" | "paused" | "over";

export type WordfallState = {
  phase: WordfallPhase;
  words: FallingWord[];
  lives: number;
  score: number;
  combo: number;
  bestCombo: number;
  completed: number;
  missed: number;
  correctKeys: number;
  totalKeys: number;
  elapsedMs: number;
  spawnInMs: number;
  nextId: number;
  buffer: string;
};

export function wordfallWave(elapsedMs: number): number {
  return Math.min(100, Math.floor(elapsedMs / WORDFALL_WAVE_MS) + 1);
}

export function wordfallDifficulty(wave: number): Difficulty {
  return wave >= 7 ? "hard" : wave >= 3 ? "normal" : "easy";
}

export function wordfallUsesWords(wave: number): boolean {
  return wave >= 2;
}

export function wordfallAccuracy(state: WordfallState): number {
  return state.totalKeys === 0 ? 100 : (state.correctKeys / state.totalKeys) * 100;
}

export function wordfallWpm(state: WordfallState): number {
  return state.elapsedMs === 0
    ? 0
    : Math.round(((state.correctKeys / 5) * 60_000) / state.elapsedMs);
}

function spawnWord(id: number, text: string, wave: number, y = -8): FallingWord {
  return {
    id,
    text,
    y,
    x: 20 + (id % 6) * 12,
    speed: 4.1 + wave * 0.42 + Math.min(1.4, text.length * 0.06),
  };
}

export function createWordfallRun(firstWords: readonly string[]): WordfallState {
  const safe = firstWords.filter(Boolean).slice(0, 3);
  return {
    phase: "playing",
    words: safe.map((text, index) => spawnWord(index + 1, text, 1, 4 - index * 14)),
    lives: WORDFALL_MAX_LIVES,
    score: 0,
    combo: 0,
    bestCombo: 0,
    completed: 0,
    missed: 0,
    correctKeys: 0,
    totalKeys: 0,
    elapsedMs: 0,
    spawnInMs: 1_500,
    nextId: safe.length + 1,
    buffer: "",
  };
}

export function createWordfallMenu(): WordfallState {
  return { ...createWordfallRun([]), phase: "menu" };
}

/** Advance falling positions and spawn at most one word per bounded game tick. */
export function advanceWordfall(
  state: WordfallState,
  deltaMs: number,
  nextWord: string,
): WordfallState {
  if (state.phase !== "playing") return state;
  const delta = Math.min(250, Math.max(0, deltaMs));
  const elapsedMs = state.elapsedMs + delta;
  const wave = wordfallWave(elapsedMs);
  const moved = state.words.map((word) => ({
    ...word,
    y: word.y + word.speed * (delta / 1_000),
  }));
  const missedNow = moved.filter((word) => word.y >= 92).length;
  let words = moved.filter((word) => word.y < 92);
  const lives = Math.max(0, state.lives - missedNow);
  const buffer = state.buffer && !words.some((word) => word.text.startsWith(state.buffer))
    ? ""
    : state.buffer;
  let spawnInMs = state.spawnInMs - delta;
  let nextId = state.nextId;
  if (lives > 0 && spawnInMs <= 0 && nextWord) {
    words = [...words, spawnWord(nextId, nextWord, wave)];
    nextId++;
    spawnInMs = Math.max(560, 1_750 - (wave - 1) * 105);
  }
  return {
    ...state,
    phase: lives === 0 ? "over" : state.phase,
    words,
    buffer,
    lives,
    missed: state.missed + missedNow,
    combo: missedNow > 0 ? 0 : state.combo,
    elapsedMs,
    spawnInMs,
    nextId,
  };
}

export function typeWordfallKey(state: WordfallState, key: string): WordfallState {
  if (state.phase !== "playing") return state;
  if (key === "Backspace") return { ...state, buffer: state.buffer.slice(0, -1) };
  if (key.length !== 1) return state;

  const candidate = state.buffer + key;
  const matching = state.words
    .filter((word) => word.text.startsWith(candidate))
    .sort((a, b) => b.y - a.y);
  if (matching.length === 0) {
    return {
      ...state,
      buffer: "",
      combo: 0,
      totalKeys: state.totalKeys + 1,
    };
  }

  const exact = matching.find((word) => word.text === candidate);
  if (!exact) {
    return {
      ...state,
      buffer: candidate,
      correctKeys: state.correctKeys + 1,
      totalKeys: state.totalKeys + 1,
    };
  }

  const combo = state.combo + 1;
  const wave = wordfallWave(state.elapsedMs);
  const dangerBonus = Math.max(0, Math.floor(exact.y / 10) * 8);
  const points = exact.text.length * 22 + wave * 30 + combo * 6 + dangerBonus;
  return {
    ...state,
    words: state.words.filter((word) => word.id !== exact.id),
    buffer: "",
    score: state.score + points,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    completed: state.completed + 1,
    correctKeys: state.correctKeys + 1,
    totalKeys: state.totalKeys + 1,
  };
}

export function toggleWordfallPause(state: WordfallState): WordfallState {
  if (state.phase === "playing") return { ...state, phase: "paused" };
  if (state.phase === "paused") return { ...state, phase: "playing" };
  return state;
}
