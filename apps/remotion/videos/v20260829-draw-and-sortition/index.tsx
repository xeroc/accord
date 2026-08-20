import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { C1Sortition } from "./scenes/c1-sortition";
import { C2Accumulator } from "./scenes/c2-accumulator";
import { C3Freeze } from "./scenes/c3-freeze";
import { Endcard } from "./scenes/endcard";
import { TitleScene } from "./scenes/title";
import { DURATION_IN_FRAMES, FPS, SCENE_FRAMES } from "./scenes/timeline";

/**
 * draw-and-sortition — Group C: randomness and the draw.
 *
 * Title → C1 stake-weighted sortition (the number line: dart, ruler,
 * draw_attempt re-derivation) → C2 the MST accumulator (45 bytes
 * on-chain, one-path ripple, the struck-out snapshot model) → C3 VRF
 * delivery + root freeze (the sequence diagram: atomic commit-and-
 * freeze, blind window A, inert window B, the crankable escape hatch)
 * → endcard. ~45.5 s, 1920x1080@30.
 */
export const video = defineVideo({
  id: "v20260829-draw-and-sortition",
  component: DrawAndSortition,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: DURATION_IN_FRAMES,
});

function DrawAndSortition() {
  const afterTitle = SCENE_FRAMES.title;
  const afterC1 = afterTitle + SCENE_FRAMES.c1;
  const afterC2 = afterC1 + SCENE_FRAMES.c2;
  return (
    <Stage>
      <Sequence from={0} durationInFrames={SCENE_FRAMES.title} name="Title">
        <TitleScene />
      </Sequence>
      <Sequence from={afterTitle} durationInFrames={SCENE_FRAMES.c1} name="C1 sortition">
        <C1Sortition />
      </Sequence>
      <Sequence from={afterC1} durationInFrames={SCENE_FRAMES.c2} name="C2 accumulator">
        <C2Accumulator />
      </Sequence>
      <Sequence from={afterC2} durationInFrames={SCENE_FRAMES.c3} name="C3 vrf freeze">
        <C3Freeze />
      </Sequence>
      <Sequence
        from={afterC2 + SCENE_FRAMES.c3}
        durationInFrames={SCENE_FRAMES.end}
        name="Endcard"
      >
        <Endcard />
      </Sequence>
    </Stage>
  );
}
