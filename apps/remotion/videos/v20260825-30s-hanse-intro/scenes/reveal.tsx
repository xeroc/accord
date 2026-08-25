import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";

/** S3 · REVEAL — the destination: Hanse, the protocol for mutuals. */
export function RevealScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="hanse-reveal" stack className="gap-9">
      <Interactive.Div name="Convergence mark" style={{ opacity: enterAt(frame, fps, 0.15, 0.7) }}>
        <AccordMark
          size={120}
          progress={enterAt(frame, fps, 0.15, 0.7)}
          className="text-amber"
        />
      </Interactive.Div>
      <Interactive.Div name="Reveal wordmark">
        <Wordmark enter={enterAt(frame, fps, 0, 0.6)} brandName="Hanse" className="text-9xl" />
      </Interactive.Div>
      <AmberRule enter={enterAt(frame, fps, 0.55, 0.4)} />
      <Interactive.Div
        name="Reveal tagline"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.8, 0.5) }}
      >
        the protocol for mutuals.
      </Interactive.Div>
      <Interactive.Div
        name="Reveal subline"
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.5, 0.5) }}
      >
        one risk, one pool — no company in the middle.
      </Interactive.Div>
    </Scene>
  );
}
