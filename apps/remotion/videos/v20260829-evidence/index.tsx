import { Sequence } from "remotion";

import { defineVideo } from "../../src/framework/video";
import { Stage } from "../../src/shell/stage";
import { E1PipelineScene } from "./scenes/e1-pipeline";
import { E2FilmstripScene } from "./scenes/e2-filmstrip";
import { EndcardScene } from "./scenes/endcard";
import { TitleScene } from "./scenes/title";

const FPS = 30;
const TITLE = 150;
const E1 = 360;
const E2 = 270;
const END = 120;

/**
 * v20260829-evidence — Group E: how Accord carries evidence.
 *
 * 16:9 1920x1080@30, ink + amber, brand motion (EASE_EXPO) throughout.
 * Scene map:
 *   S1 title  f0    – 150  family chrome + the E-group kicker
 *   S2 E1     f150  – 510  the pipeline: manifest → sha256 root → seal →
 *                        relay via the operator (amber trust tag) →
 *                        re-key to Round.jurors[] → fan-out → verify
 *                        against the 32 on-chain bytes
 *   S3 E2     f510  – 780  the per-round film strip: filing writes
 *                        frame 0, appeals write 1 and 3, round 2 leaves
 *                        the zero-sentinel; dossiers stack along the
 *                        appeal ladder — every panel sees all non-zero
 *                        frames filed so far
 *   S4 end    f780  – 900  mark + wordmark + useaccord.xyz
 */
export const video = defineVideo({
  id: "v20260829-evidence",
  component: EvidenceVideo,
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: TITLE + E1 + E2 + END,
});

function EvidenceVideo() {
  return (
    <Stage>
      <Sequence durationInFrames={TITLE}>
        <TitleScene />
      </Sequence>
      <Sequence from={TITLE} durationInFrames={E1}>
        <E1PipelineScene />
      </Sequence>
      <Sequence from={TITLE + E1} durationInFrames={E2}>
        <E2FilmstripScene />
      </Sequence>
      <Sequence from={TITLE + E1 + E2} durationInFrames={END}>
        <EndcardScene />
      </Sequence>
    </Stage>
  );
}
