import { useMemo } from "react";
import { PayoutFlow, useWallClockFrame } from "@useaccord/ui";

// The payout path, replayed — the kit PayoutFlow (same mechanism the
// demo-day deck runs) on a wall-clock loop. Reduced-motion visitors see
// the settled frame: challenged, adjudicated, paid.
const LOOP = 260; // frames @ 30fps ≈ 8.7s — settles ~5.2s, dwells, replays

export function PayoutPath() {
  const live = useWallClockFrame({ fps: 30, loopFrames: LOOP });
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const frame = reduced ? LOOP - 20 : live;

  return (
    <div className="mt-16 border-t border-border/70 pt-10">
      <div
        role="img"
        aria-label="The payout path: a proposer files a payout with encrypted evidence, a challenge window runs, a member challenges, the mutual's jury decides, and only then does the pool pay"
      >
        <PayoutFlow frame={frame} />
      </div>
      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-body sm:text-base">
        The same sequence, replayed: the proposer files the payout with its
        encrypted evidence, the challenge window runs, contested payouts go
        to the mutual's jury.{" "}
        <span className="text-nearwhite">The verdict always comes before the money moves.</span>
      </p>
    </div>
  );
}
