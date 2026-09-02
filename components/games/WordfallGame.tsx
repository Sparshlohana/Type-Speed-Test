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

function LifePips({ lives }: { lives: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${lives} of ${WORDFALL_MAX_LIVES} lives remaining`}>
      {Array.from({ length: WORDFALL_MAX_LIVES }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={`h-2.5 w-5 skew-x-[-16deg] rounded-[2px] border transition-colors ${index < lives ? "border-raid-success/50 bg-raid-success shadow-[0_0_12px_-3px_var(--raid-success-text)]" : "border-raid-border bg-raid-recessed"}`}
        />
      ))}
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
  const waveProgress = ((game.elapsedMs % 20_000) / 20_000) * 100;
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
    <div className="wordfall-shell relative isolate min-h-[calc(100dvh-8rem)] overflow-hidden bg-raid-bg text-raid-text sm:min-h-[calc(100dvh-4rem)]">
      <div aria-hidden className="wordfall-aurora pointer-events-none absolute inset-0 -z-20" />
      <div aria-hidden className="wordfall-noise pointer-events-none absolute inset-0 -z-10 opacity-40" />

      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-7xl flex-col px-4 pb-4 pt-3 sm:min-h-[calc(100dvh-4rem)] sm:px-6 sm:pb-6">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-raid-border/70">
          <Link href="/games" className="group flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-raid-faint transition-colors hover:text-raid-text">
            <span className="transition-transform group-hover:-translate-x-0.5">←</span> Arcade
          </Link>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg border border-raid-success/25 bg-raid-success/10 font-mono text-sm font-black text-raid-success">W</span>
            <div>
              <h1 className="text-sm font-black uppercase tracking-[0.08em]">Wordfall</h1>
              <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-raid-success">keep the signal airborne</p>
            </div>
          </div>
          <button type="button" disabled={game.phase === "menu" || game.phase === "over"} onClick={() => setGame(toggleWordfallPause)} className="min-w-16 rounded-lg border border-raid-border bg-raid-fill px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-raid-muted transition hover:border-raid-success/30 hover:text-raid-text disabled:opacity-25">
            {game.phase === "paused" ? "Resume" : "Pause"}
          </button>
        </header>

        {game.phase === "menu" ? (
          <main className="wordfall-enter grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,.82fr)_minmax(32rem,1.18fr)] lg:gap-14">
            <section className="mx-auto w-full max-w-xl lg:mx-0">
              <div className="flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-raid-success">
                <span className="h-px w-8 bg-raid-success/60" /> Arcade transmission 02
              </div>
              <h2 className="mt-5 text-5xl font-black uppercase leading-[0.88] tracking-[-0.075em] sm:text-7xl lg:text-[5.6rem]">
                Don&apos;t let<br /><span className="text-raid-success">it land.</span>
              </h2>
              <p className="mt-6 max-w-lg text-sm leading-6 text-raid-muted sm:text-base sm:leading-7">
                Catch the signal with your keyboard. Single characters teach the rhythm; twenty seconds later, full words start breaking through.
              </p>

              <div className="mt-7 grid grid-cols-3 gap-2">
                {[
                  ["01", "Warm up", "Characters"],
                  ["02", "Escalate", "Full words"],
                  ["03", "Survive", "Five lives"],
                ].map(([number, title, detail]) => (
                  <div key={number} className="rounded-xl border border-raid-border bg-raid-fill p-3 sm:p-4">
                    <span className="font-mono text-[9px] text-raid-success">{number}</span>
                    <p className="mt-3 text-xs font-bold text-raid-text">{title}</p>
                    <p className="mt-1 text-[10px] text-raid-faint">{detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={start} className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-raid-success px-7 text-sm font-black text-[#07110e] shadow-[0_18px_45px_-24px_var(--raid-success-text)] transition hover:-translate-y-0.5 hover:brightness-110">
                  Start transmission <span className="transition-transform group-hover:translate-x-1">→</span>
                </button>
                <div className="rounded-xl border border-raid-border bg-raid-fill px-4 py-2.5">
                  <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-raid-faint">Personal best</p>
                  <p className="font-mono text-base font-black text-raid-text">{bestScore.toLocaleString()}</p>
                </div>
              </div>
              <p className="mt-4 text-[10px] text-raid-faint">Type to lock on · Backspace corrects · Esc pauses</p>
            </section>

            <section className="relative mx-auto aspect-[1.05] w-full max-w-[39rem] overflow-hidden rounded-[2rem] border border-raid-success/20 bg-raid-surface-soft shadow-[0_35px_100px_-55px_var(--raid-success-text)] sm:aspect-[1.3] lg:aspect-[1.02]" aria-label="Wordfall preview">
              <div aria-hidden className="wordfall-lanes absolute inset-0 opacity-55" />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-raid-border bg-raid-fill px-5 py-3 font-mono text-[8px] uppercase tracking-[0.18em] text-raid-faint">
                <span>Incoming signal</span><span className="text-raid-success">Wave 01</span>
              </div>
              {[
                ["A", "22%", "19%", true],
                ["K", "67%", "36%", false],
                ["flow", "39%", "54%", false],
                ["type", "73%", "68%", false],
              ].map(([text, left, top, active]) => (
                <div key={String(text)} className={`wordfall-target absolute -translate-x-1/2 font-mono font-black ${String(text).length === 1 ? "grid h-12 w-12 place-items-center rounded-xl text-xl" : "rounded-xl px-4 py-2 text-sm"} ${active ? "border-raid-success bg-raid-success/15 text-raid-text shadow-[0_0_28px_-10px_var(--raid-success-text)]" : "border-raid-border bg-raid-surface text-raid-muted"}`} style={{ left: String(left), top: String(top) }}>
                  {String(text)}
                </div>
              ))}
              <div className="wordfall-danger absolute inset-x-0 bottom-0 h-[19%] border-t border-raid-danger/50">
                <span className="absolute right-4 top-3 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-raid-danger">impact zone</span>
              </div>
              <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-raid-success/25 bg-raid-bg/90 p-3 backdrop-blur">
                <span className="font-mono text-lg font-black text-raid-success">a</span><span className="ml-0.5 animate-pulse text-raid-success">▌</span>
              </div>
            </section>
          </main>
        ) : (
          <main className="flex flex-1 flex-col pt-3 sm:pt-4">
            <section className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-raid-border bg-raid-surface-soft p-3 sm:grid-cols-[1fr_1.4fr_1fr] sm:items-center sm:px-5">
              <div>
                <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-raid-faint">Score</p>
                <p className="mt-0.5 font-mono text-2xl font-black tabular-nums text-raid-success sm:text-3xl">{game.score.toLocaleString()}</p>
                <p className="mt-1 font-mono text-[8px] text-raid-faint">BEST {Math.max(bestScore, game.score).toLocaleString()}</p>
              </div>

              <div className="order-3 col-span-2 sm:order-none sm:col-span-1 sm:px-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-raid-faint">Wave {String(wave).padStart(2, "0")}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-raid-text">{wordfallUsesWords(wave) ? "Word storm" : "Character warm-up"}</p>
                  </div>
                  <p className="font-mono text-[9px] text-raid-faint">{Math.max(0, Math.ceil((20_000 - (game.elapsedMs % 20_000)) / 1_000))}s</p>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-raid-recessed">
                  <div className="h-full rounded-full bg-raid-success transition-[width] duration-100" style={{ width: `${waveProgress}%` }} />
                </div>
              </div>

              <div className="text-right">
                <div className="flex justify-end"><LifePips lives={game.lives} /></div>
                <div className="mt-3 flex justify-end gap-4 font-mono text-[9px] text-raid-faint">
                  <span><strong className="text-raid-text">{game.combo}×</strong> combo</span>
                  <span><strong className="text-raid-text">{accuracy.toFixed(0)}%</strong> acc</span>
                  <span className="hidden sm:inline"><strong className="text-raid-text">{wpm}</strong> wpm</span>
                </div>
              </div>
            </section>

            <section className="relative mt-3 min-h-[25rem] flex-1 overflow-hidden rounded-[1.75rem] border border-raid-border bg-raid-surface-soft shadow-[inset_0_-100px_100px_-80px_rgba(255,70,110,.3)] sm:min-h-[32rem]" onClick={() => inputRef.current?.focus()}>
              <div aria-hidden className="wordfall-lanes absolute inset-0 opacity-45" />
              <div className="absolute inset-x-0 top-0 z-[2] flex items-center justify-between border-b border-raid-border bg-raid-surface/80 px-4 py-2.5 backdrop-blur-md">
                <span className="flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-raid-faint"><span className="h-1.5 w-1.5 rounded-full bg-raid-success shadow-[0_0_8px_var(--raid-success-text)]" /> Live field</span>
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-raid-faint">{game.words.length} incoming · {game.completed} cleared</span>
              </div>

              <div className="wordfall-danger absolute inset-x-0 bottom-0 h-[14%] border-t border-raid-danger/55">
                <div className="absolute inset-x-0 top-0 flex -translate-y-1/2 items-center gap-2 px-4">
                  <span className="h-px flex-1 bg-raid-danger/25" /><span className="rounded-full border border-raid-danger/30 bg-raid-bg px-2.5 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.2em] text-raid-danger">Impact line</span><span className="h-px flex-1 bg-raid-danger/25" />
                </div>
              </div>

              {game.words.map((word) => {
                const targeted = word.id === targetId;
                const dangerous = word.y >= 68;
                const isCharacter = word.text.length === 1;
                return (
                  <div
                    key={word.id}
                    className={`wordfall-target absolute -translate-x-1/2 font-mono font-black transition-[top] duration-100 ease-linear ${isCharacter ? "grid h-12 w-12 place-items-center rounded-xl text-xl sm:h-14 sm:w-14 sm:text-2xl" : "rounded-xl px-3.5 py-2 text-sm sm:px-4 sm:text-base"} ${targeted ? "wordfall-target-active border-raid-success bg-raid-success/15 text-raid-text" : dangerous ? "border-raid-danger/45 bg-raid-danger/10 text-raid-text" : "border-raid-border bg-raid-surface text-raid-muted"}`}
                    style={{ left: `${word.x}%`, top: `${word.y}%` }}
                  >
                    {targeted && game.buffer ? <><span className="text-raid-success">{game.buffer}</span>{word.text.slice(game.buffer.length)}</> : word.text}
                  </div>
                );
              })}

              {game.phase === "paused" ? (
                <div className="absolute inset-0 z-20 grid place-items-center bg-raid-overlay/95 p-6 backdrop-blur-xl">
                  <div className="text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-raid-border bg-raid-fill font-mono text-lg text-raid-success">Ⅱ</div>
                    <p className="mt-5 text-3xl font-black uppercase tracking-[-0.04em]">Signal held</p>
                    <p className="mt-2 text-xs text-raid-muted">The field is frozen. Resume when your hands are ready.</p>
                    <button type="button" onClick={() => setGame(toggleWordfallPause)} className="mt-6 rounded-xl bg-raid-success px-7 py-3 text-sm font-black text-[#07110e]">Resume run</button>
                  </div>
                </div>
              ) : null}

              {game.phase === "over" ? (
                <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-raid-overlay/95 p-4 backdrop-blur-xl sm:p-8">
                  <div className="wordfall-enter w-full max-w-2xl rounded-[1.75rem] border border-raid-border bg-raid-surface p-5 shadow-[0_30px_100px_-55px_var(--raid-danger-text)] sm:p-8">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-raid-danger">Transmission lost · wave {String(wave).padStart(2, "0")}</p>
                        <h2 className="mt-2 text-4xl font-black uppercase leading-none tracking-[-0.06em] sm:text-5xl">Impact<br />detected.</h2>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-raid-faint">Final score</p>
                        <p className="mt-1 font-mono text-4xl font-black text-raid-success sm:text-5xl">{game.score.toLocaleString()}</p>
                      </div>
                    </div>
                    <p className={`mt-4 min-h-4 text-xs ${submission === "best" ? "text-raid-success" : submission === "error" ? "text-raid-danger" : "text-raid-muted"}`} role="status">{submission === "saving" ? "Syncing this run…" : submission === "best" ? "New personal best · leaderboard updated" : submission === "saved" ? "Run saved to your account" : submission === "error" ? "Score could not be saved" : ""}</p>
                    <div className="mt-5 grid grid-cols-4 divide-x divide-raid-border overflow-hidden rounded-xl border border-raid-border bg-raid-fill py-3">
                      <Stat label="Cleared" value={String(game.completed)} />
                      <Stat label="Best combo" value={`${game.bestCombo}×`} />
                      <Stat label="Accuracy" value={`${accuracy.toFixed(0)}%`} />
                      <Stat label="WPM" value={String(wpm)} />
                    </div>
                    <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={start} className="min-h-11 flex-1 rounded-xl bg-raid-success px-5 text-sm font-black text-[#07110e] transition hover:brightness-110">Run it back</button>
                      <Link href="/leaderboard?game=wordfall" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-raid-border px-5 text-sm font-bold text-raid-muted transition hover:bg-raid-fill hover:text-raid-text">View leaderboard</Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <div className="relative z-10 mx-2 -mt-4 flex items-center gap-3 rounded-2xl border border-raid-success/30 bg-raid-bg/95 p-2.5 shadow-[0_18px_55px_-30px_var(--raid-success-text)] backdrop-blur-xl sm:mx-8 sm:-mt-5 sm:p-3">
              <span className="hidden h-9 items-center rounded-lg bg-raid-success/10 px-3 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-raid-success sm:inline-flex">Command</span>
              <span aria-hidden className="font-mono text-lg font-black text-raid-success">›</span>
              <input ref={inputRef} value={game.buffer} onChange={() => undefined} onKeyDown={onKeyDown} disabled={game.phase !== "playing"} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Type a falling target" placeholder={wordfallUsesWords(wave) ? "Type an incoming word…" : "Press a falling character…"} className="min-w-0 flex-1 bg-transparent font-mono text-base font-bold text-raid-success outline-none placeholder:font-normal placeholder:text-raid-faint" />
              <span className="shrink-0 font-mono text-[9px] text-raid-faint">{game.missed} missed</span>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
