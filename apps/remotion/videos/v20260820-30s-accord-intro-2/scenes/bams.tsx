import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@useaccord/ui";
import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";

// One card per slot: fade in, hold just long enough to read, fade out.
const SLOT = 82;

function cardStyle(frame: number, start: number) {
  return {
    opacity: interpolate(
      frame,
      [start, start + 10, start + SLOT - 12, start + SLOT - 2],
      [0, 1, 1, 0],
      {
        easing: [EASE_EXPO, Easing.linear, EASE_EXPO],
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    ),
    scale: interpolate(frame, [start, start + 10], [0.96, 1], {
      easing: EASE_EXPO,
      output: "perceptual-scale" as const,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  };
}

/**
 * Scene 4 — the bams (16s-27s).
 * Four cards, one at a time, dead center: verdict escrow, curated
 * registries, mutuals as a protocol, adjudicated upgrades.
 */
export function BamsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="bams" />
      <div className="relative flex h-full flex-col items-center justify-center gap-16 px-24">
        <Interactive.Div
          name="Primitives caption"
          className="font-mono text-2xl tracking-[0.35em] text-amber"
          style={{
            opacity: interpolate(frame, [0.15 * fps, 0.5 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          NEW PRIMITIVES ON SOLANA
        </Interactive.Div>

        <div className="relative h-[420px] w-full">
          <div className="absolute inset-0 flex items-center justify-center">
            <Interactive.Div
              name="Card verdict escrow"
              className="w-[640px]"
              style={cardStyle(frame, 0)}
            >
              <Card className="ring-1 ring-foreground/10">
                <CardHeader>
                  <Badge variant="outline" className="font-mono">
                    escrow
                  </Badge>
                  <CardTitle className="mt-4 font-heading text-4xl text-nearwhite">
                    Verdict escrow
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xl text-text-secondary">
                  Funds release on a ruling.
                </CardContent>
              </Card>
            </Interactive.Div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <Interactive.Div
              name="Card curated registries"
              className="w-[640px]"
              style={cardStyle(frame, SLOT)}
            >
              <Card className="ring-1 ring-foreground/10">
                <CardHeader>
                  <Badge variant="outline" className="font-mono">
                    registry
                  </Badge>
                  <CardTitle className="mt-4 font-heading text-4xl text-nearwhite">
                    Curated registries
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xl text-text-secondary">
                  Entries defended by stake.
                </CardContent>
              </Card>
            </Interactive.Div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <Interactive.Div
              name="Card mutuals"
              className="w-[640px]"
              style={cardStyle(frame, SLOT * 2)}
            >
              <Card className="ring-1 ring-foreground/10">
                <CardHeader>
                  <Badge variant="outline" className="font-mono">
                    mutual
                  </Badge>
                  <CardTitle className="mt-4 font-heading text-4xl text-nearwhite">
                    Mutuals as a protocol
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xl text-text-secondary">
                  Coverage pools. A jury decides every claim.
                </CardContent>
              </Card>
            </Interactive.Div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <Interactive.Div
              name="Card adjudicated upgrades"
              className="w-[640px]"
              style={cardStyle(frame, SLOT * 3)}
            >
              <Card className="ring-1 ring-foreground/10">
                <CardHeader>
                  <Badge variant="outline" className="font-mono">
                    authority
                  </Badge>
                  <CardTitle className="mt-4 font-heading text-4xl text-nearwhite">
                    Adjudicated upgrades
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xl text-text-secondary">
                  Ship through a court.
                </CardContent>
              </Card>
            </Interactive.Div>
          </div>
        </div>
      </div>
    </div>
  );
}
