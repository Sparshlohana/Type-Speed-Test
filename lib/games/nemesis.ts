/**
 * Nemesis — a duel against an opponent forged from the player's own mistakes.
 *
 * The arcade's other games throw the same content at everyone. This one reads the
 * player's weakness profile, builds its words from the keys they actually miss, and
 * keeps learning inside the run: every mistyped character is remembered and fed back
 * into the next strike. It persists between sessions, so beating it makes it evolve
 * and losing to it makes it meaner.
 */

import { WORD_BANK } from "../words";
import type { WeaknessProfile } from "../weakness";

export const NEMESIS_STORAGE_KEY = "typeflow.nemesis";
export const NEMESIS_PLAYER_HP = 100;
export const NEMESIS_MAX_LEVEL = 12;
export const NEMESIS_PURGE_COST = 5;
export const NEMESIS_CURSE_WORDS = 3;
/** Completed words between curses, so there is always a clean stretch to recover in. */
export const NEMESIS_CURSE_INTERVAL = 5;
/** Below this share of its health it stops giving the player clean stretches. */
const ENRAGE_THRESHOLD = 0.35;
const LEARNED_LIMIT = 6;
const LOG_LIMIT = 5;
const FALLBACK_SIGNATURE = "e";

export type CurseId = "mirror" | "veil" | "haste" | "bite";
export type NemesisPhase = "playing" | "paused" | "won" | "lost";

export type CurseDefinition = {
  id: CurseId;
  title: string;
  /** Shown while the curse is live, phrased as the rule the player must now follow. */
  rule: string;
  glyph: string;
};

export const CURSES: readonly CurseDefinition[] = [
  { id: "mirror", title: "Mirror", rule: "The word is reversed. Type it backwards.", glyph: "◑" },
  { id: "veil", title: "Veil", rule: "The word vanishes once you start. Finish it blind.", glyph: "◍" },
  { id: "haste", title: "Haste", rule: "The fuse burns almost twice as fast.", glyph: "≫" },
  { id: "bite", title: "Bite", rule: "Every mistake costs double.", glyph: "✖" },
] as const;

export function curseById(id: CurseId): CurseDefinition {
  return CURSES.find((curse) => curse.id === id) ?? CURSES[0];
}

/** What the player has to live with across sessions; stored locally, never on the server. */
export type NemesisIdentity = {
  name: string;
  /** The key this nemesis was born from — its whole personality in one character. */
  signature: string;
  level: number;
  wins: number;
  losses: number;
  /** Rises with every loss and makes its opening strikes hit harder. */
  grudge: number;
  /** Signatures the player has already beaten out of it, shown as trophies. */
  masteredKeys: string[];
};

export type NemesisStrike = {
  id: number;
  word: string;
  /** Forged almost entirely from weak keys — clearing it cleanly does double damage. */
  marked: boolean;
  /** A word the player has actually mistyped before, resurfaced on purpose. */
  memory: boolean;
  fuseMs: number;
  remainingMs: number;
};

export type ActiveCurse = { id: CurseId; wordsLeft: number };

export type NemesisLogEntry = {
  id: number;
  text: string;
  tone: "player" | "nemesis" | "system";
};

export type KeyDuelCount = { hits: number; misses: number };

export type NemesisState = {
  phase: NemesisPhase;
  identity: NemesisIdentity;
  strike: NemesisStrike;
  typed: string;
  curse: ActiveCurse | null;
  /** Curses already spent this run, so the same one never repeats back to back. */
  usedCurses: CurseId[];
  playerHp: number;
  nemesisHp: number;
  nemesisMaxHp: number;
  purge: number;
  combo: number;
  bestCombo: number;
  /** True while the current word has not been mistyped yet. */
  clean: boolean;
  words: number;
  markedCleared: number;
  memoryCleared: number;
  fusesLost: number;
  correctKeys: number;
  totalKeys: number;
  elapsedMs: number;
  wordsSinceCurse: number;
  /** Keys mistyped inside this run, newest first — the live half of its learning. */
  learned: string[];
  keyDuel: Record<string, KeyDuelCount>;
  log: NemesisLogEntry[];
  nextId: number;
  /** Bumped on every hit taken so the shell can react without owning timers. */
  impact: number;
};

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

const EPITHETS = [
  "Wraith", "Echo", "Hollow", "Splinter", "Cinder", "Vessel",
  "Remnant", "Choir", "Warden", "Mimic", "Grain", "Fracture",
] as const;

