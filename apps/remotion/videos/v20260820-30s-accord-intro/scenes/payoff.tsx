import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/**
 * S5 · PAYOFF — the incentive ledger, then the name for it.
 * The ledger is fully gone (faded AND lifted out) before the aha layer
 * enters — the two text layers never coexist on screen.
 */
export function PayoffScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="intro-payoff" stack>
      <div className="flex flex-col items-center gap-8">
        <Interactive.Div
          name="Payoff row earn"
          className="font-heading text-5xl font-bold text-nearwhite"
          style={{
            opacity: interpolate(
              frame,
              [0.1 * fps, 0.6 * fps, 2 * fps, 2.4 * fps],
              [0, 1, 1, 0],
              { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
            ),
            translate: interpolate(
              frame,
              [2 * fps, 2.4 * fps],
              ["0px 0px", "0px -60px"],
              { easing: EASE_EXPO, ...clamp },
            ),
          }}
        >
          vote with the majority → <span className="text-confirm">earn.</span>
        </Interactive.Div>
        <Interactive.Div
          name="Payoff row slashed"
          className="font-heading text-5xl font-bold text-nearwhite"
          style={{
            opacity: interpolate(
              frame,
              [0.75 * fps, 1.25 * fps, 2 * fps, 2.4 * fps],
              [0, 1, 1, 0],
              { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
            ),
            translate: interpolate(
              frame,
              [2 * fps, 2.4 * fps],
              ["0px 0px", "0px -60px"],
              { easing: EASE_EXPO, ...clamp },
            ),
          }}
        >
          vote against → <span className="text-slash">get slashed.</span>
        </Interactive.Div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-10">
        <Interactive.Div
          name="Schelling point line"
          className="font-heading text-8xl font-bold text-nearwhite"
          style={{
            opacity: enterAt(frame, fps, 2.5, 0.55),
            scale: interpolate(
              frame,
              [2.5 * fps, 3.05 * fps],
              ["0.92 0.92", "1 1"],
              { easing: EASE_EXPO, output: "perceptual-scale", ...clamp },
            ),
          }}
        >
          the schelling point: <span className="text-amber">honesty.</span>
        </Interactive.Div>
        <Interactive.Div
          name="Payoff rule"
          className="h-1 w-64 origin-center rounded-full bg-amber"
          style={{ scale: `${enterAt(frame, fps, 3.3, 0.4)} 1` }}
        />
      </div>
    </Scene>
  );
}
