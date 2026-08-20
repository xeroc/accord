import { useEffect, useState } from "react";

/**
 * useWallClockFrame — the browser-side twin of Remotion's
 * useCurrentFrame(): a monotonically advancing frame counter driven by
 * requestAnimationFrame at the given fps. Feeds the frame-driven
 * display components (Backdrop, mechanism pieces) on the web.
 *
 * Freezes at frame 0 for prefers-reduced-motion users. `loopFrames`
 * wraps the counter modulo a loop length (choreographed strips).
 */
export function useWallClockFrame({
  fps = 30,
  loopFrames,
}: {
  fps?: number;
  loopFrames?: number;
} = {}): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let raf = 0;
    const start = performance.now();
    let last = -1;
    const tick = (now: number) => {
      const elapsed = Math.floor(((now - start) / 1000) * fps);
      const value = loopFrames
        ? elapsed % loopFrames
        : Math.min(elapsed, 1_000_000);
      if (value !== last) {
        last = value;
        setFrame(value);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, loopFrames]);

  return frame;
}
