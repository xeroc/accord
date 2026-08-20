import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { PhaseCaptions } from "../../../src/shell/rail";
import {
  JurorPool,
  RulingStamp,
  SealedVote,
} from "@useaccord/ui";

const POOL_SIZE = 30;

const DRAWN = [
  { dot: 7, at: 40 },
  { dot: 16, at: 50 },
  { dot: 24, at: 60 },
];

const JURORS = [
  { hash: "6f3a91", commitAt: 90, vote: "yes", revealAt: 135 },
  { hash: "c07d24", commitAt: 98, vote: "yes", revealAt: 143 },
  { hash: "9b1e58", commitAt: 106, vote: "no", revealAt: 151 },
];

const STAGE_FRAMES = [40, 90, 135];
const CAPTIONS = ["DRAW", "COMMIT", "REVEAL", "RULE"];

/**
 * Scene 2 — the mechanism (5s-12s).
 * Left: the claim. Right: the pipeline — a staked pool, three jurors drawn,
 * commits land as hashes, reveals flip to votes, the ruling stamps in.
 */
export function MechanismScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stage = STAGE_FRAMES.filter((s) => frame >= s).length;

  return (
    <Scene seed="mechanism">
      <div className="relative flex h-full items-center gap-24 px-24">
        <div className="flex flex-1 flex-col justify-center gap-8">
          <Interactive.Div
            name="Mechanism headline"
            className="font-heading text-7xl font-bold leading-tight tracking-tight text-nearwhite"
            style={{
              opacity: enterAt(frame, fps, 0.25, 0.5),
              translate: `0px ${(1 - enterAt(frame, fps, 0.25, 0.5)) * 24}px`,
            }}
          >
            Accord puts human jurors on-chain.
          </Interactive.Div>
          <Interactive.Div
            name="Mechanism subline"
            className="font-mono text-2xl text-text-secondary"
            style={{ opacity: enterAt(frame, fps, 1.8, 0.5) }}
          >
            drawn at random / staked / slashed for dishonesty
          </Interactive.Div>
          <Interactive.Div
            name="Mechanism incentive line"
            className="font-heading text-3xl font-medium text-amber"
            style={{ opacity: enterAt(frame, fps, 3.1, 0.5) }}
          >
            Vote with the majority or lose your stake.
          </Interactive.Div>
        </div>

        <div className="flex w-[620px] flex-col items-center gap-7">
          {/* staked pool */}
          <Interactive.Div name="Juror pool">
            <JurorPool
              frame={frame}
              count={POOL_SIZE}
              cols={5}
              dotSize={12}
              drawnAt={(d) => DRAWN.find((x) => x.dot === d)?.at}
            />
          </Interactive.Div>

          <div className="h-8 w-px bg-border-subtle" />

          {/* commits, then reveals */}
          <div className="flex gap-4">
            {JURORS.map((juror) => (
              <Interactive.Div key={juror.hash} name={`Commit ${juror.hash}`}>
                <SealedVote
                  frame={frame}
                  hash={juror.hash}
                  vote={juror.vote}
                  commitAt={juror.commitAt}
                  revealAt={juror.revealAt}
                  className="h-auto rounded-md bg-raised px-5 py-2.5 font-mono text-lg"
                />
              </Interactive.Div>
            ))}
          </div>

          <div className="h-8 w-px bg-border-subtle" />

          {/* the ruling */}
          <Interactive.Div name="Ruling stamp">
            <RulingStamp frame={frame} text="RULING: YES" at={175} dur={7} size="md" />
          </Interactive.Div>

          <PhaseCaptions labels={CAPTIONS} active={stage} />
        </div>
      </div>
    </Scene>
  );
}
