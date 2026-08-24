import { useEffect, useState } from "react";

/**
 * useSlideFrame — the slide-local frame clock. Starts at 0 when the
 * slide mounts (so every kit mechanism replays its choreography each
 * time the slide is entered) and advances at `fps`. Reduced-motion
 * users get a large settled frame instead of frame 0, so every piece
 * renders its end state rather than its pre-animation state.
 */
export function useSlideFrame(fps = 30): number {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setFrame(100_000);
      return;
    }
    let raf = 0;
    const start = performance.now();
    let last = -1;
    const tick = (now: number) => {
      const value = Math.floor(((now - start) / 1000) * fps);
      if (value !== last) {
        last = value;
        setFrame(value);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps]);

  return frame;
}
