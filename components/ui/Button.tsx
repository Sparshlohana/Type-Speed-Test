"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:brightness-110 active:brightness-95 shadow-[0_6px_20px_-8px_var(--accent)]",
  secondary:
    "bg-surface text-text border border-border hover:bg-surface-hover hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]",
  ghost: "text-sub hover:text-text hover:bg-surface",
  danger: "bg-error-soft text-error border border-[color-mix(in_srgb,var(--error)_35%,transparent)] hover:bg-[color-mix(in_srgb,var(--error)_22%,transparent)]",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function Button({ variant = "secondary", className = "", children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-[var(--ease)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
