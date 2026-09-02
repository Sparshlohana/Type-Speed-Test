"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { getResultDetails } from "@/app/actions/results";
import { LineChart, type Series } from "@/components/charts/LineChart";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { LoadingStatus, Skeleton } from "@/components/ui/Skeleton";
import { modeLabel } from "@/lib/engine";
import { formatDuration, formatRelativeTime, round } from "@/lib/format";
import { mean } from "@/lib/metrics";
import { resultsStore } from "@/lib/store";
import type { StoredResult } from "@/lib/storage";

const MOVING_AVERAGE_WINDOW = 10;
const CHART_HISTORY = 50;
const DAY_MS = 86_400_000;

type RangeKey = "all" | "7d" | "30d" | "90d";
type MetricKey = "wpm" | "accuracy" | "consistency" | "best";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "wpm", label: "WPM" },
  { value: "accuracy", label: "Accuracy" },
  { value: "consistency", label: "Consistency" },
  { value: "best", label: "Personal best" },
];

function movingAverage(values: number[], window: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    return mean(values.slice(start, index + 1));
  });
}

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function practiceStreak(results: readonly StoredResult[], now: number): number {
  const days = new Set(results.map((result) => localDayKey(result.ts)));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(localDayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function deltaLabel(value: number, suffix = ""): string {
  const rounded = round(value, 1);
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}

function StatsPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <LoadingStatus label="Loading your statistics" />
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <Skeleton className="mt-6 h-20 w-full rounded-xl" />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-5 h-64 w-full rounded-lg" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { results, hydrated, source, syncing } = useSyncExternalStore(
    resultsStore.subscribe,
    resultsStore.get,
    resultsStore.getServer,
  );
  const [range, setRange] = useState<RangeKey>("all");
  const [selectedMode, setSelectedMode] = useState("all");
  const [metric, setMetric] = useState<MetricKey>("wpm");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoredResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openedAt] = useState(Date.now);

  const modeOptions = useMemo(() => {
    const modes = new Map<string, string>();
    for (const result of results) modes.set(result.modeKey, modeLabel(result.mode));
    return [...modes.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [results]);

  const filtered = useMemo(() => {
    const cutoff = range === "all" ? 0 : openedAt - Number.parseInt(range, 10) * DAY_MS;
    return results.filter(
      (result) =>
        result.ts >= cutoff && (selectedMode === "all" || result.modeKey === selectedMode),
    );
  }, [openedAt, range, results, selectedMode]);

  const summary = useMemo(() => {
    if (filtered.length === 0) return null;
    return {
      average: mean(filtered.map((result) => result.wpm)),
      best: Math.max(...filtered.map((result) => result.wpm)),
      accuracy: mean(filtered.map((result) => result.accuracy)),
      consistency: mean(filtered.map((result) => result.consistency)),
      duration: filtered.reduce((sum, result) => sum + result.durationMs, 0),
      total: filtered.length,
    };
  }, [filtered]);

  const chronological = useMemo(
    () => [...filtered].reverse().slice(-CHART_HISTORY),
    [filtered],
  );

  const trendSeries = useMemo<Series[]>(() => {
    if (chronological.length === 0) return [];
    const values = chronological.map((result) => {
      if (metric === "accuracy") return result.accuracy;
      if (metric === "consistency") return result.consistency;
      return result.wpm;
    });
    if (metric === "best") {
      let best = 0;
      return [{
        id: "best",
        label: "Personal best",
        points: values.map((value, index) => {
          best = Math.max(best, value);
          return { x: index + 1, y: best };
        }),
        area: true,
      }];
    }
    const label = metric === "wpm" ? "Test WPM" : metric === "accuracy" ? "Accuracy" : "Consistency";
    return [
      {
        id: metric,
        label,
        points: values.map((value, index) => ({ x: index + 1, y: value })),
        area: true,
      },
      {
        id: "trend",
        label: `${MOVING_AVERAGE_WINDOW}-test average`,
        points: movingAverage(values, MOVING_AVERAGE_WINDOW).map((value, index) => ({
          x: index + 1,
          y: value,
        })),
        color: "var(--sub)",
        dashed: true,
      },
    ];
  }, [chronological, metric]);

  const comparison = useMemo(() => {
    const recent = filtered.slice(0, 10);
    const previous = filtered.slice(10, 20);
    if (recent.length < 10 || previous.length < 10) return null;
    return {
      recentCount: recent.length,
      previousCount: previous.length,
      wpm: mean(recent.map((result) => result.wpm)) - mean(previous.map((result) => result.wpm)),
      accuracy:
        mean(recent.map((result) => result.accuracy)) -
        mean(previous.map((result) => result.accuracy)),
      consistency:
        mean(recent.map((result) => result.consistency)) -
        mean(previous.map((result) => result.consistency)),
    };
  }, [filtered]);

  const activity = useMemo(() => {
    const byDay = new Map<string, { count: number; duration: number }>();
    for (const result of results) {
      const key = localDayKey(result.ts);
      const day = byDay.get(key) ?? { count: 0, duration: 0 };
      day.count++;
      day.duration += result.durationMs;
      byDay.set(key, day);
    }
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(openedAt);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (13 - index));
      const value = byDay.get(localDayKey(date.getTime())) ?? { count: 0, duration: 0 };
      return { date, ...value };
    });
    return { days, max: Math.max(1, ...days.map((day) => day.duration)) };
  }, [openedAt, results]);

  const byMode = useMemo(() => {
    const groups = new Map<string, { label: string; results: StoredResult[] }>();
    for (const result of filtered) {
      const existing = groups.get(result.modeKey);
      if (existing) existing.results.push(result);
      else groups.set(result.modeKey, { label: modeLabel(result.mode), results: [result] });
    }
    return [...groups.values()]
      .map((group) => ({
        label: group.label,
        tests: group.results.length,
        best: Math.max(...group.results.map((result) => result.wpm)),
        average: mean(group.results.map((result) => result.wpm)),
      }))
      .sort((a, b) => b.tests - a.tests);
  }, [filtered]);

  useEffect(() => {
    if (!selectedId) return;
    const base = results.find((result) => result.id === selectedId) ?? null;
    if (!base) return;
    if (base.samples.length > 0 || source !== "server") return;
    let cancelled = false;
    void getResultDetails(selectedId)
      .then((result) => {
        if (!cancelled && result) setDetail(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [results, selectedId, source]);

  const selectResult = (result: StoredResult) => {
    if (selectedId === result.id) {
      setSelectedId(null);
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    setSelectedId(result.id);
    setDetail(result);
    setDetailLoading(source === "server" && result.samples.length === 0);
  };

  if (!hydrated) {
    return <StatsPageSkeleton />;
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
            Finish your first test to unlock trends, comparisons, and detailed analysis.
          </p>
          <Link href="/" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white">
            Take a test
          </Link>
        </div>
      </div>
    );
  }

  const percentMetric = metric === "accuracy" || metric === "consistency";
  const detailSeries: Series[] = detail?.samples.length
    ? [
        {
          id: "wpm",
          label: "WPM",
          points: detail.samples.map((sample) => ({ x: sample.t, y: sample.wpm })),
          area: true,
        },
        {
          id: "raw",
          label: "Raw",
          points: detail.samples.map((sample) => ({ x: sample.t, y: sample.raw })),
          color: "var(--sub)",
          dashed: true,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:py-14">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Your statistics</h1>
        {syncing ? (
          <div className="mt-2">
            <LoadingStatus label="Syncing your results" />
            <Skeleton className="h-4 w-52" />
          </div>
        ) : (
          <p className="mt-1 text-sm text-sub">
            {`${source === "server" ? "Synced" : "Stored on this device"} across ${results.length} tests.`}
          </p>
        )}
      </header>

      <section className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-sub">Mode</p>
          <select
            value={selectedMode}
            onChange={(event) => {
              setSelectedMode(event.target.value);
              setSelectedId(null);
            }}
            className="mt-1.5 min-w-48 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            aria-label="Filter by test mode"
          >
            <option value="all">All modes</option>
            {modeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto pb-1">
          <Segmented
            options={RANGE_OPTIONS}
            value={range}
            onChange={(value) => {
              setRange(value);
              setSelectedId(null);
            }}
            ariaLabel="Statistics date range"
            size="sm"
          />
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border px-5 py-16 text-center">
          <p className="text-sm font-medium text-text">No tests match these filters</p>
          <p className="mt-1 text-xs text-sub">Choose another mode or a wider date range.</p>
        </div>
      ) : (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Average WPM" value={Math.round(summary?.average ?? 0)} />
            <StatTile label="Best WPM" value={Math.round(summary?.best ?? 0)} accent />
            <StatTile label="Accuracy" value={`${round(summary?.accuracy ?? 0, 1)}%`} />
            <StatTile label="Consistency" value={`${round(summary?.consistency ?? 0, 1)}%`} />
            <StatTile label="Practice time" value={formatDuration(summary?.duration ?? 0)} />
            <StatTile label="Current streak" value={`${practiceStreak(results, openedAt)}d`} hint={`${summary?.total ?? 0} filtered tests`} />
          </section>

          <section className="mt-4 rounded-xl border border-border bg-surface p-5">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-medium text-text">Progress over time</h2>
                <p className="mt-0.5 text-xs text-sub">Up to your latest {CHART_HISTORY} matching tests.</p>
              </div>
              <div className="overflow-x-auto pb-1">
                <Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} ariaLabel="Trend metric" size="sm" />
              </div>
            </div>
            <LineChart
              series={trendSeries}
              height={280}
              xLabel="matching test number"
              yLabel={percentMetric ? "percent" : "words per minute"}
              xFormat={(value) => `#${Math.round(value)}`}
              yFormat={(value) => `${round(value, percentMetric ? 1 : 0)}${percentMetric ? "%" : ""}`}
            />
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-medium text-text">Last 14 days</h2>
                  <p className="mt-0.5 text-xs text-sub">Daily practice time across all modes.</p>
                </div>
                <span className="font-mono text-xs text-sub">{practiceStreak(results, openedAt)} day streak</span>
              </div>
              <div className="mt-5 grid h-32 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5">
                {activity.days.map((day, index) => {
                  const height = day.duration === 0 ? 4 : Math.max(10, (day.duration / activity.max) * 100);
                  return (
                    <div key={day.date.toISOString()} className="flex h-full flex-col justify-end gap-1">
                      <div
                        className={`w-full rounded-sm ${day.duration > 0 ? "bg-accent" : "bg-border"}`}
                        style={{ height: `${height}%`, opacity: day.duration > 0 ? 0.55 + (index / 14) * 0.4 : 0.55 }}
                        title={`${day.date.toLocaleDateString()}: ${day.count} tests, ${formatDuration(day.duration)}`}
                      />
                      <span className="text-center text-[8px] text-sub">
                        {index % 3 === 1 ? day.date.toLocaleDateString(undefined, { weekday: "narrow" }) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-sm font-medium text-text">Recent improvement</h2>
              <p className="mt-0.5 text-xs text-sub">Latest tests compared with the previous group.</p>
              {comparison ? (
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { label: "WPM", value: comparison.wpm, suffix: "" },
                    { label: "Accuracy", value: comparison.accuracy, suffix: "%" },
                    { label: "Consistency", value: comparison.consistency, suffix: "%" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-bg p-3 text-center">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-sub">{item.label}</p>
                      <p className={`mt-2 font-mono text-xl font-semibold ${item.value >= 0 ? "text-accent" : "text-error"}`}>
                        {deltaLabel(item.value, item.suffix)}
                      </p>
                    </div>
                  ))}
                  <p className="col-span-3 text-center text-[11px] text-sub">
                    Latest {comparison.recentCount} vs previous {comparison.previousCount} matching tests
                  </p>
                </div>
              ) : (
                <div className="mt-8 rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-sub">
                  Complete at least 20 matching tests to unlock a comparison.
                </div>
              )}
            </div>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <caption className="px-5 pt-5 text-left text-sm font-medium text-text">Performance by mode</caption>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-sub">
                    <th className="px-5 py-3 font-medium">Mode</th>
                    <th className="px-3 py-3 text-right font-medium">Tests</th>
                    <th className="px-3 py-3 text-right font-medium">Avg</th>
                    <th className="px-5 py-3 text-right font-medium">Best</th>
                  </tr>
                </thead>
                <tbody>
                  {byMode.map((row) => (
                    <tr key={row.label} className="border-t border-border/60">
                      <td className="px-5 py-3 text-text">{row.label}</td>
                      <td className="px-3 py-3 text-right font-mono text-sub">{row.tests}</td>
                      <td className="px-3 py-3 text-right font-mono text-sub">{Math.round(row.average)}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-text">{Math.round(row.best)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-medium text-text">Recent matching tests</h2>
              <ul className="flex flex-col">
                {filtered.slice(0, 8).map((result) => (
                  <li key={result.id} className="border-b border-border/60 last:border-0">
                    <button
                      type="button"
                      aria-expanded={selectedId === result.id}
                      onClick={() => selectResult(result)}
                      className="flex w-full items-center justify-between gap-4 py-2.5 text-left text-sm transition-colors hover:text-accent"
                    >
                      <span className="text-sub">{modeLabel(result.mode)}</span>
                      <span className="flex items-center gap-4">
                        <span className="font-mono text-sub">{round(result.accuracy, 1)}%</span>
                        <span className="w-12 text-right font-mono font-semibold text-text">{Math.round(result.wpm)}</span>
                        <span className="hidden w-24 text-right text-xs text-sub sm:block">{formatRelativeTime(result.ts)}</span>
                        <span aria-hidden className={`text-sub transition-transform ${selectedId === result.id ? "rotate-180" : ""}`}>⌄</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {selectedId && detail ? (
            <section className="rise-in mt-4 rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent">Result details</p>
                  <h2 className="mt-1 text-lg font-semibold text-text">{modeLabel(detail.mode)} · {Math.round(detail.wpm)} WPM</h2>
                  <p className="mt-0.5 text-xs text-sub">{new Date(detail.ts).toLocaleString()}</p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Accuracy" value={`${round(detail.accuracy, 1)}%`} />
                <StatTile label="Consistency" value={`${round(detail.consistency, 1)}%`} />
                <StatTile label="Errors" value={detail.errors} />
                <StatTile label="Duration" value={formatDuration(detail.durationMs)} />
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_17rem]">
                <div className="rounded-lg border border-border bg-bg p-4">
                  <h3 className="mb-3 text-xs font-medium text-text">Speed during this test</h3>
                  {detailLoading ? (
                    <div className="h-56 pt-2">
                      <LoadingStatus label="Loading test samples" />
                      <div className="flex h-full items-end gap-2 border-b border-l border-border px-3 pb-3">
                        {[42, 64, 52, 76, 58, 84, 70, 88, 74, 92, 80, 86].map((height, index) => (
                          <Skeleton key={index} className="flex-1 rounded-t-sm" style={{ height: `${height}%` }} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <LineChart series={detailSeries} height={230} xLabel="seconds" yLabel="words per minute" xFormat={(value) => `${Math.round(value)}s`} />
                  )}
                </div>
                <div className="rounded-lg border border-border bg-bg p-4">
                  <h3 className="text-xs font-medium text-text">Character breakdown</h3>
                  <dl className="mt-3 space-y-2 text-xs">
                    {[
                      ["Correct", detail.chars.correct],
                      ["Incorrect", detail.chars.incorrect],
                      ["Extra", detail.chars.extra],
                      ["Missed", detail.chars.missed],
                      ["Keystrokes", detail.keystrokes],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
                        <dt className="text-sub">{label}</dt>
                        <dd className="font-mono text-text">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {detail.weaknesses?.words.length ? (
                    <div className="mt-4">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-sub">Problem words</p>
                      <p className="mt-1 font-mono text-xs text-error">
                        {detail.weaknesses.words.slice(0, 4).map((item) => item.word).join(" · ")}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
