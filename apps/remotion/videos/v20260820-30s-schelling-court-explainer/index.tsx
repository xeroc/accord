import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { CourtScene } from "./scenes/court";
import { DURATION_IN_FRAMES, FPS } from "./scenes/timeline";

/**
 * schelling-court — how Accord converges on a coherent Ruling.
 *
 * Seven moves in one continuous take: draw (VRF from the staked pool),
 * commit (hash(vote, salt)), reveal, participation fee, slash the
 * incoherent vote, redistribute to the coherent majority, and the
 * Ruling stamp. ~28.5s, 1920x1080@30.
 */
export const video = defineVideo({
  id: "schelling-court",
  component: SchellingCourt,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: DURATION_IN_FRAMES,
});

function SchellingCourt() {
  return (
    <Stage>
      <CourtScene />
    </Stage>
  );
}
