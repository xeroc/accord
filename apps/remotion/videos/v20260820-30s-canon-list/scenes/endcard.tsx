import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AmberRule } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";

/** S4 · END CARD — Canon lockup, tagline, one link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lockIn = enterAt(frame, fps, 0.05, 0.5);

  return (
    <Scene seed="canon-list-endcard" stack className="gap-8">
      <Interactive.Div
        name="Canon lockup"
        className="font-heading text-8xl font-bold tracking-tight text-nearwhite"
        style={{ opacity: lockIn, translate: `0px ${(1 - lockIn) * 24}px` }}
      >
        Canon
      </Interactive.Div>
      <Interactive.Div name="Endcard rule">
        <AmberRule enter={enterAt(frame, fps, 0.35, 0.45)} className="w-64" />
      </Interactive.Div>
      <Interactive.Div
        name="Endcard tagline"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.55, 0.4) }}
      >
        the list that defends itself.
      </Interactive.Div>
      <Interactive.Div
        name="Endcard link"
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.75, 0.4) }}
      >
        useaccord.xyz
      </Interactive.Div>
    </Scene>
  );
}
