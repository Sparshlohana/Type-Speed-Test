"use client";

import { useState } from "react";

import type { Mode } from "@/lib/engine";
import type { QuoteLength } from "@/lib/words";

const TIME_PRESETS = [15, 30, 60];
const WORD_PRESETS = [25, 50, 100];
const QUOTE_PRESETS: QuoteLength[] = ["short", "medium", "long"];

const MIN_CUSTOM_SECONDS = 5;
const MAX_CUSTOM_SECONDS = 600;

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-[var(--ease)] ${
        active ? "bg-accent-soft text-accent" : "text-sub hover:bg-surface-hover hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

export function TestConfigBar({
  mode,
  onChange,
  dimmed,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  /** Fades the bar out of the way while a test is in progress. */
  dimmed: boolean;
}) {
  const isCustomTime = mode.kind === "time" && !TIME_PRESETS.includes(mode.seconds);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState(
    mode.kind === "time" ? String(mode.seconds) : "45",
  );
  // Opened by hand, or implied by a custom duration already being active.
  const showCustom = customOpen || isCustomTime;

  const commitCustom = () => {
    const parsed = Number.parseInt(customValue, 10);
    if (!Number.isFinite(parsed)) return;
    const seconds = Math.min(MAX_CUSTOM_SECONDS, Math.max(MIN_CUSTOM_SECONDS, parsed));
    setCustomValue(String(seconds));
    onChange({ kind: "time", seconds });
  };

  return (
    <div
      className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1.5 transition-opacity duration-300 ease-[var(--ease)]"
      style={{ opacity: dimmed ? 0.25 : 1 }}
    >
      {TIME_PRESETS.map((seconds) => (
        <Pill
          key={seconds}
          active={mode.kind === "time" && mode.seconds === seconds}
          onClick={() => {
            setCustomOpen(false);
            onChange({ kind: "time", seconds });
          }}
        >
          {seconds}s
        </Pill>
      ))}

      {showCustom ? (
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-2 py-1">
          <input
            type="number"
            min={MIN_CUSTOM_SECONDS}
            max={MAX_CUSTOM_SECONDS}
            value={customValue}
            aria-label="Custom test length in seconds"
            onChange={(event) => setCustomValue(event.target.value)}
            onBlur={commitCustom}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCustom();
                event.currentTarget.blur();
              }
            }}
            className="w-14 bg-transparent text-center font-mono text-sm text-accent outline-none"
          />
          <span className="text-xs text-accent">s</span>
        </span>
      ) : (
        <Pill active={isCustomTime} onClick={() => setCustomOpen(true)}>
          Custom
        </Pill>
      )}

      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />

      {WORD_PRESETS.map((count) => (
        <Pill
          key={count}
          active={mode.kind === "words" && mode.count === count}
          onClick={() => {
            setCustomOpen(false);
            onChange({ kind: "words", count });
          }}
        >
          {count} words
        </Pill>
      ))}

      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />

      {QUOTE_PRESETS.map((length) => (
        <Pill
          key={length}
          active={mode.kind === "quote" && mode.length === length}
          onClick={() => {
            setCustomOpen(false);
            onChange({ kind: "quote", length });
          }}
        >
          {length} quote
        </Pill>
      ))}
    </div>
  );
}
