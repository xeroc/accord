import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/** Endcard — family chrome: mark, wordmark, the amber rule, useaccord.xyz. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="evidence-endcard" stack className="gap-8">
      <Interactive.Div name="Endcard mark" style={{ opacity: enterAt(frame, fps, 0.05, 0.35) }}>
        <AccordMark
          size={88}
          progress={enterAt(frame, fps, 0.05, 0.5)}
          className="text-amber"
        />
      </Interactive.Div>
      <Interactive.Div name="Endcard wordmark">
        <Wordmark enter={enterAt(frame, fps, 0.15, 0.4)} settle={24} className="text-7xl" />
      </Interactive.Div>
      <AmberRule enter={enterAt(frame, fps, 0.45, 0.4)} />
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
