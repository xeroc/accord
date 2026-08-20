import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { AmberRule } from "@useaccord/ui";
import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/**
 * S3 · TAKEAWAY — the incentive pincer in two lines: failed attacks
 * pay the target, honest strikes collect the pile.
 */
export function TakeawayScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-econ-takeaway" stack className="gap-10">
      <Interactive.Div
        name="Takeaway line 1"
        className="font-heading text-6xl font-bold text-nearwhite"
        style={{ opacity: enterAt(frame, fps, 0.2, 0.5) }}
      >
        every failed attack <span className="text-amber">armors</span> the target.
      </Interactive.Div>
      <Interactive.Div
        name="Takeaway line 2"
        className="font-heading text-6xl font-bold text-nearwhite"
        style={{ opacity: enterAt(frame, fps, 1.4, 0.5) }}
      >
        every <span className="text-confirm">honest strike</span> takes the{" "}
        <span className="text-amber">whole pile.</span>
      </Interactive.Div>
      <AmberRule
        enter={enterAt(frame, fps, 2.6, 0.4)}
        className="mt-4 w-64"
      />
    </Scene>
  );
}
