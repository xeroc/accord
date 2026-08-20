import { Sequence, staticFile } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { HookScene } from "./scenes/hook";
import { MechanismScene } from "./scenes/mechanism";
import { TakeawayScene } from "./scenes/takeaway";

const FPS = 30;

/**
 * v20260820-30s-canon-challenge — E3 · THE CHALLENGE, 30s X film.
 * 16:9 1920x1080, muted-first (all copy on-screen), ink + amber,
 * brand motion (EASE_EXPO) throughout. Scene map:
 *   S1 hook      f0–105   see a scam? put capital behind it.
 *   S2 mechanism f105–705 01 stake · 02 case · 03 verdict
 *   S3 takeaway  f705–810 a challenge is a case — self-executing.
 *   S4 end card  f810–900 canon. the list that defends itself. useaccord.xyz
 */
export const video = defineVideo({
  id: "canon-challenge-30s",
  component: CanonChallenge30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
  music: {
    // rendered once by `pnpm --filter @useaccord/remotion score canon-challenge-30s`
    src: staticFile("audio/canon-challenge-30s.wav"),
    volume: 0.25,
  },
});

function CanonChallenge30s() {
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
