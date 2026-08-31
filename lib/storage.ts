/**
 * Local-first persistence used for signed-out visitors and as an offline fallback.
 *
 * Every access is guarded: private-mode browsers and blocked site data must still
 * render a fully working app on defaults rather than throwing during a render.
 */

import { modeKey, type Mode } from "./engine";
import type { CharStats, Sample } from "./metrics";
import type { WeaknessSummary } from "./weakness";

export const STORAGE_KEYS = {
  results: "typeflow.results",
  settings: "typeflow.settings",
} as const;

/** Bump when a stored shape changes incompatibly; older blobs are discarded, not crashed on. */
const SCHEMA_VERSION = 1;
const MAX_RESULTS = 200;

export type StoredResult = {
  id: string;
  /** Epoch ms. */
  ts: number;
  mode: Mode;
  modeKey: string;
  durationMs: number;
  wpm: number;
  raw: number;
  accuracy: number;
  consistency: number;
  chars: CharStats;
  keystrokes: number;
  errors: number;
  samples: Sample[];
  /** Optional so results saved before adaptive analytics remain readable. */
  weaknesses?: WeaknessSummary;
};

export type ThemePreference = "dark" | "light" | "system";
export type AccentName = "violet" | "blue" | "emerald" | "amber";
export type CaretStyle = "line" | "block" | "underline";

export type Settings = {
  theme: ThemePreference;
  accent: AccentName;
  sound: boolean;
  smoothCaret: boolean;
  caretStyle: CaretStyle;
  username: string;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: "violet",
  sound: false,
  smoothCaret: true,
  caretStyle: "line",
  username: "You",
};

export const ACCENT_HEX: Record<AccentName, string> = {
  violet: "#7C5CFF",
  blue: "#3B82F6",
  emerald: "#10B981",
  amber: "#F59E0B",
};

type Envelope<T> = { version: number; data: T };

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readEnvelope<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || parsed.version !== SCHEMA_VERSION) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeEnvelope<T>(key: string, data: T): void {
  if (!canUseStorage()) return;
  try {
    const envelope: Envelope<T> = { version: SCHEMA_VERSION, data };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or storage blocked — the app keeps working, it just forgets.
  }
}

export function loadSettings(): Settings {
  const stored = readEnvelope<Partial<Settings>>(STORAGE_KEYS.settings);
  if (!stored) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings: Settings): void {
  writeEnvelope(STORAGE_KEYS.settings, settings);
}

export function loadResults(): StoredResult[] {
  const stored = readEnvelope<StoredResult[]>(STORAGE_KEYS.results);
  if (!Array.isArray(stored)) return [];
  return stored.filter((r) => r && typeof r.wpm === "number");
}

/** Newest first, capped so a heavy user never fills their quota. */
export function saveResult(result: StoredResult): StoredResult[] {
  const next = [result, ...loadResults()].slice(0, MAX_RESULTS);
  writeEnvelope(STORAGE_KEYS.results, next);
  return next;
}

export function clearAllData(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEYS.results);
    window.localStorage.removeItem(STORAGE_KEYS.settings);
  } catch {
    // Nothing to do — there was nothing readable to clear.
  }
}

/** Best WPM for a given mode, excluding a result you want to compare against. */
export function personalBest(results: readonly StoredResult[], mode: Mode, excludeId?: string): StoredResult | null {
  const key = modeKey(mode);
  let best: StoredResult | null = null;
  for (const result of results) {
    if (result.modeKey !== key) continue;
    if (excludeId && result.id === excludeId) continue;
    if (!best || result.wpm > best.wpm) best = result;
  }
  return best;
}

export function createResultId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
