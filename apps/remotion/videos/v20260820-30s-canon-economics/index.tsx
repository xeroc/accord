import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { HookScene } from "./scenes/hook";
import { MechanismScene } from "./scenes/mechanism";
import { TakeawayScene } from "./scenes/takeaway";

const FPS = 30;

/**
 * v20260820-30s-canon-economics — E4 of the Canon series: the economics.
 * 16:9 1920x1080, muted-first (all copy on-screen), ink + amber,
 * brand motion (EASE_EXPO) throughout. Kicker: lying has a price tag.
 * Scene map:
 *   S1 hook      f0–105   attacks make the target stronger. until one doesn't.
 *   S2 mechanism f105–705 deposit → armor → bounty (500 → 750 → 1125)
 *   S3 takeaway  f705–810 failed attacks armor · honest strikes collect
 *   S4 end card  f810–900 canon. the list that defends itself. useaccord.xyz
 */
export const video = defineVideo({
  id: "canon-economics-30s",
  component: CanonEconomics30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
});

function CanonEconomics30s() {
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
