import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AmberRule } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";

/** S3 · TAKEAWAY — the one-liner the episode exists for. */
export function TakeawayScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lineOne = enterAt(frame, fps, 0.15, 0.5);
  const lineTwo = enterAt(frame, fps, 0.95, 0.55);

  return (
    <Scene seed="canon-list-takeaway" stack className="gap-12">
      <Interactive.Div
        name="Takeaway line one"
        className="font-heading text-7xl font-bold text-nearwhite"
        style={{ opacity: lineOne, translate: `0px ${(1 - lineOne) * 24}px` }}
      >
        a constitution and a court —
      </Interactive.Div>
      <Interactive.Div
        name="Takeaway line two"
        className="font-heading text-7xl font-bold text-nearwhite"
        style={{ opacity: lineTwo, translate: `0px ${(1 - lineTwo) * 24}px` }}
      >
        created by anyone, <span className="text-amber">owned by no one.</span>
      </Interactive.Div>
      <Interactive.Div name="Takeaway rule" className="pt-2">
        <AmberRule enter={enterAt(frame, fps, 1.9, 0.5)} className="w-64" />
      </Interactive.Div>
    </Scene>
  );
}
