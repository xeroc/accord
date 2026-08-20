import {
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";

/**
 * Scene 5 — close (27s-30s).
 * Wordmark, amber rule, the thesis line, the program id. Fades to ink.
 */
export function CloseScene() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="close" />
      <Interactive.Div
        name="Close stack"
        className="relative flex h-full flex-col items-center justify-center gap-9"
        style={{
          opacity: interpolate(
            frame,
            [durationInFrames - 15, durationInFrames],
            [1, 0],
            {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          ),
        }}
      >
        <Interactive.Div
          name="Wordmark"
          className="font-heading text-[10rem] font-bold leading-none tracking-tight text-nearwhite"
          style={{
            opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [0, 0.4 * fps],
              ["0px 30px", "0px 0px"],
              {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
          }}
        >
          Accord
        </Interactive.Div>

        <Interactive.Div
          name="Amber rule"
          className="h-1.5 w-56 origin-center rounded-full bg-amber"
          style={{
            scale: interpolate(frame, [0.25 * fps, 0.7 * fps], ["0 1", "1 1"], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />

        <Interactive.Div
          name="Thesis line"
          className="font-heading text-4xl font-medium text-body"
          style={{
            opacity: interpolate(frame, [0.4 * fps, 0.8 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Honesty is now a Solana primitive.
        </Interactive.Div>

        <Interactive.Div
          name="Program id"
          className="font-mono text-base text-text-secondary"
          style={{
            opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed
        </Interactive.Div>
      </Interactive.Div>
    </div>
  );
}
