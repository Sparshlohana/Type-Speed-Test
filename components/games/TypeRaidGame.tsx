"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSettings } from "@/hooks/useSettings";
import { playSound } from "@/lib/sound";
import { generateWords, type Difficulty } from "@/lib/words";

type Phase = "menu" | "briefing" | "battle" | "paused" | "reward" | "victory" | "defeat";

type Enemy = {
  name: string;
  title: string;
  sprite: string;
  hp: number;
  damage: number;
  attackMs: number;
  difficulty: Difficulty;
  color: string;
};

type UpgradeId =
  | "blade"
  | "ward"
  | "heart"
  | "momentum"
  | "tempo"
  | "mercy"
  | "echo"
  | "leech"
  | "fracture"
  | "execute"
  | "rage"
  | "phoenix"
  | "overclock"
  | "heavy"
  | "buffer"
  | "carry"
  | "cascade"
  | "anchor"
  | "prelude";

type UpgradeRarity = "common" | "rare" | "epic" | "legendary";

type Upgrade = {
  id: UpgradeId;
  name: string;
  description: string;
  symbol: string;
  kind: "offense" | "defense" | "utility";
  rarity: UpgradeRarity;
};

const ENEMIES: readonly Enemy[] = [
  { name: "Glitchling", title: "The broken token", sprite: "/games/typeraid/glitchling.webp", hp: 58, damage: 9, attackMs: 5_600, difficulty: "easy", color: "#57d9a3" },
  { name: "Syntax Serpent", title: "Keeper of the second gate", sprite: "/games/typeraid/syntax-serpent.webp", hp: 92, damage: 12, attackMs: 5_000, difficulty: "normal", color: "#67a8ff" },
  { name: "Null Warden", title: "Nothing gets past", sprite: "/games/typeraid/null-warden.webp", hp: 132, damage: 15, attackMs: 4_500, difficulty: "normal", color: "#ff9f67" },
  { name: "Void Compiler", title: "Final boss · eater of clean builds", sprite: "/games/typeraid/void-compiler.webp", hp: 210, damage: 18, attackMs: 4_000, difficulty: "hard", color: "#bc79ff" },
] as const;

const UPGRADES: readonly Upgrade[] = [
  { id: "blade", name: "Tempered Keys", description: "+4 damage on every completed word.", symbol: "↑", kind: "offense", rarity: "common" },
  { id: "ward", name: "Quiet Ward", description: "Enemy attacks deal 4 less damage.", symbol: "◇", kind: "defense", rarity: "common" },
  { id: "heart", name: "Second Wind", description: "+18 maximum health and fully heal.", symbol: "+", kind: "defense", rarity: "common" },
  { id: "mercy", name: "Soft Landing", description: "Typos cost 1 health instead of 3.", symbol: "∿", kind: "defense", rarity: "common" },
  { id: "momentum", name: "Combo Crown", description: "Combo damage ramps every 2 words instead of 3, and by 3 instead of 2.", symbol: "×", kind: "offense", rarity: "rare" },
  { id: "tempo", name: "Stolen Time", description: "Enemies take 1.2 seconds longer to attack.", symbol: "◷", kind: "utility", rarity: "rare" },
  { id: "leech", name: "Vampiric Script", description: "Every clean word restores 2 health.", symbol: "♥", kind: "defense", rarity: "rare" },
  { id: "rage", name: "Berserker Buffer", description: "+6 word damage while you are at or below half health.", symbol: "!", kind: "offense", rarity: "rare" },
  { id: "overclock", name: "Overclock", description: "Critical hits land every 5th combo word instead of every 8th.", symbol: "⚡", kind: "offense", rarity: "rare" },
  { id: "heavy", name: "Heavy Payload", description: "+8 damage on words of 7 characters or more.", symbol: "▮", kind: "offense", rarity: "rare" },
  { id: "buffer", name: "Buffer Overflow", description: "The first typo in each room costs no health and keeps your combo.", symbol: "⛉", kind: "defense", rarity: "rare" },
  { id: "carry", name: "Warm Cache", description: "Keep your combo when you walk into the next room.", symbol: "→", kind: "utility", rarity: "rare" },
  { id: "echo", name: "Arcane Echo", description: "Every 4th clean word strikes twice for double damage.", symbol: "Ⅱ", kind: "offense", rarity: "epic" },
  { id: "fracture", name: "Time Fracture", description: "Every clean word pushes the enemy timer back 0.45s.", symbol: "↶", kind: "utility", rarity: "epic" },
  { id: "execute", name: "Execute.exe", description: "Deal double damage while the enemy is below 30% health.", symbol: "⌁", kind: "offense", rarity: "epic" },
  { id: "cascade", name: "Cascade", description: "Every word deals bonus damage equal to your current combo.", symbol: "≫", kind: "offense", rarity: "epic" },
  { id: "anchor", name: "Anchor Frame", description: "Enemy attacks no longer cut your combo.", symbol: "⚓", kind: "utility", rarity: "epic" },
  { id: "phoenix", name: "Phoenix Cache", description: "Survive one lethal hit and return with 35 health.", symbol: "✦", kind: "defense", rarity: "legendary" },
  { id: "prelude", name: "Cold Open", description: "Each room starts with 6 extra seconds before the enemy can attack.", symbol: "❄", kind: "utility", rarity: "legendary" },
] as const;

