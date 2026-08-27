"use client";

import { useEffect } from "react";

/** One-line confirmation that fades itself out. */
export function Toast({
  message,
  onDismiss,
  duration = 2400,
}: {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(id);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fade-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text shadow-[var(--shadow)]"
    >
      {message}
    </div>
  );
}
