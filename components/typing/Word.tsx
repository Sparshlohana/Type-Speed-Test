"use client";

import { memo } from "react";

type Props = {
  target: string;
  typed: string;
  isActive: boolean;
  /** Committed word that did not match — gets a soft red underline. */
  flagged: boolean;
};

/**
 * One word. Memoised so a keystroke only re-renders the word being typed;
 * a 300-word timed test would otherwise repaint every span on every key.
 */
function WordComponent({ target, typed, isActive, flagged }: Props) {
  const chars = target.split("");
  const extras = typed.length > target.length ? typed.slice(target.length).split("") : [];

  return (
    <span className={`mr-[0.6ch] inline-block ${flagged ? "word-flagged" : ""}`} data-word>
      {chars.map((char, index) => {
        const typedChar = typed[index];
        const state =
          typedChar === undefined ? "pending" : typedChar === char ? "correct" : "incorrect";
        return (
          <span
            key={index}
            className={`char-${state}`}
            data-active-char={isActive && index === typed.length ? "" : undefined}
          >
            {char}
          </span>
        );
      })}

      {extras.map((char, index) => (
        <span
          key={`extra-${index}`}
          className="char-extra"
          data-active-char={isActive && target.length + index === typed.length ? "" : undefined}
        >
          {char}
        </span>
      ))}

      {/* Caret anchor for when the cursor sits past the last character of the word. */}
      {isActive && typed.length >= target.length + extras.length ? (
        <span data-caret-tail className="inline-block w-0" />
      ) : null}
    </span>
  );
}

export const Word = memo(WordComponent);
