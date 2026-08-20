import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";

/** Family title card — group kicker, mark draw-on, wordmark, rule, subtitle. */
export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="lifecycle-title" stack className="gap-9">
      <Interactive.Div
        name="Group kicker"
        className="font-mono text-xl tracking-[0.35em] text-amber"
        style={{ opacity: enterAt(frame, fps, 0.15, 0.4) }}
      >
        GROUP B · LIFECYCLE
      </Interactive.Div>
      <Interactive.Div name="Title mark" style={{ opacity: enterAt(frame, fps, 0.35, 0.5) }}>
        <AccordMark size={104} progress={enterAt(frame, fps, 0.35, 0.6)} />
      </Interactive.Div>
      <Wordmark enter={enterAt(frame, fps, 0.75, 0.5)} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 1.15, 0.4)} className="w-72" />
      <Interactive.Div
        name="Title subtitle"
        className="font-mono text-3xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.35, 0.5) }}
      >
        the dispute lifecycle
      </Interactive.Div>
    </Scene>
  );
}
