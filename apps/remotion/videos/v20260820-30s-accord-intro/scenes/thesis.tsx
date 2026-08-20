import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";

/**
 * S2 · THESIS — code can hold the stakes, but it cannot judge them.
 */
export function ThesisScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="intro-thesis" />
      <div className="relative flex h-full flex-col items-center justify-center gap-10 p-16">
        <Interactive.Div
          name="Thesis headline"
          className="font-heading text-7xl font-bold text-nearwhite"
          style={{
            opacity: interpolate(frame, [0.3 * fps, 0.85 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [0.3 * fps, 0.85 * fps], ["0.94 0.94", "1 1"], {
              easing: EASE_EXPO,
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          smart contracts <span className="text-slash">can’t judge.</span>
        </Interactive.Div>
        <Interactive.Div
          name="Thesis subline"
          className="font-mono text-2xl text-text-secondary"
          style={{
            opacity: interpolate(frame, [0.9 * fps, 1.4 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          no opcode for “who’s right?”
        </Interactive.Div>
      </div>
    </div>
  );
}
