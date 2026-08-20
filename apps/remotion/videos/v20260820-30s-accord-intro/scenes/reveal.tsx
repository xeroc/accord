import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AccordMark, AmberRule, Wordmark } from "../../../src/shell/brand";
import { Scene } from "../../../src/shell/scene";

/** S3 · REVEAL — the wordmark. Mark converges, name lands, tagline follows. */
export function RevealScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="intro-reveal" stack className="gap-9">
      <Interactive.Div name="Convergence mark" style={{ opacity: enterAt(frame, fps, 0.15, 0.7) }}>
        <AccordMark
          size={120}
          progress={enterAt(frame, fps, 0.15, 0.7)}
          dot={enterAt(frame, fps, 0.8, 0.3)}
          className="text-amber"
        />
      </Interactive.Div>
      <Interactive.Div name="Reveal wordmark">
        <Wordmark enter={enterAt(frame, fps, 0, 0.6)} className="text-9xl" />
      </Interactive.Div>
      <AmberRule enter={enterAt(frame, fps, 0.55, 0.4)} />
      <Interactive.Div
        name="Reveal tagline"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.8, 0.5) }}
      >
        dispute resolution on solana.
      </Interactive.Div>
    </Scene>
  );
}
