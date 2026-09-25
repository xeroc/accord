import { Sequence, staticFile } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { HookScene } from "./scenes/hook";
import { MechanismScene } from "./scenes/mechanism";
import { TakeawayScene } from "./scenes/takeaway";

const FPS = 30;

/**
 * v20260820-30s-canon-list — E1 · THE LIST. 30s, 16:9 1920x1080,
 * muted-first (all copy on-screen), ink + amber, brand motion
 * (EASE_EXPO) throughout. Kicker: nobody approves a list. Scene map:
 *   S1 hook      f0–105    anyone can forge a canon. that's the point.
 *   S2 mechanism f105–705  create → court → locked (StepRail, 3 beats)
 *   S3 takeaway  f705–810  a constitution and a court, owned by no one.
 *   S4 end card  f810–900  canon · the list that defends itself.
 */
export const video = defineVideo({
  id: "canon-list-30s",
  component: CanonList30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
  music: {
    // rendered once by `pnpm --filter @useaccord/remotion score canon-list-30s`
    src: staticFile("audio/canon-list-30s.wav"),
    volume: 0.25,
  },
});

function CanonList30s() {
  return (
    <Stage>
      <Sequence durationInFrames={105}>
        <HookScene />
      </Sequence>
      <Sequence from={105} durationInFrames={600}>
        <MechanismScene />
      </Sequence>
      <Sequence from={705} durationInFrames={105}>
        <TakeawayScene />
      </Sequence>
      <Sequence from={810} durationInFrames={90}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
