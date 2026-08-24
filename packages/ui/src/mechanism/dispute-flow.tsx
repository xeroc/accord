import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, tween } from "../internal/motion-math";
import { MonoChip } from "./chips";

/**
 * DisputeFlow — "a ruling about the real world, settled on-chain":
 * the dispute block, a wire with a traveling amber pulse, the court
 * block scaling in, a second pulsed wire, the ruling block — then the
 * consumer chips fan out underneath ("any program can read it").
 * Extracted from the accord-30s intro unlock scene. Pulses loop on the
 * frame counter, so browser walls clock it via useWallClockFrame.
 * Pure function of `frame`.
 */

export const DEFAULT_CONSUMERS: readonly string[] = [
  "escrow",
  "registry",
  "mutual",
  "+ your program",
];

export const DisputeFlow: FC<{
  frame: number;
  /** frame the source block enters (default 0) */
  at?: number;
  sourceLabel?: string;
  sourceValue?: string;
  courtLabel?: string;
  courtSub?: string;
  rulingLabel?: string;
  rulingValue?: string;
  /** fan-out chips under the flow (default the intro four) */
  consumers?: readonly string[];
  /** frame the first consumer chip enters (default at + 57) */
  consumersAt?: number;
  /** frames between consumer chips (default 5) */
  consumersStagger?: number;
  /** wire pulse loop length in frames (default 45) */
  wireFrames?: number;
  /** second wire's phase offset in frames (default 22) */
  wireOffset?: number;
  wireWidth?: number;
  className?: string;
}> = ({
  frame,
  at = 0,
  sourceLabel = "DISPUTE",
  sourceValue = "real-world event",
  courtLabel = "ACCORD",
  courtSub = "schelling-point court",
  rulingLabel = "RULING",
  rulingValue = "final_ruling",
  consumers = DEFAULT_CONSUMERS,
  consumersAt,
  consumersStagger = 5,
  wireFrames = 45,
  wireOffset = 22,
  wireWidth = 200,
  className,
}) => {
  // the pulse travels the full wire; its last 8 px slide UNDER the
  // next block (opaque, painted after the wire) and vanish behind it
  const pulseA = ((frame % wireFrames) / wireFrames) * wireWidth;
  const pulseB = (((frame + wireOffset) % wireFrames) / wireFrames) * wireWidth;
  const chipAt = consumersAt ?? at + 57;

  const wire = (pulse: number) => (
    <div data-wire className="relative h-px bg-border-subtle" style={{ width: wireWidth }}>
      <div
        data-pulse
        className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber"
        style={{ left: pulse }}
      />
    </div>
  );

  const block = (
    label: string,
    value: string,
    enter: number,
    dataNode: string,
  ) => (
    <div
      data-node={dataNode}
      className="rounded-lg border border-border-subtle bg-raised px-8 py-6 text-center font-mono"
      style={{ opacity: tween(frame, [enter, enter + 12], [0, 1], easeExpo) }}
    >
      <div className="text-sm tracking-widest text-text-secondary">{label}</div>
      <div className="mt-2 text-xl text-nearwhite">{value}</div>
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-14", className)}>
      <div className="flex items-center">
        {block(sourceLabel, sourceValue, at, "source")}
        {wire(pulseA)}
        <div
          data-node="court"
          className="rounded-lg border-2 border-amber bg-raised px-10 py-8 text-center"
          style={{
            opacity: tween(frame, [at + 6, at + 18], [0, 1], easeExpo),
            scale: String(tween(frame, [at + 6, at + 18], [0.9, 1], easeExpo)),
          }}
        >
          <div className="font-heading text-3xl font-bold text-amber">{courtLabel}</div>
          <div className="mt-2 font-mono text-sm text-text-secondary">{courtSub}</div>
        </div>
        {wire(pulseB)}
        {block(rulingLabel, rulingValue, at + 12, "ruling")}
      </div>

      <div data-consumers className="flex justify-center gap-5 font-mono text-lg">
        {consumers.map((chip, i) => (
          <div
            key={chip}
            data-consumer={i}
            style={{ opacity: tween(frame, [chipAt + i * consumersStagger, chipAt + i * consumersStagger + 10], [0, 1], easeExpo) }}
          >
            <MonoChip tone="neutral" className="px-5 py-2 text-lg">
              {chip}
            </MonoChip>
          </div>
        ))}
      </div>
    </div>
  );
};
