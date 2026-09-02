"use client";

import {
  applyResultToProgress,
  buildProgressFromResults,
  createEmptyProgress,
  progressForToday,
  type ProgressReward,
  type ProgressState,
} from "./progression";
import type { StoredResult } from "./storage";

const PROGRESS_KEY = "typeflow.progress";
const PROGRESS_VERSION = 1;

type ProgressSnapshot = {
  hydrated: boolean;
  progress: ProgressState;
  source: "local" | "server";
  syncing: boolean;
};

const EMPTY_SNAPSHOT: ProgressSnapshot = {
  hydrated: false,
  progress: createEmptyProgress(0),
  source: "local",
  syncing: false,
};

const listeners = new Set<() => void>();
let cache: ProgressSnapshot | null = null;

function readLocalProgress(): ProgressState | null {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; data?: ProgressState };
    return parsed.version === PROGRESS_VERSION && parsed.data?.version === 1
      ? progressForToday(parsed.data)
      : null;
  } catch {
    return null;
  }
}

function writeLocalProgress(progress: ProgressState): void {
  try {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: PROGRESS_VERSION, data: progress }),
    );
  } catch {
    // Progress remains available for this session when storage is unavailable.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

export const progressionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): ProgressSnapshot {
    if (cache === null) {
      cache = {
        hydrated: true,
        progress: readLocalProgress() ?? createEmptyProgress(),
        source: "local",
        syncing: false,
      };
    }
    return cache;
  },
  getServer(): ProgressSnapshot {
    return EMPTY_SNAPSHOT;
  },
  add(result: StoredResult): ProgressReward {
    const current = progressionStore.get();
    const applied = applyResultToProgress(current.progress, result);
    cache = { ...current, hydrated: true, progress: applied.state };
    writeLocalProgress(applied.state);
    emit();
    return applied.reward;
  },
  ensureFromResults(results: readonly StoredResult[]): void {
    const current = progressionStore.get();
    if (current.progress.totalTests > 0 || results.length === 0) return;
    const progress = buildProgressFromResults(results);
    cache = { ...current, hydrated: true, progress };
    writeLocalProgress(progress);
    emit();
  },
  setServer(progress: ProgressState): void {
    cache = { hydrated: true, progress: progressForToday(progress), source: "server", syncing: false };
    emit();
  },
  setLocal(results: readonly StoredResult[]): void {
    const progress = readLocalProgress() ?? buildProgressFromResults(results);
    cache = { hydrated: true, progress: progressForToday(progress), source: "local", syncing: false };
    writeLocalProgress(cache.progress);
    emit();
  },
  setSyncing(syncing: boolean): void {
    const current = progressionStore.get();
    cache = { ...current, syncing };
    emit();
  },
  clear(): void {
    try {
      window.localStorage.removeItem(PROGRESS_KEY);
    } catch {
      // Nothing readable to clear.
    }
    cache = { hydrated: true, progress: createEmptyProgress(), source: "local", syncing: false };
    emit();
  },
};
