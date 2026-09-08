/**
 * Nemesis — a duel against an opponent forged from the player's own mistakes.
 *
 * The arcade's other games throw the same content at everyone. This one reads the
 * player's weakness profile, builds its words from the keys they actually miss, and
 * keeps learning inside the run: every mistyped character is remembered and fed back
 * into the next strike. It persists between sessions, so beating it makes it evolve
 * and losing to it makes it meaner.
 *
 * The module is pure and React-free. Nothing here owns a timer or touches storage
 * during a duel; the component ticks it and diffs the monotonic counters for effects.
 */

import { WORD_BANK } from "../words.ts";
import type { WeaknessProfile } from "../weakness.ts";

export const NEMESIS_STORAGE_KEY = "typeflow.nemesis";
export const NEMESIS_PLAYER_HP = 100;
export const NEMESIS_MAX_LEVEL = 12;
/** Charge segments the shared ability meter holds; the priciest ability spends all of them. */
export const NEMESIS_CHARGE_MAX = 6;
export const NEMESIS_CURSE_WORDS = 3;
/** Signatures kept as trophies on the identity. */
export const MASTERED_LIMIT = 12;
const LEARNED_LIMIT = 6;
const LEARNED_LIMIT_MAX = 9;
const LOG_LIMIT = 5;
const WARD_MS = 12_000;
/** A mistake dents the meter instead of emptying it; only a burned word wipes it. */
const MISTAKE_CHARGE_LOSS = 2;
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

/* -------------------------------------------------------------------------- */
/* Abilities                                                                   */
/* -------------------------------------------------------------------------- */

export type AbilityId = "purge" | "brand" | "recall" | "bulwark";

export type AbilityDefinition = {
  id: AbilityId;
  title: string;
  /** Phrased as what pressing it does, the mirror of a curse's rule. */
  rule: string;
  glyph: string;
  /** Display label and the key the component binds. */
  bind: string;
  cost: number;
  cooldownMs: number;
  /** Nemesis level at which the player earns it — the reason to keep winning. */
  unlockLevel: number;
};

export const ABILITIES: readonly AbilityDefinition[] = [
  {
    id: "purge",
    title: "Purge",
    rule: "Break the active curse and counter-attack.",
    glyph: "✧",
    bind: "Tab",
    cost: 5,
    cooldownMs: 0,
    unlockLevel: 1,
  },
  {
    id: "brand",
    title: "Brand",
    rule: "Expose the current word and relight its fuse.",
    glyph: "◈",
    bind: "1",
    cost: 4,
    cooldownMs: 9_000,
    unlockLevel: 3,
  },
  {
    id: "recall",
    title: "Recall",
    rule: "Make it forget your freshest mistake, and take a breath.",
    glyph: "◐",
    bind: "2",
    cost: 6,
    cooldownMs: 15_000,
    unlockLevel: 5,
  },
  {
    id: "bulwark",
    title: "Bulwark",
    rule: "Twelve seconds of halved damage.",
    glyph: "▣",
    bind: "3",
    cost: 5,
    cooldownMs: 20_000,
    unlockLevel: 8,
  },
] as const;

export function abilityById(id: AbilityId): AbilityDefinition {
  return ABILITIES.find((ability) => ability.id === id) ?? ABILITIES[0];
}

export type AbilityState = {
  charge: number;
  cooldowns: Record<AbilityId, number>;
  /** Per-run use counts, so a duel can report which of the kit was actually needed. */
  used: Record<AbilityId, number>;
};

function emptyAbilityCounters(): Record<AbilityId, number> {
  return { purge: 0, brand: 0, recall: 0, bulwark: 0 };
}

function emptyAbilityState(): AbilityState {
  return { charge: 0, cooldowns: emptyAbilityCounters(), used: emptyAbilityCounters() };
}

/* -------------------------------------------------------------------------- */
/* Phases                                                                      */
/* -------------------------------------------------------------------------- */

export type PhaseId = "opening" | "pressure" | "enrage" | "last-stand";

