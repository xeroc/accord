import { AmberRule } from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S4 · END CARD — Canon lockup, tagline, one link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-challenge-endcard" stack className="gap-8">
      <Interactive.Div
        name="Canon lockup"
        className="font-heading font-bold tracking-tight text-nearwhite text-8xl"
        style={{ opacity: enterAt(frame, fps, 0.05, 0.35) }}
      >
        Canon
      </Interactive.Div>
      <AmberRule enter={enterAt(frame, fps, 0.35, 0.4)} />
      <Interactive.Div
        name="Endcard tagline"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.5, 0.4) }}
      >
        the list that defends itself.
      </Interactive.Div>
      <Interactive.Div
        name="Endcard link"
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.7, 0.4) }}
      >
        useaccord.xyz
      </Interactive.Div>
    </Scene>
  );
}
