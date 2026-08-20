import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/**
 * Title — family chrome: mark draw-on, wordmark, amber rule, the video
 * title, and the Group E mono kicker.
 */
export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="evidence-title" stack className="gap-7">
      <Interactive.Div
        name="Group kicker"
        className="font-mono text-sm uppercase tracking-[0.4em] text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.1, 0.4) }}
      >
        group e — evidence
      </Interactive.Div>

      <Interactive.Div name="Title mark" style={{ opacity: enterAt(frame, fps, 0.3, 0.5) }}>
        <AccordMark size={84} progress={enterAt(frame, fps, 0.3, 0.6)} className="text-amber" />
      </Interactive.Div>

      <Interactive.Div name="Title wordmark">
        <Wordmark enter={enterAt(frame, fps, 0.5, 0.5)} settle={28} className="text-6xl" />
      </Interactive.Div>

      <AmberRule enter={enterAt(frame, fps, 0.9, 0.5)} />

      <Interactive.Div name="Title heading">
        <h1
          className="font-heading text-4xl font-bold text-nearwhite"
          style={{ opacity: enterAt(frame, fps, 1.05, 0.5) }}
        >
          Evidence, keyed to the drawn
        </h1>
      </Interactive.Div>

      <Interactive.Div
        name="Title sub"
        className="font-mono text-xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.3, 0.5) }}
      >
        hash on-chain · bytes re-encrypted per Round.jurors[]
      </Interactive.Div>

      <Interactive.Div
        name="Title index"
        className="font-mono text-sm text-muted-foreground"
        style={{ opacity: enterAt(frame, fps, 1.6, 0.5) }}
      >
        E1 the pipeline — E2 per-round hashes
      </Interactive.Div>
    </Scene>
  );
}
