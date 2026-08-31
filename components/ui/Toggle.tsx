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
      className={`relative h-7 w-12 shrink-0 rounded-full border p-0 transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
        checked
          ? "border-accent bg-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_75%,white)]"
          : "border-border bg-surface-hover hover:border-sub"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-[var(--ease)] ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
