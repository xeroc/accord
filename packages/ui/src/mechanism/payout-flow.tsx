import type { CSSProperties, FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";
import { VaultBox } from "./vault-box";

/**
 * PayoutFlow — the mutual's optimistic payout path, played once,
 * challenged:
 *
 *   member_contributions → [proposer files: payout + encrypted evidence]
 *   → challenge window (timer bar) ── no challenge ──→ auto-pay (ghost,
 *   struck dead the moment a member challenges)
 *   → the mutual's jury (staked dots) → verdict → only then THE POOL PAYS.
 *
 * Pure function of `frame` (caller owns time): the vault settles at
 * `at+15`, the claim lands `at+40`, the window drains `at+58…88` and
 * freezes at 75% when the challenge clicks (`at+84`), the ghost auto-pay
 * lane dies `at+92`, jurors seat from `at+100`, the verdict stamps
 * `at+128`, and the pay node lights `at+145` — always after the jury.
 * Lifted from the demo-day deck (apps/pitch) 2026-08.
 */

/** Choreography, in frames relative to `at`. */
const T = {
  vaultAt: 15,
  link1: [36, 44] as const,
  claim: [40, 52] as const,
  link2: [50, 56] as const,
  bar: [58, 88] as const,
  barFreeze: 0.75,
  click: 84,
  clickIn: [84, 92] as const,
  ghost: [62, 72] as const,
  ghostKill: 92,
  strike: [92, 100] as const,
  jury: [100, 110] as const,
  dotAt: (i: number) => 104 + i * 5,
  link4: [122, 128] as const,
  verdict: [128, 138] as const,
  link5: [138, 144] as const,
  pay: [145, 156] as const,
};

/** Settle-pop style for a card entering at tweened progress `p`. */
const pop = (p: number) => ({
  opacity: p,
  transform: `scale(${0.95 + 0.05 * p})`,
});

/** Document-with-padlock glyph — encrypted evidence. */
const EvidenceLock: FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <path d="M6 2.5h7.5L18 7v12.5H6z" />
    <path d="M13.5 2.5V7H18" />
    <rect x="8.5" y="13" width="7" height="5.2" rx="1" />
    <path d="M10.2 13v-1.5a1.8 1.8 0 0 1 3.6 0V13" />
  </svg>
);

/** Hairline connector that draws left→right; chevron lands when done. */
const Arrow: FC<{ frame: number; from: number; to: number }> = ({ frame, from, to }) => {
  const p = tween(frame, [from, to], [0, 1], easeExpo);
  return (
    <div className="flex items-center gap-0.5">
      <div className="h-px w-7 origin-left bg-nearwhite/40" style={{ opacity: p > 0 ? 1 : 0, transform: `scaleX(${p})` }} />
      <span className="text-xs text-nearwhite/40" style={{ opacity: p >= 1 ? 1 : 0 }}>
      </span>
    </div>
  );
};

const amount = (n: number) => n.toLocaleString("en-US");

