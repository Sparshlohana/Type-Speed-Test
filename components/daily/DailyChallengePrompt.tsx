"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { hasCompletedDailyChallenge } from "@/app/actions/daily";
import {
  dailyChallengeAt,
  dismissDailyPrompt,
  hasLocalDailyCompletion,
  wasDailyPromptDismissed,
} from "@/lib/daily";
import { useSession } from "@/lib/auth-client";

export function DailyChallengePrompt() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [challenge] = useState(() => dailyChallengeAt(Date.now()));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname !== "/" || isPending) return;
    if (hasLocalDailyCompletion(challenge.id) || wasDailyPromptDismissed(challenge.id)) return;

    let cancelled = false;
    if (!session?.user) {
      queueMicrotask(() => {
        if (!cancelled) setVisible(true);
      });
      return () => {
        cancelled = true;
      };
    }

    void hasCompletedDailyChallenge(challenge.id)
      .then((completed) => {
        if (!cancelled && !completed) setVisible(true);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, [challenge.id, isPending, pathname, session?.user]);

  if (!visible || pathname !== "/") return null;

  const dismiss = () => {
    dismissDailyPrompt(challenge.id);
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-5 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-prompt-title"
        className="rise-in w-full max-w-sm rounded-2xl border border-border bg-bg p-6 shadow-[var(--shadow)]"
      >
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft font-mono text-sm font-bold text-accent">
          50
        </div>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          Daily challenge
        </p>
        <h2 id="daily-prompt-title" className="mt-1 text-xl font-semibold tracking-tight text-text">
          Today&apos;s challenge is waiting
        </h2>
        <p className="mt-2 text-sm leading-6 text-sub">
          Type the same 50 words as everyone else and see where you rank today.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/daily"
            onClick={() => setVisible(false)}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            Take today&apos;s challenge
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-sub transition-colors hover:bg-surface hover:text-text"
          >
            Maybe later
          </button>
        </div>
        <p className="mt-4 text-center text-[11px] text-sub">Resets at midnight IST</p>
      </section>
    </div>
  );
}
