"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import {
  ACHIEVEMENTS,
  DAILY_GOALS,
  levelProgress,
} from "@/lib/progression";
import { progressionStore } from "@/lib/progression-store";
import { formatDuration } from "@/lib/format";

function ProgressSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <LoadingStatus label="Loading your progress" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      <Skeleton className="mt-8 h-48 rounded-2xl" />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
    </div>
  );
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
}

export default function ProgressPage() {
  const { progress, hydrated, source, syncing } = useSyncExternalStore(
    progressionStore.subscribe,
    progressionStore.get,
    progressionStore.getServer,
  );

  if (!hydrated) return <ProgressSkeleton />;

  const level = levelProgress(progress);
  const unlockedCount = Object.keys(progress.achievements).length;
  const nextStreak = [3, 7, 30].find((days) => days > progress.currentStreak);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">Goals & rewards</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">Your progression</h1>
          <p className="mt-1 text-sm text-sub">Build a daily rhythm, earn XP, and unlock milestones as you improve.</p>
        </div>
        <p className="text-xs text-sub">
          {syncing ? "Syncing progress…" : source === "server" ? "Synced to your account" : "Saved on this device"}
        </p>
      </div>

      <section className="relative mt-8 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-[radial-gradient(circle_at_85%_20%,var(--accent-soft),transparent_38%),var(--surface)] p-6 sm:p-8">
        <div className="flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-sub">Current level</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="font-mono text-6xl font-semibold leading-none text-accent sm:text-7xl">{level.level}</span>
              <span className="text-sm text-sub">{compact(progress.xp)} total XP</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-80">
            <div className="rounded-xl border border-border bg-bg/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-sub">Current streak</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-text">{progress.currentStreak} days</p>
            </div>
            <div className="rounded-xl border border-border bg-bg/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-sub">Longest streak</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-text">{progress.longestStreak} days</p>
            </div>
          </div>
        </div>
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between text-xs text-sub">
            <span>{level.current} / {level.required} XP</span>
            <span>{level.required - level.current} XP to level {level.level + 1}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={level.required} aria-valuenow={level.current}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${level.percent}%` }} />
          </div>
        </div>
      </section>

      <section className="mt-9">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text">Today&apos;s goals</h2>
            <p className="mt-1 text-xs text-sub">Goals reset daily at midnight IST. Each reward is claimed once.</p>
          </div>
          <span className="font-mono text-xs text-sub">{progress.daily.claimed.length}/3 complete</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {DAILY_GOALS.map((goal) => {
            const value = goal.value(progress.daily);
            const completed = progress.daily.claimed.includes(goal.id);
            const percent = Math.min(100, (value / goal.target) * 100);
            return (
              <article key={goal.id} className={`rounded-xl border p-5 ${completed ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-accent-soft" : "border-border bg-surface"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-text">{goal.title}</h3>
                    <p className="mt-1 text-xs text-sub">{goal.description}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-semibold ${completed ? "bg-accent text-white" : "bg-bg text-accent"}`}>
                    {completed ? "CLAIMED" : `+${goal.xp} XP`}
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between text-xs">
                  <span className="font-mono text-text">{goal.format(value)}</span>
                  <span className="text-sub">{Math.round(percent)}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Tests completed", compact(progress.totalTests)],
          ["Practice time", formatDuration(progress.totalDurationMs)],
          ["Correct characters", compact(progress.totalCorrectChars)],
          ["Best speed", `${Math.round(progress.bestWpm)} WPM`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sub">{label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-text">{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text">Achievements</h2>
            <p className="mt-1 text-xs text-sub">Permanent milestones with one-time XP rewards.</p>
          </div>
          <p className="font-mono text-xs text-sub">{unlockedCount}/{ACHIEVEMENTS.length} unlocked</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACHIEVEMENTS.map((achievement) => {
            const unlockedAt = progress.achievements[achievement.id];
            return (
              <article key={achievement.id} className={`flex gap-4 rounded-xl border p-4 ${unlockedAt ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-surface" : "border-border bg-surface/50 opacity-60"}`}>
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl font-mono text-xs font-bold ${unlockedAt ? "bg-accent text-white" : "bg-bg text-sub"}`} aria-hidden>
                  {achievement.symbol}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-text">{achievement.title}</h3>
                    <span className="shrink-0 font-mono text-[10px] text-accent">+{achievement.xp}</span>
                  </div>
                  <p className="mt-1 text-xs text-sub">{achievement.description}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-sub">
                    {unlockedAt ? `Unlocked ${new Date(unlockedAt).toLocaleDateString()}` : "Locked"}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-text">
            {nextStreak ? `${nextStreak - progress.currentStreak} days to your next streak badge` : "30-day streak badge earned"}
          </h2>
          <p className="mt-1 text-xs text-sub">Complete at least one test each day to keep the streak alive.</p>
        </div>
        <Link href="/" className="shrink-0 rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white transition-opacity hover:opacity-90">
          Start a test
        </Link>
      </section>
    </div>
  );
}
