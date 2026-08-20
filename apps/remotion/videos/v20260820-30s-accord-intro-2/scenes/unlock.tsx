import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { MonoChip } from "../../../src/pieces/chips";

/**
 * Scene 3 — the unlock (12s-16s).
 * A real-world dispute goes in, an on-chain ruling comes out, and any
 * program can read it. Amber pulses travel the wires while the fan-out
 * chips (the consumers) light up.
 */
export function UnlockScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Wire pulse position — loops every 45 frames, offset per wire.
  const pulseA = ((frame % 45) / 45) * 200;
  const pulseB = (((frame + 22) % 45) / 45) * 200;

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

      <div className="flex items-center">
        <Interactive.Div
          name="Dispute block"
          className="rounded-lg border border-border-subtle bg-raised px-8 py-6 text-center font-mono"
          style={{ opacity: enterAt(frame, fps, 0.5, 0.4) }}
        >
          <div className="text-sm tracking-widest text-text-secondary">
            DISPUTE
          </div>
          <div className="mt-2 text-xl text-nearwhite">real-world event</div>
        </Interactive.Div>

        <div className="relative h-px w-[200px] bg-border-subtle">
          <div
            className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber"
            style={{ left: pulseA }}
          />
        </div>

        <Interactive.Div
          name="Accord block"
          className="rounded-lg border-2 border-amber px-10 py-8 text-center"
          style={{
            opacity: enterAt(frame, fps, 0.7, 0.4),
            scale: interpolate(frame, [0.7 * fps, 1.1 * fps], [0.9, 1], {
              easing: EASE_EXPO,
              output: "perceptual-scale",
              ...clamp,
            }),
          }}
        >
          <div className="font-heading text-3xl font-bold text-amber">ACCORD</div>
          <div className="mt-2 font-mono text-sm text-text-secondary">
            schelling-point court
          </div>
        </Interactive.Div>

        <div className="relative h-px w-[200px] bg-border-subtle">
          <div
            className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber"
            style={{ left: pulseB }}
          />
        </div>

        <Interactive.Div
          name="Ruling block"
          className="rounded-lg border border-border-subtle bg-raised px-8 py-6 text-center font-mono"
          style={{ opacity: enterAt(frame, fps, 0.9, 0.4) }}
        >
          <div className="text-sm tracking-widest text-text-secondary">
            RULING
          </div>
          <div className="mt-2 text-xl text-nearwhite">final_ruling</div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Unlock subheadline"
        className="font-heading text-4xl font-medium text-body"
        style={{ opacity: enterAt(frame, fps, 1.5, 0.4) }}
      >
        Any program can read it.
      </Interactive.Div>

      <div className="flex gap-5 font-mono text-lg">
        {["escrow", "registry", "mutual", "+ your program"].map((chip, i) => (
          <Interactive.Div
            key={chip}
            name={`Consumer chip ${chip}`}
            style={{ opacity: enterAt(frame, fps, 1.9 + i * 0.18, 0.35) }}
          >
            <MonoChip tone="neutral" className="px-5 py-2 text-lg">
              {chip}
            </MonoChip>
          </Interactive.Div>
        ))}
      </div>
    </Scene>
  );
}
