/** Small display formatters shared across screens. */

export function formatSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  if (clamped < 60) return `${clamped}`;
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const RELATIVE_UNITS: [limitMs: number, divisor: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60_000, 1_000, "second"],
  [3_600_000, 60_000, "minute"],
  [86_400_000, 3_600_000, "hour"],
  [604_800_000, 86_400_000, "day"],
  [2_629_800_000, 604_800_000, "week"],
  [31_557_600_000, 2_629_800_000, "month"],
  [Infinity, 31_557_600_000, "year"],
];

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const delta = timestamp - now;
  const magnitude = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [limit, divisor, unit] of RELATIVE_UNITS) {
    if (magnitude < limit) return formatter.format(Math.round(delta / divisor), unit);
  }
  return new Date(timestamp).toLocaleDateString();
}
