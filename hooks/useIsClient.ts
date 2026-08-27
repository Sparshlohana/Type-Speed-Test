"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False during server render and the hydration pass, true afterwards.
 *
 * Anything whose first render is genuinely non-deterministic — random words, stored
 * results — must wait for this instead of guessing at render time, or the server HTML
 * and the client's first render disagree.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
