"use client";

import { useState } from "react";

import { TestRunner } from "@/components/typing/TestRunner";
import { useIsClient } from "@/hooks/useIsClient";
import { DEFAULT_MODE, modeKey, type Mode } from "@/lib/engine";

/** Holds the layout while the real test waits for the client. */
function TestSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-6">
      <div className="flex min-h-14 flex-col items-center justify-center gap-2">
        <div className="h-11 w-full max-w-4xl rounded-xl border border-border bg-surface" />
        <div className="h-10 w-72 rounded-xl border border-border bg-surface" />
      </div>
      <div className="typing-text flex flex-col gap-2 opacity-40">
        <span className="h-[1lh] w-full rounded bg-surface" />
        <span className="h-[1lh] w-11/12 rounded bg-surface" />
        <span className="h-[1lh] w-2/3 rounded bg-surface" />
      </div>
      <div className="h-5" />
    </div>
  );
}

export default function TestPage() {
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const isClient = useIsClient();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-10 sm:py-16">
      {isClient ? (
        // Words are generated randomly, so the first render has to be the client's.
        <TestRunner key={modeKey(mode)} mode={mode} onModeChange={setMode} />
      ) : (
        <TestSkeleton />
      )}
    </div>
  );
}
