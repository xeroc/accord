import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";

/** Endcard (rev 3) — the domain sign-off: mark, wordmark, rule, link. */
export function EndcardScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="schelling-endcard" stack className="gap-8">
      <Interactive.Div name="Endcard mark" style={{ opacity: enterAt(frame, fps, 0.05, 0.35) }}>
        <AccordMark size={90} progress={enterAt(frame, fps, 0.05, 0.35)} className="text-amber" />
      </Interactive.Div>
      <Wordmark enter={enterAt(frame, fps, 0.15, 0.4)} settle={24} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 0.5, 0.4)} className="w-56" />
      <Interactive.Div
        name="Endcard link"
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 0.7, 0.4) }}
      >
        useaccord.xyz
      </Interactive.Div>
    </Scene>
  );
}
