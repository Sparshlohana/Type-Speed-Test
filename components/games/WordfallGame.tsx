"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { saveGameRun } from "@/app/actions/games";
import {
  WORDFALL_MAX_LIVES,
  advanceWordfall,
  createWordfallMenu,
  createWordfallRun,
  toggleWordfallPause,
  typeWordfallKey,
  wordfallAccuracy,
  wordfallDifficulty,
  wordfallUsesWords,
  wordfallWave,
  wordfallWpm,
  type WordfallState,
} from "@/lib/games/wordfall";
import { generateWords } from "@/lib/words";

const BEST_KEY = "typeflow.wordfall.best";
const WARMUP_CHARACTERS = "abcdefghijklmnopqrstuvwxyz";

function nextTarget(wave: number): string {
  if (!wordfallUsesWords(wave)) {
    return WARMUP_CHARACTERS[Math.floor(Math.random() * WARMUP_CHARACTERS.length)];
  }
  return generateWords(1, wordfallDifficulty(wave))[0];
}

function runId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `fall-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-raid-faint">{label}</p>
      <p className={`mt-1 font-mono text-sm font-bold sm:text-lg ${accent ? "text-raid-accent" : "text-raid-text"}`}>{value}</p>
    </div>
  );
}

export function WordfallGame() {
  const [game, setGame] = useState<WordfallState>(createWordfallMenu);
  const [currentRunId, setCurrentRunId] = useState("");
  const [bestScore, setBestScore] = useState(0);
  const [submission, setSubmission] = useState<"idle" | "saving" | "saved" | "best" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(new Set<string>());

  const wave = wordfallWave(game.elapsedMs);
  const accuracy = wordfallAccuracy(game);
  const wpm = wordfallWpm(game);
  const targetId = useMemo(() => game.buffer
    ? game.words.filter((word) => word.text.startsWith(game.buffer)).sort((a, b) => b.y - a.y)[0]?.id
    : null, [game.buffer, game.words]);

  const start = useCallback(() => {
    setCurrentRunId(runId());
    setSubmission("idle");
    setGame(createWordfallRun(Array.from({ length: 3 }, () => nextTarget(1))));
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setBestScore(Number(window.localStorage.getItem(BEST_KEY)) || 0);
      } catch {
        setBestScore(0);
      }
    });
  }, []);

  useEffect(() => {
    if (game.phase !== "playing") return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - previous;
      previous = now;
      setGame((current) => {
        const nextWave = wordfallWave(current.elapsedMs + Math.min(250, delta));
        const nextWord = current.spawnInMs <= Math.min(250, delta)
          ? nextTarget(nextWave)
          : "";
        return advanceWordfall(current, delta, nextWord);
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [game.phase]);

  useEffect(() => {
    if (game.phase === "playing") queueMicrotask(() => inputRef.current?.focus());
  }, [game.phase]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) {
        setGame((current) => current.phase === "playing" ? { ...current, phase: "paused" } : current);
      }
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  useEffect(() => {
    if (game.phase !== "over" || !currentRunId || submitted.current.has(currentRunId)) return;
    submitted.current.add(currentRunId);
    setSubmission("saving");
    const nextBest = Math.max(bestScore, game.score);
    setBestScore(nextBest);
    try {
      window.localStorage.setItem(BEST_KEY, String(nextBest));
    } catch {
      // Account persistence still works when local storage is blocked.
    }
    void saveGameRun({
      clientId: currentRunId,
      gameId: "wordfall",
      score: game.score,
      wpm,
      accuracy,
      words: game.completed,
      bestCombo: game.bestCombo,
      wave,
      missedWords: game.missed,
      durationMs: Math.round(game.elapsedMs),
    })
      .then((response) => setSubmission(response.ok ? response.isPersonalBest ? "best" : "saved" : "error"))
      .catch(() => setSubmission("error"));
  }, [accuracy, bestScore, currentRunId, game, wave, wpm]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setGame(toggleWordfallPause);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Backspace" || event.key.length === 1) {
      event.preventDefault();
      setGame((current) => typeWordfallKey(current, event.key));
    }
  }, []);

  return (
    <div className="relative isolate min-h-[calc(100dvh-8rem)] overflow-hidden bg-raid-bg text-raid-text sm:min-h-[calc(100dvh-4rem)]">
      <div aria-hidden className="typeraid-grid absolute inset-0 -z-20 opacity-45" />
      <div aria-hidden className="absolute left-1/2 top-[-18rem] -z-10 h-[40rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(87,217,163,.16),transparent_68%)]" />

      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-6xl flex-col px-4 py-5 sm:min-h-[calc(100dvh-4rem)] sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Link href="/games" className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em] text-raid-muted transition hover:text-raid-text">← Arcade</Link>
          <div className="text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-raid-success">survival protocol</p>
            <h1 className="mt-0.5 text-lg font-bold tracking-[-0.04em]">Wordfall</h1>
          </div>
          <button type="button" disabled={game.phase === "menu" || game.phase === "over"} onClick={() => setGame(toggleWordfallPause)} className="min-w-16 rounded-xl border border-raid-border bg-raid-fill px-3 py-2 text-xs font-medium text-raid-muted transition hover:text-raid-text disabled:opacity-30">
            {game.phase === "paused" ? "Resume" : "Pause"}
          </button>
        </header>

        {game.phase === "menu" ? (
          <main className="grid flex-1 place-items-center py-10">
            <section className="w-full max-w-2xl text-center">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-raid-border bg-raid-fill text-4xl text-raid-success shadow-[0_24px_70px_-35px_#57d9a3]">↓</div>
              <p className="mt-7 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-raid-success">Arcade 02</p>
              <h2 className="mt-2 text-5xl font-black tracking-[-0.065em] sm:text-7xl">Characters first. Words next.</h2>
              <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-raid-muted">Wave 1 warms you up with single characters. After 20 seconds, complete words begin falling and every new wave gets faster. Five misses end the run.</p>
              <div className="mx-auto mt-8 grid max-w-lg grid-cols-3 divide-x divide-raid-border overflow-hidden rounded-2xl border border-raid-border bg-raid-fill py-4">
                <Stat label="Lives" value="5" />
                <Stat label="Wave" value="∞" />
                <Stat label="Best" value={bestScore.toLocaleString()} accent />
              </div>
              <button type="button" onClick={start} className="mt-8 rounded-xl bg-raid-text px-8 py-3.5 text-sm font-bold text-raid-bg transition hover:-translate-y-0.5">Start falling →</button>
              <p className="mt-4 text-xs text-raid-faint">Physical keyboard recommended · Esc pauses</p>
            </section>
          </main>
        ) : (
          <main className="flex flex-1 flex-col py-5 sm:py-7">
            <section className="grid grid-cols-5 gap-3 rounded-2xl border border-raid-border bg-raid-surface-soft p-4 sm:px-6">
              <Stat label="Score" value={game.score.toLocaleString()} accent />
              <Stat label="Wave" value={String(wave)} />
              <Stat label="Lives" value={`${game.lives}/${WORDFALL_MAX_LIVES}`} />
              <Stat label="Combo" value={`${game.combo}×`} />
              <Stat label="Accuracy" value={`${accuracy.toFixed(0)}%`} />
            </section>

            <section className="relative mt-4 min-h-[30rem] flex-1 overflow-hidden rounded-3xl border border-raid-border bg-[linear-gradient(180deg,var(--raid-fill),transparent_45%),var(--raid-surface-soft)] shadow-[inset_0_-70px_80px_-70px_rgba(255,92,122,.32)]" onClick={() => inputRef.current?.focus()}>
              <span className="absolute left-3 top-3 z-[1] rounded-full border border-raid-border bg-raid-surface/85 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-raid-faint">
                {wordfallUsesWords(wave) ? "Word phase" : "Character warm-up"}
              </span>
              <div className="absolute inset-x-0 bottom-[8%] border-t border-dashed border-raid-danger/55">
                <span className="absolute bottom-2 right-3 text-[8px] font-semibold uppercase tracking-[0.18em] text-raid-danger">danger line</span>
              </div>
              {game.words.map((word) => {
                const targeted = word.id === targetId;
                return (
                  <div key={word.id} className={`absolute -translate-x-1/2 rounded-lg border px-2.5 py-1.5 font-mono text-sm font-semibold transition-[top] duration-100 ease-linear ${targeted ? "border-raid-success bg-[color-mix(in_srgb,var(--raid-success)_14%,var(--raid-surface))] text-raid-text shadow-[0_0_22px_-8px_var(--raid-success)]" : "border-raid-border bg-raid-surface text-raid-muted"}`} style={{ left: `${word.x}%`, top: `${word.y}%` }}>
                    {targeted && game.buffer ? <><span className="text-raid-success">{game.buffer}</span>{word.text.slice(game.buffer.length)}</> : word.text}
                  </div>
                );
              })}

              {game.phase === "paused" ? (
                <div className="absolute inset-0 z-10 grid place-items-center bg-raid-overlay backdrop-blur-md">
                  <div className="text-center"><p className="text-3xl font-bold">Run paused</p><button type="button" onClick={() => setGame(toggleWordfallPause)} className="mt-5 rounded-xl bg-raid-text px-6 py-3 text-sm font-bold text-raid-bg">Resume</button></div>
                </div>
              ) : null}

              {game.phase === "over" ? (
                <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-raid-overlay p-5 backdrop-blur-xl">
                  <div className="w-full max-w-xl text-center">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-raid-danger">Run over · wave {wave}</p>
                    <h2 className="mt-2 text-5xl font-black tracking-[-0.06em]">The words landed.</h2>
                    <p className={`mt-3 text-xs ${submission === "best" ? "text-raid-success" : submission === "error" ? "text-raid-danger" : "text-raid-muted"}`} role="status">{submission === "saving" ? "Saving score…" : submission === "best" ? "New personal best · leaderboard updated" : submission === "saved" ? "Run saved to your account" : submission === "error" ? "Score could not be saved" : ""}</p>
                    <div className="mt-7 grid grid-cols-4 divide-x divide-raid-border overflow-hidden rounded-2xl border border-raid-border bg-raid-fill py-4">
                      <Stat label="Score" value={game.score.toLocaleString()} accent />
                      <Stat label="Words" value={String(game.completed)} />
                      <Stat label="Combo" value={`${game.bestCombo}×`} />
                      <Stat label="Accuracy" value={`${accuracy.toFixed(0)}%`} />
                    </div>
                    <div className="mt-7 flex flex-wrap justify-center gap-3">
                      <button type="button" onClick={start} className="rounded-xl bg-raid-text px-6 py-3 text-sm font-bold text-raid-bg">Play again</button>
                      <Link href="/leaderboard?game=wordfall" className="rounded-xl border border-raid-border px-6 py-3 text-sm font-semibold text-raid-muted transition hover:text-raid-text">View leaderboard</Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-raid-border bg-raid-surface p-3 sm:px-5">
              <span className="hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-raid-faint sm:block">Type here</span>
              <input ref={inputRef} value={game.buffer} onChange={() => undefined} onKeyDown={onKeyDown} disabled={game.phase !== "playing"} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Type a falling word" placeholder="Start typing a falling word…" className="min-w-0 flex-1 bg-transparent font-mono text-base text-raid-success outline-none placeholder:text-raid-faint" />
              <span className="font-mono text-xs text-raid-faint">{game.completed} cleared · {game.missed} missed</span>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
