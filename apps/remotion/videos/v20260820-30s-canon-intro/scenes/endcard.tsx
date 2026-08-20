import { AmberRule } from "@useaccord/ui";
import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S6 · END CARD — Canon lockup, tagline, one link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-intro-endcard" stack className="gap-8">
      <Interactive.Div
        name="Endcard lockup"
        className="font-heading text-8xl font-bold tracking-tight text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 0.1, 0.4),
          scale: interpolate(
            frame,
            [0.1 * fps, 0.6 * fps],
            ["0.94 0.94", "1 1"],
            {
              easing: EASE_EXPO,
              output: "perceptual-scale",
              ...clamp,
            },
          ),
        }}
      >
        Canon
      </Interactive.Div>
      <AmberRule enter={enterAt(frame, fps, 0.5, 0.4)} />
      <Interactive.Div
        name="Endcard tagline"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.8, 0.4) }}
      >
        the list that defends itself.
      </Interactive.Div>
      <Interactive.Div
        name="Endcard link"
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 1.1, 0.4) }}
      >
        useaccord.xyz
      </Interactive.Div>
    </Scene>
  );
}
