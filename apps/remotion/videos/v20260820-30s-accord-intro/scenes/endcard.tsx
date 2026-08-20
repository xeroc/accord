import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AccordMark, Wordmark } from "../../../src/shell/brand";
import { Scene } from "../../../src/shell/scene";

/** S6 · END CARD — wordmark, tagline, one link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="intro-endcard" stack className="gap-8">
      <Interactive.Div name="Endcard mark" style={{ opacity: enterAt(frame, fps, 0.05, 0.35) }}>
        <AccordMark
          size={90}
          progress={enterAt(frame, fps, 0.05, 0.35)}
          dot={enterAt(frame, fps, 0.35, 0.25)}
          className="text-amber"
        />
      </Interactive.Div>
      <Interactive.Div name="Endcard wordmark">
        <Wordmark
          enter={enterAt(frame, fps, 0.1, 0.4)}
          settle={24}
          className="text-8xl"
        />
      </Interactive.Div>
      <Interactive.Div
        name="Endcard tagline"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.4, 0.4) }}
      >
        mechanize the verdict.
      </Interactive.Div>
      <Interactive.Div
        name="Endcard link"
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.6, 0.4) }}
      >
        useaccord.xyz
      </Interactive.Div>
    </Scene>
  );
}