export const PayoutFlow: FC<{
  frame: number;
  /** frame the sequence starts (default 0) */
  at?: number;
  /** the filed payout amount (default 12,500) */
  payout?: number;
  /** pool balance the vault counts up to (default 2,400,000) */
  balance?: number;
  /** members sub-counter on the vault (default 1,250) */
  members?: number;
  className?: string;
}> = ({ frame, at = 0, payout = 12_500, balance = 2_400_000, members = 1_250, className }) => {
  const f = frame - at;
  // The window drains T.bar; the challenge clicks and freezes it at 75%.
  const challenged = f >= T.click;
  const barFill = challenged ? T.barFreeze : tween(f, [...T.bar], [0, 1], linear);
  const ghostP = tween(f, [...T.ghost], [0, 1], easeExpo);
  const killed = f >= T.ghostKill;
  const strikeP = tween(f, [...T.strike], [0, 1], easeExpo);
  const juryP = tween(f, [...T.jury], [0, 1], easeExpo);
  const verdictP = tween(f, [...T.verdict], [0, 1], easeExpo);
  const payP = tween(f, [...T.pay], [0, 1], easeExpo);
  const clickRing = challenged ? Math.max(0, 1 - (f - T.click) / 10) : 0;
  const popAt = (window: readonly [number, number]): CSSProperties =>
    pop(tween(f, [...window], [0, 1], easeExpo));

  return (
    <div data-payout-flow className={cn("flex max-w-6xl flex-wrap items-center gap-5", className)}>
      {/* the pool: member contributions */}
      <VaultBox
        frame={f}
        label="member_contributions"
        token="fee"
        balance={balance}
        at={T.vaultAt}
        tickAt={T.vaultAt}
        subCounters={[{ label: "members", value: members }]}
      />
      <Arrow frame={f} from={T.link1[0]} to={T.link1[1]} />

      {/* the proposer files: a payout amount + encrypted evidence */}
      <div
        data-claim
        className="flex w-60 flex-col gap-2.5 rounded-lg border border-border-subtle bg-raised/60 px-5 py-4"
        style={popAt(T.claim)}
      >
        <div className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          PROPOSER FILES
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold tabular-nums text-nearwhite">
            {amount(payout)}
          </span>
          <span className="font-mono text-sm text-text-secondary">payout</span>
        </div>
        <div className="flex items-center gap-2 self-start rounded-md border border-border-subtle bg-raised px-3 py-1.5 font-mono text-sm text-text-secondary">
          <EvidenceLock className="h-4 w-4 text-amber" />
          evidence · encrypted
        </div>
      </div>
      <Arrow frame={f} from={T.link2[0]} to={T.link2[1]} />

      {/* the challenge window and everything downstream of it */}
      <div className="flex min-w-[26rem] flex-1 flex-col gap-4"
        style={pop(tween(f, [T.link2[1], T.link2[1] + 5], [0, 1], easeExpo))}
      >
        {/* the window is a timer, not a block: a bar that drains until it
            either completes (auto-pay) or is interrupted by a challenge */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center max-w-4xl justify-between font-mono text-xs text-muted-foreground">
            <span>CHALLENGE WINDOW</span>
            <span data-window-readout className="tabular-nums">
              {challenged ? "" : `${Math.round(barFill * 100)}%`}
            </span>
          </div>
          <div className="relative">
            <div className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-raised">
              <div
                data-window-fill
                className="h-full rounded-full bg-amber"
                style={{ width: `${barFill * 100}%` }}
              />
            </div>
            {/* the click: a member stops the clock inside the window */}
            <div
              className="absolute top-1/2 -translate-y-3/2"
              style={{ left: "75%", ...pop(tween(f, [...T.clickIn], [0, 1], easeExpo)) }}
            >
              <div
                data-challenge
                className="-translate-x-1/2 rounded-full border border-amber bg-amber/15 px-3 py-1 font-mono text-xs whitespace-nowrap text-amber"
                style={{ boxShadow: `0 0 ${12 * clickRing}px var(--accord-amber)` }}
              >
                member challenges
              </div>
            </div>
          </div>
        </div>

        {/* the challenged path: jury first, protocol pays after the verdict */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            data-jury
            className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-raised/60 px-4 py-3"
            style={pop(juryP)}
          >
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  data-juror-dot
                  className="h-2.5 w-2.5 rounded-full bg-amber"
                  style={pop(tween(f, [T.dotAt(i), T.dotAt(i) + 5], [0, 1], easeExpo))}
                />
              ))}
            </div>
            <div className="font-mono text-xs text-text-secondary">
              the mutual's jury · stake at risk
            </div>
          </div>
          <Arrow frame={f} from={T.link4[0]} to={T.link4[1]} />
          <div
            data-verdict
            className="rounded-full border border-amber/60 bg-amber/10 px-4 py-2 font-mono text-sm whitespace-nowrap text-amber"
            style={pop(verdictP)}
          >
            verdict: pay
          </div>
          <Arrow frame={f} from={T.link5[0]} to={T.link5[1]} />
          <div
            data-pay
            className="flex items-baseline gap-2 rounded-lg border border-confirm/60 bg-confirm/10 px-4 py-2.5"
            style={pop(payP)}
          >
            <span className="font-mono text-sm text-confirm">the pool pays</span>
            <span className="font-mono text-lg font-semibold tabular-nums text-confirm">
              {amount(payout)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
