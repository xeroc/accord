import { MonoChip } from "@useaccord/ui";
import type { ChipTone } from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

const PREREQS: {
  name: string;
  role: string;
  status: string;
  tone: ChipTone;
}[] = [
  {
    name: "pull payment layer",
    role: "recurring contributions, non-custodial",
    status: "LIVE · SOLANA MAINNET",
    tone: "confirm",
  },
  {
    name: "dispute resolution layer",
    role: "contested payouts, a jury per mutual",
    status: "LIVE · DEVNET",
    tone: "confirm",
  },
  {
    name: "mutual contract",
    role: "pooled cover and payouts",
    status: "IN IMPLEMENTATION",
    tone: "amber",
  },
];

/** S4 · PREREQS — built bottom-up, in dependency order. De-named
 * primitives per the stage vocabulary (messaging-guide §7). */
export function PrereqsScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="hanse-prereqs" stack className="gap-10">
      <Interactive.Div
        name="Prereqs kicker"
        className="font-mono text-xl uppercase tracking-widest text-amber"
        style={{ opacity: enterAt(frame, fps, 0.05, 0.4) }}
      >
        built bottom-up, in dependency order
      </Interactive.Div>

      <div className="flex w-[1420px] flex-col gap-4">
        {PREREQS.map((p, i) => {
          const enter = enterAt(frame, fps, 0.4 + i * 0.6, 0.45);
          return (
            <div
              key={p.name}
              className="flex flex-wrap items-center gap-6 rounded-lg border border-border-subtle bg-raised/60 px-8 py-5"
              style={{ opacity: enter, transform: `translateY(${(1 - enter) * 18}px)` }}
            >
              <MonoChip tone="neutral" className="px-5 py-2.5 text-xl">
                {p.name}
              </MonoChip>
              <span className="text-2xl text-text-secondary">{p.role}</span>
              <MonoChip
                tone={p.tone}
                className="ml-auto px-5 py-2.5 text-lg"
                style={{ opacity: enterAt(frame, fps, 0.7 + i * 0.6, 0.4) }}
              >
                {p.status}
              </MonoChip>
            </div>
          );
        })}
      </div>

      <Interactive.Div
        name="Audits next"
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 2.7, 0.5) }}
      >
        audits next — before any mainnet capital sits on them.
      </Interactive.Div>
    </Scene>
  );
}
