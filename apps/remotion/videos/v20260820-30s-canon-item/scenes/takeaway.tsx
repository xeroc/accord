import { AmberRule, StateNode } from "@useaccord/ui";
import {
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/**
 * S3 · TAKEAWAY — the spine recap: three states earned (confirm), the
 * exit still lit (amber), REMOVED never reached (dim).
 */
export function TakeawayScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const railAt = Math.round(1.8 * fps);
  const railFrame = Math.max(0, frame - railAt);

  return (
    <Scene seed="canon-item-takeaway" stack className="gap-9">
      <Interactive.Div
        name="Takeaway headline"
        className="font-heading text-8xl font-bold text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 0.1, 0.5),
          scale: interpolate(
            frame,
            [0.1 * fps, 0.6 * fps],
            ["0.94 0.94", "1 1"],
            { easing: EASE_EXPO, output: "perceptual-scale", ...clamp },
          ),
        }}
      >
        every state is <span className="text-amber">earned.</span>
      </Interactive.Div>
      <Interactive.Div name="Takeaway rule">
        <AmberRule enter={enterAt(frame, fps, 0.8, 0.4)} className="w-64" />
      </Interactive.Div>
      <Interactive.Div
        name="Takeaway line two"
        className="font-heading text-5xl font-bold text-nearwhite"
        style={{ opacity: enterAt(frame, fps, 1.3, 0.5) }}
      >
        the only exit is <span className="text-amber">still on trial.</span>
      </Interactive.Div>
      <Interactive.Div
        name="Lifecycle recap rail"
        className="mt-3 flex items-center gap-3"
        style={{ opacity: enterAt(frame, fps, 1.8, 0.5) }}
      >
        <StateNode frame={railFrame} label="PENDING" at={0} activeAt={2} settleAt={8} className="text-base" />
        <div className="h-[2px] w-8 bg-border-subtle" />
        <StateNode frame={railFrame} label="LISTED" at={2} activeAt={6} settleAt={12} className="text-base" />
        <div className="h-[2px] w-8 bg-border-subtle" />
        <StateNode frame={railFrame} label="WITHDRAW-PENDING" at={4} activeAt={10} className="text-base" />
        <div className="h-[2px] w-8 bg-border-subtle" />
        <StateNode frame={railFrame} label="REMOVED" at={6} className="text-base" />
      </Interactive.Div>
    </Scene>
  );
}
