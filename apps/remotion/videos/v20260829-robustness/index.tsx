import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { F1GridScene } from "./scenes/f1-grid";
import { F2EscapeScene } from "./scenes/f2-escape";
import { F3PauseScene } from "./scenes/f3-pause";
import { F4AttestScene } from "./scenes/f4-attest";
import { F5MedianScene } from "./scenes/f5-median";
import { F6FreezeScene } from "./scenes/f6-freeze";
import { F7TrustScene } from "./scenes/f7-trust";
import { TitleScene } from "./scenes/title";

const FPS = 30;

/** Scene lengths (frames @30) — the sequence map sums to DURATION. */
const SCENES = [
  { id: "title", scene: <TitleScene />, frames: 135 }, //  4.5s  family identity
  { id: "f1", scene: <F1GridScene />, frames: 300 }, // 10.0s  round_idx × draw_attempt
  { id: "f2", scene: <F2EscapeScene />, frames: 390 }, // 13.0s  liveness escape hatch
  { id: "f3", scene: <F3PauseScene />, frames: 300 }, // 10.0s  pause scope split
  { id: "f4", scene: <F4AttestScene />, frames: 360 }, // 12.0s  attestation gate + prune
  { id: "f5", scene: <F5MedianScene />, frames: 270 }, //  9.0s  median + coherence band
  { id: "f6", scene: <F6FreezeScene />, frames: 330 }, // 11.0s  CaseTerms freeze
  { id: "f7", scene: <F7TrustScene />, frames: 360 }, // 12.0s  trust profile map
  { id: "end", scene: <EndcardScene />, frames: 120 }, //  4.0s  the close
] as const;

const STARTS = SCENES.reduce<number[]>(
  (acc, _s, i) => [...acc, i === 0 ? 0 : (acc[i - 1] ?? 0) + (SCENES[i - 1]?.frames ?? 0)],
  [],
);

const DURATION_IN_FRAMES = SCENES.reduce((sum, s) => sum + s.frames, 0);

/**
 * v20260829-robustness — group F: robustness & failure modes.
 *
 * Seven concepts, one register: reassurance-through-rigor. Every
 * stall is bounded by a clock, every gate is structural, every
 * assumption is stated and priced — the motion itself argues the
 * system degrades to refunds, never to capture. ~85.5s, 1920x1080@30.
 */
export const video = defineVideo({
  id: "v20260829-robustness",
  component: RobustnessVideo,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: DURATION_IN_FRAMES,
});

function RobustnessVideo() {
  return (
    <Stage>
      {SCENES.map(({ id, scene, frames }, i) => (
        <Sequence key={id} from={STARTS[i] ?? 0} durationInFrames={frames}>
          {scene}
        </Sequence>
      ))}
    </Stage>
  );
}
