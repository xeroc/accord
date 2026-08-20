import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AccordMark, AmberRule, Wordmark } from "@useaccord/ui";

/**
 * Title — the family identity: mark draw-on, wordmark, rule, and the
 * group-D kicker. Every concept video in the A–F family opens with
 * this shape (only kicker + subtitle differ).
 */
export function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed="econ-title" stack className="gap-10">
      <p
        className="font-mono text-lg tracking-[0.35em] text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.05, 0.4) }}
      >
        GROUP D · ECONOMICS
      </p>
      <AccordMark size={110} progress={enterAt(frame, fps, 0.15, 0.6)} />
      <Wordmark enter={enterAt(frame, fps, 0.45, 0.5)} className="text-8xl" />
      <AmberRule enter={enterAt(frame, fps, 0.7, 0.4)} className="w-72" />
      <p
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.85, 0.5) }}
      >
        two mints · ledgers · bonds · finality · your capital
      </p>
    </Scene>
  );
}
