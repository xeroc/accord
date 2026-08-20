import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, enterAt, tween } from "../internal/motion-math";
import { TOKEN_TONE, type TokenTone } from "./token-tone";

/**
 * VaultBox — a mint vault: visually static, solid-bodied container
 * whose only life is a ≤0.5 % breath, a tabular balance that counts
 * up (or down) on its tick frame, optional stacked sub-counters
 * (fee_paid / bonds beneath the fee vault), and the "unchanged"
 * shield badge that re-checks on cue. Stillness is the message —
 * no particle ever leaves a vault here. Pure function of `frame`.
 */
export const VaultBox: FC<{
  frame: number;
  /** vault name, e.g. "stake_vault" */
  label: string;
  /** which mint lives here — picks the tone colors */
  token: TokenTone;
  /** current balance (post-tick) */
  balance: number;
  /** pre-tick balance; omit for a static counter */
  from?: number;
  /** frame the vault card settles in (default 0) */
  at?: number;
  /** frame the balance ticks (count-up + brightness flash) */
  tickAt?: number;
  /** count-up length in frames (default 12 ≈ 400 ms) */
  tickDur?: number;
  /** stacked sub-counters beneath the balance (fee_paid, bonds, …) */
  subCounters?: readonly { label: string; value: number }[];
  /** frame the "unchanged" badge (re-)checks */
  unchangedAt?: number;
  className?: string;
}> = ({
  frame,
  label,
  token,
  balance,
  from,
  at = 0,
  tickAt,
  tickDur = 12,
  subCounters,
  unchangedAt,
  className,
}) => {
  const tone = TOKEN_TONE[token];
  const inOp = tween(frame, [at, at + 12], [0, 1], easeExpo);
  const inY = tween(frame, [at, at + 12], [-10, 0], easeExpo);
  // The sanctioned vault breath: ≤ 0.5 % scale, 4 s sine period.
  const breath = 1 + 0.004 * Math.sin((frame * 2 * Math.PI) / 120);

  const start = from ?? balance;
  const tick = tickAt ?? at;
  const count = Math.round(
    tween(frame, [tick, tick + tickDur], [start, balance], easeExpo),
  );
  // 120 ms post-tick brightness flash: a nearwhite wash fading over 4 frames.
  const flash = tween(frame, [tick + tickDur, tick + tickDur + 4], [1, 0], easeExpo);

  const badgePop = unchangedAt !== undefined ? enterAt(frame, unchangedAt, 8) : 0;

  return (
    <div
      data-vault={label}
      className={cn(
        "relative w-56 rounded-xl border bg-raised px-4 py-3",
        tone.border,
        className,
      )}
      style={{ opacity: inOp, transform: `translateY(${inY}px) scale(${breath})` }}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-xs tracking-[0.2em] text-text-secondary">{label}</span>
        <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      </div>
      <div className="relative mt-1 w-fit">
        <span
          data-balance
          className={cn("font-mono text-2xl tabular-nums", tone.text)}
          style={{ transform: `scale(${1 + flash * 0.04})` }}
        >
          {count.toLocaleString("en-US")}
        </span>
        {flash > 0 && flash < 1 ? (
          <span
            data-flash
            className="pointer-events-none absolute inset-0 rounded-sm bg-nearwhite/10"
            style={{ opacity: flash }}
          />
        ) : null}
      </div>
      {subCounters && subCounters.length > 0 ? (
        <div className="mt-2 flex flex-col gap-0.5 border-t border-border-subtle pt-2">
          {subCounters.map((sub) => (
            <div
              key={sub.label}
              data-sub={sub.label}
              className="flex items-center justify-between font-mono text-xs text-muted-foreground"
            >
              <span>{sub.label}</span>
              <span className="tabular-nums">{sub.value.toLocaleString("en-US")}</span>
            </div>
          ))}
        </div>
      ) : null}
      {unchangedAt !== undefined ? (
        <div
          data-unchanged
          className="absolute -top-2.5 right-3 rounded-full border border-confirm/50 bg-confirm/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-confirm"
          style={{ opacity: badgePop, transform: `scale(${0.8 + badgePop * 0.2})` }}
        >
          unchanged
        </div>
      ) : null}
    </div>
  );
};
