import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/**
 * Family title card — mono group kicker, mark draw-on, wordmark, rule,
 * then the video title. Same lockup order in every group-A–F video.
 */
export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="orientation-title" stack className="gap-9">
      <p
        className="font-mono text-sm tracking-[0.55em] text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.1, 0.35) }}
      >
        GROUP A · ORIENTATION
      </p>
      <AccordMark size={104} progress={enterAt(frame, fps, 0.25, 0.55)} />
      <Wordmark enter={enterAt(frame, fps, 0.6, 0.45)} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 0.95, 0.4)} className="w-64" />
      <div className="mt-5 flex flex-col items-center gap-3">
        <h1
          className="font-heading text-4xl font-bold text-nearwhite"
          style={{ opacity: enterAt(frame, fps, 1.1, 0.4) }}
        >
          The mental model
        </h1>
        <p
          className="font-mono text-xl text-text-secondary"
          style={{ opacity: enterAt(frame, fps, 1.3, 0.4) }}
        >
          the map · the equilibrium · the spine
        </p>
      </div>
    </Scene>
  );
}
