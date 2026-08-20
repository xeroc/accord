import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";
import { ConvergenceGlyph } from "./glyph";

/** S6 · END CARD — wordmark, tagline, one link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="intro-endcard" />
      <div className="relative flex h-full flex-col items-center justify-center gap-8 p-16">
        <Interactive.Div
          name="Endcard glyph"
          style={{
            opacity: interpolate(frame, [0.05 * fps, 0.4 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <ConvergenceGlyph
            size={90}
            progress={interpolate(frame, [0.05 * fps, 0.4 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            dot={interpolate(frame, [0.35 * fps, 0.6 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            className="text-amber"
          />
        </Interactive.Div>
        <Interactive.Div
          name="Endcard wordmark"
          className="font-heading text-8xl font-bold tracking-tight text-nearwhite"
          style={{
            opacity: interpolate(frame, [0.1 * fps, 0.5 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [0.1 * fps, 0.5 * fps], ["0px 24px", "0px 0px"], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Accord
        </Interactive.Div>
        <Interactive.Div
          name="Endcard tagline"
          className="font-mono text-3xl text-text-secondary"
          style={{
            opacity: interpolate(frame, [0.4 * fps, 0.8 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          mechanize the verdict.
        </Interactive.Div>
        <Interactive.Div
          name="Endcard link"
          className="font-mono text-3xl text-amber"
          style={{
            opacity: interpolate(frame, [0.6 * fps, 1 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          useaccord.xyz
        </Interactive.Div>
      </div>
    </div>
  );
}
