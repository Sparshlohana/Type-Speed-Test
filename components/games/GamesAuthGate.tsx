"use client";

import { useState } from "react";
import Link from "next/link";

import { signIn } from "@/lib/auth-client";

function ArcadeLock() {
  return (
    <div className="relative grid h-24 w-24 place-items-center" aria-hidden>
      <div className="absolute inset-0 rounded-[2rem] bg-accent/20 blur-2xl" />
      <div className="relative grid h-20 w-20 rotate-3 place-items-center rounded-[1.65rem] border border-raid-border bg-raid-fill shadow-[0_18px_45px_-24px_color-mix(in_srgb,var(--raid-text)_38%,transparent)]">
        <svg viewBox="0 0 48 48" fill="none" className="h-11 w-11 -rotate-3">
          <path
            d="M15 21v-4a9 9 0 0 1 18 0v4"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <rect x="10" y="20" width="28" height="22" rx="7" fill="currentColor" />
          <circle cx="24" cy="30" r="3" className="fill-raid-bg" />
          <path d="M24 32v4" className="stroke-raid-bg" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <span className="absolute -right-1 top-0 h-3 w-3 rounded-full bg-[#55e6b0] shadow-[0_0_16px_#55e6b0]" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.35l-3.25-2.55c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.93A6.03 6.03 0 0 1 6.07 12c0-.67.11-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
    </svg>
  );
}

export function GamesAuthGate() {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    setSigningIn(true);
    setError("");

    try {
      await signIn.social({ provider: "google", callbackURL: window.location.pathname });
    } catch {
      setError("Sign-in could not be started. Please try again.");
      setSigningIn(false);
    }
  }

  return (
    <div className="relative isolate grid min-h-[calc(100svh-4rem)] place-items-center overflow-hidden bg-raid-bg px-5 py-12 text-raid-text">
      <div aria-hidden className="typeraid-grid absolute inset-0 -z-20 bg-[size:52px_52px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[110px]" />
      <div aria-hidden className="absolute -left-24 bottom-0 -z-10 h-64 w-64 rounded-full bg-[#55e6b0]/10 blur-[90px]" />

      <section className="w-full max-w-xl rounded-[2rem] border border-raid-border bg-raid-surface-soft p-7 text-center shadow-[0_32px_100px_-45px_color-mix(in_srgb,var(--raid-text)_45%,transparent)] backdrop-blur-xl sm:p-11">
        <div className="mx-auto w-fit text-raid-accent">
          <ArcadeLock />
        </div>

        <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-raid-success">
          Player access required
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
          Sign in to enter the arcade.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-raid-muted">
          Games are reserved for signed-in players, so your runs, scores, and future unlocks stay connected to your account.
        </p>

        <button
          type="button"
          disabled={signingIn}
          onClick={() => void handleSignIn()}
          className="mx-auto mt-8 flex min-h-12 w-full max-w-sm items-center justify-center gap-3 rounded-xl bg-raid-text px-5 py-3 text-sm font-semibold text-raid-bg shadow-[0_12px_35px_-18px_color-mix(in_srgb,var(--raid-text)_50%,transparent)] transition duration-200 hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-wait disabled:opacity-65 disabled:hover:translate-y-0"
        >
          {signingIn ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-raid-bg/25 border-t-raid-bg" aria-hidden />
          ) : (
            <GoogleMark />
          )}
          {signingIn ? "Opening sign in…" : "Continue with Google"}
        </button>

        {error ? <p className="mt-3 text-xs text-error" role="alert">{error}</p> : null}

        <div className="mt-7 border-t border-raid-border pt-6">
          <p className="text-xs text-raid-faint">Typing tests and practice are still available without an account.</p>
          <Link href="/" className="mt-3 inline-flex text-xs font-semibold text-accent transition-colors hover:text-raid-text">
            Back to typing test →
          </Link>
        </div>
      </section>
    </div>
  );
}
