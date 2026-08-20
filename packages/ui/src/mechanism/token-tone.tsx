import type { FC } from "react";

import { cn } from "../internal/cn";
import { enterAt } from "../internal/motion-math";

/**
 * TokenTone — the two-mint color convention (the economics vocabulary).
 * Accord moves exactly two SPL mints through a Subaccord, and every
 * token-carrying surface agrees on their colors:
 *
 *   stake → cool nearwhite (slate family) — heavy, rigid, at rest
 *   fee   → warm Verdict Amber — earned, flowing, alive
 *
 * One mapping for chips, vaults, counters, and particles so coins,
 * ledgers, and badges never drift apart. Token classes only; the
 * mapping is the single place a mint gets its color.
 */
export type TokenTone = "stake" | "fee";

export const TOKEN_TONE: Record<
  TokenTone,
  { text: string; bg: string; border: string; dot: string }
> = {
  stake: {
    text: "text-nearwhite",
    bg: "bg-nearwhite/10",
    border: "border-nearwhite/40",
    dot: "bg-nearwhite",
  },
  fee: {
    text: "text-amber",
    bg: "bg-amber/10",
    border: "border-amber/50",
    dot: "bg-amber",
  },
};

/**
 * TokenBadge — the atom of the money vocabulary: a mint dot + mono
 * amount (+ unit label), popped in at `at`. Compose into vault rows,
 * particle landings, and fee ledgers. Pure function of `frame`.
 */
export const TokenBadge: FC<{
  frame: number;
  tone: TokenTone;
  amount: number | string;
  label?: string;
  /** frame the badge pops in (default 0) */
  at?: number;
  className?: string;
}> = ({ frame, tone, amount, label, at = 0, className }) => {
  const t = TOKEN_TONE[tone];
  const pop = enterAt(frame, at, 8);
  return (
    <div
      data-badge
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs",
        t.border,
        t.bg,
        t.text,
        className,
      )}
      style={{ opacity: pop, transform: `scale(${0.7 + pop * 0.3})` }}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      <span className="tabular-nums">{amount}</span>
      {label ? <span>{label}</span> : null}
    </div>
  );
};
