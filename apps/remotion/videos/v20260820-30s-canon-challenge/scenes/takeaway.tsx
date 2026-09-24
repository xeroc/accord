import { AmberRule } from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S3 · TAKEAWAY — the challenge reframed: a case that closes itself. */
export function TakeawayScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-challenge-takeaway" stack className="gap-10">
      <Interactive.Div
        name="Takeaway line 1"
        className="font-heading font-bold text-6xl text-nearwhite"
        style={{ opacity: enterAt(frame, fps, 0.05, 0.4) }}
      >
        a challenge is a <span className="text-amber">case</span> —
      </Interactive.Div>
      <AmberRule enter={enterAt(frame, fps, 0.6, 0.5)} className="w-72" />
      <Interactive.Div
        name="Takeaway line 2"
        className="font-heading font-bold text-6xl text-nearwhite"
        style={{ opacity: enterAt(frame, fps, 1.0, 0.4) }}
      >
        and the verdict is <span className="text-amber">self-executing</span>.
      </Interactive.Div>
    </Scene>
  );
}
