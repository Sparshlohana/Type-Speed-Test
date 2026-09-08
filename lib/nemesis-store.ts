"use client";

/**
 * One owner for the rival.
 *
 * The dossier, the duel and the sign-in sync all need the same identity, and the sync
 * writes to storage from outside React. Component state plus a save-on-change effect
 * would silently overwrite those writes, so the identity lives here and every reader
 * subscribes to it instead.
 */

import {
  createNemesisIdentity,
  loadNemesisIdentity,
  saveNemesisIdentity,
  type NemesisIdentity,
} from "./games/nemesis";

export type NemesisSnapshot = {
  /** False only while server-rendering, so screens can hold their skeleton. */
  hydrated: boolean;
  identity: NemesisIdentity;
  /** Lifetime duel count, the tiebreaker when two devices disagree. */
  duels: number;
  source: "local" | "server";
  syncing: boolean;
};

const EMPTY_SNAPSHOT: NemesisSnapshot = {
  hydrated: false,
  identity: createNemesisIdentity(),
  duels: 0,
  source: "local",
  syncing: false,
};

const listeners = new Set<() => void>();
let cache: NemesisSnapshot | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export const nemesisStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get(): NemesisSnapshot {
    if (cache === null) {
      cache = {
        hydrated: true,
        identity: loadNemesisIdentity(),
        duels: 0,
        source: "local",
        syncing: false,
      };
    }
    return cache;
  },
  getServer(): NemesisSnapshot {
    return EMPTY_SNAPSHOT;
  },
  /** Write-through: storage is the source of truth a reload reads back. */
  set(identity: NemesisIdentity, duels?: number): void {
    const current = nemesisStore.get();
    if (identity === current.identity && duels === undefined) return;
    cache = { ...current, hydrated: true, identity, duels: duels ?? current.duels };
    saveNemesisIdentity(identity);
    emit();
  },
  setServer(identity: NemesisIdentity, duels: number): void {
    cache = { hydrated: true, identity, duels, source: "server", syncing: false };
    saveNemesisIdentity(identity);
    emit();
  },
  setSyncing(syncing: boolean): void {
    cache = { ...nemesisStore.get(), syncing };
    emit();
  },
};
