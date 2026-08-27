import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`rounded-xl border border-border bg-surface p-5 transition-colors duration-200 ease-[var(--ease)] ${className}`}
    >
      {children}
    </div>
  );
}

/** A labelled number tile — the unit shared by the results screen and the stats page. */
export function StatTile({
  label,
  value,
  hint,
  accent = false,
  className = "",
  style,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Card className={className} style={style}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sub">{label}</p>
      <p
        className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${accent ? "text-accent" : "text-text"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-sub">{hint}</p> : null}
    </Card>
  );
}
