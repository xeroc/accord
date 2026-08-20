import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/**
 * S2 · THESIS — code can hold the stakes, but it cannot judge them.
 */
export function ThesisScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="intro-thesis" stack className="gap-10">
      <Interactive.Div
        name="Thesis headline"
        className="font-heading text-7xl font-bold text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 0.3, 0.55),
          scale: interpolate(frame, [0.3 * fps, 0.85 * fps], ["0.94 0.94", "1 1"], {
            easing: EASE_EXPO,
            output: "perceptual-scale",
            ...clamp,
          }),
        }}
      >
        smart contracts <span className="text-slash">can’t judge.</span>
      </Interactive.Div>
      <Interactive.Div
        name="Thesis subline"
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.9, 0.5) }}
      >
        no opcode for “who’s right?”
      </Interactive.Div>
    </Scene>
  );
}
