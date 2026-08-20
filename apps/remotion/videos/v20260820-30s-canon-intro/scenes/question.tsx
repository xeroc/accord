import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S2 · QUESTION — every surface asks it; nobody owns the answer. */
export function QuestionScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-intro-question" stack className="gap-10">
      <Interactive.Div
        name="Question headline"
        className="font-heading text-8xl font-bold text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 0.25, 0.55),
          scale: interpolate(
            frame,
            [0.25 * fps, 0.8 * fps],
            ["0.94 0.94", "1 1"],
            {
              easing: EASE_EXPO,
              output: "perceptual-scale",
              ...clamp,
            },
          ),
        }}
      >
        <span className="text-amber">which</span> one is{" "}
        <span className="text-amber">real</span>?
      </Interactive.Div>
      <Interactive.Div
        name="Question subline"
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.9, 0.5) }}
      >
        wallets. dexs. explorers. everyone asks.
      </Interactive.Div>
    </Scene>
  );
}
