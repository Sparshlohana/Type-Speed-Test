"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { saveGameRun } from "@/app/actions/games";
import { achievementById, type ProgressReward } from "@/lib/progression";
import { progressionStore } from "@/lib/progression-store";
import {
  CURSES,
  NEMESIS_PLAYER_HP,
  NEMESIS_PURGE_COST,
  advanceNemesis,
  createNemesisRun,
  curseById,
  evolveIdentity,
  loadNemesisIdentity,
  nemesisAccuracy,
  nemesisAutopsy,
  nemesisScore,
  nemesisWpm,
  purgeNemesis,
  reforgeIdentity,
  saveNemesisIdentity,
  strikeTarget,
  toggleNemesisPause,
  typeNemesisKey,
  type NemesisIdentity,
  type NemesisState,
} from "@/lib/games/nemesis";
import { resultsStore } from "@/lib/store";
import { aggregateWeaknesses } from "@/lib/weakness";

const TICK_MS = 80;

function runId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `nem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** The sigil is drawn from the signature key, so every player's rival looks different. */
function Sigil({ signature, level }: { signature: string; level: number }) {
  const seed = signature.charCodeAt(0) || 65;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2 - Math.PI / 2;
    const radius = 26 + ((seed * (index + 3)) % 13);
    return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" aria-hidden className="h-full w-full">
      <polygon points={points} fill="color-mix(in srgb, var(--nemesis-text) 12%, transparent)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="50" cy="50" r={16 + Math.min(10, level)} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="30" fontWeight="900" fill="currentColor" fontFamily="var(--font-geist-mono), monospace">
        {signature.toLocaleUpperCase()}
      </text>
    </svg>
  );
}

function HealthBar({
  label,
  value,
  max,
  tone,
  align = "left",
}: {
  label: string;
  value: number;
  max: number;
  tone: "nemesis" | "player";
  align?: "left" | "right";
}) {
  const percent = max === 0 ? 0 : Math.max(0, (value / max) * 100);
  const critical = percent <= 25;
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`flex items-baseline gap-2 ${align === "right" ? "justify-end" : ""}`}>
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-raid-faint">{label}</span>
        <span className={`font-mono text-xs font-black tabular-nums ${critical ? "text-raid-danger" : "text-raid-text"}`}>
          {Math.ceil(value)}<span className="text-raid-faint">/{max}</span>
        </span>
      </div>
      <div className={`mt-1.5 h-2 overflow-hidden rounded-full bg-raid-recessed ${align === "right" ? "[direction:rtl]" : ""}`}>
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-[var(--ease)]"
          style={{
            width: `${percent}%`,
            background: tone === "nemesis" ? "var(--nemesis-text)" : "var(--raid-success-text)",
          }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "nemesis" | "success" }) {
  return (
    <div className="px-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-raid-faint">{label}</p>
      <p className={`mt-1 font-mono text-sm font-bold sm:text-lg ${tone === "nemesis" ? "text-nemesis" : tone === "success" ? "text-raid-success" : "text-raid-text"}`}>
        {value}
      </p>
    </div>
  );
}

function NemesisShell({ flash, children }: { flash?: boolean; children: React.ReactNode }) {
  return (
    <div className={`nemesis-shell relative isolate min-h-[calc(100dvh-8rem)] overflow-hidden text-raid-text sm:min-h-[calc(100dvh-4rem)] ${flash ? "nemesis-impact" : ""}`}>
      <div aria-hidden className="nemesis-veins pointer-events-none absolute inset-0 -z-20" />
      <div aria-hidden className="nemesis-scanlines pointer-events-none absolute inset-0 -z-10 opacity-30" />
      <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-7xl flex-col px-4 pb-5 pt-3 sm:min-h-[calc(100dvh-4rem)] sm:px-6">
        {children}
      </div>
    </div>
  );
}

function ArenaHeader({ paused, canPause, onPause }: { paused: boolean; canPause: boolean; onPause: () => void }) {
  return (
    <header className="flex h-12 items-center justify-between gap-3 border-b border-raid-border/70">
      <Link href="/games" className="group flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-raid-faint transition-colors hover:text-raid-text">
        <span className="transition-transform group-hover:-translate-x-0.5">←</span> Arcade
      </Link>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg border border-nemesis/25 bg-nemesis/10 font-mono text-sm font-black text-nemesis">N</span>
        <div>
          <h1 className="text-sm font-black uppercase tracking-[0.08em]">Nemesis</h1>
          <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-nemesis">it is built from your mistakes</p>
        </div>
      </div>
      <button
        type="button"
        disabled={!canPause}
        onClick={onPause}
        className="min-w-16 rounded-lg border border-raid-border bg-raid-fill px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-raid-muted transition hover:border-nemesis/30 hover:text-raid-text disabled:opacity-25"
      >
        {paused ? "Resume" : "Pause"}
      </button>
    </header>
  );
}

export function NemesisGame() {
  const snapshot = useSyncExternalStore(resultsStore.subscribe, resultsStore.get, resultsStore.getServer);
  const [storedIdentity, setStoredIdentity] = useState<NemesisIdentity | null>(null);
  /** Null until the player starts: the dossier screen needs no run state. */
  const [game, setGame] = useState<NemesisState | null>(null);
  const [currentRunId, setCurrentRunId] = useState("");
  const [submission, setSubmission] = useState<"idle" | "saving" | "saved" | "best" | "error">("idle");
  const [progressReward, setProgressReward] = useState<ProgressReward | null>(null);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(new Set<string>());
  const lastImpact = useRef(0);

  /** Everything the nemesis knows about the player, rebuilt whenever results change. */
  const profile = useMemo(() => aggregateWeaknesses(snapshot.results), [snapshot.results]);

  useEffect(() => {
    queueMicrotask(() => setStoredIdentity(loadNemesisIdentity()));
  }, []);

  // Its identity tracks the player's current worst key, so it reforms as they improve.
  const identity = useMemo(
    () => (storedIdentity && snapshot.hydrated && profile.hasHistory
      ? reforgeIdentity(storedIdentity, profile)
      : storedIdentity),
    [profile, snapshot.hydrated, storedIdentity],
  );

  useEffect(() => {
    if (identity && identity !== storedIdentity) saveNemesisIdentity(identity);
  }, [identity, storedIdentity]);

  const start = useCallback(() => {
    if (!identity) return;
    setCurrentRunId(runId());
    setSubmission("idle");
    setProgressReward(null);
    setGame(createNemesisRun(identity, profile));
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [identity, profile]);

  const phase = game?.phase;

  useEffect(() => {
    if (phase !== "playing") return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - previous;
      previous = now;
      setGame((current) => (current ? advanceNemesis(current, delta, profile) : current));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase, profile]);

  useEffect(() => {
    if (phase === "playing") queueMicrotask(() => inputRef.current?.focus());
  }, [phase]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (!document.hidden) return;
      setGame((current) => (current?.phase === "playing" ? { ...current, phase: "paused" } : current));
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  // Any hit the player takes shakes the arena once, without the game state owning a timer.
  useEffect(() => {
    if (!game || game.impact === lastImpact.current) return;
    lastImpact.current = game.impact;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 320);
    return () => window.clearTimeout(timer);
  }, [game]);

  useEffect(() => {
    if (!game || (game.phase !== "won" && game.phase !== "lost")) return;
    if (!currentRunId || submitted.current.has(currentRunId)) return;
    submitted.current.add(currentRunId);

    const won = game.phase === "won";
    const evolved = evolveIdentity(game.identity, won);
    saveNemesisIdentity(evolved);
    setStoredIdentity(evolved);

    setSubmission("saving");
    void saveGameRun({
      clientId: currentRunId,
      gameId: "nemesis",
      score: nemesisScore(game),
      wpm: nemesisWpm(game),
      accuracy: nemesisAccuracy(game),
      words: game.words,
      bestCombo: game.bestCombo,
      nemesisLevel: game.identity.level,
      outcome: won ? "victory" : "defeat",
      durationMs: Math.round(game.elapsedMs),
    })
      .then((response) => {
        if (!response.ok) {
          setSubmission("error");
          return;
        }
        progressionStore.setServer(response.progress);
        setProgressReward(response.reward);
        setSubmission(response.isPersonalBest ? "best" : "saved");
      })
      .catch(() => setSubmission("error"));
  }, [currentRunId, game]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setGame((current) => (current ? toggleNemesisPause(current) : current));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      setGame((current) => (current ? purgeNemesis(current) : current));
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Backspace" || event.key.length === 1) {
      event.preventDefault();
      setGame((current) => (current ? typeNemesisKey(current, event.key, profile) : current));
    }
  }, [profile]);

  if (!identity) {
    return (
      <NemesisShell>
        <p className="m-auto font-mono text-[10px] uppercase tracking-[0.24em] text-raid-faint">Reading the mirror…</p>
      </NemesisShell>
    );
  }

  if (!game) {
    return (
      <NemesisShell>
        <ArenaHeader paused={false} canPause={false} onPause={() => undefined} />
      <main className="nemesis-enter grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,.85fr)] lg:gap-16">
        <section>
          <div className="flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-nemesis">
            <span className="h-px w-8 bg-nemesis/60" /> Arcade transmission 03
          </div>
          <h2 className="mt-5 text-5xl font-black uppercase leading-[0.88] tracking-[-0.075em] sm:text-7xl">
            It types<br /><span className="text-nemesis">like you</span><br />on your worst day.
          </h2>
          <p className="mt-6 max-w-lg text-sm leading-6 text-raid-muted sm:text-base sm:leading-7">
            {profile.hasHistory
              ? "Your Nemesis is forged from the keys and words you actually miss. Every mistake you make in the duel is added to its arsenal on the spot."
              : "You have no recorded mistakes yet, so it will improvise this first duel — and start learning the moment you slip."}
          </p>

          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            {CURSES.map((curse) => (
              <div key={curse.id} className="rounded-xl border border-raid-border bg-raid-fill p-3.5">
                <p className="flex items-center gap-2 text-xs font-bold text-raid-text">
                  <span aria-hidden className="text-nemesis">{curse.glyph}</span> {curse.title}
                </p>
                <p className="mt-1.5 text-[11px] leading-5 text-raid-faint">{curse.rule}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={start}
              className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-nemesis px-7 text-sm font-black text-[#12040a] shadow-[0_18px_45px_-24px_var(--nemesis-text)] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              Face it <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <p className="text-[10px] leading-5 text-raid-faint">
              Type to strike · <strong className="text-raid-text">Tab</strong> purges a curse · Esc pauses
            </p>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[2rem] border border-nemesis/25 bg-raid-surface-soft p-6 shadow-[0_35px_100px_-55px_var(--nemesis-text)] sm:p-8" aria-label="Nemesis dossier">
          <div aria-hidden className="nemesis-scanlines absolute inset-0 opacity-25" />
          <div className="relative">
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-raid-faint">Current rival</p>
            <div className="mt-5 flex flex-col items-center">
              <div className="nemesis-avatar h-28 w-28 text-nemesis">
                <Sigil signature={identity.signature} level={identity.level} />
              </div>
              <div aria-hidden className="nemesis-avatar-reflection -mt-6 h-20 w-28 text-nemesis">
                <Sigil signature={identity.signature} level={identity.level} />
              </div>
            </div>
            <h3 className="nemesis-glitch mt-4 text-center text-xl font-black uppercase tracking-[-0.02em]" data-glitch={identity.name}>
              {identity.name}
            </h3>
            <p className="mt-2 text-center text-[11px] text-raid-faint">
              Born from your <strong className="font-mono text-nemesis">{identity.signature}</strong> key
            </p>

            <dl className="mt-6 grid grid-cols-3 divide-x divide-raid-border overflow-hidden rounded-xl border border-raid-border bg-raid-fill py-3 text-center">
              {[
                ["Level", String(identity.level)],
                ["Your wins", String(identity.wins)],
                ["Its wins", String(identity.losses)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-raid-faint">{label}</dt>
                  <dd className="mt-1 font-mono text-lg font-black">{value}</dd>
                </div>
              ))}
            </dl>

            {identity.grudge > 0 ? (
              <p className="mt-4 rounded-lg border border-nemesis/25 bg-nemesis/10 px-3 py-2 text-center text-[11px] text-raid-muted">
                Grudge {identity.grudge} — it opens harder after every win it takes.
              </p>
            ) : null}

            {identity.masteredKeys.length > 0 ? (
              <div className="mt-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-raid-faint">Keys you took back</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {identity.masteredKeys.map((key) => (
                    <span key={key} className="rounded-md border border-raid-success/30 bg-raid-success/10 px-2 py-1 font-mono text-[11px] font-bold text-raid-success">
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </main>
      </NemesisShell>
    );
  }

  const target = strikeTarget(game);
  const typedLength = game.typed.length;
  const fusePercent = game.strike.fuseMs === 0
    ? 0
    : Math.max(0, (game.strike.remainingMs / game.strike.fuseMs) * 100);
  const accuracy = nemesisAccuracy(game);
  const wpm = nemesisWpm(game);
  const score = nemesisScore(game);
  const autopsy = nemesisAutopsy(game);
  const veiled = game.curse?.id === "veil" && typedLength > 0;
  const won = game.phase === "won";
  const finished = game.phase === "won" || game.phase === "lost";

  return (
    <NemesisShell flash={flash}>
      <ArenaHeader
        paused={game.phase === "paused"}
        canPause={game.phase === "playing" || game.phase === "paused"}
        onPause={() => setGame(toggleNemesisPause(game))}
      />
      <main className="flex flex-1 flex-col gap-3 pt-3">
        <section className="flex items-center gap-4 rounded-2xl border border-nemesis/25 bg-raid-surface-soft p-3 sm:px-5">
          <div className="nemesis-avatar h-12 w-12 shrink-0 text-nemesis sm:h-14 sm:w-14">
            <Sigil signature={game.identity.signature} level={game.identity.level} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black uppercase tracking-[0.06em] sm:text-sm">{game.identity.name}</p>
            <div className="mt-1.5">
              <HealthBar label={`Lv ${game.identity.level}`} value={game.nemesisHp} max={game.nemesisMaxHp} tone="nemesis" />
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-raid-faint">Score</p>
            <p className="font-mono text-xl font-black tabular-nums text-nemesis">{score.toLocaleString()}</p>
          </div>
        </section>

        <section className="relative flex min-h-[20rem] flex-1 flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-raid-border bg-raid-surface-soft px-4 py-8">
          <div aria-hidden className="nemesis-veins absolute inset-0 opacity-40" />

          {game.curse ? (
            <div className="relative mb-6 flex items-center gap-2.5 rounded-full border border-nemesis/35 bg-nemesis/10 px-4 py-1.5">
              <span aria-hidden className="nemesis-word-mirrored font-mono text-sm text-nemesis">{curseById(game.curse.id).glyph}</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-nemesis">{curseById(game.curse.id).title}</span>
              <span className="hidden text-[11px] text-raid-muted sm:inline">{curseById(game.curse.id).rule}</span>
              <span className="font-mono text-[10px] text-raid-faint">{game.curse.wordsLeft} left</span>
            </div>
          ) : (
            <p className="relative mb-6 font-mono text-[9px] uppercase tracking-[0.22em] text-raid-faint">
              {game.strike.memory ? "It remembers this word" : game.strike.marked ? "Weak point exposed" : "Incoming strike"}
            </p>
          )}

          <div className="relative w-full max-w-3xl text-center">
            <p aria-hidden className="nemesis-word nemesis-word-mirrored select-none font-mono text-2xl font-black text-raid-text/10 sm:text-4xl">
              {game.strike.word}
            </p>
            <p
              key={game.strike.id}
              className={`nemesis-word nemesis-strike-in mt-1 break-all font-mono text-4xl font-black sm:text-6xl ${game.strike.marked ? "text-nemesis" : "text-raid-text"}`}
            >
              <span className="text-raid-success">{target.slice(0, typedLength)}</span>
              <span className={veiled ? "nemesis-word-veiled" : undefined}>{target.slice(typedLength)}</span>
            </p>

            <div className={`mx-auto mt-7 h-1.5 max-w-md overflow-hidden rounded-full bg-raid-recessed ${game.strike.marked ? "nemesis-marked" : ""}`}>
              <div
                className="nemesis-fuse-bar h-full rounded-full"
                style={{
                  width: `${fusePercent}%`,
                  backgroundColor: fusePercent < 30 ? "var(--nemesis-text)" : "var(--raid-warning-text)",
                }}
              />
            </div>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-raid-faint">
              fuse · {(game.strike.remainingMs / 1000).toFixed(1)}s
            </p>
          </div>

          <ul className="relative mt-8 w-full max-w-md space-y-1 text-center" aria-live="polite">
            {game.log.slice(0, 3).map((entry, index) => (
              <li
                key={entry.id}
                className={`font-mono text-[10px] ${index === 0 ? "opacity-100" : index === 1 ? "opacity-55" : "opacity-30"} ${entry.tone === "nemesis" ? "text-nemesis" : entry.tone === "player" ? "text-raid-success" : "text-raid-faint"}`}
              >
                {entry.text}
              </li>
            ))}
          </ul>

          {game.phase === "paused" ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-raid-overlay/95 p-6 backdrop-blur-xl">
              <div className="text-center">
                <p className="text-3xl font-black uppercase tracking-[-0.04em]">Held</p>
                <p className="mt-2 text-xs text-raid-muted">It waits. It does not get tired.</p>
                <button type="button" onClick={() => setGame(toggleNemesisPause(game))} className="mt-6 rounded-xl bg-nemesis px-7 py-3 text-sm font-black text-[#12040a]">
                  Resume duel
                </button>
              </div>
            </div>
          ) : null}

          {finished ? (
            <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-raid-overlay/95 p-4 backdrop-blur-xl sm:p-8">
              <div className="nemesis-enter w-full max-w-2xl rounded-[1.75rem] border border-raid-border bg-raid-surface p-5 sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className={`font-mono text-[9px] font-bold uppercase tracking-[0.22em] ${won ? "text-raid-success" : "text-nemesis"}`}>
                      {won ? `${game.identity.name} broken` : `${game.identity.name} stands`}
                    </p>
                    <h2 className="mt-2 text-4xl font-black uppercase leading-none tracking-[-0.06em] sm:text-5xl">
                      {won ? <>You beat<br />yourself.</> : <>It knew<br />your hands.</>}
                    </h2>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-raid-faint">Final score</p>
                    <p className={`mt-1 font-mono text-4xl font-black sm:text-5xl ${won ? "text-raid-success" : "text-nemesis"}`}>
                      {score.toLocaleString()}
                    </p>
                  </div>
                </div>

                <p
                  className={`mt-4 min-h-4 text-xs ${submission === "best" ? "text-raid-success" : submission === "error" ? "text-raid-danger" : "text-raid-muted"}`}
                  role="status"
                >
                  {submission === "saving"
                    ? "Syncing this duel…"
                    : submission === "error"
                      ? "Score and progress could not be saved"
                      : progressReward
                        ? `+${progressReward.earnedXp} XP earned${progressReward.unlockedAchievements[0] ? ` · ${achievementById(progressReward.unlockedAchievements[0]).title} unlocked` : ""}${submission === "best" ? " · new personal best" : ""}`
                        : ""}
                </p>

                <p className="mt-3 rounded-xl border border-nemesis/25 bg-nemesis/10 px-4 py-3 text-xs leading-5 text-raid-muted">
                  {won
                    ? `It reassembles at level ${identity.level}. Stronger, and still made of you.`
                    : `Its grudge rises to ${identity.grudge}. The next duel opens harder.`}
                </p>

                <div className="mt-5 grid grid-cols-2 divide-raid-border overflow-hidden rounded-xl border border-raid-border bg-raid-fill py-3 sm:grid-cols-4 sm:divide-x">
                  <Stat label="Words" value={String(game.words)} />
                  <Stat label="Weak points" value={String(game.markedCleared)} tone="success" />
                  <Stat label="Accuracy" value={`${accuracy.toFixed(0)}%`} />
                  <Stat label="WPM" value={String(wpm)} />
                </div>

                <div className="mt-5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-raid-faint">Autopsy — the keys it attacked</p>
                  {autopsy.length === 0 ? (
                    <p className="mt-2 text-xs text-raid-muted">It never landed a read on a single key. Nothing to fix.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {autopsy.map((verdict) => (
                        <span
                          key={verdict.key}
                          title={`${verdict.hits} hit${verdict.hits === 1 ? "" : "s"}, ${verdict.misses} miss${verdict.misses === 1 ? "" : "es"}`}
                          className={`rounded-md border px-2 py-1 font-mono text-[11px] font-bold ${verdict.broken ? "border-raid-success/30 bg-raid-success/10 text-raid-success" : "border-nemesis/30 bg-nemesis/10 text-nemesis"}`}
                        >
                          {verdict.key === " " ? "space" : verdict.key}
                          <span className="ml-1.5 font-normal opacity-70">{verdict.accuracy.toFixed(0)}%</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <button type="button" onClick={start} className="min-h-11 flex-1 rounded-xl bg-nemesis px-5 text-sm font-black text-[#12040a] transition hover:brightness-110">
                    {won ? "Face what it became" : "Try again"}
                  </button>
                  <Link href="/practice" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-raid-border px-5 text-sm font-bold text-raid-muted transition hover:bg-raid-fill hover:text-raid-text">
                    Drill these keys
                  </Link>
                  <Link href="/leaderboard?game=nemesis" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-raid-border px-5 text-sm font-bold text-raid-muted transition hover:bg-raid-fill hover:text-raid-text">
                    Board
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 rounded-2xl border border-raid-border bg-raid-surface-soft p-3 sm:grid-cols-[1.1fr_auto] sm:items-center sm:px-5">
          <HealthBar label="You" value={game.playerHp} max={NEMESIS_PLAYER_HP} tone="player" />
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="flex gap-4 font-mono text-[9px] text-raid-faint">
              <span><strong className="text-raid-text">{game.combo}×</strong> combo</span>
              <span><strong className="text-raid-text">{accuracy.toFixed(0)}%</strong> acc</span>
              <span className="hidden sm:inline"><strong className="text-raid-text">{wpm}</strong> wpm</span>
            </div>
            <button
              type="button"
              onClick={() => setGame(purgeNemesis(game))}
              disabled={game.purge < NEMESIS_PURGE_COST || game.phase !== "playing"}
              className="flex items-center gap-2 rounded-lg border border-raid-success/35 bg-raid-success/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-raid-success transition enabled:hover:brightness-125 disabled:border-raid-border disabled:bg-raid-fill disabled:text-raid-faint"
            >
              Purge
              <span aria-hidden className="flex gap-0.5">
                {Array.from({ length: NEMESIS_PURGE_COST }, (_, index) => (
                  <span
                    key={index}
                    className={`h-2.5 w-1 rounded-[1px] ${index < game.purge ? "bg-raid-success" : "bg-raid-border"}`}
                  />
                ))}
              </span>
              <span className="sr-only">
                {game.purge} of {NEMESIS_PURGE_COST} charges — clears the active curse and counter-attacks
              </span>
            </button>
          </div>
        </section>

        <div className="flex items-center gap-3 rounded-2xl border border-nemesis/30 bg-raid-bg/95 p-2.5 shadow-[0_18px_55px_-30px_var(--nemesis-text)] sm:p-3">
          <span className="hidden h-9 items-center rounded-lg bg-nemesis/10 px-3 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-nemesis sm:inline-flex">
            Strike
          </span>
          <span aria-hidden className="font-mono text-lg font-black text-nemesis">›</span>
          <input
            ref={inputRef}
            value={game.typed}
            onChange={() => undefined}
            onKeyDown={onKeyDown}
            disabled={game.phase !== "playing"}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Type the strike word"
            placeholder={game.curse?.id === "mirror" ? "Type it backwards…" : "Type the word…"}
            className="min-w-0 flex-1 bg-transparent font-mono text-base font-bold text-raid-text outline-none placeholder:font-normal placeholder:text-raid-faint"
          />
          <span className="shrink-0 font-mono text-[9px] text-raid-faint">{game.fusesLost} burned</span>
        </div>
      </main>
    </NemesisShell>
  );
}
