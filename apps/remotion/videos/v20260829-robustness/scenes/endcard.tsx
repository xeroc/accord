import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/** Endcard — mark, wordmark, useaccord.xyz, rule. The family close. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed="robustness-endcard" stack className="gap-8">
      <AccordMark
        size={92}
        progress={enterAt(frame, fps, 0.05, 0.4)}
        className="text-amber"
      />
      <Wordmark enter={enterAt(frame, fps, 0.15, 0.4)} settle={24} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 0.45, 0.35)} className="w-64" />
      <div
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.65, 0.4) }}
      >
        useaccord.xyz
      </div>
      <div
        className="font-mono text-sm tracking-[0.3em] text-muted-foreground"
        style={{ opacity: enterAt(frame, fps, 0.9, 0.4) }}
      >
        ROBUSTNESS
      </div>
    </Scene>
  );
}
