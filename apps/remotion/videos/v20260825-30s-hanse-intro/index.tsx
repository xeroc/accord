import { Sequence, staticFile } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { HookScene } from "./scenes/hook";
import { MachineScene } from "./scenes/machine";
import { MachinesScene } from "./scenes/machines";
import { PrereqsScene } from "./scenes/prereqs";
import { RevealScene } from "./scenes/reveal";

const FPS = 30;

/**
 * v20260825-30s-hanse-intro — 30s X/Twitter intro for Hanse.
 * 16:9 1920x1080, muted-first (all copy on-screen), ink + amber,
 * brand motion (EASE_EXPO) throughout. Heritage-led arc (why → what),
 * de-named primitives ("pull payment layer" / "dispute resolution
 * layer"), mutual vocabulary only. Scene map (bar-quantized):
 *   S1 hook    f0–120   a mutual is people sharing a risk and a pool.
 *   S2 machines f120–240 collect · decide · pay — each a protocol problem.
 *   S3 reveal   f240–360 Hanse — the protocol for mutuals.
 *   S4 prereqs  f360–540 pull payment layer LIVE · dispute resolution
 *                        layer LIVE · mutual contract in implementation.
 *   S5 machine  f540–720 propose → challenge → jury → pay (PayoutFlow).
 *   S6 end card f720–900 Hanse · tagline · status · hanse.useaccord.xyz
 */
export const video = defineVideo({
  id: "hanse-intro-30s",
  component: HanseIntro30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
  music: {
    // rendered once by `pnpm --filter @useaccord/remotion score hanse-intro-30s`
    src: staticFile("audio/hanse-intro-30s.wav"),
    volume: 0.25,
  },
});

function HanseIntro30s() {
  return (
    <Stage>
      {/* music is mounted by Root from the `music` field above */}
      <Sequence durationInFrames={120}>
        <HookScene />
      </Sequence>
      <Sequence from={120} durationInFrames={120}>
        <MachinesScene />
      </Sequence>
      <Sequence from={240} durationInFrames={120}>
        <RevealScene />
      </Sequence>
      <Sequence from={360} durationInFrames={180}>
        <PrereqsScene />
      </Sequence>
      <Sequence from={540} durationInFrames={180}>
        <MachineScene />
      </Sequence>
      <Sequence from={720} durationInFrames={180}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
