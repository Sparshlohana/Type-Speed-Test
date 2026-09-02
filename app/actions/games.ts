"use server";

import { updateTag } from "next/cache";

import { updateGamePersonalBest, type GameRun } from "@/lib/db/game-storage";
import { LEADERBOARD_CACHE_TAG } from "@/lib/server/leaderboard";
import { requireUser } from "@/lib/server/session";

export type SaveGameRunResponse =
  | { ok: true; isPersonalBest: boolean }
  | { ok: false; error: string };

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateGameRun(input: unknown): GameRun | null {
  if (!input || typeof input !== "object") return null;
  const run = input as Partial<GameRun>;
  if (
    typeof run.clientId !== "string" || run.clientId.length < 1 || run.clientId.length > 128 ||
    run.gameId !== "typeraid" ||
    !Number.isInteger(run.score) || !finiteNumber(run.score, 0, 10_000_000) ||
    !Number.isInteger(run.wpm) || !finiteNumber(run.wpm, 0, 1_000) ||
    !finiteNumber(run.accuracy, 0, 100) ||
    !Number.isInteger(run.words) || !finiteNumber(run.words, 0, 10_000) ||
    !Number.isInteger(run.bestCombo) || !finiteNumber(run.bestCombo, 0, 10_000) ||
    !Number.isInteger(run.roomsCleared) || !finiteNumber(run.roomsCleared, 0, 4) ||
    (run.outcome !== "victory" && run.outcome !== "defeat") ||
    !Number.isInteger(run.durationMs) || !finiteNumber(run.durationMs, 0, 3_600_000)
  ) return null;
  if (
    run.bestCombo > run.words ||
    (run.outcome === "victory" && run.roomsCleared !== 4) ||
    (run.outcome === "defeat" && run.roomsCleared >= 4)
  ) return null;
  return run as GameRun;
}

export async function saveGameRun(input: unknown): Promise<SaveGameRunResponse> {
  const run = validateGameRun(input);
  if (!run) return { ok: false, error: "Invalid game result." };

  const user = await requireUser();
  const isPersonalBest = await updateGamePersonalBest(user, run);
  if (isPersonalBest) updateTag(LEADERBOARD_CACHE_TAG);
  return { ok: true, isPersonalBest };
}
