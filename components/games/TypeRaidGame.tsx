"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSettings } from "@/hooks/useSettings";
import { playSound } from "@/lib/sound";
import { generateWords, type Difficulty } from "@/lib/words";

type Phase = "menu" | "battle" | "paused" | "reward" | "victory" | "defeat";

type Enemy = {
  name: string;
  title: string;
  glyph: string;
  hp: number;
  damage: number;
  attackMs: number;
  difficulty: Difficulty;
  color: string;
};

type UpgradeId = "blade" | "ward" | "heart" | "momentum" | "tempo" | "mercy";

type Upgrade = {
  id: UpgradeId;
  name: string;
  description: string;
  symbol: string;
};

const ENEMIES: readonly Enemy[] = [
  { name: "Glitchling", title: "The broken token", glyph: "G", hp: 58, damage: 9, attackMs: 5_600, difficulty: "easy", color: "#57d9a3" },
  { name: "Syntax Serpent", title: "Keeper of the second gate", glyph: "S", hp: 92, damage: 12, attackMs: 5_000, difficulty: "normal", color: "#67a8ff" },
  { name: "Null Warden", title: "Nothing gets past", glyph: "N", hp: 132, damage: 15, attackMs: 4_500, difficulty: "normal", color: "#ff9f67" },
  { name: "Void Compiler", title: "Final boss · eater of clean builds", glyph: "V", hp: 210, damage: 18, attackMs: 4_000, difficulty: "hard", color: "#bc79ff" },
] as const;

const UPGRADES: readonly Upgrade[] = [
  { id: "blade", name: "Tempered Keys", description: "+4 damage on every completed word.", symbol: "↑" },
  { id: "ward", name: "Quiet Ward", description: "Enemy attacks deal 4 less damage.", symbol: "◇" },
  { id: "heart", name: "Second Wind", description: "+18 maximum health and fully heal.", symbol: "+" },
  { id: "momentum", name: "Combo Crown", description: "Combos add twice as much bonus damage.", symbol: "×" },
  { id: "tempo", name: "Stolen Time", description: "Enemies take 1.2 seconds longer to attack.", symbol: "◷" },
  { id: "mercy", name: "Soft Landing", description: "Typos cost 1 health instead of 3.", symbol: "∿" },
] as const;

const BEST_KEY = "typeflow.typeraid.best";
const WORD_BATCH = 32;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pickRewards(owned: readonly UpgradeId[]): Upgrade[] {
  const available = UPGRADES.filter((upgrade) => !owned.includes(upgrade.id));
  const pool = available.length >= 3 ? available : [...UPGRADES];
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
}

function HealthBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const percent = clamp((value / max) * 100, 0, 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
        <span>{label}</span>
        <span className="font-mono tracking-normal text-white/70">{Math.max(0, value)} / {max}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[.08] ring-1 ring-white/[.06]">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${percent}%`, background: color, boxShadow: `0 0 18px ${color}` }} />
      </div>
    </div>
  );
}

function EnemyAvatar({ enemy, hurt }: { enemy: Enemy; hurt: boolean }) {
  return (
    <div className={`typeraid-enemy relative ${hurt ? "typeraid-enemy-hit" : ""}`} style={{ "--enemy-color": enemy.color } as React.CSSProperties}>
      <div aria-hidden className="absolute inset-5 rounded-full bg-[var(--enemy-color)] opacity-20 blur-2xl" />
      <div className="relative grid h-36 w-36 place-items-center rounded-[38%_62%_55%_45%] border border-white/15 bg-[#171326] shadow-[inset_0_0_50px_rgba(255,255,255,.035),0_22px_70px_-32px_var(--enemy-color)] sm:h-44 sm:w-44">
        <div className="absolute inset-3 rounded-[55%_45%_38%_62%] border border-dashed border-white/10" />
        <span className="font-mono text-6xl font-black text-[var(--enemy-color)] drop-shadow-[0_0_20px_var(--enemy-color)] sm:text-7xl">{enemy.glyph}</span>
        <span className="absolute left-[27%] top-[35%] h-2 w-2 rounded-full bg-white shadow-[0_0_12px_white]" />
        <span className="absolute right-[27%] top-[35%] h-2 w-2 rounded-full bg-white shadow-[0_0_12px_white]" />
      </div>
    </div>
  );
}