export type BossPhase = {
  id: PhaseId;
  title: string;
  /** Active at or below this share of its max health. Ordered high to low. */
  threshold: number;
  curseInterval: number;
  fuseScale: number;
  fuseDamageScale: number;
  /** A cornered nemesis stops caring that it already used a curse. */
  recycleCurses: boolean;
  /** "{sig}" is replaced with its signature key. */
  taunts: readonly string[];
};

export const NEMESIS_PHASES: readonly BossPhase[] = [
  {
    id: "opening",
    title: "Opening",
    threshold: 1,
    curseInterval: 5,
    fuseScale: 1,
    fuseDamageScale: 1,
    recycleCurses: false,
    taunts: ["It watches your hands.", "It has all night.", "It knows where you start."],
  },
  {
    id: "pressure",
    title: "Pressure",
    threshold: 0.7,
    curseInterval: 4,
    fuseScale: 0.94,
    fuseDamageScale: 1,
    recycleCurses: false,
    taunts: [
      "It stops being polite about \"{sig}\".",
      "It closes the gaps between words.",
      "It has seen enough to guess.",
    ],
  },
  {
    id: "enrage",
    title: "Enrage",
    threshold: 0.35,
    curseInterval: 2,
    fuseScale: 0.88,
    fuseDamageScale: 1.1,
    recycleCurses: false,
    taunts: [
      "It stops leaving you clean stretches.",
      "\"{sig}\". Again. Always \"{sig}\".",
      "It is not tired. It is never tired.",
    ],
  },
  {
    id: "last-stand",
    title: "Last stand",
    threshold: 0.12,
    curseInterval: 2,
    fuseScale: 0.82,
    fuseDamageScale: 1.15,
    recycleCurses: true,
    taunts: [
      "It stops holding curses back.",
      "It would rather break than lose.",
      "It types faster than you have ever typed.",
    ],
  },
] as const;

export function phaseById(id: PhaseId): BossPhase {
  return NEMESIS_PHASES.find((phase) => phase.id === id) ?? NEMESIS_PHASES[0];
}

function phaseForRatio(ratio: number): BossPhase {
  let current = NEMESIS_PHASES[0];
  for (const phase of NEMESIS_PHASES) {
    if (ratio <= phase.threshold) current = phase;
  }
  return current;
}

export function phaseFor(state: NemesisState): BossPhase {
  return phaseForRatio(state.nemesisMaxHp === 0 ? 1 : state.nemesisHp / state.nemesisMaxHp);
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export type MutationId = "vindictive" | "adaptive" | "relentless" | "hoarder" | "brittle";

export type MutationDefinition = {
  id: MutationId;
  title: string;
  description: string;
  glyph: string;
  /** True for the single trait the player earns by winning. */
  onWin: boolean;
};

export const MUTATIONS: readonly MutationDefinition[] = [
  { id: "vindictive", title: "Vindictive", description: "Burned words hurt more.", glyph: "▲", onWin: false },
  { id: "adaptive", title: "Adaptive", description: "It remembers more of your fresh mistakes.", glyph: "◎", onWin: false },
  { id: "relentless", title: "Relentless", description: "Curses arrive sooner.", glyph: "≡", onWin: false },
  { id: "hoarder", title: "Hoarder", description: "Your abilities recover slower.", glyph: "⧗", onWin: false },
  { id: "brittle", title: "Brittle", description: "Its weak points take more damage.", glyph: "◇", onWin: true },
];

export type Mutation = { id: MutationId; stacks: number };

export const MUTATION_STACK_LIMIT = 3;

export function mutationById(id: MutationId): MutationDefinition {
  return MUTATIONS.find((mutation) => mutation.id === id) ?? MUTATIONS[0];
}

function mutationStacks(identity: NemesisIdentity, id: MutationId): number {
  return identity.mutations.find((mutation) => mutation.id === id)?.stacks ?? 0;
}

function stackMutation(mutations: readonly Mutation[], id: MutationId): Mutation[] {
  const existing = mutations.find((mutation) => mutation.id === id);
  if (!existing) return [...mutations, { id, stacks: 1 }];
  return mutations.map((mutation) =>
    mutation.id === id
      ? { ...mutation, stacks: Math.min(MUTATION_STACK_LIMIT, mutation.stacks + 1) }
      : mutation,
  );
}

/** A win peels back the most recent thing a loss gave it. */
function easeNewestHostile(mutations: readonly Mutation[]): Mutation[] {
  for (let index = mutations.length - 1; index >= 0; index--) {
    if (mutationById(mutations[index].id).onWin) continue;
    const stacks = mutations[index].stacks - 1;
    return stacks > 0
      ? mutations.map((mutation, at) => (at === index ? { ...mutation, stacks } : mutation))
      : mutations.filter((_, at) => at !== index);
  }
  return [...mutations];
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/** What the player has to live with across sessions; local-first, merged with the server copy when signed in. */
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
  /** Traits earned across duels; they persist and stack, so a rival gets a character. */
  mutations: Mutation[];
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
  phaseId: PhaseId;
  identity: NemesisIdentity;
  strike: NemesisStrike;
  typed: string;
  curse: ActiveCurse | null;
  /** Curses already spent this run, so the same one never repeats back to back. */
  usedCurses: CurseId[];
  playerHp: number;
  nemesisHp: number;
  nemesisMaxHp: number;
  abilities: AbilityState;
  /** Milliseconds of Bulwark left; while positive, incoming damage is softened. */
  ward: number;
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
  /** Bumped whenever the nemesis takes damage. */
  struck: number;
  /** Bumped whenever a curse lands. */
  curseCast: number;
};

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
    mutations: [],
  };
}