function rankFor(level: number): string {
  if (level >= 9) return "Sovereign";
  if (level >= 6) return "Elder";
  if (level >= 3) return "Risen";
  return "Lesser";
}

export function nemesisName(signature: string, level: number): string {
  const seed = signature.charCodeAt(0) || 0;
  return `${rankFor(level)} ${EPITHETS[seed % EPITHETS.length]} of ${signature.toLocaleUpperCase()}`;
}

export function createNemesisIdentity(signature = FALLBACK_SIGNATURE): NemesisIdentity {
  const key = normalizeSignature(signature);
  return {
    name: nemesisName(key, 1),
    signature: key,
    level: 1,
    wins: 0,
    losses: 0,
    grudge: 0,
    masteredKeys: [],
  };
}

function normalizeSignature(value: string): string {
  const char = (value ?? "").trim().toLocaleLowerCase().slice(0, 1);
  return /[a-z0-9]/.test(char) ? char : FALLBACK_SIGNATURE;
}

/**
 * Reconcile the stored nemesis with the player's current worst key.
 *
 * A nemesis keeps its identity while the weakness that created it survives; once that
 * key stops being the player's worst, it reforms around the new one and remembers the
 * old signature as something they beat.
 */
export function reforgeIdentity(
  identity: NemesisIdentity,
  profile: WeaknessProfile,
): NemesisIdentity {
  const worst = normalizeSignature(profile.focusChars[0] ?? identity.signature);
  if (worst === identity.signature) return identity;
  const masteredKeys = identity.masteredKeys.includes(identity.signature)
    ? identity.masteredKeys
    : [...identity.masteredKeys, identity.signature].slice(-8);
  return { ...identity, signature: worst, masteredKeys, name: nemesisName(worst, identity.level) };
}

export function evolveIdentity(identity: NemesisIdentity, won: boolean): NemesisIdentity {
  if (!won) {
    return { ...identity, losses: identity.losses + 1, grudge: Math.min(10, identity.grudge + 1) };
  }
  const level = Math.min(NEMESIS_MAX_LEVEL, identity.level + 1);
  return {
    ...identity,
    level,
    wins: identity.wins + 1,
    grudge: Math.max(0, identity.grudge - 1),
    name: nemesisName(identity.signature, level),
  };
}

function isIdentity(value: unknown): value is NemesisIdentity {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.signature === "string"
    && typeof candidate.level === "number"
    && Number.isFinite(candidate.level);
}

/** Local-only so a signed-out or storage-blocked browser still gets a fresh rival. */
export function loadNemesisIdentity(): NemesisIdentity {
  if (typeof window === "undefined") return createNemesisIdentity();
  try {
    const raw = window.localStorage.getItem(NEMESIS_STORAGE_KEY);
    if (!raw) return createNemesisIdentity();
    const parsed: unknown = JSON.parse(raw);
    if (!isIdentity(parsed)) return createNemesisIdentity();
    const signature = normalizeSignature(parsed.signature);
    const level = Math.min(NEMESIS_MAX_LEVEL, Math.max(1, Math.floor(parsed.level)));
    return {
      signature,
      level,
      name: typeof parsed.name === "string" && parsed.name ? parsed.name : nemesisName(signature, level),
      wins: Math.max(0, Math.floor(parsed.wins ?? 0)),
      losses: Math.max(0, Math.floor(parsed.losses ?? 0)),
      grudge: Math.min(10, Math.max(0, Math.floor(parsed.grudge ?? 0))),
      masteredKeys: Array.isArray(parsed.masteredKeys)
        ? parsed.masteredKeys.filter((key): key is string => typeof key === "string").slice(-8)
        : [],
    };
  } catch {
    return createNemesisIdentity();
  }
}

export function saveNemesisIdentity(identity: NemesisIdentity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NEMESIS_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // The run still counts on the server; only the grudge is forgotten.
  }
}

/* -------------------------------------------------------------------------- */
/* Word forging                                                                */
/* -------------------------------------------------------------------------- */

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function minimumLength(level: number): number {
  return level >= 8 ? 6 : level >= 5 ? 5 : level >= 3 ? 4 : 3;
}

/** Score every candidate by how much of the player's weakness it packs per character. */
function forgeCandidates(weights: Map<string, number>, minLength: number): string[] {
  const scored: { word: string; score: number }[] = [];
  for (const word of WORD_BANK) {
    if (word.length < minLength) continue;
    let score = 0;
    for (const char of word) score += weights.get(char) ?? 0;
    if (score > 0) scored.push({ word, score: score / word.length });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 140)
    .map((item) => item.word);
}

