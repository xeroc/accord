import { LedgerCounter } from "@useaccord/ui";
import { Interactive, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S1 · HOOK — the oldest form of pooled protection, still huge. */
export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="hanse-hook" stack className="gap-14">
      <Interactive.Div
        name="mtnDAO badge"
        className="absolute right-16 top-16"
        style={{ opacity: enterAt(frame, fps, 0.3, 0.5) }}
      >
        <img src={staticFile("mtndao.svg")} alt="mtnDAO" className="h-12 opacity-90" />
      </Interactive.Div>

      <div className="text-center font-heading text-7xl font-bold leading-tight tracking-tight text-nearwhite">
        <span
          className="block"
          style={{ opacity: enterAt(frame, fps, 0.1, 0.5) }}
        >
          a mutual is people
        </span>
        <span
          className="block"
          style={{ opacity: enterAt(frame, fps, 0.45, 0.5) }}
        >
          sharing a risk and a pool.
        </span>
      </div>

      <Interactive.Div
        name="Hook subline"
        className="font-mono text-2xl text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.0, 0.5) }}
      >
        the oldest form of pooled protection — and still a quarter of the world&rsquo;s cover.
      </Interactive.Div>

      <Interactive.Div
        name="Worldwide cover counter"
        className="w-[1100px]"
        style={{ opacity: enterAt(frame, fps, 1.4, 0.4) }}
      >
        <LedgerCounter
          frame={frame}
          label="mutual cover worldwide · ICMIF 2024"
          from={0}
          to={1_606_000_000_000}
          at={55}
          dur={40}
          tone="confirm"
          className="text-3xl"
        />
      </Interactive.Div>
    </Scene>
  );
}
