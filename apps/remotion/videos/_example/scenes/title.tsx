import { Badge, Button } from "@useaccord/ui";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AmberRule, Wordmark } from "../../../src/shell/brand";
import { Scene } from "../../../src/shell/scene";

export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badge = enterAt(frame, fps, 0.2);

  return (
    <Scene seed="example-title" stack className="gap-8">
      <div
        style={{
          opacity: badge,
          transform: `translateY(${(1 - badge) * 16}px)`,
        }}
      >
        <Badge variant="secondary">schelling-point arbitration</Badge>
      </div>
      <Wordmark enter={enterAt(frame, fps, 0, 0.6)} className="text-9xl" />
      <AmberRule enter={enterAt(frame, fps, 0.5)} />
      <p
        className="max-w-2xl text-center font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.7) }}
      >
        Stake-weighted jurors. Commit-reveal votes. An on-chain ruling.
      </p>
      <div style={{ opacity: enterAt(frame, fps, 0.9) }}>
        <Button size="lg">File a dispute</Button>
      </div>
    </Scene>
  );
}
