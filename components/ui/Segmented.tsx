"use client";

import type { ReactNode } from "react";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
};

/** Pill selector with a sliding highlight behind the active option. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  const padding = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`rounded-lg font-medium transition-all duration-200 ease-[var(--ease)] ${padding} ${
              active
                ? "bg-accent-soft text-accent"
                : "text-sub hover:bg-surface-hover hover:text-text"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
