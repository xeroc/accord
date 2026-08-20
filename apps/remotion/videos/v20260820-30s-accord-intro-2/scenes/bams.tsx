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
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

// One card per slot: fade in, hold just long enough to read, fade out.
const SLOT = 82;

function cardStyle(frame: number, start: number) {
  return {
    opacity: interpolate(
      frame,
      [start, start + 10, start + SLOT - 12, start + SLOT - 2],
      [0, 1, 1, 0],
      { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
    ),
    scale: interpolate(frame, [start, start + 10], [0.96, 1], {
      easing: EASE_EXPO,
      output: "perceptual-scale" as const,
      ...clamp,
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

  const CARDS = [
    {
      slot: 0,
      badge: "escrow",
      title: "Verdict escrow",
      body: "Funds release on a ruling.",
    },
    {
      slot: SLOT,
      badge: "registry",
      title: "Curated registries",
      body: "Entries defended by stake.",
    },
    {
      slot: SLOT * 2,
      badge: "mutual",
      title: "Mutuals as a protocol",
      body: "Coverage pools. A jury decides every claim.",
    },
    {
      slot: SLOT * 3,
      badge: "authority",
      title: "Adjudicated upgrades",
      body: "Ship through a court.",
    },
  ];

  return (
    <Scene seed="bams" stack className="gap-16 px-24">
      <Interactive.Div
        name="Primitives caption"
        className="font-mono text-2xl tracking-[0.35em] text-amber"
        style={{ opacity: enterAt(frame, fps, 0.15, 0.35) }}
      >
        NEW PRIMITIVES ON SOLANA
      </Interactive.Div>

      <div className="relative h-[420px] w-full">
        {CARDS.map((card) => (
          <div
            key={card.badge}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Interactive.Div
              name={`Card ${card.title}`}
              className="w-[640px]"
              style={cardStyle(frame, card.slot)}
            >
              <Card className="ring-1 ring-foreground/10">
                <CardHeader>
                  <Badge variant="outline" className="font-mono">
                    {card.badge}
                  </Badge>
                  <CardTitle className="mt-4 font-heading text-4xl text-nearwhite">
                    {card.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xl text-text-secondary">
                  {card.body}
                </CardContent>
              </Card>
            </Interactive.Div>
          </div>
        ))}
      </div>
    </Scene>
  );
}
