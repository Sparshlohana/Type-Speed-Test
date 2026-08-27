/**
 * Tiny external stores over localStorage with optional signed-in server results.
 *
 * Screens subscribe with `useSyncExternalStore` rather than copying storage into
 * component state inside an effect: one source of truth, no cascading renders, and
 * a finished test immediately shows up on the stats and leaderboard pages.
 */

import {
  DEFAULT_SETTINGS,
  clearAllData,
  loadResults,
  loadSettings,
  saveResult,
  saveSettings,
  type Settings,
  type StoredResult,
} from "./storage";
import { saveResult as saveServerResult } from "@/app/actions/results";

type Listener = () => void;

function createEmitter() {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of listeners) listener();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

const settingsEmitter = createEmitter();
let settingsCache: Settings | null = null;

export const settingsStore = {
  subscribe: settingsEmitter.subscribe,
  /** Lazily hydrated once, then a stable reference until something changes. */
  get(): Settings {
    if (settingsCache === null) settingsCache = loadSettings();
    return settingsCache;
  },
  getServer(): Settings {
    return DEFAULT_SETTINGS;
  },
  update(patch: Partial<Settings>): Settings {
    const next = { ...settingsStore.get(), ...patch };
    settingsCache = next;
    saveSettings(next);
    settingsEmitter.emit();
    return next;
  },
  reset(): void {
    settingsCache = DEFAULT_SETTINGS;
    saveSettings(DEFAULT_SETTINGS);
    settingsEmitter.emit();
  },
};

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export type ResultsSnapshot = {
  /** False only while server-rendering and hydrating, so screens can hold their skeleton. */
  hydrated: boolean;
  results: StoredResult[];
  source: "local" | "server";
  syncing: boolean;
};

const EMPTY_SNAPSHOT: ResultsSnapshot = {
  hydrated: false,
  results: [],
  source: "local",
  syncing: false,
};

const resultsEmitter = createEmitter();
let resultsCache: ResultsSnapshot | null = null;

export const resultsStore = {
  subscribe: resultsEmitter.subscribe,
  get(): ResultsSnapshot {
    if (resultsCache === null) {
      resultsCache = {
        hydrated: true,
        results: loadResults(),
        source: "local",
        syncing: false,
      };
    }
    return resultsCache;
  },
  getServer(): ResultsSnapshot {
    return EMPTY_SNAPSHOT;
  },
  add(result: StoredResult): void {
    saveResult(result);
    const current = resultsStore.get();
    const results = [result, ...current.results.filter((item) => item.id !== result.id)].slice(0, 200);
    resultsCache = { ...current, hydrated: true, results };
    resultsEmitter.emit();
    void saveServerResult(result).catch(() => {
      // The local write already succeeded; sync can retry this result later.
    });
  },
  setSyncing(syncing: boolean): void {
    const current = resultsStore.get();
    resultsCache = { ...current, syncing };
    resultsEmitter.emit();
  },
  setServerResults(results: StoredResult[]): void {
    resultsCache = { hydrated: true, results, source: "server", syncing: false };
    resultsEmitter.emit();
  },
  setLocalResults(results: StoredResult[]): void {
    resultsCache = { hydrated: true, results, source: "local", syncing: false };
    resultsEmitter.emit();
  },
  clear(): void {
    clearAllData();
    resultsCache = { hydrated: true, results: [], source: "local", syncing: false };
    settingsCache = DEFAULT_SETTINGS;
    resultsEmitter.emit();
    settingsEmitter.emit();
  },
};
