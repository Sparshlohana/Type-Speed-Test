import Link from "next/link";

import { buildWeaknessAnalytics, type KeyWeakness } from "@/lib/weakness";
import type { StoredResult } from "@/lib/storage";

type KeyShape = { key: string; label?: string; width?: number };

const KEYBOARD: readonly (readonly KeyShape[])[] = [
  "1234567890-=".split("").map((key) => ({ key })),
  "qwertyuiop[]\\".split("").map((key) => ({ key })),
  "asdfghjkl;'".split("").map((key) => ({ key })),
  "zxcvbnm,./".split("").map((key) => ({ key })),
  [{ key: " ", label: "space", width: 6 }],
];

function Key({ shape, weakness }: {
  shape: KeyShape;
  weakness?: KeyWeakness;
}) {
  const hasAccuracy = weakness?.accuracy !== null && weakness?.accuracy !== undefined;
  const accuracy = weakness?.accuracy ?? 100;
  const missRate = Math.max(0, (100 - accuracy) / 100);
  const misses = (weakness?.attempts ?? 0) - (weakness?.correct ?? 0);
  const label = hasAccuracy
    ? `${shape.label ?? shape.key}: ${accuracy.toFixed(1)}% accuracy across ${weakness?.attempts} attempts, ${misses} misses`
    : `${shape.label ?? shape.key}: no accuracy sample yet`;

  return (
    <div
      title={label}
      aria-label={label}
      className="flex h-10 shrink-0 flex-col items-center justify-center rounded-md border font-mono transition-colors sm:h-11"
      style={{
        width: `${(shape.width ?? 1) * 2.55}rem`,
        borderColor: hasAccuracy
          ? missRate > 0
            ? `color-mix(in srgb, var(--error) ${35 + missRate * 45}%, var(--border))`
            : "color-mix(in srgb, var(--accent) 35%, var(--border))"
          : "var(--border)",
        background: hasAccuracy
          ? missRate > 0
            ? `color-mix(in srgb, var(--error) ${10 + missRate * 50}%, var(--bg))`
            : "color-mix(in srgb, var(--accent) 10%, var(--bg))"
          : "var(--bg)",
        color: hasAccuracy ? "var(--text)" : "var(--sub)",
      }}
    >
      <span className="text-xs uppercase">{shape.label ?? shape.key}</span>
      {hasAccuracy ? (
        <span className={`text-[9px] ${misses > 0 ? "text-error" : "text-accent"}`}>
          {accuracy.toFixed(accuracy === 100 ? 0 : 1)}%
        </span>
      ) : null}
    </div>
  );
}

