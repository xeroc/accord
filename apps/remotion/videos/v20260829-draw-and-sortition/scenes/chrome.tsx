import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, enterAt, exitAt } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { StepRail } from "../../../src/shell/rail";

/**
 * BeatCopy — the bottom caption pair, mirroring the `Beat` chrome from
 * src/shell/scene (headline + mono sub, brand-eased settle-rise).
 * `at`/`out` are seconds into the scene; `out` omits for a hold.
 */
export function BeatCopy({
  at,
  out,
  copy,
  sub,
  y = 936,
}: {
  at: number;
  out?: number;
  copy: string;
  sub: string;
  y?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = enterAt(frame, fps, at, 0.4);
  const op = out !== undefined ? enter * exitAt(frame, fps, out, 0.3) : enter;
  return (
    <div
      className="absolute inset-x-0 flex flex-col items-center gap-3"
      style={{ top: y, opacity: op, transform: `translateY(${(1 - enter) * 14}px)` }}
    >
      <h2 className="font-heading text-5xl font-bold text-nearwhite">{copy}</h2>
      <p className="font-mono text-2xl text-text-secondary">{sub}</p>
    </div>
  );
}

const RAIL_LABELS = ["sortition", "accumulator", "vrf freeze"] as const;

/**
 * SceneChrome — the shared concept nav: group kicker + step rail with
 * the active concept filling. Past steps read full amber, future ones
 * muted (zero-frame steps are never active, so the rail never NaNs).
 */
export function SceneChrome({ active, frames }: { active: 0 | 1 | 2; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = RAIL_LABELS.map((label, i) => ({
    label,
    frames: i === active ? frames : 0,
  }));
  return (
    <>
      <div
        className="absolute left-16 top-10 font-mono text-sm tracking-[0.35em] text-muted-foreground"
        style={{ opacity: enterAt(frame, fps, 0, 0.33) }}
      >
        ACCORD · GROUP C · RANDOMNESS AND THE DRAW
      </div>
      <StepRail className="absolute inset-x-0 top-24" steps={steps} />
    </>
  );
}

/** Frame-domain brand-eased 0→1 tween for geometric motion (draws,
 * flights, scales — enter/exit fades go through enterAt/exitAt).
 * Clamped both ends. */
export function expo(frame: number, at: number, dur: number): number {
  return interpolate(frame, [at, at + dur], [0, 1], { easing: EASE_EXPO, ...clamp });
}
