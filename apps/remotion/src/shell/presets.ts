import { Easing } from "remotion";

/**
 * Brand motion language for videos — the Remotion twin of the ui kit's
 * EASE_EXPO (DESIGN.md §08 --ease-expo, exponential ease-out). Use these
 * instead of ad-hoc curves so videos move like the apps do.
 */

/** cubic-bezier(0.22, 1, 0.36, 1) — same curve as @useaccord/ui EASE_EXPO. */
export const EASE_EXPO = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * fps-agnostic spring feels — pass fps at the call site:
 *   spring({ frame, fps, config: SPRING.snappy })
 */
export const SPRING = {
  gentle: { stiffness: 80, damping: 18, mass: 0.9 },
  snappy: { stiffness: 140, damping: 20, mass: 0.6 },
} as const;