const RARITY_META: Record<UpgradeRarity, { label: string; color: string; soft: string }> = {
  common: { label: "Common", color: "var(--raid-common)", soft: "color-mix(in srgb, var(--raid-common) 10%, transparent)" },
  rare: { label: "Rare", color: "var(--raid-rare)", soft: "color-mix(in srgb, var(--raid-rare) 10%, transparent)" },
  epic: { label: "Epic", color: "var(--raid-epic)", soft: "color-mix(in srgb, var(--raid-epic) 11%, transparent)" },
  legendary: { label: "Legendary", color: "var(--raid-legendary)", soft: "color-mix(in srgb, var(--raid-legendary) 12%, transparent)" },
};

const RARITY_WEIGHTS: readonly Record<UpgradeRarity, number>[] = [
  { common: 56, rare: 30, epic: 12, legendary: 2 },
  { common: 40, rare: 36, epic: 20, legendary: 4 },
  { common: 22, rare: 38, epic: 32, legendary: 8 },
];

const BEST_KEY = "typeflow.typeraid.best";
const WORD_BATCH = 32;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function weightedUpgrade(pool: readonly Upgrade[], clearedRoom: number): Upgrade | undefined {
  const weights = RARITY_WEIGHTS[Math.min(clearedRoom, RARITY_WEIGHTS.length - 1)];
  const rarities = (Object.keys(weights) as UpgradeRarity[])
    .filter((rarity) => pool.some((upgrade) => upgrade.rarity === rarity));
  const total = rarities.reduce((sum, rarity) => sum + weights[rarity], 0);
  if (total === 0) return pool[0];
  let roll = Math.random() * total;
  for (const rarity of rarities) {
    roll -= weights[rarity];
    if (roll <= 0) {
      const matches = pool.filter((upgrade) => upgrade.rarity === rarity);
      return matches[Math.floor(Math.random() * matches.length)];
    }
  }
  return pool.at(-1);
}

