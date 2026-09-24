import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { DisputesScene } from "./scenes/disputes";
import { StatusScene } from "./scenes/status";
import { TitleScene } from "./scenes/title";

const FPS = 30;

/**
 * _example — the tracked reference video. Demonstrates every framework
 * capability: Stage + brand presets, ui-kit components, and the AppStage
 * harness mounting a real apps/app view (DisputeList) over seeded data.
 */
export const video = defineVideo({
  id: "example",
  component: ExampleVideo,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 15 * FPS,
});

function ExampleVideo() {
  return (
    <Stage>
      <Sequence durationInFrames={4 * FPS}>
        <TitleScene />
      </Sequence>
      <Sequence from={4 * FPS} durationInFrames={7 * FPS}>
        <DisputesScene />
      </Sequence>
      <Sequence from={11 * FPS} durationInFrames={4 * FPS}>
        <StatusScene />
      </Sequence>
    </Stage>
  );
}