function KeyboardHeatmap({ keys }: { keys: KeyWeakness[] }) {
  const byKey = new Map(keys.map((key) => [key.key, key]));

  return (
    <div className="overflow-x-auto pb-2">
      <div
        role="group"
        aria-label="QWERTY keyboard heatmap of per-key accuracy"
        className="mx-auto min-w-[42rem] space-y-1.5"
      >
        {KEYBOARD.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex justify-center gap-1.5"
            style={{ paddingInlineStart: `${[0, 0.6, 1.2, 2.1, 0][rowIndex]}rem` }}
          >
            {row.map((shape) => (
              <Key key={shape.key} shape={shape} weakness={byKey.get(shape.key)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function displayKey(value: string): string {
  if (!value) return "extra";
  if (value === " ") return "space";
  return value;
}

export function WeaknessAnalytics({ results }: { results: readonly StoredResult[] }) {
  const analytics = buildWeaknessAnalytics(results);
  const accuracyKeys = analytics.keys.filter((key) => key.accuracy !== null);
  const rankedAccuracyKeys = accuracyKeys.filter((key) => key.attempts >= 3);
  const weakestKey = [...(rankedAccuracyKeys.length > 0 ? rankedAccuracyKeys : accuracyKeys)]
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100) || b.attempts - a.attempts)[0];
  const trackedFingers = analytics.fingers.filter((finger) => finger.accuracy !== null);
  const weakestFinger = [...trackedFingers]
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100) || b.attempts - a.attempts)[0];
  const topPair = analytics.keyErrors[0];
  const hasSignals = analytics.trackedAttempts > 0 || analytics.totalKeyErrors > 0 || analytics.totalWordErrors > 0;

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            Weakness analytics
          </p>
          <h2 className="mt-1 text-lg font-semibold text-text">Where your accuracy breaks down</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-sub">
            Per-key accuracy from the matching tests, plus the exact substitutions and words behind
            your mistakes.
          </p>
        </div>
        <Link
          href="/practice"
          className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-center text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          Practice weak keys
        </Link>
      </div>

      {!hasSignals ? (
        <div className="mt-5 rounded-lg border border-dashed border-border bg-bg px-5 py-10 text-center">
          <p className="text-sm font-medium text-text">No weakness signals in these tests</p>
          <p className="mt-1 text-xs text-sub">
            {analytics.analyzedTests > 0
              ? "Clean work. Widen the filters or keep typing to build a larger sample."
              : "These results predate mistake tracking. Complete a new test to start the heatmap."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-sub">Key accuracy</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-text">
                {analytics.overallAccuracy === null ? "—" : `${analytics.overallAccuracy.toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-sub">{analytics.trackedAttempts} tracked attempts</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-sub">Weakest key</p>
              <p className="mt-1 font-mono text-2xl font-semibold uppercase text-error">
                {weakestKey?.key === " " ? "space" : weakestKey?.key ?? "—"}
              </p>
              <p className="text-[10px] text-sub">
                {weakestKey?.accuracy === null || weakestKey?.accuracy === undefined
                  ? "No accuracy sample"
                  : `${weakestKey.accuracy.toFixed(1)}% across ${weakestKey.attempts}`}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-sub">Problem-word signals</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-text">{analytics.totalWordErrors}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-sub">Tests analysed</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-text">{analytics.accuracyTests}</p>
              <p className="text-[10px] text-sub">of {results.length} matching</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-bg p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-text">Keyboard heatmap</h3>
                <p className="mt-0.5 text-[11px] text-sub">Standard QWERTY · hover a key for attempts and misses</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-sub" aria-hidden>
                <span>Higher accuracy</span>
                {[0.16, 0.38, 0.68, 1].map((opacity) => (
                  <span
                    key={opacity}
                    className="h-3 w-5 rounded-sm border border-border"
                    style={{ background: `color-mix(in srgb, var(--error) ${opacity * 50}%, var(--bg))` }}
                  />
                ))}
                <span>Lower</span>
              </div>
            </div>
            {analytics.accuracyTests === 0 ? (
              <div className="mb-4 rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-sub">
                Historical results contain misses only. Complete a new test to populate per-key accuracy.
              </div>
            ) : null}
            <KeyboardHeatmap keys={analytics.keys} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-lg border border-border bg-bg p-4">
              <h3 className="text-sm font-medium text-text">Finger pressure</h3>
              <p className="mt-0.5 text-[11px] text-sub">Accuracy and share of tracked misses by touch-typing finger.</p>
              <div className="mt-4 space-y-3">
                {analytics.fingers.map((finger) => (
                  <div key={finger.id}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                      <span className="text-sub sm:hidden">{finger.shortLabel}</span>
                      <span className="hidden text-sub sm:inline">{finger.label}</span>
                      <span className="font-mono text-text">
                        {finger.accuracy === null ? "—" : `${finger.accuracy.toFixed(1)}%`}
                        {finger.count > 0 ? ` · ${Math.round(finger.share * 100)}% of misses` : ""}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-error transition-[width]"
                        style={{ width: `${finger.accuracy === null ? 0 : 100 - finger.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-bg p-4">
                <h3 className="text-sm font-medium text-text">Common confusions</h3>
                <p className="mt-0.5 text-[11px] text-sub">What you pressed instead of the target.</p>
                <ol className="mt-3 space-y-2">
                  {analytics.keyErrors.slice(0, 6).map((item, index) => (
                    <li
                      key={`${item.expected}-${item.actual}`}
                      className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-xs last:border-0"
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-4 font-mono text-[10px] text-sub">{index + 1}</span>
                        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-text">
                          {displayKey(item.expected)}
                        </kbd>
                        <span className="text-sub">→</span>
                        <kbd className="rounded border border-error/30 bg-error-soft px-1.5 py-0.5 font-mono text-error">
                          {displayKey(item.actual)}
                        </kbd>
                      </span>
                      <span className="font-mono text-sub">×{item.count}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-lg border border-border bg-bg p-4">
                <h3 className="text-sm font-medium text-text">Problem words</h3>
                <p className="mt-0.5 text-[11px] text-sub">Words that generated the most mistake signals.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {analytics.wordErrors.slice(0, 10).map((item) => (
                    <span
                      key={item.word}
                      className="rounded-md border border-error/20 bg-error-soft px-2 py-1 font-mono text-xs text-error"
                    >
                      {item.word} <span className="opacity-70">×{item.count}</span>
                    </span>
                  ))}
                  {analytics.wordErrors.length === 0 ? (
                    <span className="text-xs text-sub">No problem words recorded.</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-accent-soft px-4 py-3 text-xs leading-5 text-text">
            <span className="font-medium">Training focus: </span>
            {weakestKey && weakestFinger
              ? `Slow down around “${displayKey(weakestKey.key).toUpperCase()}” with your ${weakestFinger.label.toLocaleLowerCase()}`
              : "Keep building a clean baseline"}
            {topPair
              ? `; you most often typed “${displayKey(topPair.actual)}” when “${displayKey(topPair.expected)}” was expected.`
              : "."}
            {analytics.extraKeypresses > 0
              ? ` You also typed ${analytics.extraKeypresses} extra ${analytics.extraKeypresses === 1 ? "key" : "keys"} past word endings.`
              : ""}
          </div>
        </>
      )}
    </section>
  );
}
