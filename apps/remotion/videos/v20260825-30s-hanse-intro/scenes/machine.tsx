import { PayoutFlow } from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S5 · MACHINE — the optimistic payout path: propose, challenge,
 * jury, pay (kit PayoutFlow, lifted from the demo-day deck). */
export function MachineScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="hanse-machine" stack className="gap-12">
      <div className="flex min-h-0 items-center justify-center">
        <PayoutFlow frame={frame} at={12} className="scale-[1.35]" />
      </div>

      <div className="flex flex-col items-center gap-5">
        <Interactive.Div
          name="Machine headline"
          className="font-heading text-5xl font-bold tracking-tight text-nearwhite"
          style={{ opacity: enterAt(frame, fps, 0.05, 0.4) }}
        >
          unchallenged, the pool pays.
        </Interactive.Div>
        <Interactive.Div
          name="Machine subline"
          className="font-mono text-2xl text-text-secondary"
          style={{ opacity: enterAt(frame, fps, 2.8, 0.5) }}
        >
          challenged, the mutual&rsquo;s own jury decides — books close once per period, surplus
          flows back.
        </Interactive.Div>
      </div>
    </Scene>
  );
}