function normalizeSignature(value: string): string {
  const char = (value ?? "").trim().toLocaleLowerCase().slice(0, 1);
  return /[a-z0-9]/.test(char) ? char : FALLBACK_SIGNATURE;
}

function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function sanitizeMutations(value: unknown): Mutation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<MutationId>();
  const mutations: Mutation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const id = MUTATIONS.find((mutation) => mutation.id === candidate.id)?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    mutations.push({ id, stacks: clampInt(candidate.stacks, 1, MUTATION_STACK_LIMIT, 1) });
  }
  return mutations;
}

/**
 * Coerce an untrusted identity into a valid one.
 *
 * Shared by the local loader and the server action: a stored blob and a posted blob are
 * equally untrusted, so they go through exactly one set of rules.
 */
export function sanitizeIdentity(value: unknown): NemesisIdentity | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.signature !== "string") return null;
  if (typeof candidate.level !== "number" || !Number.isFinite(candidate.level)) return null;

  const signature = normalizeSignature(candidate.signature);
  const level = clampInt(candidate.level, 1, NEMESIS_MAX_LEVEL, 1);
  return {
    signature,
    level,
    name: typeof candidate.name === "string" && candidate.name
      ? candidate.name.slice(0, 120)
      : nemesisName(signature, level),
    wins: clampInt(candidate.wins, 0, 100_000, 0),
    losses: clampInt(candidate.losses, 0, 100_000, 0),
    grudge: clampInt(candidate.grudge, 0, 10, 0),
    masteredKeys: Array.isArray(candidate.masteredKeys)
      ? candidate.masteredKeys
        .filter((key): key is string => typeof key === "string" && key.length === 1)
        .slice(-MASTERED_LIMIT)
      : [],
    mutations: sanitizeMutations(candidate.mutations),
  };
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
  /** Evidence the old key is genuinely beaten; without it the reform earns no trophy. */
  provenBroken: (key: string) => boolean = () => true,
): NemesisIdentity {
  const worst = normalizeSignature(profile.focusChars[0] ?? identity.signature);
  if (worst === identity.signature) return identity;
  const earned = !identity.masteredKeys.includes(identity.signature) && provenBroken(identity.signature);
  const masteredKeys = earned
    ? [...identity.masteredKeys, identity.signature].slice(-MASTERED_LIMIT)
    : identity.masteredKeys;
  return { ...identity, signature: worst, masteredKeys, name: nemesisName(worst, identity.level) };
}

