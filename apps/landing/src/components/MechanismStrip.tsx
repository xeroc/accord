import { useMemo } from "react";
import {
  JurorPool,
  RulingStamp,
  SealedVote,
  TallyBar,
  useWallClockFrame,
} from "@useaccord/ui";

// The mechanism as a living loop: the staked pool, five jurors drawn by
// VRF, sealed commits flipping to reveals, the tally, the ruling stamp.
// Same kit pieces the videos use — wall-clock driven here, looping
// every 12s. Reduced-motion visitors see the settled frame.

const LOOP = 360; // frames @ 30fps = 12s

const BEAT = {
  drawAt: (i: number) => 24 + i * 6,
  commitAt: (i: number) => 100 + i * 9,
  revealAt: (i: number) => 168 + i * 9,
  tallyAt: 232,
  stampAt: 272,
};

/** The cast — five jurors, one incoherent (the NO). One drawn pool dot
 * per sealed vote: DRAWN_DOTS is derived from the cast, never counted by hand. */
const JURORS = [
  { hash: "6f3a91c2", vote: "YES" },
  { hash: "c07d24ae", vote: "NO" },
  { hash: "9b1e58f0", vote: "YES" },
  { hash: "3d94b761", vote: "YES" },
  { hash: "e2c80b45", vote: "YES" },
] as const;

const DRAWN_DOTS = JURORS.map((_, i) => 3 + i * 6);
const yesCount = JURORS.filter((j) => j.vote === "YES").length;

export function MechanismStrip() {
  const live = useWallClockFrame({ fps: 30, loopFrames: LOOP });
  const reduced = useMemo(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const frame = reduced ? LOOP - 20 : live;

  return (
    <div
      aria-label="How a ruling is produced: jurors drawn from the staked pool, sealed commits revealed, majority stamped as the ruling"
      role="img"
      className="mt-12 flex flex-col items-center gap-9 border-t border-border/60 pt-12"
    >
      <JurorPool
        frame={frame}
        count={30}
        cols={15}
        drawnAt={(d) => {
          const j = DRAWN_DOTS.indexOf(d);
          return j >= 0 ? BEAT.drawAt(j) : undefined;
        }}
        label="STAKED POOL · 30"
      />

      <div className="flex flex-wrap justify-center gap-4">
        {JURORS.map((juror, i) => (
          <SealedVote
            key={juror.hash}
            frame={frame}
            hash={juror.hash}
            vote={juror.vote}
            commitAt={BEAT.commitAt(i)}
            revealAt={BEAT.revealAt(i)}
            tone={juror.vote === "NO" ? "slash" : "confirm"}
            toneAt={296 + i * 4}
            crossAt={juror.vote === "NO" ? 316 : undefined}
            className="h-auto rounded-md bg-raised px-5 py-2.5 font-mono text-lg"
          />
        ))}
      </div>

      <TallyBar
        frame={frame}
        yes={yesCount}
        no={JURORS.length - yesCount}
        at={BEAT.tallyAt}
        width={520}
      />

      <RulingStamp frame={frame} text="RULING: YES" at={BEAT.stampAt} size="md" />
    </div>
  );
}
