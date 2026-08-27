"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";

import { LineChart, type Series } from "@/components/charts/LineChart";
import { StatTile } from "@/components/ui/Card";
import { modeLabel } from "@/lib/engine";
import { formatRelativeTime, round } from "@/lib/format";
import { mean } from "@/lib/metrics";
import { resultsStore } from "@/lib/store";
import type { StoredResult } from "@/lib/storage";

/** Window used for the trend line drawn over the raw per-test scores. */
const MOVING_AVERAGE_WINDOW = 10;
const CHART_HISTORY = 50;

function movingAverage(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    return mean(values.slice(start, index + 1));
  });
}

export default function StatsPage() {
  const { results, hydrated, source, syncing } = useSyncExternalStore(
    resultsStore.subscribe,
    resultsStore.get,
    resultsStore.getServer,
  );

  const summary = useMemo(() => {
    if (results.length === 0) return null;
    const wpms = results.map((r) => r.wpm);
    return {
      average: mean(wpms),
      best: Math.max(...wpms),
      accuracy: mean(results.map((r) => r.accuracy)),
      total: results.length,
    };
  }, [results]);

  // Oldest-to-newest so the improvement line reads left to right.
  const chronological = useMemo(
    () => [...results].reverse().slice(-CHART_HISTORY),
    [results],
  );

  const series = useMemo<Series[]>(() => {
    if (chronological.length === 0) return [];
    const wpms = chronological.map((r) => r.wpm);
    const trend = movingAverage(wpms, MOVING_AVERAGE_WINDOW);
    return [
      {
        id: "wpm",
        label: "Test WPM",
        points: wpms.map((y, index) => ({ x: index + 1, y })),
        area: true,
      },
      {
        id: "trend",
        label: `${MOVING_AVERAGE_WINDOW}-test average`,
        points: trend.map((y, index) => ({ x: index + 1, y })),
        color: "var(--sub)",
        dashed: true,
      },
    ];
  }, [chronological]);

  const byMode = useMemo(() => {
    const groups = new Map<string, { label: string; results: StoredResult[] }>();
    for (const result of results) {
      const existing = groups.get(result.modeKey);
      if (existing) existing.results.push(result);
      else groups.set(result.modeKey, { label: modeLabel(result.mode), results: [result] });
    }
    return [...groups.values()]
      .map((group) => ({
        label: group.label,
        tests: group.results.length,
        best: Math.max(...group.results.map((r) => r.wpm)),
        average: mean(group.results.map((r) => r.wpm)),
        accuracy: mean(group.results.map((r) => r.accuracy)),
      }))
      .sort((a, b) => b.tests - a.tests);
  }, [results]);

  if (!hydrated) {
    return <div className="mx-auto w-full max-w-5xl px-5 py-14 text-sm text-sub">Loading…</div>;
  }

  if (results.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-10 sm:py-14">
        {source === "local" ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-sub">
            Signed out — results are saved on this device only.
          </div>
        ) : null}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text">No tests yet</h1>
          <p className="max-w-sm text-sm text-sub">
            Your speed history, accuracy trend, and personal bests appear here once you finish your
            first test.
          </p>
          <Link
            href="/"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 ease-[var(--ease)] hover:brightness-110"
          >
            Take a test
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      {source === "local" ? (
        <div className="mb-5 rounded-lg border border-border bg-surface px-4 py-3 text-xs text-sub">
          Signed out — results are saved on this device only.
        </div>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-text">Your statistics</h1>
      <p className="mt-1 text-sm text-sub">
        {syncing
          ? "Syncing your results…"
          : `${source === "server" ? "Synced" : "Stored on this device"} across ${results.length} tests.`}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Average WPM" value={Math.round(summary?.average ?? 0)} />
        <StatTile label="Best WPM" value={Math.round(summary?.best ?? 0)} accent />
        <StatTile label="Average accuracy" value={`${round(summary?.accuracy ?? 0, 1)}%`} />
        <StatTile label="Tests completed" value={summary?.total ?? 0} />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-medium text-text">Improvement</h2>
        <LineChart
          series={series}
          height={280}
          xLabel="test number"
          yLabel="words per minute"
          xFormat={(v) => `#${Math.round(v)}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[380px] border-collapse text-sm">
            <caption className="px-5 pt-5 text-left text-sm font-medium text-text">By mode</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-sub">
                <th className="px-5 py-3 font-medium">Mode</th>
                <th className="px-5 py-3 text-right font-medium">Tests</th>
                <th className="px-5 py-3 text-right font-medium">Avg</th>
                <th className="px-5 py-3 text-right font-medium">Best</th>
              </tr>
            </thead>
            <tbody>
              {byMode.map((row) => (
                <tr key={row.label} className="border-t border-border/60">
                  <td className="px-5 py-3 text-text">{row.label}</td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-sub">
                    {row.tests}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-sub">
                    {Math.round(row.average)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums text-text">
                    {Math.round(row.best)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium text-text">Recent tests</h2>
          <ul className="flex flex-col">
            {results.slice(0, 8).map((result) => (
              <li
                key={result.id}
                className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 text-sm last:border-0"
              >
                <span className="text-sub">{modeLabel(result.mode)}</span>
                <span className="flex items-center gap-4">
                  <span className="font-mono tabular-nums text-sub">
                    {round(result.accuracy, 1)}%
                  </span>
                  <span className="w-12 text-right font-mono font-semibold tabular-nums text-text">
                    {Math.round(result.wpm)}
                  </span>
                  <span className="hidden w-24 text-right text-xs text-sub sm:block">
                    {formatRelativeTime(result.ts)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
