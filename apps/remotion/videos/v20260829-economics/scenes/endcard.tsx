import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/**
 * Endcard — mark, wordmark, one link, rule. Matches the existing
 * videos' endcard pattern so the family bookends read as one system.
 */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed="econ-endcard" stack className="gap-8">
      <AccordMark size={90} progress={enterAt(frame, fps, 0.05, 0.35)} />
      <Wordmark enter={enterAt(frame, fps, 0.1, 0.4)} settle={24} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 0.35, 0.4)} />
      <p
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.5, 0.4) }}
      >
        useaccord.xyz
      </p>
    </Scene>
  );
}