export function TypeRaidGame() {
  const { settings } = useSettings();
  const [phase, setPhase] = useState<Phase>("menu");
  const [room, setRoom] = useState(0);
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [enemyHp, setEnemyHp] = useState(ENEMIES[0].hp);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [wordsTyped, setWordsTyped] = useState(0);
  const [errors, setErrors] = useState(0);
  const [typed, setTyped] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [words, setWords] = useState(() => generateWords(WORD_BATCH, "easy"));
  const [attackLeft, setAttackLeft] = useState(ENEMIES[0].attackMs);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [owned, setOwned] = useState<UpgradeId[]>([]);
  const [rewards, setRewards] = useState<Upgrade[]>([]);
  const [bestScore, setBestScore] = useState(0);
  const [enemyHurt, setEnemyHurt] = useState(false);
  const [playerHurt, setPlayerHurt] = useState(false);
  const [floatText, setFloatText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const effectTimers = useRef<number[]>([]);

  const enemy = ENEMIES[room];
  const bonusDamage = owned.includes("blade") ? 4 : 0;
  const armor = owned.includes("ward") ? 4 : 0;
  const comboScale = owned.includes("momentum") ? 2 : 1;
  const attackBonus = owned.includes("tempo") ? 1_200 : 0;
  const typoDamage = owned.includes("mercy") ? 1 : 3;
  const target = words[wordIndex] ?? words[0];
  const nextWords = words.slice(wordIndex + 1, wordIndex + 4);
  const accuracy = wordsTyped + errors === 0 ? 100 : (wordsTyped / (wordsTyped + errors)) * 100;
  const wpm = elapsedMs > 0 ? Math.round((wordsTyped * 60_000) / elapsedMs) : 0;

  const flash = useCallback((kind: "enemy" | "player", text?: string) => {
    if (kind === "enemy") setEnemyHurt(true);
    else setPlayerHurt(true);
    if (text) setFloatText(text);
    const timer = window.setTimeout(() => {
      if (kind === "enemy") setEnemyHurt(false);
      else setPlayerHurt(false);
      if (text) setFloatText(null);
    }, 260);
    effectTimers.current.push(timer);
  }, []);

  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const resetAttack = useCallback((roomIndex: number, ids: readonly UpgradeId[] = owned) => {
    setAttackLeft(ENEMIES[roomIndex].attackMs + (ids.includes("tempo") ? 1_200 : 0));
  }, [owned]);

  const startRun = useCallback(() => {
    effectTimers.current.forEach(window.clearTimeout);
    effectTimers.current = [];
    const first = ENEMIES[0];
    setRoom(0);
    setHp(100);
    setMaxHp(100);
    setEnemyHp(first.hp);
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setWordsTyped(0);
    setErrors(0);
    setTyped("");
    setWordIndex(0);
    setWords(generateWords(WORD_BATCH, first.difficulty));
    setOwned([]);
    setRewards([]);
    setElapsedMs(0);
    setAttackLeft(first.attackMs);
    setPhase("battle");
    focusInput();
  }, [focusInput]);

  const finishRun = useCallback((outcome: "victory" | "defeat", finalScore: number) => {
    setPhase(outcome);
    setBestScore((current) => {
      const next = Math.max(current, finalScore);
      try {
        window.localStorage.setItem(BEST_KEY, String(next));
      } catch {
        // A blocked local store should never stop the game.
      }
      return next;
    });
  }, []);

  const completeRoom = useCallback((nextScore: number) => {
    if (room >= ENEMIES.length - 1) {
      const victoryScore = nextScore + hp * 20;
      setScore(victoryScore);
      finishRun("victory", victoryScore);
      return;
    }
    setRewards(pickRewards(owned));
    setPhase("reward");
  }, [finishRun, hp, owned, room]);

  const completeWord = useCallback(() => {
    const nextCombo = combo + 1;
    const comboDamage = Math.floor(nextCombo / 3) * 2 * comboScale;
    const critical = nextCombo > 0 && nextCombo % 8 === 0;
    const damage = (10 + bonusDamage + comboDamage) * (critical ? 2 : 1);
    const remaining = Math.max(0, enemyHp - damage);
    const nextScore = score + damage * 12 + nextCombo * 5 + room * 40;

    setEnemyHp(remaining);
    setScore(nextScore);
    setCombo(nextCombo);
    setBestCombo((current) => Math.max(current, nextCombo));
    setWordsTyped((current) => current + 1);
    setTyped("");
    setWordIndex((current) => {
      if (current < words.length - 5) return current + 1;
      setWords(generateWords(WORD_BATCH, enemy.difficulty));
      return 0;
    });
    flash("enemy", critical ? `CRIT ${damage}` : `-${damage}`);
    if (settings.sound) playSound("key");
    if (remaining === 0) completeRoom(nextScore);
  }, [bonusDamage, combo, comboScale, completeRoom, enemy.difficulty, enemyHp, flash, room, score, settings.sound, words.length]);

  const registerTypo = useCallback(() => {
    setErrors((current) => current + 1);
    setCombo(0);
    setScore((current) => Math.max(0, current - 20));
    setHp((current) => {
      const next = Math.max(0, current - typoDamage);
      if (next === 0) finishRun("defeat", score);
      return next;
    });
    flash("player", `-${typoDamage}`);
    if (settings.sound) playSound("error");
  }, [finishRun, flash, score, settings.sound, typoDamage]);

  const handleKey = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setPhase((current) => current === "battle" ? "paused" : current === "paused" ? "battle" : current);
      return;
    }
    if (phase !== "battle") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      setTyped((current) => current.slice(0, -1));
      return;
    }
    if (event.key.length !== 1) return;
    event.preventDefault();
    if (event.key !== target[typed.length]) {
      registerTypo();
      return;
    }
    const next = typed + event.key;
    if (next === target) completeWord();
    else setTyped(next);
  }, [completeWord, phase, registerTypo, target, typed]);

  const chooseUpgrade = useCallback((upgrade: Upgrade) => {
    const nextOwned = owned.includes(upgrade.id) ? owned : [...owned, upgrade.id];
    setOwned(nextOwned);
    if (upgrade.id === "heart") {
      setMaxHp((current) => current + 18);
      setHp((current) => maxHp + 18 > current ? maxHp + 18 : current);
    } else {
      setHp((current) => Math.min(maxHp, current + 14));
    }

    const nextRoom = room + 1;
    const nextEnemy = ENEMIES[nextRoom];
    setRoom(nextRoom);
    setEnemyHp(nextEnemy.hp);
    setCombo(0);
    setTyped("");
    setWordIndex(0);
    setWords(generateWords(WORD_BATCH, nextEnemy.difficulty));
    resetAttack(nextRoom, nextOwned);
    setPhase("battle");
    focusInput();
  }, [focusInput, maxHp, owned, resetAttack, room]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setBestScore(Number(window.localStorage.getItem(BEST_KEY)) || 0);
      } catch {
        setBestScore(0);
      }
    });
    return () => effectTimers.current.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    if (phase !== "battle") return;
    const timer = window.setInterval(() => {
      setElapsedMs((current) => current + 100);
      setAttackLeft((current) => {
        const next = current - 100;
        if (next > 0) return next;
        const incoming = Math.max(1, enemy.damage - armor);
        setHp((currentHp) => {
          const nextHp = Math.max(0, currentHp - incoming);
          if (nextHp === 0) finishRun("defeat", score);
          return nextHp;
        });
        setCombo(0);
        flash("player", `-${incoming}`);
        if (settings.sound) playSound("error");
        return enemy.attackMs + attackBonus;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [armor, attackBonus, enemy.attackMs, enemy.damage, finishRun, flash, phase, score, settings.sound]);

  useEffect(() => {
    if (phase === "battle") focusInput();
  }, [focusInput, phase]);

  const attackPercent = clamp((attackLeft / (enemy.attackMs + attackBonus)) * 100, 0, 100);
  const runStats = useMemo(() => [
    { label: "Score", value: score.toLocaleString() },
    { label: "Combo", value: `${combo}×` },
    { label: "WPM", value: String(wpm) },
    { label: "Accuracy", value: `${accuracy.toFixed(0)}%` },
  ], [accuracy, combo, score, wpm]);

  return (
    <div className="typeraid-shell relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[#09070f] text-white">
      <div aria-hidden className="typeraid-grid absolute inset-0 opacity-35" />
      <div aria-hidden className="absolute left-1/2 top-[-18rem] h-[38rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,.22),transparent_68%)]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col px-4 py-5 sm:px-6 sm:py-7">
        <header className="flex items-center justify-between gap-4">
          <Link href="/games" className="group flex items-center gap-3 text-white/55 transition-colors hover:text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[.04] transition-transform group-hover:-translate-x-0.5">←</span>
            <span className="hidden text-xs font-medium uppercase tracking-[0.16em] sm:inline">Arcade</span>
          </Link>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a58dff]">TypeFlow presents</p>
            <h1 className="mt-0.5 text-lg font-bold tracking-[-0.04em]">TypeRaid</h1>
          </div>
          <div className="min-w-20 text-right">
            <p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Best</p>
            <p className="font-mono text-sm font-semibold text-white/75">{bestScore.toLocaleString()}</p>
          </div>
        </header>

        {phase === "menu" ? (
          <main className="grid flex-1 place-items-center py-10">
            <section className="typeraid-enter w-full max-w-4xl text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-[38%_62%_58%_42%] border border-[#9b7cff]/30 bg-[#9b7cff]/10 shadow-[0_0_80px_-20px_#7c5cff]">
                <span className="font-mono text-5xl font-black text-[#af9aff] drop-shadow-[0_0_20px_#7c5cff]">T</span>
              </div>
              <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a58dff]">A four-room typing roguelike</p>
              <h2 className="mx-auto mt-3 max-w-3xl text-5xl font-bold leading-[.92] tracking-[-0.065em] sm:text-7xl">
                Type fast.<br /><span className="text-white/30">Survive the void.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-sm leading-6 text-white/48">
                Complete words to strike. Build combos for heavier damage. One wrong key hurts—and every enemy is faster than the last.
              </p>
              <button type="button" onClick={startRun} className="mt-8 rounded-2xl bg-[#8a6cff] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_12px_40px_-14px_#7c5cff] transition hover:-translate-y-0.5 hover:bg-[#9b81ff] active:translate-y-0">
                Begin the raid
              </button>
              <div className="mx-auto mt-9 grid max-w-xl grid-cols-3 gap-2 text-left">
                {[['TYPE', 'Words attack'], ['COMBO', 'Streaks amplify'], ['UPGRADE', 'Evolve each room']].map(([label, body]) => (
                  <div key={label} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
                    <p className="text-[9px] font-semibold tracking-[.14em] text-[#9f87ff]">{label}</p>
                    <p className="mt-1 text-[11px] text-white/42">{body}</p>
                  </div>
                ))}
              </div>
            </section>
          </main>
        ) : (
          <main className="flex flex-1 flex-col py-5 sm:py-7">
            <div className="mx-auto grid w-full max-w-5xl grid-cols-4 gap-2 sm:gap-3">
              {runStats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/[.07] bg-white/[.025] px-3 py-2.5 text-center sm:px-5">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/32 sm:text-[9px]">{stat.label}</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-white/85 sm:text-lg">{stat.value}</p>
                </div>
              ))}
            </div>

            <section className="mx-auto mt-5 grid w-full max-w-5xl flex-1 gap-6 lg:grid-cols-[1fr_1.15fr] lg:items-center">
              <div className="flex flex-col items-center">
                <div className="mb-3 flex items-center gap-2">
                  {ENEMIES.map((entry, index) => (
                    <span key={entry.name} className={`h-1.5 rounded-full transition-all ${index === room ? "w-8 bg-[#9b7cff]" : index < room ? "w-4 bg-[#57d9a3]" : "w-4 bg-white/10"}`} />
                  ))}
                </div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Room {room + 1} of {ENEMIES.length}</p>
                <div className="relative mt-5">
                  <EnemyAvatar enemy={enemy} hurt={enemyHurt} />
                  {floatText && enemyHurt ? <span className="typeraid-float absolute right-0 top-8 font-mono text-lg font-black text-white">{floatText}</span> : null}
                </div>
                <h2 className="mt-5 text-xl font-semibold tracking-tight">{enemy.name}</h2>
                <p className="mt-1 text-xs text-white/35">{enemy.title}</p>
                <div className="mt-5 w-full max-w-sm">
                  <HealthBar value={enemyHp} max={enemy.hp} color={enemy.color} label="Enemy integrity" />
                  <div className="mt-3">
                    <div className="mb-1.5 flex justify-between text-[9px] uppercase tracking-[0.13em] text-white/30"><span>Incoming attack</span><span>{Math.max(0, attackLeft / 1000).toFixed(1)}s</span></div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full bg-white/40 transition-[width] duration-100" style={{ width: `${attackPercent}%` }} /></div>
                  </div>
                </div>
              </div>

              <div className={`relative rounded-3xl border border-white/[.08] bg-[#11101a]/90 p-5 shadow-[0_32px_90px_-50px_#7c5cff] backdrop-blur sm:p-7 ${playerHurt ? "typeraid-player-hit" : ""}`} onClick={focusInput}>
                {floatText && playerHurt ? <span className="typeraid-float absolute right-6 top-4 z-10 font-mono text-lg font-black text-[#ff6688]">{floatText}</span> : null}
                <HealthBar value={hp} max={maxHp} color={hp < maxHp * 0.3 ? "#ff5c7a" : "#8b70ff"} label="Your health" />

                <div className="mt-9 text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/28">Type to attack</p>
                  <div className="mt-4 min-h-16 break-all font-mono text-[clamp(2rem,7vw,4.4rem)] font-bold leading-none tracking-[-0.055em]">
                    <span className="text-[#a88fff]">{target.slice(0, typed.length)}</span>
                    <span className="relative text-white/85">
                      <span className="absolute -left-px bottom-0 top-0 w-[2px] animate-pulse bg-[#a88fff]" />
                      {target.slice(typed.length)}
                    </span>
                  </div>
                  <div className="mt-5 flex justify-center gap-4 font-mono text-sm text-white/18">
                    {nextWords.map((word) => <span key={word}>{word}</span>)}
                  </div>
                </div>

                <div className="mt-9 flex items-center justify-between border-t border-white/[.06] pt-4 text-[10px] text-white/30">
                  <span>Wrong keys deal {typoDamage} damage</span>
                  <button type="button" onClick={() => setPhase("paused")} className="rounded-lg px-2 py-1 transition-colors hover:bg-white/[.06] hover:text-white/65">Esc · pause</button>
                </div>
                <input ref={inputRef} value="" onChange={() => undefined} onKeyDown={handleKey} aria-label={`Type the word ${target}`} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} className="pointer-events-none absolute h-px w-px opacity-0" />
              </div>
            </section>

            {owned.length > 0 ? (
              <div className="mx-auto mt-5 flex max-w-5xl flex-wrap justify-center gap-2">
                {owned.map((id) => {
                  const upgrade = UPGRADES.find((item) => item.id === id)!;
                  return <span key={id} title={upgrade.description} className="rounded-full border border-white/[.07] bg-white/[.03] px-3 py-1 text-[10px] text-white/40"><span className="mr-1.5 text-[#a78fff]">{upgrade.symbol}</span>{upgrade.name}</span>;
                })}
              </div>
            ) : null}
          </main>
        )}

        {phase === "paused" ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-[#09070f]/85 p-5 backdrop-blur-md">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9f87ff]">Run suspended</p>
              <h2 className="mt-2 text-4xl font-bold tracking-[-0.05em]">Catch your breath.</h2>
              <button type="button" onClick={() => { setPhase("battle"); focusInput(); }} className="mt-7 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#0b0912]">Resume raid</button>
            </div>
          </div>
        ) : null}

        {phase === "reward" ? (
          <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-[#09070f]/94 p-5 backdrop-blur-xl">
            <section className="w-full max-w-4xl py-8 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#64dca9]">Room cleared</p>
              <h2 className="mt-2 text-4xl font-bold tracking-[-0.05em] sm:text-5xl">Choose your advantage.</h2>
              <p className="mt-3 text-sm text-white/38">You recover 14 health after choosing. Pick carefully—the void gets faster.</p>
              <div className="mt-9 grid gap-3 md:grid-cols-3">
                {rewards.map((upgrade, index) => (
                  <button key={upgrade.id} type="button" onClick={() => chooseUpgrade(upgrade)} className="group rounded-2xl border border-white/[.09] bg-white/[.035] p-6 text-left transition duration-200 hover:-translate-y-1 hover:border-[#9d83ff]/55 hover:bg-[#9d83ff]/10">
                    <div className="flex items-start justify-between">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#9d83ff]/12 font-mono text-xl font-bold text-[#ad99ff]">{upgrade.symbol}</span>
                      <span className="font-mono text-[10px] text-white/20">0{index + 1}</span>
                    </div>
                    <h3 className="mt-8 text-lg font-semibold">{upgrade.name}</h3>
                    <p className="mt-2 text-xs leading-5 text-white/42">{upgrade.description}</p>
                    <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a58eff] opacity-0 transition-opacity group-hover:opacity-100">Take upgrade →</p>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {phase === "victory" || phase === "defeat" ? (
          <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-[#09070f]/94 p-5 backdrop-blur-xl">
            <section className="w-full max-w-2xl py-8 text-center">
              <div className={`mx-auto grid h-20 w-20 place-items-center rounded-[38%_62%_55%_45%] border ${phase === "victory" ? "border-[#65dca9]/30 bg-[#65dca9]/10 text-[#65dca9]" : "border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-[#ff718d]"}`}>
                <span className="font-mono text-3xl font-black">{phase === "victory" ? "V" : "×"}</span>
              </div>
              <p className={`mt-7 text-[10px] font-semibold uppercase tracking-[0.22em] ${phase === "victory" ? "text-[#65dca9]" : "text-[#ff718d]"}`}>{phase === "victory" ? "Raid complete" : `Fallen in room ${room + 1}`}</p>
              <h2 className="mt-2 text-5xl font-bold tracking-[-0.06em] sm:text-6xl">{phase === "victory" ? "The void compiled." : "The void won."}</h2>
              <p className="mt-4 text-sm text-white/38">{phase === "victory" ? "Every enemy defeated. Your keyboard survives another day." : "A cleaner combo might be all that stands between you and the next room."}</p>
              <div className="mt-9 grid grid-cols-4 overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.025]">
                {[{ label: "Score", value: score.toLocaleString() }, { label: "Words", value: wordsTyped }, { label: "Best combo", value: `${bestCombo}×` }, { label: "Accuracy", value: `${accuracy.toFixed(0)}%` }].map((stat) => (
                  <div key={stat.label} className="border-r border-white/[.07] px-2 py-4 last:border-r-0">
                    <p className="text-[8px] uppercase tracking-[.12em] text-white/28">{stat.label}</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-white/85 sm:text-lg">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={startRun} className="rounded-xl bg-[#8a6cff] px-6 py-3 text-sm font-semibold transition hover:bg-[#9b81ff]">Raid again</button>
                <Link href="/games" className="rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-white/55 transition hover:bg-white/[.05] hover:text-white">Back to arcade</Link>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