function weightsFor(profile: WeaknessProfile, learned: readonly string[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const char of profile.focusChars) {
    weights.set(char.toLocaleLowerCase(), 1);
  }
  // A key missed during this run outranks history: the nemesis attacks the fresh wound.
  for (const char of learned) {
    weights.set(char.toLocaleLowerCase(), (weights.get(char.toLocaleLowerCase()) ?? 0) + 2);
  }
  return weights;
}

function markedFor(word: string, weights: Map<string, number>): boolean {
  let hits = 0;
  for (const char of word) if (weights.has(char)) hits++;
  return hits >= 2 && hits / word.length >= 0.4;
}

/**
 * Roughly the time the word takes at a threshold speed, plus a beat to read it.
 * Level 1 threatens a ~30 WPM typist; level 12 threatens a ~50 WPM one.
 */
function fuseFor(word: string, level: number, hasted: boolean): number {
  const base = 800 + word.length * 340;
  const pressure = Math.max(0.55, 1 - (level - 1) * 0.03);
  return Math.round(base * pressure * (hasted ? 0.62 : 1));
}

export function forgeStrike(
  id: number,
  profile: WeaknessProfile,
  learned: readonly string[],
  level: number,
  hasted: boolean,
): NemesisStrike {
  const weights = weightsFor(profile, learned);
  const memories = profile.focusWords
    .map((word) => word.trim().toLocaleLowerCase())
    .filter((word) => word.length > 2 && !/\s/.test(word));
  const useMemory = memories.length > 0 && Math.random() < 0.22;
  const candidates = useMemory ? [] : forgeCandidates(weights, minimumLength(level));
  const pool = useMemory ? memories : candidates.length > 0 ? candidates : WORD_BANK;
  const word = pick(pool);
  return {
    id,
    word,
    marked: !useMemory && markedFor(word, weights),
    memory: useMemory,
    fuseMs: fuseFor(word, level, hasted),
    remainingMs: fuseFor(word, level, hasted),
  };
}

/* -------------------------------------------------------------------------- */
/* Combat                                                                      */
/* -------------------------------------------------------------------------- */

export function nemesisMaxHp(level: number): number {
  return 300 + (level - 1) * 30;
}

function fuseDamage(identity: NemesisIdentity): number {
  return Math.round(11 + identity.level * 1.5 + identity.grudge);
}

function mistakeDamage(state: NemesisState): number {
  return state.curse?.id === "bite" ? 6 : 3;
}

function strikeDamage(state: NemesisState, strike: NemesisStrike): number {
  const comboBonus = Math.min(7, Math.floor(state.combo / 3));
  const base = 6 + comboBonus + Math.min(4, Math.floor(strike.word.length / 3));
  const clean = state.clean ? base : Math.round(base * 0.6);
  return strike.marked && state.clean ? clean * 2 : clean;
}

/** The text the player must actually produce, which the Mirror curse reverses. */
export function strikeTarget(state: NemesisState): string {
  return state.curse?.id === "mirror"
    ? [...state.strike.word].reverse().join("")
    : state.strike.word;
}

function log(state: NemesisState, text: string, tone: NemesisLogEntry["tone"]): NemesisLogEntry[] {
  return [{ id: state.nextId, text, tone }, ...state.log].slice(0, LOG_LIMIT);
}

function trackKey(
  keyDuel: Record<string, KeyDuelCount>,
  key: string,
  hit: boolean,
): Record<string, KeyDuelCount> {
  const normalized = key.toLocaleLowerCase();
  const current = keyDuel[normalized] ?? { hits: 0, misses: 0 };
  return {
    ...keyDuel,
    [normalized]: {
      hits: current.hits + (hit ? 1 : 0),
      misses: current.misses + (hit ? 0 : 1),
    },
  };
}

function castCurse(state: NemesisState): NemesisState {
  const available = CURSES.filter((curse) => !state.usedCurses.includes(curse.id));
  const pool = available.length > 0 ? available : CURSES;
  const curse = pick(pool);
  return {
    ...state,
    curse: { id: curse.id, wordsLeft: NEMESIS_CURSE_WORDS },
    usedCurses: available.length > 0 ? [...state.usedCurses, curse.id] : [curse.id],
    wordsSinceCurse: 0,
    log: log(state, `${curse.title} cast — ${curse.rule}`, "nemesis"),
    nextId: state.nextId + 1,
  };
}

