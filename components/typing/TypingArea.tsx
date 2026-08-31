"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Caret, GhostCaret, type CaretPosition } from "./Caret";
import { Word } from "./Word";
import type { GhostRaceState } from "@/hooks/useTypingTest";
import { typedAt, type TestState } from "@/lib/engine";
import type { CaretStyle } from "@/lib/storage";

/** Rows of text kept visible; the active row is pinned to the second one. */
const VISIBLE_LINES = 3;
/** Idle gap after which the caret starts blinking again. */
const BLINK_DELAY_MS = 800;

function hasCommandModifier(event: KeyboardEvent | React.KeyboardEvent): boolean {
  // AltGr reports as Ctrl+Alt on several layouts but still produces printable text.
  const altGraph = event.getModifierState("AltGraph");
  return event.metaKey || (!altGraph && (event.ctrlKey || event.altKey));
}

type Props = {
  state: TestState;
  caretStyle: CaretStyle;
  smoothCaret: boolean;
  ghost: GhostRaceState | null;
  onChar: (char: string) => void;
  onSpace: () => void;
  onBackspace: (wholeWord: boolean) => void;
  onRestart: () => void;
};

export function TypingArea({
  state,
  caretStyle,
  smoothCaret,
  ghost,
  onChar,
  onSpace,
  onBackspace,
  onRestart,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const suppressBeforeInputRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);

  const [focused, setFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [caret, setCaret] = useState<CaretPosition | null>(null);
  const [ghostCaret, setGhostCaret] = useState<CaretPosition | null>(null);
  const [offsetY, setOffsetY] = useState(0);
  const [lineHeight, setLineHeight] = useState(48);

  const focus = useCallback(() => inputRef.current?.focus(), []);

  const markTyping = useCallback(() => {
    setIsTyping(true);
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setIsTyping(false), BLINK_DELAY_MS);
  }, []);

  const suppressMatchingBeforeInput = useCallback(() => {
    suppressBeforeInputRef.current = true;
    // preventDefault() can stop beforeinput entirely. Never let its suppression
    // flag leak into a later dead-key, composition, or AltGr character.
    window.setTimeout(() => {
      suppressBeforeInputRef.current = false;
    }, 0);
  }, []);

  const ghostStep = ghost?.status === "ready"
    ? Math.max(0, Math.floor(ghost.ghostChars))
    : null;
  const ghostPosition = (() => {
    if (ghostStep === null) return null;
    let remaining = ghostStep;
    for (let wordIndex = 0; wordIndex < state.target.length; wordIndex++) {
      const length = state.target[wordIndex]?.length ?? 0;
      if (remaining <= length) return { wordIndex, charIndex: remaining };
      remaining -= length;
      if (wordIndex < state.target.length - 1) remaining -= 1;
    }
    const wordIndex = Math.max(0, state.target.length - 1);
    return { wordIndex, charIndex: state.target[wordIndex]?.length ?? 0 };
  })();

  useEffect(() => {
    focus();
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
  }, [focus]);

  // Any keypress while unfocused pulls focus back to the test.
  useEffect(() => {
    if (focused) return;
    const onWindowKey = (event: KeyboardEvent) => {
      if (hasCommandModifier(event)) return;
      if (event.key.length === 1 || event.key === "Backspace") focus();
    };
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, [focused, focus]);

  // Position both carets and keep the player's active line pinned to row two.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const measuredLineHeight = parseFloat(window.getComputedStyle(inner).lineHeight);
    if (Number.isFinite(measuredLineHeight) && measuredLineHeight > 0) {
      setLineHeight(measuredLineHeight);
    }

    const activeChar = inner.querySelector<HTMLElement>("[data-active-char]");
    const tail = inner.querySelector<HTMLElement>("[data-caret-tail]");
    const anchor = activeChar ?? tail;
    if (!anchor) {
      setCaret(null);
      return;
    }

    const isTail = anchor === tail;
    // The tail marker has no width of its own, so borrow the last rendered character's.
    const reference = isTail
      ? (anchor.previousElementSibling as HTMLElement | null) ?? anchor
      : anchor;

    const height = reference.offsetHeight || measuredLineHeight * 0.7;
    const top = reference.offsetTop;

    setCaret({
      left: isTail ? reference.offsetLeft + reference.offsetWidth : anchor.offsetLeft,
      top,
      height,
      width: reference.offsetWidth || 12,
    });

    const ghostChar = inner.querySelector<HTMLElement>("[data-ghost-char]");
    const ghostTail = inner.querySelector<HTMLElement>("[data-ghost-tail]");
    const ghostAnchor = ghostChar ?? ghostTail;
    if (ghostAnchor) {
      const isGhostTail = ghostAnchor === ghostTail;
      let ghostReference = ghostAnchor;
      if (isGhostTail) {
        ghostReference = (ghostAnchor.previousElementSibling as HTMLElement | null) ?? ghostAnchor;
        if (ghostReference.hasAttribute("data-caret-tail")) {
          ghostReference =
            (ghostReference.previousElementSibling as HTMLElement | null) ?? ghostAnchor;
        }
      }
      setGhostCaret({
        left: isGhostTail
          ? ghostReference.offsetLeft + ghostReference.offsetWidth
          : ghostAnchor.offsetLeft,
        top: ghostReference.offsetTop,
        height: ghostReference.offsetHeight || measuredLineHeight * 0.7,
        width: isGhostTail ? 2 : ghostAnchor.offsetWidth || 12,
      });
    } else {
      setGhostCaret(null);
    }

    const line = Number.isFinite(measuredLineHeight) ? measuredLineHeight : 48;
    setOffsetY(Math.max(0, top - line));
  }, [ghostStep, state.typed, state.wordIndex, state.target]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab" && !event.shiftKey) {
        // Restart shortcut. Shift+Tab is left alone so keyboard navigation still works.
        event.preventDefault();
        onRestart();
        markTyping();
        return;
      }
      if (event.key === "Escape") {
        inputRef.current?.blur();
        return;
      }

      const wholeWord = event.ctrlKey || event.altKey;
      if (event.key === "Backspace") {
        event.preventDefault();
        suppressMatchingBeforeInput();
        onBackspace(wholeWord);
        markTyping();
        return;
      }

      // Let genuine browser shortcuts through untouched.
      if (hasCommandModifier(event)) return;

      if (event.key === " ") {
        event.preventDefault();
        suppressMatchingBeforeInput();
        onSpace();
        markTyping();
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        suppressMatchingBeforeInput();
        onChar(event.key);
        markTyping();
      }
    },
    [onBackspace, onChar, onRestart, onSpace, markTyping, suppressMatchingBeforeInput],
  );

  // Mobile keyboards and IMEs report `Unidentified` in keydown, so fall back to beforeinput.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const onBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      if (suppressBeforeInputRef.current) {
        suppressBeforeInputRef.current = false;
        event.preventDefault();
        return;
      }
      event.preventDefault();

      if (inputEvent.inputType === "deleteContentBackward") {
        onBackspace(false);
        markTyping();
        return;
      }
      if (inputEvent.inputType !== "insertText" && inputEvent.inputType !== "insertCompositionText") {
        return;
      }
      for (const char of inputEvent.data ?? "") {
        if (char === " ") onSpace();
        else onChar(char);
      }
      markTyping();
    };

    input.addEventListener("beforeinput", onBeforeInput);
    return () => input.removeEventListener("beforeinput", onBeforeInput);
  }, [onBackspace, onChar, onSpace, markTyping]);

  return (
    <div className="relative w-full" onClick={focus}>
      <input
        ref={inputRef}
        type="text"
        value=""
        onChange={() => undefined}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        inputMode="text"
        aria-label="Typing test input"
        className="absolute inset-0 z-10 h-full w-full cursor-default opacity-0"
        style={{ caretColor: "transparent" }}
      />

      {ghost ? (
        <div className="mb-2 flex min-h-4 justify-end text-[10px] font-medium uppercase tracking-[0.12em] text-sub">
          {ghost.status === "ready" ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sub" />
              {ghost.opponent === "personal-best" ? "PB ghost" : "Last-attempt ghost"} · {Math.round(ghost.resultWpm)} WPM
            </span>
          ) : ghost.status === "empty" ? (
            <span>Complete this mode once to create a ghost</span>
          ) : ghost.status === "loading" ? (
            <span>Loading ghost…</span>
          ) : (
            <span>Ghost unavailable</span>
          )}
        </div>
      ) : null}

      <div
        className="relative overflow-hidden transition-[filter,opacity] duration-200 ease-[var(--ease)]"
        style={{
          height: lineHeight * VISIBLE_LINES,
          filter: focused ? "none" : "blur(4px)",
          opacity: focused ? 1 : 0.55,
        }}
      >
        <div
          ref={innerRef}
          className="typing-text relative select-none"
          style={{
            transform: `translateY(${-offsetY}px)`,
            transition: "transform 220ms var(--ease)",
          }}
        >
          <Caret
            position={caret}
            style={caretStyle}
            smooth={smoothCaret}
            blinking={!isTyping}
            visible={focused}
          />
          <GhostCaret position={ghostCaret} visible={ghost?.status === "ready"} />
          {state.target.map((word, index) => (
            <Word
              key={index}
              target={word}
              typed={typedAt(state, index)}
              isActive={index === state.wordIndex}
              ghostCharIndex={ghostPosition?.wordIndex === index ? ghostPosition.charIndex : undefined}
              flagged={index < state.wordIndex && typedAt(state, index) !== word}
            />
          ))}
        </div>
      </div>

      {!focused ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="fade-in rounded-lg bg-surface/80 px-4 py-2 text-sm text-sub backdrop-blur-sm">
            Click or press any key to focus
          </span>
        </div>
      ) : null}
    </div>
  );
}
