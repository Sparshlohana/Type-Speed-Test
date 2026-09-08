"use server";

import { readNemesisIdentity, writeNemesisIdentity } from "@/lib/db/nemesis-storage";
import { sanitizeIdentity, type NemesisIdentity } from "@/lib/games/nemesis";
import { getUser, requireUser } from "@/lib/server/session";

export type NemesisSyncResponse =
  | { ok: true; identity: NemesisIdentity; duels: number }
  | { ok: false; error: string };

/** Null for a signed-out visitor, whose rival stays entirely on their device. */
export async function getNemesisIdentity(): Promise<{ identity: NemesisIdentity; duels: number } | null> {
  const user = await getUser();
  if (!user) return null;
  return readNemesisIdentity(user.id);
}

/**
 * Push this device's copy of the rival up and get the merged one back.
 *
 * The identity is a client-authored blob — the same one the player could already edit in
 * local storage — so it is sanitized here and merged upward on the server. The worst a
 * forged payload can do is make that player's own nemesis meaner.
 */
export async function syncNemesisIdentity(input: unknown): Promise<NemesisSyncResponse> {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid nemesis." };
  const payload = input as Record<string, unknown>;
  const identity = sanitizeIdentity(payload.identity);
  if (!identity) return { ok: false, error: "Invalid nemesis." };
  if (
    !Number.isInteger(payload.duels)
    || typeof payload.duels !== "number"
    || payload.duels < 0
    || payload.duels > 1_000_000
  ) {
    return { ok: false, error: "Invalid duel count." };
  }

  const user = await requireUser();
  const merged = await writeNemesisIdentity(user.id, identity, payload.duels);
  return { ok: true, identity: merged.identity, duels: merged.duels };
}
