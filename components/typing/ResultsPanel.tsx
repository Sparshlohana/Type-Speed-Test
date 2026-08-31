"use client";

import { useCallback, useMemo, useState } from "react";

import { LineChart, type Marker, type Series } from "@/components/charts/LineChart";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/Card";
import { Confetti } from "@/components/ui/Confetti";
import { Toast } from "@/components/ui/Toast";
import type { FinishedResult, PersonalBestMetric } from "@/hooks/useTypingTest";
import { modeLabel } from "@/lib/engine";
import { formatDuration, round } from "@/lib/format";
import { totalTypedChars } from "@/lib/metrics";
import type { Quote } from "@/lib/words";

const BEST_LABELS: Record<PersonalBestMetric, string> = {
  wpm: "WPM",
  raw: "raw WPM",
  accuracy: "accuracy",
  consistency: "consistency",
};

function bestLabels(metrics: readonly PersonalBestMetric[]): string {
  return metrics.map((metric) => BEST_LABELS[metric]).join(" · ");
}

function buildShareText(finished: FinishedResult): string {
  const { result } = finished;
  return [
    `TypeFlow — ${modeLabel(result.mode)}`,
    result.mode.kind === "daily" ? `Challenge ${result.mode.challengeId}` : null,
    `${Math.round(result.wpm)} WPM · ${round(result.accuracy, 1)}% accuracy · ${Math.round(result.consistency)}% consistency`,
    finished.personalBests.length > 0
      ? `New records: ${bestLabels(finished.personalBests)}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function ResultsPanel({
  finished,
  quote,
  onRetry,
  onNewTest,
}: {
  finished: FinishedResult;
  quote: Quote | null;
  onRetry: () => void;
  onNewTest: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const { result, previousBest, personalBests } = finished;

  const series = useMemo<Series[]>(
    () => [
      {
        id: "wpm",
        label: "WPM",
        points: result.samples.map((s) => ({ x: s.t, y: s.wpm })),
        area: true,
      },
      {
        id: "raw",
        label: "Raw",
        points: result.samples.map((s) => ({ x: s.t, y: s.raw })),
        color: "var(--sub)",
        dashed: true,
      },
    ],
    [result.samples],
  );

  // A marker for each second in which at least one wrong key was pressed.
  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = [];
    let previous = 0;
    for (const sample of result.samples) {
      const delta = sample.errors - previous;
      if (delta > 0) {
        out.push({ x: sample.t, y: 0, label: `${delta} error${delta === 1 ? "" : "s"} at ${sample.t}s` });
      }
      previous = sample.errors;
    }
    return out;
  }, [result.samples]);

  const share = useCallback(async () => {
    const text = buildShareText(finished);
    const url =
      result.mode.kind === "daily" && typeof window !== "undefined"
        ? `${window.location.origin}/daily`
        : undefined;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "TypeFlow result", text, url });
        return;
      }
      await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
      setToast("Result copied to clipboard");
    } catch {
      setToast("Couldn't share — copy it manually");
    }
  }, [finished, result.mode]);

  const delta = previousBest === null ? null : result.wpm - previousBest;
  const typed = totalTypedChars(result.chars);

  return (
    <section className="w-full">
      <Confetti label={modeLabel(result.mode)} />
      <div className="rise-in flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-sub">
            Words per minute
          </p>
          <p className="mt-1 font-mono text-7xl font-semibold leading-none text-accent sm:text-8xl">
            <AnimatedNumber value={result.wpm} duration={900} />
          </p>
          <p className="mt-3 text-sm text-sub">
            {modeLabel(result.mode)} · {formatDuration(result.durationMs)}
            {quote ? ` · ${quote.author}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-sub">Accuracy</p>
            <p className="mt-1 font-mono text-4xl font-semibold text-text">
              <AnimatedNumber value={result.accuracy} decimals={1} duration={900} suffix="%" />
            </p>
          </div>
          {personalBests.length > 0 ? (
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent ring-1 ring-[color-mix(in_srgb,var(--accent)_40%,transparent)]">
              New records: {bestLabels(personalBests)}
            </span>
          ) : delta !== null ? (
            <span className="rounded-full bg-surface px-3 py-1 text-xs text-sub">
              {delta >= 0 ? "+" : ""}
              {Math.round(delta)} WPM vs your best ({Math.round(previousBest ?? 0)})
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="rise-in mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        style={{ animationDelay: "80ms" }}
      >
        <StatTile label="Raw WPM" value={Math.round(result.raw)} />
        <StatTile label="Consistency" value={`${Math.round(result.consistency)}%`} />
        <StatTile label="Characters" value={typed} />
        <StatTile label="Correct" value={result.chars.correct} />
        <StatTile label="Incorrect" value={result.chars.incorrect + result.chars.extra} />
        <StatTile label="Errors" value={result.errors} hint={`${result.keystrokes} keystrokes`} />
      </div>

      <div
        className="rise-in mt-4 rounded-xl border border-border bg-surface p-5"
        style={{ animationDelay: "140ms" }}
      >
        <h2 className="mb-4 text-sm font-medium text-text">Speed over time</h2>
        <LineChart
          series={series}
          markers={markers}
          height={260}
          xLabel="seconds"
          yLabel="words per minute"
          xFormat={(v) => `${Math.round(v)}s`}
        />
      </div>

      <div
        className="rise-in mt-6 flex flex-wrap items-center gap-3"
        style={{ animationDelay: "200ms" }}
      >
        <Button variant="primary" onClick={onRetry}>
          Try Again
        </Button>
        <Button onClick={onNewTest}>New Test</Button>
        <Button variant="ghost" onClick={share}>
          Share Result
        </Button>
        <span className="ml-auto hidden text-xs text-sub sm:block">
          Press <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">Tab</kbd> to
          restart
        </span>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}
