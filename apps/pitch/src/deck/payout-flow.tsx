import type { CSSProperties, FC } from "react";

import { VaultBox } from "@useaccord/ui";

/**
 * PayoutFlow — deck-local mechanism for the mutual machine slide:
 * the optimistic payout path, played once, challenged.
 *
 *   member_contributions → [proposer files: payout + encrypted evidence]
 *   → challenge window (timer bar) ── no challenge ──→ auto-pay (ghost,
 *   struck dead the moment a member challenges)
 *   → the mutual's jury (staked dots) → verdict → only then THE POOL PAYS.
 *
 * Pure function of `frame` (30 fps): vault settles 15, claim lands 40,
 * the window drains 58–88 and freezes at 75% when the challenge clicks
 * (84), the ghost auto-pay lane dies at 92, jurors seat 104+, the
 * verdict stamps 128, and the pay node lights 145 — always after the
 * jury. Candidate for the ui-kit once the shape settles.
 */

/** Clamp progress 0 → 1 across frames [a, b]. */
const pr = (frame: number, a: number, b: number) =>
  Math.min(1, Math.max(0, (frame - a) / (b - a)));

/** Settle-pop style for a card entering at progress `p`. */
const pop = (p: number): CSSProperties => ({
  opacity: p,
  transform: `scale(${0.95 + 0.05 * p})`,
});

/** Draw style for a connector hairline at progress `p`. */
const draw = (p: number): CSSProperties => ({
  opacity: p > 0 ? 1 : 0,
  transform: `scaleX(${p})`,
});

/** Hairline connector that draws left→right; chevron lands when done. */
const Link: FC<{ frame: number; from: number; to: number; className?: string }> = ({
  frame,
  from,
  to,
  className,
}) => {
  const p = pr(frame, from, to);
  return (
    <div className={`flex items-center gap-0.5 ${className ?? ""}`}>
      <div
        className="h-px w-7 origin-left bg-nearwhite/40"
        style={draw(p)}
      />
      <span
        className="text-xs text-nearwhite/40"
        style={{ opacity: p >= 1 ? 1 : 0 }}
      >
        ›
      </span>
    </div>
  );
};

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

const AMOUNT = 12_500;

export function PayoutFlow({ frame }: { frame: number }) {
  // The window drains 58→88; the challenge clicks at 84 and freezes it at 75%.
  const challenged = frame >= 84;
  const barFill = challenged ? 0.75 : pr(frame, 58, 88);

  const juryP = pr(frame, 100, 110);
  const verdictP = pr(frame, 128, 138);
  const payP = pr(frame, 145, 156);

  const clickRing = challenged ? Math.max(0, 1 - (frame - 84) / 10) : 0;

  return (
    <div className="flex max-w-8xl flex-wrap items-center gap-5">
      {/* the pool: member contributions */}
      <VaultBox
        frame={frame}
        label="member_contributions"
        token="fee"
        balance={2_400_000}
        at={15}
        tickAt={15}
        subCounters={[{ label: "members", value: 1_250 }]}
      />
      <Link frame={frame} from={36} to={44} />

      {/* the proposer files: a payout amount + encrypted evidence */}
      <div
        className="flex w-60 flex-col gap-2.5 rounded-lg border border-border-subtle bg-raised/60 px-5 py-4"
        style={pop(pr(frame, 40, 52))}
      >
        <div className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          PROPOSER FILES
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold tabular-nums text-nearwhite">
            {AMOUNT.toLocaleString("en-US")}
          </span>
          <span className="font-mono text-sm text-text-secondary">payout</span>
        </div>
        <div className="flex items-center gap-2 self-start rounded-md border border-border-subtle bg-raised px-3 py-1.5 font-mono text-sm text-text-secondary">
          <EvidenceLock className="h-4.5 w-4.5 text-amber" />
          evidence · encrypted
        </div>
      </div>
      <Link frame={frame} from={50} to={56} />

      {/* the challenge window and everything downstream of it */}
      <div className="flex min-w-104 flex-1 flex-col gap-4"
        style={pop(pr(frame, 56, 60))}
      >
        {/* the window is a timer, not a block: a bar that drains until it
            either completes (auto-pay) or is interrupted by a challenge */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center  max-w-4xl  justify-between font-mono text-xs text-muted-foreground">
            <span>CHALLENGE WINDOW</span>
            <span className="tabular-nums">
              {challenged ? "" : `${Math.round(barFill * 100)}%`}
            </span>
          </div>
          <div className="relative">
            <div className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-raised">
              <div
                className="h-full rounded-full bg-amber"
                style={{ width: `${barFill * 100}%` }}
              />
            </div>
            {/* the click: a member stops the clock inside the window */}
            <div
              className="absolute top-1/2 -translate-y-3/2"
              style={{ left: "75%", ...pop(pr(frame, 84, 92)) }}
            >
              <div
                className="-translate-x-1/2 rounded-full border border-amber bg-amber/15 px-3 py-1 font-mono text-xs whitespace-nowrap text-amber"
                style={{
                  boxShadow: `0 0 ${12 * clickRing}px var(--accord-amber)`,
                }}
              >
                member challenges
              </div>
            </div>
          </div>
        </div>

        {/* the challenged path: jury first, protocol pays after the verdict */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-raised/60 px-4 py-3"
            style={pop(juryP)}
          >
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className="h-2.5 w-2.5 rounded-full bg-amber"
                  style={pop(pr(frame, 104 + i * 5, 109 + i * 5))}
                />
              ))}
            </div>
            <div className="font-mono text-xs text-text-secondary">
              the mutual's jury · stake at risk
            </div>
          </div>
          <Link frame={frame} from={122} to={128} />
          <div
            className="rounded-full border border-amber/60 bg-amber/10 px-4 py-2 font-mono text-sm whitespace-nowrap text-amber"
            style={pop(verdictP)}
          >
            verdict: pay
          </div>
          <Link frame={frame} from={138} to={144} />
          <div
            className="flex items-baseline gap-2 rounded-lg border border-confirm/60 bg-confirm/10 px-4 py-2.5"
            style={pop(payP)}
          >
            <span className="font-mono text-sm text-confirm">the pool pays</span>
            <span className="font-mono text-lg font-semibold tabular-nums text-confirm">
              {AMOUNT.toLocaleString("en-US")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
