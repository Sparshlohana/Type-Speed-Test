"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Live subscription so a mid-session preference change takes effect immediately. */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(REDUCED_MOTION_QUERY).matches
      : false),
    () => false,
  );
}

const easeOutExpo = (t: number): number => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * Animates a number from its previous value toward `target` on rAF, starting at zero
 * on mount so a fresh score counts up. Snaps instantly under reduced motion, so
 * nothing important is conveyed by movement alone.
 */
export function useTween(target: number, durationMs = 600): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    if (reduced || durationMs <= 0) {
      valueRef.current = target;
      return;
    }

    const from = valueRef.current;
    const delta = target - from;
    if (delta === 0) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const next = progress === 1 ? target : from + delta * easeOutExpo(progress);
      valueRef.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return reduced ? target : value;
}
