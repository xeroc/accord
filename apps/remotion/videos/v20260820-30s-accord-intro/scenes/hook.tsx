import { Card, CardContent, CardHeader, CardTitle } from "@useaccord/ui";
import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";

/** S1 · HOOK — two wallets face off; the chain between them holds the tension. */
export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="intro-hook" />
      <div className="relative flex h-full flex-col items-center justify-center gap-16 p-16">
        <div className="flex w-[1560px] items-center gap-10">
          <Interactive.Div
            name="Party card left"
            className="w-[440px] shrink-0"
            style={{
              opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [0, 0.6 * fps, 1.2 * fps, 3.4 * fps],
                ["-140px 0px", "0px 0px", "0px 0px", "14px 0px"],
                {
                  easing: [EASE_EXPO, Easing.linear, EASE_EXPO],
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-xl text-text-secondary">
                  7xKX…gQ2v
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-2xl text-nearwhite">
                  “the milestone shipped”
                </p>
              </CardContent>
            </Card>
          </Interactive.Div>

          <Interactive.Div
            name="Tension line"
            className="h-[3px] flex-1 origin-center rounded-full bg-amber"
            style={{
              scale: interpolate(frame, [0.7 * fps, 1.2 * fps], ["0 1", "1 1"], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />

          <Interactive.Div
            name="Party card right"
            className="w-[440px] shrink-0"
            style={{
              opacity: interpolate(frame, [0.15 * fps, 0.75 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [0.15 * fps, 0.75 * fps, 1.2 * fps, 3.4 * fps],
                ["140px 0px", "0px 0px", "0px 0px", "-14px 0px"],
                {
                  easing: [EASE_EXPO, Easing.linear, EASE_EXPO],
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-xl text-text-secondary">
                  9fJe…wLm3
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-2xl text-nearwhite">
                  “it never did”
                </p>
              </CardContent>
            </Card>
          </Interactive.Div>
        </div>

        <div className="flex flex-col items-center gap-7">
          <Interactive.Div
            name="Hook line one"
            className="font-heading text-7xl font-bold text-nearwhite"
            style={{
              opacity: interpolate(frame, [1.5 * fps, 2 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [1.5 * fps, 2 * fps],
                ["0px 24px", "0px 0px"],
                {
                  easing: EASE_EXPO,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            two sides. one chain.
          </Interactive.Div>
          <Interactive.Div
            name="Hook line two"
            className="font-heading text-8xl font-bold text-amber"
            style={{
              opacity: interpolate(frame, [2.3 * fps, 2.9 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate(frame, [2.3 * fps, 2.9 * fps], ["0.92 0.92", "1 1"], {
                easing: EASE_EXPO,
                output: "perceptual-scale",
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            who decides?
          </Interactive.Div>
        </div>
      </div>
    </div>
  );
}