export function evolveIdentity(identity: NemesisIdentity, won: boolean): NemesisIdentity {
  if (!won) {
    // Deterministic rather than random: the player can see which trait the next loss adds.
    const hostile = MUTATIONS.filter((mutation) => !mutation.onWin);
    const granted = hostile[identity.level % hostile.length];
    return {
      ...identity,
      losses: identity.losses + 1,
      grudge: Math.min(10, identity.grudge + 1),
      mutations: stackMutation(identity.mutations, granted.id),
    };
  }
  const level = Math.min(NEMESIS_MAX_LEVEL, identity.level + 1);
  return {
    ...identity,
    level,
    wins: identity.wins + 1,
    grudge: Math.max(0, identity.grudge - 1),
    // Traits must not only ratchet difficulty, or a losing streak becomes unrecoverable.
    mutations: stackMutation(easeNewestHostile(identity.mutations), "brittle"),
    name: nemesisName(identity.signature, level),
  };
}

/**
 * Fold two copies of the same rival together, upward.
 *
 * The copy with more duels supplies the identity — which device actually played is the
 * only honest signal — but every progression field takes the maximum regardless, so the
 * merge is idempotent, loses nothing, and cannot be gamed by clearing storage.
 */
export function mergeIdentities(
  local: NemesisIdentity,
  localDuels: number,
  remote: NemesisIdentity,
  remoteDuels: number,
): { identity: NemesisIdentity; duels: number } {
  const base = localDuels >= remoteDuels ? local : remote;
  const other = base === local ? remote : local;
  const level = Math.max(local.level, remote.level);
  const masteredKeys = [...new Set([...base.masteredKeys, ...other.masteredKeys])]
    .slice(-MASTERED_LIMIT);
  const mutations = MUTATIONS
    .map(({ id }) => ({ id, stacks: Math.max(mutationStacks(local, id), mutationStacks(remote, id)) }))
    .filter((mutation) => mutation.stacks > 0);

  return {
    identity: {
      signature: base.signature,
      level,
      name: base.level === level ? base.name : nemesisName(base.signature, level),
      wins: Math.max(local.wins, remote.wins),
      losses: Math.max(local.losses, remote.losses),
      grudge: Math.max(local.grudge, remote.grudge),
      masteredKeys,
      mutations,
    },
    duels: Math.max(localDuels, remoteDuels),
  };
}

