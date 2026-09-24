import { interpolate, random } from "remotion";

import { EASE_EXPO } from "./presets";

/**
 * Shared animation math for video scenes — the sanctioned way to write
 * frame-driven motion (README §Shared vocabulary). Everything here is a
 * pure function of `frame`/`fps`: deterministic, render-safe, no hooks.
 */

/** Both-ends clamp for interpolate() — spread into the options object. */
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** Brand-eased enter: 0→1 over [delaySec, delaySec+durSec], clamped both ends. */
export function enterAt(
  frame: number,
  fps: number,
  delaySec: number,
  durSec = 0.5,
): number {
  return interpolate(frame, [delaySec * fps, (delaySec + durSec) * fps], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
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
    ...clamp,
  });
}

/** Spring input: 0 before `from`, then frames elapsed since. */
export function since(frame: number, from: number): number {
  return Math.max(0, frame - from);
}

/**
 * Deterministic text scramble — resolves to `target` once locked.
 * Same (seed, 2-frame bucket) → same string; drifts across buckets.
 */
export function scramble(
  seed: string,
  frame: number,
  target: string,
  locked: boolean,
): string {
  if (locked) {
    return target;
  }
  const bucket = Math.floor(frame / 2);
  const HEX = "0123456789abcdef";
  return target
    .split("")
    .map((c, i) =>
      random(`${seed}:${i}:${bucket}`) > 0.45
        ? c
        : HEX[Math.floor(random(`${seed}:${i}:${bucket}:x`) * 16)],
    )
    .join("");
}
