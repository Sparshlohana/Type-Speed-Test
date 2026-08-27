"use client";

import { useEffect } from "react";

import { listResults, syncLocalResults } from "@/app/actions/results";
import { useSession } from "@/lib/auth-client";
import { resultsStore } from "@/lib/store";
import { loadResults } from "@/lib/storage";

export function useResultsSync(): void {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      resultsStore.setLocalResults(loadResults());
      return;
    }

    let cancelled = false;
    const syncKey = `typeflow.synced.${userId}`;

    resultsStore.setSyncing(true);
    void (async () => {
      try {
        const alreadySynced = window.localStorage.getItem(syncKey) === "1";
        if (!alreadySynced) {
          const response = await syncLocalResults(loadResults());
          if (!response.ok) throw new Error(response.error || "Result sync failed.");
          window.localStorage.setItem(syncKey, "1");
        }
        const serverResults = await listResults();
        if (!cancelled) resultsStore.setServerResults(serverResults);
      } catch {
        if (!cancelled) resultsStore.setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPending, userId]);
}

export function ResultsSync({ children }: { children: React.ReactNode }) {
  useResultsSync();
  return children;
}
