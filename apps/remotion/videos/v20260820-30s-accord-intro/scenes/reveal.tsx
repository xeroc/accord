import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";
import { ConvergenceGlyph } from "./glyph";

/** S3 · REVEAL — the wordmark. Glyph converges, name lands, tagline follows. */
export function RevealScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="intro-reveal" />
      <div className="relative flex h-full flex-col items-center justify-center gap-9 p-16">
        <Interactive.Div
          name="Convergence glyph"
          style={{
            opacity: interpolate(frame, [0.15 * fps, 0.85 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <ConvergenceGlyph
            size={120}
            progress={interpolate(frame, [0.15 * fps, 0.85 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            dot={interpolate(frame, [0.8 * fps, 1.1 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            className="text-amber"
          />
        </Interactive.Div>
        <Interactive.Div
          name="Reveal wordmark"
          className="font-heading text-9xl font-bold tracking-tight text-nearwhite"
          style={{
            opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [0, 0.6 * fps], ["0px 40px", "0px 0px"], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Accord
        </Interactive.Div>
        <Interactive.Div
          name="Reveal rule"
          className="h-1 w-48 origin-center rounded-full bg-amber"
          style={{
            scale: interpolate(frame, [0.55 * fps, 0.95 * fps], ["0 1", "1 1"], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
        <Interactive.Div
          name="Reveal tagline"
          className="font-mono text-3xl text-text-secondary"
          style={{
            opacity: interpolate(frame, [0.8 * fps, 1.3 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          dispute resolution on solana.
        </Interactive.Div>
      </div>
    </div>
  );
}
