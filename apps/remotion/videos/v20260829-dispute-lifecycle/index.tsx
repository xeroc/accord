import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { CommitRevealScene } from "./scenes/commit-reveal";
import { EndcardScene } from "./scenes/endcard";
import { LifecycleScene } from "./scenes/lifecycle";
import { TitleScene } from "./scenes/title";
import {
  COMMIT_REVEAL_FRAMES,
  DURATION_IN_FRAMES,
  ENDCARD_FRAMES,
  FPS,
  LIFECYCLE_FRAMES,
  TITLE_FRAMES,
} from "./scenes/timeline";

/**
 * v20260829-dispute-lifecycle — Group B, both concepts, one family cut:
 * the title card, B1 (one case walking the DisputeState machine —
 * windows, cranks, the appeal ghost), B2 (commit-reveal: sealed votes,
 * the copycat's empty set, verified openings), and the end card.
 * 900 frames = 30s, 1920x1080@30.
 */
export const video = defineVideo({
  id: "v20260829-dispute-lifecycle",
  component: DisputeLifecycle,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: DURATION_IN_FRAMES,
});

function DisputeLifecycle() {
  return (
    <Stage>
      <Sequence durationInFrames={TITLE_FRAMES}>
        <TitleScene />
      </Sequence>
      <Sequence from={TITLE_FRAMES} durationInFrames={LIFECYCLE_FRAMES}>
        <LifecycleScene />
      </Sequence>
      <Sequence
        from={TITLE_FRAMES + LIFECYCLE_FRAMES}
        durationInFrames={COMMIT_REVEAL_FRAMES}
      >
        <CommitRevealScene />
      </Sequence>
      <Sequence
        from={TITLE_FRAMES + LIFECYCLE_FRAMES + COMMIT_REVEAL_FRAMES}
        durationInFrames={ENDCARD_FRAMES}
      >
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
