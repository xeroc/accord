import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { DisputeFlow } from "@useaccord/ui";

/**
 * Scene 3 — the unlock (12s-16s).
 * A real-world dispute goes in, an on-chain ruling comes out, and any
 * program can read it — the kit DisputeFlow (blocks, pulsing wires,
 * consumer fan-out) carries the whole diagram.
 */
export function UnlockScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="unlock" stack className="gap-14 px-24">
      <Interactive.Div
        name="Unlock headline"
        className="text-center font-heading text-6xl font-bold tracking-tight text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 0.15, 0.45),
          translate: `0px ${(1 - enterAt(frame, fps, 0.15, 0.45)) * 20}px`,
        }}
      >
        A ruling about the real world, settled on-chain.
      </Interactive.Div>

      <Interactive.Div name="Dispute flow">
        <DisputeFlow frame={frame} at={0.5 * fps} />
      </Interactive.Div>

      <Interactive.Div
        name="Unlock subheadline"
        className="font-heading text-4xl font-medium text-body"
        style={{ opacity: enterAt(frame, fps, 1.5, 0.4) }}
      >
        Any program can read it.
      </Interactive.Div>
    </Scene>
  );
}
