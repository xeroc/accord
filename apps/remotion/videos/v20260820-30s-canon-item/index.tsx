import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { HookScene } from "./scenes/hook";
import { MechanismScene } from "./scenes/mechanism";
import { TakeawayScene } from "./scenes/takeaway";

const FPS = 30;

/**
 * canon-item-30s — E2 · THE ITEM lifecycle (every entry is on trial).
 * 16:9 1920x1080, muted-first (all copy on-screen), ink + amber,
 * brand motion (EASE_EXPO) throughout. Scene map:
 *   S1 hook      f0–105   listed doesn’t mean safe. it means tested.
 *   S2 mechanism f105–735 submit → pending → listed → exit
 *                          (state rail spine; one item walks all four)
 *   S3 takeaway  f735–825 every state is earned.
 *   S4 end card  f825–900 the list that defends itself. useaccord.xyz
 */
export const video = defineVideo({
  id: "canon-item-30s",
  component: CanonItem30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
});

function CanonItem30s() {
  return (
    <Stage>
      <Sequence durationInFrames={105}>
        <HookScene />
      </Sequence>
      <Sequence from={105} durationInFrames={630}>
        <MechanismScene />
      </Sequence>
      <Sequence from={735} durationInFrames={90}>
        <TakeawayScene />
      </Sequence>
      <Sequence from={825} durationInFrames={75}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
