import { Sequence, staticFile } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { EndcardScene } from "./scenes/endcard";
import { HookScene } from "./scenes/hook";
import { MechanismScene } from "./scenes/mechanism";
import { PayoffScene } from "./scenes/payoff";
import { RevealScene } from "./scenes/reveal";
import { ThesisScene } from "./scenes/thesis";

const FPS = 30;

/**
 * v20260820-30s-accord-intro — 30s X/Twitter intro.
 * 16:9 1920x1080, muted-first (all copy on-screen), ink + amber,
 * brand motion (EASE_EXPO) throughout. Scene map:
 *   S1 hook      f0–120   two sides. one chain. who decides?
 *   S2 thesis    f120–240 smart contracts can't judge.
 *   S3 reveal    f240–360 wordmark + tagline
 *   S4 mechanism f360–690 file → draw → vote → rule
 *   S5 payoff    f690–825 earn / slashed / the schelling point: honesty.
 *   S6 end card  f825–900 mechanize the verdict. useaccord.xyz
 */
export const video = defineVideo({
  id: "accord-intro-30s",
  component: AccordIntro30s,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * FPS,
  music: {
    // rendered once by `pnpm --filter @useaccord/remotion score accord-intro-30s`
    src: staticFile("audio/accord-intro-30s.wav"),
    volume: 0.25,
  },
});

function AccordIntro30s() {
  return (
    <Stage>
      {/* music is mounted by Root from the `music` field above */}
      <Sequence durationInFrames={120}>
        <HookScene />
      </Sequence>
      <Sequence from={120} durationInFrames={120}>
        <ThesisScene />
      </Sequence>
      <Sequence from={240} durationInFrames={120}>
        <RevealScene />
      </Sequence>
      <Sequence from={360} durationInFrames={330}>
        <MechanismScene />
      </Sequence>
      <Sequence from={690} durationInFrames={135}>
        <PayoffScene />
      </Sequence>
      <Sequence from={825} durationInFrames={75}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
