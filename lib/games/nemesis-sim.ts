/**
 * Nemesis balance simulator.
 *
 * There is no test runner here and a duel takes minutes to play by hand, so the only
 * practical way to check that level 12 is hard rather than impossible is to have a
 * virtual typist play thousands of them against the real reducer.
 *
 *   node --experimental-strip-types lib/games/nemesis-sim.ts [duelsPerCell]
 *
 * Prints the win rate per level for a fresh rival and for the worst case a losing
 * streak can build: maximum grudge with every hostile mutation fully stacked.
 */

import {
  ABILITIES,
  MUTATIONS,
  MUTATION_STACK_LIMIT,
  NEMESIS_MAX_LEVEL,
  abilityStatus,
  advanceNemesis,
  createNemesisIdentity,
  createNemesisRun,
  spendAbility,
  strikeTarget,
  typeNemesisKey,
  type NemesisIdentity,
  type NemesisState,
} from "./nemesis.ts";
import type { WeaknessProfile } from "../weakness.ts";

const PROFILE: WeaknessProfile = {
  keyErrors: [],
  wordErrors: [],
  focusChars: ["e", "r", "t", "i", "o", "n"],
  focusWords: [],
  totalErrors: 0,
  hasHistory: true,
};

/** Curses cost a real player accuracy; the sim pays for them too. */
function errorRate(state: NemesisState, base: number): number {
  const curse = state.curse?.id;
  if (curse === "veil") return base * 2.6;
  if (curse === "mirror") return base * 2.2;
  if (curse === "haste") return base * 1.2;
  return base;
}

/** A competent but not optimal player: spend on survival, brand when the fuse is short. */
function act(state: NemesisState): NemesisState {
  const ready = (id: (typeof ABILITIES)[number]["id"]) => abilityStatus(state, id).ready;
  if (state.curse && ready("purge")) return spendAbility(state, "purge");
  if (state.playerHp < 45 && ready("bulwark")) return spendAbility(state, "bulwark");
  if (state.playerHp < 60 && ready("recall")) return spendAbility(state, "recall");
  if (state.strike.remainingMs / state.strike.fuseMs < 0.35 && ready("brand")) {
    return spendAbility(state, "brand");
  }
  return state;
}

function duel(identity: NemesisIdentity, wpm: number, accuracy: number): boolean {
  const msPerKey = 60_000 / (wpm * 5);
  let state = createNemesisRun(identity, PROFILE);
  const base = 1 - accuracy;

  // Generous ceiling: a duel this long has already decided itself.
  for (let step = 0; step < 20_000 && state.phase === "playing"; step++) {
    state = advanceNemesis(state, msPerKey, PROFILE);
    if (state.phase !== "playing") break;
    state = act(state);
    if (state.phase !== "playing") break;

    const expected = strikeTarget(state)[state.typed.length] ?? "";
    const wrong = Math.random() < errorRate(state, base);
    state = typeNemesisKey(state, wrong ? (expected === "z" ? "q" : "z") : expected, PROFILE);
  }
  return state.phase === "won";
}

function worstCase(level: number): NemesisIdentity {
  return {
    ...createNemesisIdentity("e"),
    level,
    grudge: 10,
    mutations: MUTATIONS
      .filter((mutation) => !mutation.onWin)
      .map((mutation) => ({ id: mutation.id, stacks: MUTATION_STACK_LIMIT })),
  };
}

function winRate(identity: NemesisIdentity, duels: number, wpm: number, accuracy: number): number {
  let wins = 0;
  for (let index = 0; index < duels; index++) if (duel(identity, wpm, accuracy)) wins++;
  return (wins / duels) * 100;
}

const duels = Number(process.argv[2]) || 200;
const typists: { label: string; wpm: number; accuracy: number }[] = [
  { label: "40wpm/94%", wpm: 40, accuracy: 0.94 },
  { label: "60wpm/97%", wpm: 60, accuracy: 0.97 },
  { label: "85wpm/98%", wpm: 85, accuracy: 0.98 },
];

console.log(`Nemesis balance — ${duels} duels per cell, win rate %\n`);
for (const typist of typists) {
  const fresh: string[] = [];
  const worst: string[] = [];
  for (let level = 1; level <= NEMESIS_MAX_LEVEL; level++) {
    fresh.push(
      winRate({ ...createNemesisIdentity("e"), level }, duels, typist.wpm, typist.accuracy)
        .toFixed(0).padStart(3),
    );
    worst.push(winRate(worstCase(level), duels, typist.wpm, typist.accuracy).toFixed(0).padStart(3));
  }
  console.log(typist.label.padEnd(12), "levels 1..12");
  console.log("  fresh      ", fresh.join(" "));
  console.log("  grudge+max ", worst.join(" "), "\n");
}
