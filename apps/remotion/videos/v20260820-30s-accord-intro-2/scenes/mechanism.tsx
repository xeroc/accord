import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { PhaseCaptions } from "../../../src/shell/rail";
import { DrawCommitReveal } from "@useaccord/ui";

const STAGE_FRAMES = [40, 90, 135];
const CAPTIONS = ["DRAW", "COMMIT", "REVEAL", "RULE"];

/**
 * Scene 2 — the mechanism (5s-12s).
 * Left: the claim. Right: the kit DrawCommitReveal pipeline — a staked
 * pool, three jurors drawn, commits land as hashes, reveals flip to
 * votes, the ruling stamps in. Defaults carry the intro's beat.
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
          <Interactive.Div name="Mechanism pipeline">
            <DrawCommitReveal frame={frame} />
          </Interactive.Div>

          <PhaseCaptions labels={CAPTIONS} active={stage} />
        </div>
      </div>
    </Scene>
  );
}
