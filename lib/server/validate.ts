import "server-only";

import { modeKey, type Mode } from "@/lib/engine";
import type { CharStats, Sample } from "@/lib/metrics";
import type { StoredResult } from "@/lib/storage";

const MODE_KEY_PATTERN = /^(time|words|quote|practice):[a-z0-9]+$/;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

type ValidationResult =
  | { ok: true; value: StoredResult }
  | { ok: false; error: string };

function finite(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validMode(value: unknown): value is Mode {
  if (!value || typeof value !== "object") return false;
  const mode = value as Partial<Mode> & Record<string, unknown>;
  if (mode.kind === "time") return finite(mode.seconds, 1, 3600);
  if (mode.kind === "words") return finite(mode.count, 1, 10_000);
  if (mode.kind === "quote") {
    return mode.length === "short" || mode.length === "medium" || mode.length === "long";
  }
  if (mode.kind === "practice") {
    return (
      finite(mode.count, 10, 200) &&
      Array.isArray(mode.focusChars) &&
      mode.focusChars.length <= 10 &&
      mode.focusChars.every((char) => typeof char === "string" && [...char].length === 1) &&
      Array.isArray(mode.focusWords) &&
      mode.focusWords.length <= 20 &&
      mode.focusWords.every((word) => typeof word === "string" && word.length <= 64)
    );
  }
  return false;
}

function validChars(value: unknown): value is CharStats {
  if (!value || typeof value !== "object") return false;
  const chars = value as Record<string, unknown>;
  return ["correct", "incorrect", "extra", "missed"].every((key) => finite(chars[key]));
}

function validSample(value: unknown): value is Sample {
  if (!value || typeof value !== "object") return false;
  const sample = value as Record<string, unknown>;
  return (
    finite(sample.t) &&
    finite(sample.wpm, 0, 400) &&
    finite(sample.raw, 0, 500) &&
    finite(sample.errors)
  );
}

function validWeaknesses(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  if (!Array.isArray(summary.keys) || summary.keys.length > 100) return false;
  if (!Array.isArray(summary.words) || summary.words.length > 100) return false;
  const keysValid = summary.keys.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    return (
      typeof item.expected === "string" &&
      item.expected.length <= 4 &&
      typeof item.actual === "string" &&
      item.actual.length <= 4 &&
      finite(item.count, 1, 10_000)
    );
  });
  const wordsValid = summary.words.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    return (
      typeof item.word === "string" &&
      item.word.length <= 64 &&
      finite(item.count, 1, 10_000)
    );
  });
  return keysValid && wordsValid;
}

export function validateResult(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid result." };
  const result = input as Record<string, unknown>;

  if (typeof result.id !== "string" || result.id.length < 1 || result.id.length > 128) {
    return { ok: false, error: "Invalid result id." };
  }
  if (!validMode(result.mode)) return { ok: false, error: "Invalid test mode." };
  if (
    typeof result.modeKey !== "string" ||
    !MODE_KEY_PATTERN.test(result.modeKey) ||
    result.modeKey !== modeKey(result.mode)
  ) {
    return { ok: false, error: "Invalid mode key." };
  }
  if (!finite(result.ts) || result.ts > Date.now() + MAX_FUTURE_SKEW_MS) {
    return { ok: false, error: "Invalid result timestamp." };
  }
  if (!finite(result.durationMs, 1)) return { ok: false, error: "Invalid duration." };
  if (!finite(result.wpm, 0, 400)) return { ok: false, error: "WPM must be between 0 and 400." };
  if (!finite(result.raw, 0, 500)) return { ok: false, error: "Invalid raw WPM." };
  if (!finite(result.accuracy, 0, 100)) return { ok: false, error: "Invalid accuracy." };
  if (!finite(result.consistency, 0, 100)) return { ok: false, error: "Invalid consistency." };
  if (!validChars(result.chars)) return { ok: false, error: "Invalid character totals." };
  if (!finite(result.keystrokes) || !finite(result.errors)) {
    return { ok: false, error: "Invalid keystroke totals." };
  }
  if (!Array.isArray(result.samples) || result.samples.length > 600 || !result.samples.every(validSample)) {
    return { ok: false, error: "Invalid result samples." };
  }
  if (!validWeaknesses(result.weaknesses)) {
    return { ok: false, error: "Invalid weakness analytics." };
  }

  return { ok: true, value: input as StoredResult };
}