export function createNemesisRun(
  identity: NemesisIdentity,
  profile: WeaknessProfile,
): NemesisState {
  const maxHp = nemesisMaxHp(identity.level);
  return {
    phase: "playing",
    identity,
    strike: forgeStrike(1, profile, [], identity.level, false),
    typed: "",
    curse: null,
    usedCurses: [],
    playerHp: NEMESIS_PLAYER_HP,
    nemesisHp: maxHp,
    nemesisMaxHp: maxHp,
    purge: 0,
    combo: 0,
    bestCombo: 0,
    clean: true,
    words: 0,
    markedCleared: 0,
    memoryCleared: 0,
    fusesLost: 0,
    correctKeys: 0,
    totalKeys: 0,
    elapsedMs: 0,
    wordsSinceCurse: 0,
    learned: [],
    keyDuel: {},
    log: [{ id: 0, text: `${identity.name} steps out of the mirror.`, tone: "system" }],
    nextId: 2,
    impact: 0,
  };
}

/** Burn the fuse; when it empties the nemesis lands a hit and forges the next word. */
export function advanceNemesis(
  state: NemesisState,
  deltaMs: number,
  profile: WeaknessProfile,
): NemesisState {
  if (state.phase !== "playing") return state;
  const delta = Math.min(250, Math.max(0, deltaMs));
  const elapsedMs = state.elapsedMs + delta;
  const remainingMs = state.strike.remainingMs - delta;
  if (remainingMs > 0) {
    return { ...state, elapsedMs, strike: { ...state.strike, remainingMs } };
  }

  const playerHp = Math.max(0, state.playerHp - fuseDamage(state.identity));
  const missed: NemesisState = {
    ...state,
    elapsedMs,
    playerHp,
    combo: 0,
    clean: true,
    typed: "",
    purge: 0,
    fusesLost: state.fusesLost + 1,
    impact: state.impact + 1,
    log: log(state, `"${state.strike.word}" burned through. −${fuseDamage(state.identity)} HP.`, "nemesis"),
    nextId: state.nextId + 1,
  };
  if (playerHp === 0) return { ...missed, phase: "lost" };
  return advanceCurseAndForge(missed, profile);
}

/** A cornered nemesis stops leaving gaps between curses. */
function curseInterval(state: NemesisState): number {
  return state.nemesisHp / state.nemesisMaxHp <= ENRAGE_THRESHOLD
    ? 2
    : NEMESIS_CURSE_INTERVAL;
}

/** Tick the active curse down, cast a new one when due, then forge the next strike. */
function advanceCurseAndForge(state: NemesisState, profile: WeaknessProfile): NemesisState {
  let next = state;
  if (next.curse) {
    const wordsLeft = next.curse.wordsLeft - 1;
    next = wordsLeft > 0
      ? { ...next, curse: { ...next.curse, wordsLeft } }
      : {
        ...next,
        curse: null,
        log: log(next, `${curseById(next.curse.id).title} fades.`, "system"),
        nextId: next.nextId + 1,
      };
  } else if (next.wordsSinceCurse >= curseInterval(next)) {
    next = castCurse(next);
  }
  return {
    ...next,
    strike: forgeStrike(
      next.nextId,
      profile,
      next.learned,
      next.identity.level,
      next.curse?.id === "haste",
    ),
    typed: "",
    nextId: next.nextId + 1,
  };
}

