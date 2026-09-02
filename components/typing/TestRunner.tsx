"use client";

import { useEffect } from "react";

import { LiveStats } from "./LiveStats";
import { ResultsPanel } from "./ResultsPanel";
import { TestConfigBar } from "./TestConfigBar";
import { TypingArea } from "./TypingArea";
import { useSettings } from "@/hooks/useSettings";
import { useTypingTest, type FinishedResult } from "@/hooks/useTypingTest";
import type { Mode } from "@/lib/engine";

/**
 * One attempt at the test. The page mounts this keyed by mode, so switching mode
 * starts a genuinely fresh run rather than unwinding state by hand.
 */
export function TestRunner({
  mode,
  onModeChange,
  onFinished,
}: {
  mode: Mode;
  onModeChange?: (next: Mode) => void;
  onFinished?: (finished: FinishedResult) => void;
}) {
  const { settings } = useSettings();
  const { state, live, ghost, finished, onChar, onSpace, onBackspace, restart, startNewTest } =
    useTypingTest({
      mode,
      soundEnabled: settings.sound,
      ghostEnabled: settings.ghostRace,
      ghostOpponent: settings.ghostOpponent,
      onFinished,
    });

  const isFinished = state.status === "finished";

  // The typing area owns Tab while it has focus; on the results screen nothing does.
  useEffect(() => {
    if (!isFinished) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFinished, restart]);

  if (isFinished && finished) {
    return (
      <ResultsPanel
        finished={finished}
        quote={state.quote}
        onRetry={restart}
        onNewTest={startNewTest}
      />
    );
  }

  return (
    <div className="fade-in flex flex-col gap-6">
      <div className="grid min-h-14 items-center">
        {onModeChange ? (
          <div className="col-start-1 row-start-1 flex justify-center">
            <TestConfigBar mode={mode} onChange={onModeChange} dimmed={state.status === "running"} />
          </div>
        ) : null}

        <div className="pointer-events-none col-start-1 row-start-1">
          <LiveStats live={live} visible={state.status === "running"} />
        </div>
      </div>

      <TypingArea
        state={state}
        caretStyle={settings.caretStyle}
        smoothCaret={settings.smoothCaret}
        ghost={ghost}
        onChar={onChar}
        onSpace={onSpace}
        onBackspace={onBackspace}
        onRestart={restart}
      />

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-sub">
        <span>
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">Tab</kbd> restart
        </span>
        <span>
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">Esc</kbd> unfocus
        </span>
        {state.quote ? <span>— {state.quote.author}</span> : <span>Just start typing</span>}
      </div>
    </div>
  );
}
