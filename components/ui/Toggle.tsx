"use client";

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ease-[var(--ease)] ${
        checked ? "border-transparent bg-accent" : "border-border bg-surface-hover"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease)] ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}
