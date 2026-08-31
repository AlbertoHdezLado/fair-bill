"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { ROOM_CODE_LENGTH } from "@/lib/rooms/code";

interface CodeInputProps {
  readonly onComplete: (code: string) => void;
  readonly digitLabel: string;
  readonly disabled?: boolean;
  /** Bump this value (e.g. an error counter) to trigger a shake animation. */
  readonly shakeSignal?: number;
}

const SLOTS = Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => index);

/** Six single-character boxes that advance on their own and submit when full. */
export function CodeInput({
  onComplete,
  digitLabel,
  disabled,
  shakeSignal,
}: CodeInputProps) {
  const [digits, setDigits] = useState<readonly string[]>(() =>
    SLOTS.map(() => ""),
  );
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function focusSlot(index: number) {
    const input = refs.current[Math.max(0, Math.min(index, ROOM_CODE_LENGTH - 1))];
    input?.focus();
    input?.select();
  }

  function commit(next: readonly string[]) {
    setDigits(next);
    if (next.every((digit) => digit !== "")) onComplete(next.join(""));
  }

  function fillFrom(index: number, raw: string) {
    const chars = [...raw.toUpperCase().replace(/[^A-Z0-9]/g, "")];
    if (chars.length === 0) {
      commit(digits.map((digit, i) => (i === index ? "" : digit)));
      return;
    }

    const next = [...digits];
    let cursor = index;
    for (const char of chars) {
      if (cursor >= ROOM_CODE_LENGTH) break;
      next[cursor] = char;
      cursor += 1;
    }
    commit(next);
    focusSlot(cursor);
  }

  return (
    <motion.div
      key={shakeSignal}
      animate={
        shakeSignal
          ? { x: [0, -8, 8, -6, 6, -3, 3, 0] }
          : { x: 0 }
      }
      transition={{ duration: 0.4 }}
      className="flex justify-center gap-2"
    >
      {SLOTS.map((index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={1}
          disabled={disabled}
          aria-label={digitLabel.replace("{{index}}", String(index + 1))}
          value={digits[index]}
          onChange={(event) => fillFrom(index, event.target.value)}
          onPaste={(event) => {
            event.preventDefault();
            fillFrom(index, event.clipboardData.getData("text"));
          }}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && digits[index] === "") {
              event.preventDefault();
              commit(digits.map((digit, i) => (i === index - 1 ? "" : digit)));
              focusSlot(index - 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              focusSlot(index - 1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              focusSlot(index + 1);
            }
          }}
          className="h-14 w-11 rounded-2xl border border-border bg-surface text-center font-mono text-2xl font-semibold uppercase tabular-nums shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 sm:w-12"
        />
      ))}
    </motion.div>
  );
}
