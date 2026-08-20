import { AmberRule } from "@useaccord/ui";
import {
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S4 · END CARD — series lockup: Canon, rule, tagline, one link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-item-endcard" stack className="gap-8">
      <Interactive.Div
        name="Canon lockup"
        className="font-heading text-8xl font-bold tracking-tight text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 0.05, 0.35),
          scale: interpolate(
            frame,
            [0.05 * fps, 0.5 * fps],
            ["0.94 0.94", "1 1"],
            { easing: EASE_EXPO, output: "perceptual-scale", ...clamp },
          ),
        }}
      >
        Canon
      </Interactive.Div>
      <Interactive.Div name="Endcard rule">
        <AmberRule enter={enterAt(frame, fps, 0.35, 0.4)} className="w-56" />
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
