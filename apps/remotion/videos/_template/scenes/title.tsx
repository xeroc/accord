import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AmberRule, Wordmark } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";

export function TitleScene({ subtitle }: { subtitle?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed="__SLUG__-title" stack className="gap-8">
      <Wordmark enter={enterAt(frame, fps, 0)} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 0.5)} />
      {subtitle ? (
        <p
          className="font-mono text-2xl text-text-secondary"
          style={{ opacity: enterAt(frame, fps, 0.7) }}
        >
          {subtitle}
        </p>
      ) : null}
    </Scene>
  );
}
