import { MongoServerError, ObjectId } from "mongodb";

import { mergeIdentities, type NemesisIdentity } from "../games/nemesis.ts";
import { collections } from "./mongo.ts";

const MAX_WRITE_RETRIES = 5;

export type StoredNemesis = { identity: NemesisIdentity; duels: number };

export async function readNemesisIdentity(userId: string): Promise<StoredNemesis | null> {
  const { nemesisIdentities } = await collections();
  const document = await nemesisIdentities.findOne({ userId });
  return document ? { identity: document.identity, duels: document.duels } : null;
}

/**
 * Fold an incoming copy into the stored one under optimistic concurrency.
 *
 * The merge is upward-only and idempotent, so a retry, a second device or a repeated
 * sign-in can never cost the player a level — the meaner nemesis always survives.
 */
export async function writeNemesisIdentity(
  userId: string,
  identity: NemesisIdentity,
  duels: number,
): Promise<StoredNemesis> {
  const { nemesisIdentities } = await collections();

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const current = await nemesisIdentities.findOne({ userId });

    if (!current) {
      try {
        await nemesisIdentities.insertOne({
          _id: new ObjectId(),
          userId,
          revision: 1,
          identity,
          duels,
          updatedAt: new Date(),
        });
        return { identity, duels };
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) continue;
        throw error;
      }
    }

    const merged = mergeIdentities(identity, duels, current.identity, current.duels);
    const write = await nemesisIdentities.updateOne(
      { _id: current._id, revision: current.revision },
      {
        $set: { identity: merged.identity, duels: merged.duels, updatedAt: new Date() },
        $inc: { revision: 1 },
      },
    );
    if (write.modifiedCount > 0) return merged;
  }

  throw new Error("Nemesis changed too quickly; retry the sync.");
}