function pickRewards(owned: readonly UpgradeId[], clearedRoom: number): Upgrade[] {
  // Never offer something already owned: picking it would burn the whole reward
  // for nothing but the consolation heal.
  const pool = UPGRADES.filter((upgrade) => !owned.includes(upgrade.id));
  const bossPrep = clearedRoom >= ENEMIES.length - 2;
  const offensePool = pool.filter((upgrade) =>
    upgrade.kind === "offense" && (!bossPrep || upgrade.rarity === "epic"),
  );
  const first = weightedUpgrade(offensePool.length > 0 ? offensePool : pool, clearedRoom);
  const picks = first ? [first] : [];
  while (picks.length < 3) {
    const next = weightedUpgrade(
      pool.filter((upgrade) => !picks.some((picked) => picked.id === upgrade.id)),
      clearedRoom,
    );
    if (!next) break;
    picks.push(next);
  }
  return picks;
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
    <div className={`typeraid-enemy relative h-56 w-56 sm:h-72 sm:w-72 ${hurt ? "typeraid-enemy-hit" : ""}`} style={{ "--enemy-color": enemy.color } as React.CSSProperties}>
      <div aria-hidden className="absolute inset-[18%] rounded-full bg-[var(--enemy-color)] opacity-25 blur-3xl" />
      <Image
        src={enemy.sprite}
        alt={`${enemy.name}, ${enemy.title}`}
        fill
        priority
        sizes="(min-width: 640px) 288px, 224px"
        className="relative object-contain drop-shadow-[0_24px_35px_color-mix(in_srgb,var(--raid-text)_45%,transparent)]"
      />
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
  const [phoenixUsed, setPhoenixUsed] = useState(false);
  const [bufferUsed, setBufferUsed] = useState(false);
  const [enemyHurt, setEnemyHurt] = useState(false);
  const [playerHurt, setPlayerHurt] = useState(false);
  const [floatText, setFloatText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const effectTimers = useRef<number[]>([]);

  const enemy = ENEMIES[room];
  const bonusDamage = owned.includes("blade") ? 4 : 0;
  const armor = owned.includes("ward") ? 4 : 0;
  const comboStep = owned.includes("momentum") ? 2 : 3;
  const comboScale = owned.includes("momentum") ? 3 : 2;
  const critEvery = owned.includes("overclock") ? 5 : 8;
  const attackBonus = owned.includes("tempo") ? 1_200 : 0;
  const typoDamage = owned.includes("mercy") ? 1 : 3;
  const rageDamage = owned.includes("rage") && hp <= maxHp / 2 ? 6 : 0;
  const target = words[wordIndex] ?? words[0];
  const heavyDamage = owned.includes("heavy") && target.length >= 7 ? 8 : 0;
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

  const roomStartTimer = useCallback((roomIndex: number, ids: readonly UpgradeId[]) =>
    ENEMIES[roomIndex].attackMs
      + (ids.includes("tempo") ? 1_200 : 0)
      + (ids.includes("prelude") ? 6_000 : 0), []);

  const resetAttack = useCallback((roomIndex: number, ids: readonly UpgradeId[] = owned) => {
    setAttackLeft(roomStartTimer(roomIndex, ids));
  }, [owned, roomStartTimer]);

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
    setPhoenixUsed(false);
    setBufferUsed(false);
    setAttackLeft(first.attackMs);
    setPhase("briefing");
  }, []);

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
    setRewards(pickRewards(owned, room));
    setPhase("reward");
  }, [finishRun, hp, owned, room]);

  const completeWord = useCallback(() => {
    const nextCombo = combo + 1;
    const comboDamage = Math.floor(nextCombo / comboStep) * comboScale;
    const cascadeDamage = owned.includes("cascade") ? nextCombo : 0;
    const critical = nextCombo > 0 && nextCombo % critEvery === 0;
    const echoStrike = owned.includes("echo") && (wordsTyped + 1) % 4 === 0;
    const executeStrike = owned.includes("execute") && enemyHp <= enemy.hp * 0.3;
    const multiplier = (critical ? 2 : 1) * (echoStrike ? 2 : 1) * (executeStrike ? 2 : 1);
    const damage = (10 + bonusDamage + comboDamage + cascadeDamage + heavyDamage + rageDamage) * multiplier;
    const remaining = Math.max(0, enemyHp - damage);
    const nextScore = score + damage * 12 + nextCombo * 5 + room * 40;

    setEnemyHp(remaining);
    setScore(nextScore);
    setCombo(nextCombo);
    setBestCombo((current) => Math.max(current, nextCombo));
    setWordsTyped((current) => current + 1);
    if (owned.includes("leech")) {
      setHp((current) => Math.min(maxHp, current + 2));
    }
    if (owned.includes("fracture") && remaining > 0) {
      setAttackLeft((current) => Math.max(current, Math.min(enemy.attackMs + attackBonus, current + 450)));
    }
    setTyped("");
    setWordIndex((current) => {
      if (current < words.length - 5) return current + 1;
      setWords(generateWords(WORD_BATCH, enemy.difficulty));
      return 0;
    });
    const hitLabel = echoStrike ? `ECHO ${damage}` : executeStrike ? `EXECUTE ${damage}` : critical ? `CRIT ${damage}` : `-${damage}`;
    flash("enemy", hitLabel);
    if (settings.sound) playSound("key");
    if (remaining === 0) completeRoom(nextScore);
  }, [attackBonus, bonusDamage, combo, comboScale, comboStep, completeRoom, critEvery, enemy.attackMs, enemy.difficulty, enemy.hp, enemyHp, flash, heavyDamage, maxHp, owned, rageDamage, room, score, settings.sound, words.length, wordsTyped]);

  const registerTypo = useCallback(() => {
    setErrors((current) => current + 1);
    if (owned.includes("buffer") && !bufferUsed) {
      setBufferUsed(true);
      flash("player", "ABSORBED");
      if (settings.sound) playSound("error");
      return;
    }
    setCombo(0);
    setScore((current) => Math.max(0, current - 20));
    setHp((current) => {
      const next = Math.max(0, current - typoDamage);
      if (next === 0 && owned.includes("phoenix") && !phoenixUsed) {
        setPhoenixUsed(true);
        flash("player", "REVIVED 35");
        return Math.min(maxHp, 35);
      }
      if (next === 0) finishRun("defeat", score);
      return next;
    });
    if (!(owned.includes("phoenix") && !phoenixUsed && hp <= typoDamage)) {
      flash("player", `-${typoDamage}`);
    }
    if (settings.sound) playSound("error");
  }, [bufferUsed, finishRun, flash, hp, maxHp, owned, phoenixUsed, score, settings.sound, typoDamage]);

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
    if (!nextOwned.includes("carry")) setCombo(0);
    setBufferUsed(false);
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
          if (nextHp === 0 && owned.includes("phoenix") && !phoenixUsed) {
            setPhoenixUsed(true);
            flash("player", "REVIVED 35");
            return Math.min(maxHp, 35);
          }
          if (nextHp === 0) finishRun("defeat", score);
          return nextHp;
        });
        if (!owned.includes("anchor")) setCombo((current) => Math.floor(current / 2));
        if (!(owned.includes("phoenix") && !phoenixUsed && hp <= incoming)) {
          flash("player", `-${incoming}`);
        }
        if (settings.sound) playSound("error");
        return enemy.attackMs + attackBonus;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [armor, attackBonus, enemy.attackMs, enemy.damage, finishRun, flash, hp, maxHp, owned, phase, phoenixUsed, score, settings.sound]);

  useEffect(() => {
    if (phase === "battle") focusInput();
  }, [focusInput, phase]);

  useEffect(() => {
    const modalOpen = phase === "briefing" || phase === "paused" || phase === "reward" || phase === "victory" || phase === "defeat";
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  const attackPercent = clamp((attackLeft / (enemy.attackMs + attackBonus)) * 100, 0, 100);
  const nextEcho = owned.includes("echo") && (wordsTyped + 1) % 4 === 0;
  const nextExecute = owned.includes("execute") && enemyHp <= enemy.hp * 0.3;
  const nextCrit = (combo + 1) % critEvery === 0;
  const nextWordMultiplier = (nextEcho ? 2 : 1) * (nextExecute ? 2 : 1) * (nextCrit ? 2 : 1);
  const nextWordDamage = (10 + bonusDamage + rageDamage + heavyDamage
    + (owned.includes("cascade") ? combo + 1 : 0)
    + Math.floor((combo + 1) / comboStep) * comboScale) * nextWordMultiplier;
  const runStats = useMemo(() => [
    { label: "Score", value: score.toLocaleString() },
    { label: "Combo", value: `${combo}×` },
    { label: "WPM", value: String(wpm) },
    { label: "Accuracy", value: `${accuracy.toFixed(0)}%` },
  ], [accuracy, combo, score, wpm]);

  return (
    <div className="typeraid-shell relative isolate min-h-[calc(100vh-4rem)] overflow-hidden bg-raid-bg text-raid-text">
      <div aria-hidden className="typeraid-grid absolute inset-0 opacity-35" />
      <div aria-hidden className="absolute left-1/2 top-[-18rem] h-[38rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(124,92,255,.22),transparent_68%)]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col px-4 py-5 sm:px-6 sm:py-7">
        <header className="flex items-center justify-between gap-4">
          <Link href="/games" className="group flex items-center gap-3 text-white/55 transition-colors hover:text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[.04] transition-transform group-hover:-translate-x-0.5">←</span>
            <span className="hidden text-xs font-medium uppercase tracking-[0.16em] sm:inline">Arcade</span>
          </Link>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-raid-accent">TypeFlow presents</p>
            <h1 className="mt-0.5 text-lg font-bold tracking-[-0.04em]">TypeRaid</h1>
          </div>
          <div className="flex min-w-20 items-center justify-end gap-2 text-right">
            {phase === "battle" || phase === "paused" ? (
              <button
                type="button"
                onClick={() => setPhase("briefing")}
                className="rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-1.5 text-[10px] font-semibold text-white/55 transition hover:bg-white/[.08] hover:text-white"
              >
                ? Rules
              </button>
            ) : null}
            <div className="hidden sm:block">
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/35">Best</p>
              <p className="font-mono text-sm font-semibold text-white/75">{bestScore.toLocaleString()}</p>
            </div>
          </div>
        </header>

        {phase === "menu" ? (
          <main className="grid flex-1 place-items-center py-10">
            <section className="typeraid-enter w-full max-w-4xl text-center">
              <div className="mx-auto grid h-28 w-28 place-items-center rounded-[38%_62%_58%_42%] border border-[#9b7cff]/30 bg-[#9b7cff]/10 shadow-[0_0_80px_-20px_#7c5cff]">
                <span className="font-mono text-5xl font-black text-raid-accent drop-shadow-[0_0_20px_#7c5cff]">T</span>
              </div>
              <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.24em] text-raid-accent">A four-room typing roguelike</p>
              <h2 className="mx-auto mt-3 max-w-3xl text-5xl font-bold leading-[.92] tracking-[-0.065em] sm:text-7xl">
                Type fast.<br /><span className="text-white/30">Survive the void.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-sm leading-6 text-white/48">
                Defeat four monsters using only your keyboard. Every completed word attacks; every wrong key hurts you.
              </p>
              <button type="button" onClick={startRun} className="mt-8 rounded-2xl bg-[#8a6cff] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_12px_40px_-14px_#7c5cff] transition hover:-translate-y-0.5 hover:bg-[#9b81ff] active:translate-y-0">
                Begin the raid
              </button>
              <div className="mx-auto mt-9 grid max-w-2xl grid-cols-3 gap-2 text-left">
                {[['1 · TYPE', 'Finish the shown word to hit the enemy.'], ['2 · SURVIVE', 'Beat its red attack timer and avoid typos.'], ['3 · UPGRADE', 'Defeat it, choose a power, then enter the next room.']].map(([label, body]) => (
                  <div key={label} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
                    <p className="text-[9px] font-semibold tracking-[.14em] text-raid-accent">{label}</p>
                    <p className="mt-1 text-[11px] leading-4 text-white/42">{body}</p>
                  </div>
                ))}
              </div>
            </section>
          </main>
        ) : (
          <main className="flex flex-1 flex-col py-4 sm:py-6">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-[#9b7cff]/20 bg-[#9b7cff]/[.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#9b7cff]/15 text-raid-accent">⚔</span>
                <div>
                  <p className="text-xs font-semibold text-white/85">Your objective: reduce the enemy&apos;s green health to zero.</p>
                  <p className="mt-0.5 text-[10px] text-white/38">Type the large word exactly. The next word appears automatically—no Space or Enter needed.</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-[#ff5c7a]/[.08] px-2.5 py-1.5 text-[9px] text-raid-danger sm:hidden">
                <span>Enemy strikes in</span>
                <strong className="font-mono text-xs">{Math.max(0, attackLeft / 1000).toFixed(1)}s</strong>
              </div>
              <div className="grid grid-cols-4 gap-5 sm:shrink-0">
              {runStats.map((stat) => (
                <div key={stat.label} className="text-right">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-white/28">{stat.label}</p>
                  <p className="mt-0.5 font-mono text-xs font-semibold text-white/80 sm:text-sm">{stat.value}</p>
                </div>
              ))}
              </div>
            </div>

            <section className="mx-auto mt-4 grid w-full max-w-6xl flex-1 gap-4 lg:grid-cols-[.9fr_1.1fr] lg:items-stretch">
              <div className="relative order-2 flex min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-white/[.08] bg-[radial-gradient(circle_at_50%_48%,color-mix(in_srgb,var(--enemy-color)_12%,transparent),transparent_58%),linear-gradient(180deg,var(--raid-fill),transparent)] p-5 lg:order-1 lg:min-h-[31rem]" style={{ "--enemy-color": enemy.color } as React.CSSProperties}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Enemy · room {room + 1} of {ENEMIES.length}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">{enemy.name}</h2>
                    <p className="mt-0.5 text-[11px] text-white/35">{enemy.title}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                  {ENEMIES.map((entry, index) => (
                    <span key={entry.name} className={`h-1.5 rounded-full transition-all ${index === room ? "w-8 bg-[#9b7cff]" : index < room ? "w-4 bg-[#57d9a3]" : "w-4 bg-white/10"}`} />
                  ))}
                  </div>
                </div>

                <div className="relative flex flex-1 items-center justify-center py-2">
                  <EnemyAvatar enemy={enemy} hurt={enemyHurt} />
                  {floatText && enemyHurt ? <span className="typeraid-float absolute right-[18%] top-[24%] font-mono text-xl font-black text-raid-text">{floatText}</span> : null}
                </div>

                <div className="space-y-4 rounded-2xl border border-white/[.07] bg-black/25 p-4">
                  <HealthBar value={enemyHp} max={enemy.hp} color={enemy.color} label="Enemy health — bring this to 0" />
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-raid-danger"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff5c7a]" /> Enemy attacks in</span>
                      <span className="font-mono text-sm font-bold text-raid-danger">{Math.max(0, attackLeft / 1000).toFixed(1)}s</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full bg-[#ff5c7a] shadow-[0_0_14px_rgba(255,92,122,.55)] transition-[width] duration-100" style={{ width: `${attackPercent}%` }} /></div>
                    <p className="mt-2 text-[10px] text-white/36">When it reaches zero, {enemy.name} deals <strong className="text-white/65">{Math.max(1, enemy.damage - armor)} damage</strong> and cuts your combo in half.</p>
                  </div>
                </div>
              </div>

              <div className={`relative order-1 flex min-h-[25rem] flex-col rounded-3xl border border-white/[.08] bg-raid-surface-soft p-5 shadow-[0_32px_90px_-50px_#7c5cff] backdrop-blur sm:p-7 lg:order-2 lg:min-h-[31rem] ${playerHurt ? "typeraid-player-hit" : ""}`} onClick={focusInput}>
                {floatText && playerHurt ? <span className="typeraid-float absolute right-6 top-4 z-10 font-mono text-lg font-black text-raid-danger">{floatText}</span> : null}
                <HealthBar value={hp} max={maxHp} color={hp < maxHp * 0.3 ? "#ff5c7a" : "#8b70ff"} label="Your health — do not let this reach 0" />

                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                  <div className="flex flex-wrap justify-center gap-2">
                    <span className="rounded-full border border-[#9b7cff]/20 bg-[#9b7cff]/10 px-3 py-1 text-[10px] font-semibold text-raid-accent">Complete word → deal {nextWordDamage} damage</span>
                    {nextEcho ? <span className="rounded-full border border-[#b77cff]/25 bg-[#b77cff]/10 px-3 py-1 text-[10px] font-semibold text-raid-accent">Arcane Echo ready · 2×</span> : null}
                    {nextExecute ? <span className="rounded-full border border-[#ff5c7a]/25 bg-[#ff5c7a]/10 px-3 py-1 text-[10px] font-semibold text-raid-danger">Execute active · 2×</span> : null}
                    {rageDamage > 0 ? <span className="rounded-full border border-[#ffb84d]/25 bg-[#ffb84d]/10 px-3 py-1 text-[10px] font-semibold text-raid-warning">Berserker · +6</span> : null}
                  </div>
                  <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">Type this word now</p>
                  <div className="mt-4 min-h-16 break-all font-mono text-[clamp(2.6rem,7vw,5rem)] font-bold leading-none tracking-[-0.055em]">
                    <span className="text-raid-accent">{target.slice(0, typed.length)}</span>
                    <span className="relative text-white/85">
                      <span className="absolute -left-px bottom-0 top-0 w-[2px] animate-pulse bg-[#a88fff]" />
                      {target.slice(typed.length)}
                    </span>
                  </div>
                  <p className="mt-7 text-[9px] font-semibold uppercase tracking-[.14em] text-white/22">Coming next</p>
                  <div className="mt-2 flex justify-center gap-4 font-mono text-sm text-white/22">
                    {nextWords.map((word) => <span key={word}>{word}</span>)}
                  </div>
                  <p className="mt-7 rounded-lg bg-white/[.035] px-3 py-2 text-[10px] text-white/38">Start typing anywhere · word submits automatically · Backspace is allowed</p>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-white/[.06] pt-4 text-[10px]">
                  <span className="text-raid-danger">⚠ Wrong key: lose {typoDamage} HP, 20 score, and your combo</span>
                  <button type="button" onClick={() => setPhase("paused")} className="rounded-lg px-2 py-1 transition-colors hover:bg-white/[.06] hover:text-white/65">Esc · pause</button>
                </div>
                <input ref={inputRef} value="" onChange={() => undefined} onKeyDown={handleKey} aria-label={`Type the word ${target}`} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} className="pointer-events-none absolute h-px w-px opacity-0" />
              </div>
            </section>

            {owned.length > 0 ? (
              <div className="mx-auto mt-5 flex max-w-5xl flex-wrap justify-center gap-2">
                {owned.map((id) => {
                  const upgrade = UPGRADES.find((item) => item.id === id)!;
                  const rarity = RARITY_META[upgrade.rarity];
                  const spent = id === "phoenix" && phoenixUsed;
                  return (
                    <span key={id} title={upgrade.description} className="rounded-full border px-3 py-1 text-[10px]" style={{ borderColor: `color-mix(in srgb, ${rarity.color} 24%, transparent)`, background: rarity.soft, color: spent ? "var(--raid-faint)" : rarity.color }}>
                      <span className="mr-1.5">{upgrade.symbol}</span>{upgrade.name}{spent ? " · spent" : ""}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </main>
        )}

        {phase === "briefing" ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-20 grid place-items-center overflow-y-auto bg-raid-overlay p-4 pb-20 backdrop-blur-xl sm:p-6">
            <section className="typeraid-enter w-full max-w-4xl overflow-hidden rounded-3xl border border-white/[.1] bg-raid-surface shadow-[0_40px_120px_-55px_#7c5cff]">
              <div className="grid lg:grid-cols-[.75fr_1.25fr]">
                <div className="relative hidden min-h-[34rem] overflow-hidden border-r border-white/[.07] bg-[radial-gradient(circle_at_50%_45%,rgba(87,217,163,.18),transparent_46%),linear-gradient(180deg,var(--raid-fill),transparent)] p-6 lg:flex lg:flex-col">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-raid-success">First opponent</p>
                    <h3 className="mt-1 text-xl font-semibold">{enemy.name}</h3>
                    <p className="mt-1 text-xs text-white/35">{enemy.title}</p>
                  </div>
                  <div className="flex flex-1 items-center justify-center">
                    <EnemyAvatar enemy={enemy} hurt={false} />
                  </div>
                  <p className="rounded-xl border border-[#ff5c7a]/15 bg-[#ff5c7a]/[.07] p-3 text-[11px] leading-5 text-white/48">
                    <strong className="text-raid-danger">Threat:</strong> attacks every {((enemy.attackMs + attackBonus) / 1000).toFixed(1)} seconds for {Math.max(1, enemy.damage - armor)} HP.
                  </p>
                </div>

                <div className="p-5 sm:p-8">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-raid-accent">How to play</p>
                  <h2 className="mt-2 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">Win the fight in three steps.</h2>
                  <p className="mt-3 text-sm leading-6 text-white/42">Your keyboard is the weapon. There is no mouse control during combat.</p>

                  <ol className="mt-7 space-y-3">
                    {[
                      ["1", "Type the large word", "Press its letters exactly as shown. It attacks automatically when the last letter is typed—do not press Space or Enter."],
                      ["2", "Build a combo", "Each clean word deals at least 10 damage. Consecutive words increase your combo and unlock stronger hits."],
                      ["3", "Beat the red timer", `An attack halves your combo. A wrong key costs ${typoDamage} HP and resets it entirely.`],
                    ].map(([number, title, body]) => (
                      <li key={number} className="flex gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#9b7cff]/12 font-mono text-sm font-bold text-raid-accent">{number}</span>
                        <div>
                          <h3 className="text-sm font-semibold text-white/90">{title}</h3>
                          <p className="mt-1 text-[11px] leading-5 text-white/42">{body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#65dca9]/15 bg-[#65dca9]/[.06] p-3 text-[11px] text-white/48">
                    <span className="text-lg text-raid-success">✓</span>
                    <span><strong className="text-white/80">Win:</strong> empty the enemy health bar. <strong className="ml-1 text-white/80">Lose:</strong> your health reaches zero.</span>
                  </div>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => { setPhase("battle"); focusInput(); }} className="rounded-xl bg-[#8a6cff] px-6 py-3 text-sm font-semibold shadow-[0_14px_35px_-18px_#7c5cff] transition hover:bg-[#9b81ff]">
                      {wordsTyped > 0 ? "Continue fighting" : `Fight ${enemy.name} →`}
                    </button>
                    <span className="text-[10px] text-white/28">Press Esc anytime to pause</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {phase === "paused" ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-20 grid place-items-center overflow-y-auto bg-raid-overlay p-5 pb-20 backdrop-blur-md sm:pb-5">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-raid-accent">Run suspended</p>
              <h2 className="mt-2 text-4xl font-bold tracking-[-0.05em]">Catch your breath.</h2>
              <button type="button" onClick={() => { setPhase("battle"); focusInput(); }} className="mt-7 rounded-xl bg-raid-text px-6 py-3 text-sm font-semibold text-raid-bg">Resume raid</button>
            </div>
          </div>
        ) : null}

        {phase === "reward" ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-20 grid place-items-center overflow-y-auto bg-raid-overlay p-5 pb-20 backdrop-blur-xl sm:pb-5">
            <section className="w-full max-w-4xl py-8 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-raid-success">Room cleared</p>
              <h2 className="mt-2 text-4xl font-bold tracking-[-0.05em] sm:text-5xl">Choose your advantage.</h2>
              <p className="mt-3 text-sm text-white/38">You recover 14 health after choosing. Later rooms roll better rarities; boss prep guarantees an Epic attack option.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {(Object.keys(RARITY_META) as UpgradeRarity[]).map((rarityId) => {
                  const rarity = RARITY_META[rarityId];
                  return <span key={rarityId} className="rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.12em]" style={{ color: rarity.color, borderColor: `color-mix(in srgb, ${rarity.color} 24%, transparent)`, background: rarity.soft }}>{rarity.label}</span>;
                })}
              </div>
              <div className="mt-9 grid gap-3 md:grid-cols-3">
                {rewards.map((upgrade, index) => {
                  const rarity = RARITY_META[upgrade.rarity];
                  return (
                  <button key={upgrade.id} type="button" onClick={() => chooseUpgrade(upgrade)} className="group relative overflow-hidden rounded-2xl border p-6 text-left transition duration-200 hover:-translate-y-1" style={{ borderColor: `color-mix(in srgb, ${rarity.color} 30%, transparent)`, background: `linear-gradient(145deg, ${rarity.soft}, var(--raid-fill))`, boxShadow: upgrade.rarity === "legendary" ? `0 20px 60px -35px ${rarity.color}` : undefined }}>
                    <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${rarity.color}, transparent)` }} />
                    <div className="flex items-start justify-between">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl font-mono text-xl font-bold" style={{ color: rarity.color, background: rarity.soft }}>{upgrade.symbol}</span>
                      <span className="font-mono text-[10px] text-white/20">0{index + 1}</span>
                    </div>
                    <p className="mt-7 text-[9px] font-bold uppercase tracking-[.16em]" style={{ color: rarity.color }}>{rarity.label} · {upgrade.kind}</p>
                    <h3 className="mt-1.5 text-lg font-semibold">{upgrade.name}</h3>
                    <p className="mt-2 text-xs leading-5 text-white/42">{upgrade.description}</p>
                    <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60 transition-opacity group-hover:opacity-100" style={{ color: rarity.color }}>Take upgrade →</p>
                  </button>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {phase === "victory" || phase === "defeat" ? (
          <div className="fixed inset-x-0 bottom-0 top-16 z-20 grid place-items-center overflow-y-auto bg-raid-overlay p-5 pb-20 backdrop-blur-xl sm:pb-5">
            <section className="w-full max-w-2xl py-8 text-center">
              <div className={`mx-auto grid h-20 w-20 place-items-center rounded-[38%_62%_55%_45%] border ${phase === "victory" ? "border-[#65dca9]/30 bg-[#65dca9]/10 text-raid-success" : "border-[#ff5c7a]/30 bg-[#ff5c7a]/10 text-raid-danger"}`}>
                <span className="font-mono text-3xl font-black">{phase === "victory" ? "V" : "×"}</span>
              </div>
              <p className={`mt-7 text-[10px] font-semibold uppercase tracking-[0.22em] ${phase === "victory" ? "text-raid-success" : "text-raid-danger"}`}>{phase === "victory" ? "Raid complete" : `Fallen in room ${room + 1}`}</p>
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
                <button type="button" onClick={startRun} className="rounded-xl bg-[#8a6cff] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#9b81ff]">Raid again</button>
                <Link href="/games" className="rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-white/55 transition hover:bg-white/[.05] hover:text-white">Back to arcade</Link>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
