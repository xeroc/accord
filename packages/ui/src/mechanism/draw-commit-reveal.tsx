import type { FC } from "react";

import { cn } from "../internal/cn";
import { JurorPool } from "./juror-pool";
import { RulingStamp } from "./ruling-stamp";
import { SealedVote } from "./sealed-vote";

/**
 * DrawCommitReveal — the mechanism pipeline from the accord-30s intro:
 * the staked pool, three jurors drawn out of it (amber pops), their
 * sealed commits landing as hashes, the reveal flipping them open into
 * votes, and the ruling stamping in underneath. A frame-contract
 * composition of JurorPool → SealedVote×3 → RulingStamp; every timing
 * is a prop so scenes and pages replay the same choreography. Defaults
 * reproduce the intro video's beat. Pure function of `frame`.
 */

export type DrawCommitRevealJuror = {
  /** commit hash (scrambles in, then locks) */
  hash: string;
  /** the revealed vote label */
  vote: string;
  commitAt: number;
  revealAt: number;
};

export type DrawCommitRevealDraw = {
  /** pool dot index that pops amber (the juror being drawn) */
  dot: number;
  at: number;
};

const DEFAULT_DRAWN: readonly DrawCommitRevealDraw[] = [
  { dot: 7, at: 40 },
  { dot: 16, at: 50 },
  { dot: 24, at: 60 },
];

const DEFAULT_JURORS: readonly DrawCommitRevealJuror[] = [
  { hash: "6f3a91", commitAt: 90, vote: "yes", revealAt: 135 },
  { hash: "c07d24", commitAt: 98, vote: "yes", revealAt: 143 },
  { hash: "9b1e58", commitAt: 106, vote: "no", revealAt: 151 },
];

export const DrawCommitReveal: FC<{
  frame: number;
  /** pool size in dots (default 30) */
  poolCount?: number;
  /** pool grid columns (default 5) */
  poolCols?: number;
  dotSize?: number;
  /** which pool dots are drawn, and when (default the intro trio) */
  drawn?: readonly DrawCommitRevealDraw[];
  /** the jury's commit/reveal slots (default the intro trio) */
  jurors?: readonly DrawCommitRevealJuror[];
  /** frame the ruling stamp lands (default 175) */
  rulingAt?: number;
  rulingText?: string;
  rulingDur?: number;
  width?: number;
  className?: string;
}> = ({
  frame,
  poolCount = 30,
  poolCols = 5,
  dotSize = 12,
  drawn = DEFAULT_DRAWN,
  jurors = DEFAULT_JURORS,
  rulingAt = 175,
  rulingText = "RULING: YES",
  rulingDur = 7,
  width = 620,
  className,
}) => (
  <div className={cn("flex flex-col items-center gap-7", className)} style={{ width }}>
    {/* staked pool */}
    <div data-pool>
      <JurorPool
        frame={frame}
        count={poolCount}
        cols={poolCols}
        dotSize={dotSize}
        drawnAt={(d) => drawn.find((x) => x.dot === d)?.at}
      />
    </div>

    <div className="h-8 w-px bg-border-subtle" />

    {/* commits, then reveals */}
    <div data-votes className="flex gap-4">
      {jurors.map((juror) => (
        <SealedVote
          key={juror.hash}
          frame={frame}
          hash={juror.hash}
          vote={juror.vote}
          commitAt={juror.commitAt}
          revealAt={juror.revealAt}
          className="h-auto rounded-md bg-raised px-5 py-2.5 font-mono text-lg"
        />
      ))}
    </div>

    <div className="h-8 w-px bg-border-subtle" />

    {/* the ruling */}
    <div data-ruling>
      <RulingStamp frame={frame} text={rulingText} at={rulingAt} dur={rulingDur} size="md" />
    </div>
  </div>
);
