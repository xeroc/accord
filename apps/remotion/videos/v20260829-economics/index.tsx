import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { D1VaultsScene } from "./scenes/d1-vaults";
import { D2SettlementScene } from "./scenes/d2-settlement";
import { D3LadderScene } from "./scenes/d3-ladder";
import { D4RetroBeamScene } from "./scenes/d4-retrobeam";
import { D5JourneyScene } from "./scenes/d5-journey";
import { EndcardScene } from "./scenes/endcard";
import { TitleScene } from "./scenes/title";
import { DURATION_IN_FRAMES, FPS, SCENE_FRAMES, SCENE_START } from "./scenes/timeline";

/**
 * v20260829-economics — group D: the economics of the court.
 * 16:9 1920x1080, 63 s, ink + amber, brand motion (EASE_EXPO
 * settle entrances, zero overshoot) throughout. Scene map:
 *   title  f0    – 105    mark · wordmark · GROUP D kicker
 *   D1     f105  – 435    two mints, two vaults + boxed invariants
 *   D2     f435  – 780    coherence settlement — slash is ledger-only
 *   D3     f780  – 1080   appeal ladder + exponential cost curve
 *   D4     f1080 – 1410   final-ruling retroactive beam
 *   D5     f1410 – 1785   the juror's capital journey (airlock strip)
 *   end    f1785 – 1890   mark · wordmark · useaccord.xyz
 */
export const video = defineVideo({
  id: "v20260829-economics",
  component: EconomicsVideo,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: DURATION_IN_FRAMES,
});

function EconomicsVideo() {
  return (
    <Stage>
      <Sequence from={SCENE_START.title} durationInFrames={SCENE_FRAMES.title}>
        <TitleScene />
      </Sequence>
      <Sequence from={SCENE_START.d1} durationInFrames={SCENE_FRAMES.d1}>
        <D1VaultsScene />
      </Sequence>
      <Sequence from={SCENE_START.d2} durationInFrames={SCENE_FRAMES.d2}>
        <D2SettlementScene />
      </Sequence>
      <Sequence from={SCENE_START.d3} durationInFrames={SCENE_FRAMES.d3}>
        <D3LadderScene />
      </Sequence>
      <Sequence from={SCENE_START.d4} durationInFrames={SCENE_FRAMES.d4}>
        <D4RetroBeamScene />
      </Sequence>
      <Sequence from={SCENE_START.d5} durationInFrames={SCENE_FRAMES.d5}>
        <D5JourneyScene />
      </Sequence>
      <Sequence from={SCENE_START.endcard} durationInFrames={SCENE_FRAMES.endcard}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
