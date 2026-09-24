import { Sequence, staticFile } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { AntagonistScene } from "./scenes/antagonist";
import { EndcardScene } from "./scenes/endcard";
import { HookScene } from "./scenes/hook";
import { MechanismScene } from "./scenes/mechanism";
import { PayoffScene } from "./scenes/payoff";
import { QuestionScene } from "./scenes/question";

const FPS = 30;

/**
 * v20260820-30s-canon-intro — 30s Canon flagship.
 * 16:9 1920x1080, muted-first (all copy on-screen), ink + amber,
 * brand motion (EASE_EXPO) throughout. Scene map:
 *   S1 hook       f0–120   a token launches. the fakes arrive in minutes.
 *   S2 question   f120–210 which one is real?
 *   S3 antagonist f210–300 today: somebody's private list.
 *   S4 mechanism  f300–630 submit → challenge → rule
 *   S5 payoff     f630–780 no key. no gate. / the wallet reads the list.
 *   S6 end card   f780–900 the list that defends itself. useaccord.xyz
 */
export const video = defineVideo({
  id: "canon-intro-30s",
  component: CanonIntro30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
  music: {
    // rendered once by `pnpm --filter @useaccord/remotion score canon-intro-30s`
    src: staticFile("audio/canon-intro-30s.wav"),
    volume: 0.25,
  },
});

function CanonIntro30s() {
  return (
    <Stage>
      <Sequence durationInFrames={120}>
        <HookScene />
      </Sequence>
      <Sequence from={120} durationInFrames={90}>
        <QuestionScene />
      </Sequence>
      <Sequence from={210} durationInFrames={90}>
        <AntagonistScene />
      </Sequence>
      <Sequence from={300} durationInFrames={330}>
        <MechanismScene />
      </Sequence>
      <Sequence from={630} durationInFrames={150}>
        <PayoffScene />
      </Sequence>
      <Sequence from={780} durationInFrames={120}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
