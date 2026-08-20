import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { MapScene } from "./scenes/map";
import { SchellingScene } from "./scenes/schelling";
import { SpineScene } from "./scenes/spine";
import { TitleScene } from "./scenes/title";
import { AT, DURATION_IN_FRAMES, FPS, SCENE } from "./scenes/timeline";

/**
 * v20260829-orientation — group A: the mental model. The system map
 * (cast of characters), the Schelling point (honesty as the focal
 * answer), and the Arbitrable spine (two CPI calls, party-blind) —
 * the proposals' loop storyboards played once, linearly.
 *
 *   title     f0–90     family card, group kicker
 *   A1 map    f90–435   boundary → Subaccord hero → peers → 4 flows
 *   A2 shell  f435–810  arcs converge → matrix dominates → whale → restore
 *   A3 spine  f810–1260 payload dissolves at the CPI plane ×4 → u64 home
 *   endcard   f1260–1350 mark · wordmark · useaccord.xyz
 */
export const video = defineVideo({
  id: "v20260829-orientation",
  component: OrientationVideo,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: DURATION_IN_FRAMES,
});

function OrientationVideo() {
  return (
    <Stage>
      <Sequence durationInFrames={SCENE.title}>
        <TitleScene />
      </Sequence>
      <Sequence from={AT.map} durationInFrames={SCENE.map}>
        <MapScene />
      </Sequence>
      <Sequence from={AT.schelling} durationInFrames={SCENE.schelling}>
        <SchellingScene />
      </Sequence>
      <Sequence from={AT.spine} durationInFrames={SCENE.spine}>
        <SpineScene />
      </Sequence>
      <Sequence from={AT.endcard} durationInFrames={SCENE.endcard}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
