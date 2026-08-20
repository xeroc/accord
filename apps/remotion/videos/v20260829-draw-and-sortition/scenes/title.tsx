import { useCurrentFrame, useVideoConfig } from "remotion";

import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";
import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** TitleScene — the family opener: kicker, mark draw-on, wordmark, rule. */
export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed="draw-sortition-title" stack className="gap-8">
      <span
        className="font-mono text-sm tracking-[0.4em] text-amber"
        style={{ opacity: enterAt(frame, fps, 0.3, 0.4) }}
      >
        GROUP C · RANDOMNESS AND THE DRAW
      </span>
      <AccordMark size={132} progress={enterAt(frame, fps, 0.55, 1.0)} />
      <Wordmark enter={enterAt(frame, fps, 1.5, 0.5)} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 1.95, 0.4)} />
      <h1
        className="font-heading text-5xl font-bold text-nearwhite"
        style={{ opacity: enterAt(frame, fps, 2.15, 0.4) }}
      >
        Randomness &amp; the Draw
      </h1>
      <p
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 2.4, 0.4) }}
      >
        sortition · accumulator · vrf freeze
      </p>
    </Scene>
  );
}
