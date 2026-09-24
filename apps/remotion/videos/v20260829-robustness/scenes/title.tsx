import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/**
 * Title — the family identity frame: group kicker, mark draw-on,
 * wordmark, amber rule, and the group-F thesis line.
 */
export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed="robustness-title" stack className="gap-9">
      <div
        className="font-mono text-lg tracking-[0.4em] text-amber"
        style={{ opacity: enterAt(frame, fps, 0.1, 0.4) }}
      >
        GROUP F · ROBUSTNESS &amp; FAILURE MODES
      </div>
      <AccordMark
        size={130}
        progress={enterAt(frame, fps, 0.25, 0.7)}
        className="text-amber"
      />
      <Wordmark enter={enterAt(frame, fps, 0.6, 0.5)} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 1.0, 0.4)} className="w-72" />
      <p
        className="mt-2 font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.3, 0.5) }}
      >
        stalls are bounded · gates are structural · assumptions are stated
      </p>
    </Scene>
  );
}
