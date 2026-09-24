import { useCurrentFrame, useVideoConfig } from "remotion";

import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";
import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** Endcard — the family sign-off: mark, wordmark, useaccord.xyz, rule. */
export function Endcard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed="draw-sortition-end" stack className="gap-7">
      <AccordMark size={104} progress={enterAt(frame, fps, 0.15, 0.9)} />
      <Wordmark enter={enterAt(frame, fps, 0.55, 0.5)} className="text-7xl" />
      <AmberRule enter={enterAt(frame, fps, 1.0, 0.4)} />
      <span
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.2, 0.4) }}
      >
        useaccord.xyz
      </span>
    </Scene>
  );
}
