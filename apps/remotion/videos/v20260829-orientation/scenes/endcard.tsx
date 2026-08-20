import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/** Family end card — mark, wordmark, rule, one link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="orientation-endcard" stack className="gap-8">
      <AccordMark size={90} progress={enterAt(frame, fps, 0.05, 0.35)} />
      <Wordmark enter={enterAt(frame, fps, 0.15, 0.4)} settle={24} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 0.45, 0.4)} className="w-64" />
      <p
        className="mt-4 font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.65, 0.4) }}
      >
        useaccord.xyz
      </p>
    </Scene>
  );
}
