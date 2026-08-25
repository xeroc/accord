import { MonoChip } from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

const MACHINES = [
  "collect recurring contributions",
  "decide contested payouts",
  "pay approved payouts from the pool",
];

/** S2 · MACHINES — what a mutual does; why a company shape can't hold it. */
export function MachinesScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="hanse-machines" stack className="gap-12">
      <Interactive.Div
        name="Machines headline"
        className="font-heading text-6xl font-bold tracking-tight text-nearwhite"
        style={{ opacity: enterAt(frame, fps, 0.05, 0.5) }}
      >
        a mutual does three things.
      </Interactive.Div>

      <div className="flex items-center gap-6">
        {MACHINES.map((m, i) => (
          <MonoChip
            key={m}
            tone="neutral"
            className="px-6 py-3.5 text-2xl"
            style={{
              opacity: enterAt(frame, fps, 0.5 + i * 0.2, 0.4),
              transform: `translateY(${(1 - enterAt(frame, fps, 0.5 + i * 0.2, 0.4)) * 14}px)`,
            }}
          >
            {m}
          </MonoChip>
        ))}
      </div>

      <Interactive.Div
        name="Company diagnosis"
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.4, 0.5) }}
      >
        today, a company in the middle does all three — billing, claims, treasury.
      </Interactive.Div>

      <Interactive.Div
        name="Protocol reframe"
        className="font-mono text-3xl text-amber"
        style={{ opacity: enterAt(frame, fps, 2.1, 0.5) }}
      >
        on-chain, each one is a protocol problem.
      </Interactive.Div>
    </Scene>
  );
}
