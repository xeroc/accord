import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { BamsScene } from "./scenes/bams";
import { CloseScene } from "./scenes/close";
import { GapScene } from "./scenes/gap";
import { MechanismScene } from "./scenes/mechanism";
import { UnlockScene } from "./scenes/unlock";

const FPS = 30;

/**
 * accord-30s — the 30-second "what Accord enables and why" video.
 * Five hard-cut scenes over the shared Backdrop: the gap, the mechanism,
 * the unlock, the new primitives, the close.
 */
export const video = defineVideo({
  id: "accord-30s",
  component: Accord30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
});

function Accord30s() {
  return (
    <Stage>
      <Sequence durationInFrames={5 * FPS}>
        <GapScene />
      </Sequence>
      <Sequence from={5 * FPS} durationInFrames={7 * FPS}>
        <MechanismScene />
      </Sequence>
      <Sequence from={12 * FPS} durationInFrames={4 * FPS}>
        <UnlockScene />
      </Sequence>
      <Sequence from={16 * FPS} durationInFrames={11 * FPS}>
        <BamsScene />
      </Sequence>
      <Sequence from={27 * FPS} durationInFrames={3 * FPS}>
        <CloseScene />
      </Sequence>
    </Stage>
  );
}
