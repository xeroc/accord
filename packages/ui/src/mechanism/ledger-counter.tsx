import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";

/** Outcome tones for a ledger row change — distinct from the mint
 *  TokenTone: this colors what happened (earned / slashed / pending),
 *  not which token moved. */
export type LedgerTone = "confirm" | "slash" | "amber" | "neutral";

const TONE_CLASSES: Record<LedgerTone, { text: string; flash: string }> = {
  confirm: { text: "text-confirm", flash: "bg-confirm/15" },
  slash: { text: "text-slash", flash: "bg-slash/15" },
  amber: { text: "text-amber", flash: "bg-amber/15" },
  neutral: { text: "text-text-secondary", flash: "bg-nearwhite/10" },
};

/**
 * LedgerCounter — a ledger row: mono label + tabular number that
 * counts from `from` to `to` on `at`, with the row-flash convention
 * (a tinted wash that pops and decays — the slash/econ vocabulary:
 * slashes are row flashes and number deltas, never vault outflows).
 * Pure function of `frame`.
 */
export const LedgerCounter: FC<{
  frame: number;
  /** row name, e.g. "staked", "fees_earned", "active_draws" */
  label: string;
  /** post-change value */
  to: number;
  /** pre-change value; omit for a static row */
  from?: number;
  /** frame the change fires (count starts, flash pops) */
  at?: number;
  /** count length in frames (default 12 ≈ 400 ms) */
  dur?: number;
  tone?: LedgerTone;
  /** row flash on change (default true) */
  flash?: boolean;
  className?: string;
}> = ({ frame, label, to, from, at = 0, dur = 12, tone = "neutral", flash = true, className }) => {
  const start = from ?? to;
  const count = Math.round(tween(frame, [at, at + dur], [start, to], easeExpo));
  const changed = from !== undefined && frame >= at;
  const flashOp =
    flash && changed ? tween(frame, [at, at + 8], [1, 0], linear) : 0;
  const t = TONE_CLASSES[tone];

  return (
    <div
      data-row={label}
      className={cn(
        "relative flex items-center justify-between gap-8 rounded-md px-2.5 py-1.5 font-mono text-xs",
        className,
      )}
    >
      {flashOp > 0 ? (
        <div
          data-flash
          className={cn("pointer-events-none absolute inset-0 rounded-md", t.flash)}
          style={{ opacity: flashOp }}
        />
      ) : null}
      <span className="text-muted-foreground">{label}</span>
      <span data-value className={cn("tabular-nums", changed ? t.text : "text-text-secondary")}>
        {count.toLocaleString("en-US")}
      </span>
    </div>
  );
};
