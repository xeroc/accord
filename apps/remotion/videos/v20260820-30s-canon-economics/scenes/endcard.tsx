import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { AmberRule } from "@useaccord/ui";
import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/**
 * S4 · END CARD — the Canon lockup, the series tagline, one link.
 * Canon films never use the Accord wordmark: plain-text lockup only.
 */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-econ-endcard" stack className="gap-8">
      <Interactive.Div name="Endcard lockup">
        <div
          className="font-heading text-8xl font-bold tracking-tight text-nearwhite"
          style={{
            opacity: enterAt(frame, fps, 0.05, 0.35),
            scale: `${0.94 + 0.06 * enterAt(frame, fps, 0.05, 0.45)} ${
              0.94 + 0.06 * enterAt(frame, fps, 0.05, 0.45)
            }`,
          }}
        >
          Canon
        </div>
      </Interactive.Div>
      <AmberRule enter={enterAt(frame, fps, 0.25, 0.4)} className="w-64" />
      <Interactive.Div
        name="Endcard tagline"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.45, 0.4) }}
      >
        the list that defends itself.
      </Interactive.Div>
      <Interactive.Div
        name="Endcard link"
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.65, 0.4) }}
      >
        useaccord.xyz
      </Interactive.Div>
    </Scene>
  );
}
