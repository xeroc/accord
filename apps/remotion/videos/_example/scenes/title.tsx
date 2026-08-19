import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Badge, Button } from "@useaccord/ui";

import { EASE_EXPO } from "../../../src/shell/presets";

export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Staggered enter helper — brand ease, clamped on both ends.
  const enter = (delaySec: number) =>
    interpolate(frame, [delaySec * fps, (delaySec + 0.6) * fps], [0, 1], {
      easing: EASE_EXPO,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const badge = enter(0.2);
  const wordmark = enter(0);
  const rule = enter(0.5);
  const copy = enter(0.7);
  const cta = enter(0.9);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div
        style={{
          opacity: badge,
          transform: `translateY(${(1 - badge) * 16}px)`,
        }}
      >
        <Badge variant="secondary">schelling-point arbitration</Badge>
      </div>
      <h1
        className="font-heading text-9xl font-bold tracking-tight text-nearwhite"
        style={{
          opacity: wordmark,
          transform: `translateY(${(1 - wordmark) * 40}px)`,
        }}
      >
        Accord
      </h1>
      <div
        className="h-1 w-48 origin-center rounded-full bg-amber"
        style={{ transform: `scaleX(${rule})` }}
      />
      <p
        className="max-w-2xl text-center font-mono text-2xl text-text-secondary"
        style={{ opacity: copy }}
      >
        Stake-weighted jurors. Commit-reveal votes. An on-chain ruling.
      </p>
      <div style={{ opacity: cta }}>
        <Button size="lg">File a dispute</Button>
      </div>
    </div>
  );
}
