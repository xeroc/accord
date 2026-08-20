import { cubicBezier } from "motion";

/**
 * Deterministic tween math for frame-driven display components
 * (Backdrop, mechanism pieces). Pure functions of a frame counter —
 * no wall clock, no hooks — so Remotion and the browser share them.
 */

/** cubic-bezier(0.22, 1, 0.36, 1) — the brand EASE_EXPO curve (DESIGN.md §08). */
export const easeExpo = cubicBezier(0.22, 1, 0.36, 1);

/** Identity ease — for ranges the design animates linearly. */
export const linear = (t: number): number => t;


/**
 * Interpolate one number across [in0, in1] → [out0, out1], clamped at
 * both ends. Two-point ranges only — richer choreography stays in the
 * caller (Remotion's interpolate) by design.
 */
export function tween(
  input: number,
  inRange: readonly [number, number],
  outRange: readonly [number, number],
  ease: (t: number) => number = easeExpo,
): number {
  const [a, b] = inRange;
  const [c, d] = outRange;
  const t = a === b ? 1 : (input - a) / (b - a);
  const clamped = Math.min(1, Math.max(0, t));
  return c + (d - c) * ease(clamped);
}

/** Brand-eased enter: 0→1 over [delay, delay+dur], clamped both ends. */
export function enterAt(frame: number, delay: number, dur = 15): number {
  return tween(frame, [delay, delay + dur], [0, 1]);
}
