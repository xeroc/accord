import { interpolate } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";

/** Brand-eased enter: 0→1 over [delaySec, delaySec+durSec], clamped both ends. */
export function enterAt(
  frame: number,
  fps: number,
  delaySec: number,
  durSec = 0.5,
): number {
  return interpolate(frame, [delaySec * fps, (delaySec + durSec) * fps], [0, 1], {
    easing: EASE_EXPO,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Exit mirror: 1→0 over [startSec, startSec+durSec], clamped both ends. */
export function exitAt(
  frame: number,
  fps: number,
  startSec: number,
  durSec = 0.4,
): number {
  return interpolate(frame, [startSec * fps, (startSec + durSec) * fps], [1, 0], {
    easing: EASE_EXPO,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}
