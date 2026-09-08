"use client";

import { useEffect } from "react";

import { getNemesisIdentity, syncNemesisIdentity } from "@/app/actions/nemesis";
import { useSession } from "@/lib/auth-client";
import { loadNemesisIdentity, mergeIdentities } from "@/lib/games/nemesis";
import { nemesisStore } from "@/lib/nemesis-store";

/**
 * Keep the rival in step with the account.
 *
 * Signed out, this is a no-op beyond loading the local copy: the nemesis has always been
 * a device-local thing and stays one. Signed in, the local and server copies are merged
 * upward, so a second device inherits the rivalry instead of starting a fresh level-1
 * one, and a signed-out losing streak is absorbed rather than thrown away.
 */
export function useNemesisSync(): void {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      nemesisStore.set(loadNemesisIdentity());
      return;
    }

    let cancelled = false;
    const syncKey = `typeflow.nemesis.synced.${userId}`;

    nemesisStore.setSyncing(true);
    void (async () => {
      try {
        const local = nemesisStore.get();
        const remote = await getNemesisIdentity();
        if (cancelled) return;

        if (!remote) {
          // First sign-in on this account: the device's rival becomes the account's.
          const uploaded = await syncNemesisIdentity({
            identity: local.identity,
            duels: local.duels,
          });
          if (!cancelled && uploaded.ok) {
            nemesisStore.setServer(uploaded.identity, uploaded.duels);
            window.localStorage.setItem(syncKey, "1");
          }
          return;
        }

        const merged = mergeIdentities(local.identity, local.duels, remote.identity, remote.duels);
        nemesisStore.setServer(merged.identity, merged.duels);
        window.localStorage.setItem(syncKey, "1");

        // Only push when this device actually knew something the server did not.
        const serverIsBehind = merged.duels !== remote.duels
          || merged.identity.level !== remote.identity.level
          || merged.identity.wins !== remote.identity.wins
          || merged.identity.losses !== remote.identity.losses
          || merged.identity.grudge !== remote.identity.grudge;
        if (serverIsBehind) {
          await syncNemesisIdentity({ identity: merged.identity, duels: merged.duels });
        }
      } catch {
        if (!cancelled) nemesisStore.setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPending, userId]);
}