/** Local-first, so a signed-out or storage-blocked browser still gets a rival. */
export function loadNemesisIdentity(): NemesisIdentity {
  if (typeof window === "undefined") return createNemesisIdentity();
  try {
    const raw = window.localStorage.getItem(NEMESIS_STORAGE_KEY);
    if (!raw) return createNemesisIdentity();
    return sanitizeIdentity(JSON.parse(raw)) ?? createNemesisIdentity();
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
function fuseFor(word: string, level: number, hasted: boolean, fuseScale: number): number {
  const base = 800 + word.length * 340;
  const pressure = Math.max(0.68, 1 - (level - 1) * 0.026);
  return Math.round(base * pressure * fuseScale * (hasted ? 0.62 : 1));
}

export type ForgeOptions = {
  level: number;
  hasted: boolean;
  fuseScale: number;
};

export function forgeStrike(
  id: number,
  profile: WeaknessProfile,
  learned: readonly string[],
  options: ForgeOptions,
): NemesisStrike {
  const weights = weightsFor(profile, learned);
  // Memory words come from real typed text, so anything the player cannot retype here
  // — digits, punctuation, the ability binds — has to be filtered out before it is forged.
  const memories = profile.focusWords
    .map((word) => word.trim().toLocaleLowerCase())
    .filter((word) => /^[a-z'-]{3,}$/.test(word));
  const useMemory = memories.length > 0 && Math.random() < 0.22;
  const candidates = useMemory ? [] : forgeCandidates(weights, minimumLength(options.level));
  const pool = useMemory ? memories : candidates.length > 0 ? candidates : WORD_BANK;
  const word = pick(pool);
  const fuseMs = fuseFor(word, options.level, options.hasted, options.fuseScale);
  return {
    id,
    word,
    marked: !useMemory && markedFor(word, weights),
    memory: useMemory,
    fuseMs,
    remainingMs: fuseMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Combat                                                                      */
/* -------------------------------------------------------------------------- */

export function nemesisMaxHp(level: number): number {
  return 300 + (level - 1) * 36;
}

/**
 * Capped on purpose. Level 12 with a maximum grudge and a Vindictive stack would
 * otherwise reach 48 of the player's 100 HP — two burned words and the duel is over,
 * in the phase where curses are densest. Level 12 gets harder in tempo, not lethality.
 */
function fuseDamage(state: NemesisState): number {
  const { identity } = state;
  const base = Math.min(
    30,
    Math.round(11 + identity.level * 1.5 + identity.grudge + mutationStacks(identity, "vindictive")),
  );
  const scaled = base * phaseFor(state).fuseDamageScale * (state.ward > 0 ? 0.6 : 1);
  return Math.max(1, Math.round(scaled));
}

function mistakeDamage(state: NemesisState): number {
  const scaled = 3 + Math.floor(state.identity.level / 6);
  const base = state.curse?.id === "bite" ? scaled * 2 : scaled;
  return state.ward > 0 ? Math.max(1, Math.floor(base / 2)) : base;
}

function markedMultiplier(identity: NemesisIdentity): number {
  return 2 + 0.25 * mutationStacks(identity, "brittle");
}

/**
 * Your damage climbs with the rival's level alongside its health, so a duel stays roughly
 * the same length at every level. Difficulty lives in tempo, curses and the cost of a
 * slip — not in a level 12 fight that is simply three times longer.
 */
function strikeDamage(state: NemesisState, strike: NemesisStrike): number {
  const comboBonus = Math.min(7, Math.floor(state.combo / 3));
  const base = 6 + Math.floor(state.identity.level / 2) + comboBonus
    + Math.min(4, Math.floor(strike.word.length / 3));
  const clean = state.clean ? base : Math.round(base * 0.6);
  return strike.marked && state.clean
    ? Math.round(clean * markedMultiplier(state.identity))
    : clean;
}

function learnedLimit(identity: NemesisIdentity): number {
  return Math.min(LEARNED_LIMIT_MAX, LEARNED_LIMIT + mutationStacks(identity, "adaptive"));
}

function cooldownFor(identity: NemesisIdentity, ability: AbilityDefinition): number {
  const drag = Math.min(1.45, 1 + 0.15 * mutationStacks(identity, "hoarder"));
  return Math.round(ability.cooldownMs * drag);
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

function taunt(phase: BossPhase, identity: NemesisIdentity): string {
  return pick(phase.taunts).replaceAll("{sig}", identity.signature);
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

/**
 * The single place the nemesis loses health.
 *
 * Every source routes through here so the win check, the phase crossing and its taunt
 * cannot drift apart as more damage sources are added.
 */
function damageNemesis(state: NemesisState, amount: number, text: string): NemesisState {
  const nemesisHp = Math.max(0, state.nemesisHp - amount);
  const hit: NemesisState = {
    ...state,
    nemesisHp,
    struck: state.struck + 1,
    log: log(state, text, "player"),
    nextId: state.nextId + 1,
  };
  if (nemesisHp === 0) return { ...hit, phase: "won", typed: "" };

  const phase = phaseFor(hit);
  if (phase.id === hit.phaseId) return hit;
  return {
    ...hit,
    phaseId: phase.id,
    usedCurses: phase.recycleCurses ? [] : hit.usedCurses,
    log: log(hit, taunt(phase, hit.identity), "nemesis"),
    nextId: hit.nextId + 1,
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
    curseCast: state.curseCast + 1,
    log: log(state, `${curse.title} cast — ${curse.rule}`, "nemesis"),
    nextId: state.nextId + 1,
  };
}

export function createNemesisRun(
  identity: NemesisIdentity,
  profile: WeaknessProfile,
): NemesisState {
  const maxHp = nemesisMaxHp(identity.level);
  const opening = NEMESIS_PHASES[0];
  return {
    phase: "playing",
    phaseId: opening.id,
    identity,
    strike: forgeStrike(1, profile, [], {
      level: identity.level,
      hasted: false,
      fuseScale: opening.fuseScale,
    }),
    typed: "",
    curse: null,
    usedCurses: [],
    playerHp: NEMESIS_PLAYER_HP,
    nemesisHp: maxHp,
    nemesisMaxHp: maxHp,
    abilities: emptyAbilityState(),
    ward: 0,
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
    struck: 0,
    curseCast: 0,
  };
}

/** Ability cooldowns and the ward burn down in real time, not per word. */
function tickTimers(state: NemesisState, delta: number): NemesisState {
  const ward = Math.max(0, state.ward - delta);
  const cooldowns = { ...state.abilities.cooldowns };
  let changed = ward !== state.ward;
  for (const ability of ABILITIES) {
    const remaining = Math.max(0, cooldowns[ability.id] - delta);
    if (remaining === cooldowns[ability.id]) continue;
    cooldowns[ability.id] = remaining;
    changed = true;
  }
  if (!changed) return state;
  return { ...state, ward, abilities: { ...state.abilities, cooldowns } };
}

/** Burn the fuse; when it empties the nemesis lands a hit and forges the next word. */
export function advanceNemesis(
  state: NemesisState,
  deltaMs: number,
  profile: WeaknessProfile,
): NemesisState {
  if (state.phase !== "playing") return state;
  const delta = Math.min(250, Math.max(0, deltaMs));
  // Timers tick before the early return, or cooldowns freeze while the player types well.
  const ticked = tickTimers(state, delta);
  const elapsedMs = ticked.elapsedMs + delta;
  const remainingMs = ticked.strike.remainingMs - delta;
  if (remainingMs > 0) {
    return { ...ticked, elapsedMs, strike: { ...ticked.strike, remainingMs } };
  }

  const damage = fuseDamage(ticked);
  const playerHp = Math.max(0, ticked.playerHp - damage);
  const missed: NemesisState = {
    ...ticked,
    elapsedMs,
    playerHp,
    combo: 0,
    clean: true,
    typed: "",
    abilities: { ...ticked.abilities, charge: 0 },
    fusesLost: ticked.fusesLost + 1,
    impact: ticked.impact + 1,
    log: log(ticked, `"${ticked.strike.word}" burned through. −${damage} HP.`, "nemesis"),
    nextId: ticked.nextId + 1,
  };
  if (playerHp === 0) return { ...missed, phase: "lost" };
  return advanceCurseAndForge(missed, profile);
}

/** A cornered nemesis stops leaving gaps between curses; Relentless closes them further. */
function curseInterval(state: NemesisState): number {
  return Math.max(2, phaseFor(state).curseInterval - mutationStacks(state.identity, "relentless"));
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
    strike: forgeStrike(next.nextId, profile, next.learned, {
      level: next.identity.level,
      hasted: next.curse?.id === "haste",
      fuseScale: phaseFor(next).fuseScale,
    }),
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
      abilities: {
        ...state.abilities,
        charge: Math.max(0, state.abilities.charge - MISTAKE_CHARGE_LOSS),
      },
      totalKeys: state.totalKeys + 1,
      impact: state.impact + 1,
      keyDuel: learnable ? trackKey(state.keyDuel, learnable, false) : state.keyDuel,
      // Feeding the missed key back in is the whole point: it adapts mid-duel.
      learned: learnable
        ? [learnable, ...state.learned.filter((char) => char !== learnable)]
          .slice(0, learnedLimit(state.identity))
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
  const counted: NemesisState = {
    ...hit,
    combo,
    bestCombo: Math.max(hit.bestCombo, combo),
    words: hit.words + 1,
    markedCleared: hit.markedCleared + (hit.strike.marked && hit.clean ? 1 : 0),
    memoryCleared: hit.memoryCleared + (hit.strike.memory ? 1 : 0),
    wordsSinceCurse: hit.wordsSinceCurse + 1,
    abilities: {
      ...hit.abilities,
      charge: hit.clean ? Math.min(NEMESIS_CHARGE_MAX, hit.abilities.charge + 1) : hit.abilities.charge,
    },
    clean: true,
  };
  const cleared = damageNemesis(
    counted,
    damage,
    hit.strike.marked && hit.clean
      ? `Weak point struck — ${damage} damage.`
      : `${hit.strike.word} → ${damage} damage.`,
  );
  if (cleared.phase === "won") return cleared;
  return advanceCurseAndForge(cleared, profile);
}

/* -------------------------------------------------------------------------- */
/* Abilities                                                                   */
/* -------------------------------------------------------------------------- */

export type AbilityStatus = {
  id: AbilityId;
  unlocked: boolean;
  ready: boolean;
  cooldownMs: number;
  /** 0 when ready, 100 the instant it is spent — drives the cooldown sweep. */
  cooldownPercent: number;
  cost: number;
};

export function abilityStatus(state: NemesisState, id: AbilityId): AbilityStatus {
  const ability = abilityById(id);
  const cooldownMs = state.abilities.cooldowns[id];
  const total = cooldownFor(state.identity, ability);
  const unlocked = state.identity.level >= ability.unlockLevel;
  return {
    id,
    unlocked,
    ready: unlocked && cooldownMs === 0 && state.abilities.charge >= ability.cost,
    cooldownMs,
    cooldownPercent: total === 0 ? 0 : Math.min(100, (cooldownMs / total) * 100),
    cost: ability.cost,
  };
}

/**
 * Spend the shared meter on one of the kit.
 *
 * Every rejection returns the same state reference, so a mistimed keypress costs a
 * render and nothing else. Abilities never dirty the word, break the combo or touch the
 * key ledger — they buy survival, never accuracy.
 */
export function spendAbility(state: NemesisState, id: AbilityId): NemesisState {
  if (state.phase !== "playing") return state;
  const ability = abilityById(id);
  if (state.identity.level < ability.unlockLevel) return state;
  if (state.abilities.cooldowns[id] > 0) return state;
  if (state.abilities.charge < ability.cost) return state;

  const spent: NemesisState = {
    ...state,
    abilities: {
      charge: state.abilities.charge - ability.cost,
      cooldowns: { ...state.abilities.cooldowns, [id]: cooldownFor(state.identity, ability) },
      used: { ...state.abilities.used, [id]: state.abilities.used[id] + 1 },
    },
  };

  switch (id) {
    case "purge": {
      const damage = spent.curse ? 16 : 10;
      return damageNemesis(
        { ...spent, curse: null },
        damage,
        spent.curse
          ? `Purged ${curseById(spent.curse.id).title} — ${damage} damage.`
          : `Counter — ${damage} damage.`,
      );
    }
    case "brand":
      return {
        ...spent,
        // Relighting the fuse does not restore `clean`, so a fumbled word stays fumbled.
        strike: { ...spent.strike, marked: true, remainingMs: spent.strike.fuseMs },
        log: log(spent, `Branded "${spent.strike.word}". The fuse relights.`, "player"),
        nextId: spent.nextId + 1,
      };
    case "recall": {
      const forgotten = spent.learned[0];
      return {
        ...spent,
        learned: spent.learned.slice(1),
        playerHp: Math.min(NEMESIS_PLAYER_HP, spent.playerHp + 8),
        log: log(
          spent,
          forgotten ? `It forgets "${forgotten}". +8 HP.` : "Nothing fresh to take back. +8 HP.",
          "player",
        ),
        nextId: spent.nextId + 1,
      };
    }
    case "bulwark":
      return {
        ...spent,
        ward: WARD_MS,
        log: log(spent, "Bulwark holds — damage halved.", "player"),
        nextId: spent.nextId + 1,
      };
  }
}

/** Kept as the name the Tab binding has always had. */
export function purgeNemesis(state: NemesisState): NemesisState {
  return spendAbility(state, "purge");
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

/** Won without giving it a single key or a single burned word. */
export function nemesisFlawless(state: NemesisState): boolean {
  return state.phase === "won" && state.totalKeys === state.correctKeys && state.fusesLost === 0;
}

export function abilitiesUsed(state: NemesisState): number {
  return ABILITIES.reduce((sum, ability) => sum + state.abilities.used[ability.id], 0);
}

/** Every unlocked ability was used at least once this duel. */
export function usedFullKit(state: NemesisState): boolean {
  const unlocked = ABILITIES.filter((ability) => state.identity.level >= ability.unlockLevel);
  return unlocked.length === ABILITIES.length
    && unlocked.every((ability) => state.abilities.used[ability.id] > 0);
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
