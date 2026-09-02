import type { HTMLAttributes } from "react";

export function Skeleton({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-surface-hover ${className}`}
      {...props}
    />
  );
}

export function LoadingStatus({ label }: { label: string }) {
  return <span className="sr-only" role="status">{label}</span>;
}