export function typeNemesisKey(
  state: NemesisState,
  key: string,
  profile: WeaknessProfile,
): NemesisState {
  if (state.phase !== "playing") return state;
  if (key === "Backspace") return { ...state, typed: state.typed.slice(0, -1) };
  if (key.length !== 1) return state;

  const target = strikeTarget(state);
  const expected = target[state.typed.length] ?? "";
  if (key !== expected) {
    const damage = mistakeDamage(state);
    const playerHp = Math.max(0, state.playerHp - damage);
    const learnable = expected.trim().length === 1 ? expected.toLocaleLowerCase() : "";
    const missed: NemesisState = {
      ...state,
      playerHp,
      combo: 0,
      clean: false,
      purge: 0,
      totalKeys: state.totalKeys + 1,
      impact: state.impact + 1,
      keyDuel: learnable ? trackKey(state.keyDuel, learnable, false) : state.keyDuel,
      // Feeding the missed key back in is the whole point: it adapts mid-duel.
      learned: learnable
        ? [learnable, ...state.learned.filter((char) => char !== learnable)].slice(0, LEARNED_LIMIT)
        : state.learned,
      log: learnable
        ? log(state, `It learned "${learnable}". −${damage} HP.`, "nemesis")
        : state.log,
      nextId: state.nextId + 1,
    };
    return playerHp === 0 ? { ...missed, phase: "lost" } : missed;
  }

  const typed = state.typed + key;
  const hit: NemesisState = {
    ...state,
    typed,
    correctKeys: state.correctKeys + 1,
    totalKeys: state.totalKeys + 1,
    keyDuel: expected.trim().length === 1
      ? trackKey(state.keyDuel, expected, true)
      : state.keyDuel,
  };
  if (typed.length < target.length) return hit;

  const combo = hit.combo + 1;
  const damage = strikeDamage(hit, hit.strike);
  const nemesisHp = Math.max(0, hit.nemesisHp - damage);
  const cleared: NemesisState = {
    ...hit,
    nemesisHp,
    combo,
    bestCombo: Math.max(hit.bestCombo, combo),
    words: hit.words + 1,
    markedCleared: hit.markedCleared + (hit.strike.marked && hit.clean ? 1 : 0),
    memoryCleared: hit.memoryCleared + (hit.strike.memory ? 1 : 0),
    wordsSinceCurse: hit.wordsSinceCurse + 1,
    purge: hit.clean ? Math.min(NEMESIS_PURGE_COST, hit.purge + 1) : hit.purge,
    clean: true,
    log: log(
      hit,
      hit.strike.marked && hit.clean
        ? `Weak point struck — ${damage} damage.`
        : `${hit.strike.word} → ${damage} damage.`,
      "player",
    ),
    nextId: hit.nextId + 1,
  };
  if (nemesisHp === 0) return { ...cleared, phase: "won", typed: "" };
  return advanceCurseAndForge(cleared, profile);
}

/** Spend a full meter to break the active curse and counter-attack. */
export function purgeNemesis(state: NemesisState): NemesisState {
  if (state.phase !== "playing" || state.purge < NEMESIS_PURGE_COST) return state;
  const damage = state.curse ? 16 : 10;
  const nemesisHp = Math.max(0, state.nemesisHp - damage);
  const purged: NemesisState = {
    ...state,
    nemesisHp,
    purge: 0,
    curse: null,
    log: log(
      state,
      state.curse
        ? `Purged ${curseById(state.curse.id).title} — ${damage} damage.`
        : `Counter — ${damage} damage.`,
      "player",
    ),
    nextId: state.nextId + 1,
  };
  return nemesisHp === 0 ? { ...purged, phase: "won" } : purged;
}

export function toggleNemesisPause(state: NemesisState): NemesisState {
  if (state.phase === "playing") return { ...state, phase: "paused" };
  if (state.phase === "paused") return { ...state, phase: "playing" };
  return state;
}

/* -------------------------------------------------------------------------- */
/* Derived                                                                     */
/* -------------------------------------------------------------------------- */

export function nemesisAccuracy(state: NemesisState): number {
  return state.totalKeys === 0 ? 100 : (state.correctKeys / state.totalKeys) * 100;
}

export function nemesisWpm(state: NemesisState): number {
  return state.elapsedMs === 0
    ? 0
    : Math.round(((state.correctKeys / 5) * 60_000) / state.elapsedMs);
}

export function nemesisScore(state: NemesisState): number {
  const survival = Math.round(state.playerHp * 4);
  const victory = state.phase === "won" ? 500 + state.identity.level * 150 : 0;
  return Math.max(
    0,
    state.words * 90
    + state.markedCleared * 60
    + state.memoryCleared * 40
    + state.bestCombo * 35
    + Math.round(nemesisAccuracy(state) * 3)
    + survival
    + victory,
  );
}

export type KeyVerdict = {
  key: string;
  hits: number;
  misses: number;
  accuracy: number;
  /** Cleared without a single miss — the key is no longer its weapon. */
  broken: boolean;
};

/** Which of the keys it attacked with actually held up, newest weakness first. */
export function nemesisAutopsy(state: NemesisState, limit = 8): KeyVerdict[] {
  return Object.entries(state.keyDuel)
    .map(([key, count]) => {
      const attempts = count.hits + count.misses;
      return {
        key,
        hits: count.hits,
        misses: count.misses,
        accuracy: attempts === 0 ? 100 : (count.hits / attempts) * 100,
        broken: count.misses === 0 && count.hits >= 3,
      };
    })
    .filter((verdict) => verdict.misses > 0 || verdict.broken)
    .sort((a, b) => b.misses - a.misses || a.accuracy - b.accuracy)
    .slice(0, limit);
}
