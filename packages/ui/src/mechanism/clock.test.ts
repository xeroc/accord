import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNow, useWallClockFrame } from "./clock";

function mockReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Collect rAF callbacks and drive them with timestamps relative to a
 * mount-time performance.now() baseline — like a real browser clock. */
function makeRafDriver() {
  const mount = performance.now();
  let rafCbs: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCbs.push(cb);
    return rafCbs.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  return {
    tickAll(elapsedMs: number) {
      const cbs = rafCbs;
      rafCbs = [];
      act(() => cbs.forEach((cb) => cb(mount + elapsedMs)));
    },
  };
}

describe("useWallClockFrame", () => {
  it("starts at frame 0 and advances with wall time", () => {
    mockReducedMotion(false);
    const raf = makeRafDriver();
    const { result } = renderHook(() => useWallClockFrame({ fps: 30 }));
    expect(result.current).toBe(0);
    // ~1s of wall time at 60Hz rAF
    for (let i = 1; i <= 60; i++) {
      raf.tickAll(i * 16.67);
    }
    expect(result.current).toBeGreaterThanOrEqual(28);
    expect(result.current).toBeLessThanOrEqual(32);
  });

  it("freezes at frame 0 for prefers-reduced-motion users", () => {
    mockReducedMotion(true);
    const raf = makeRafDriver();
    const { result } = renderHook(() => useWallClockFrame({ fps: 30 }));
    raf.tickAll(1000);
    expect(result.current).toBe(0);
  });

  it("loops modulo loopFrames when provided", () => {
    mockReducedMotion(false);
    const raf = makeRafDriver();
    const { result } = renderHook(() =>
      useWallClockFrame({ fps: 30, loopFrames: 300 }),
    );
    // ~13s of wall time → 390 frames → loops to ~90
    for (let i = 1; i <= 780; i++) {
      raf.tickAll(i * 16.67);
    }
    expect(result.current).toBeGreaterThanOrEqual(80);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});

describe("useNow", () => {
  it("returns the current unix second on mount", () => {
    const before = Math.floor(Date.now() / 1000);
    const { result } = renderHook(() => useNow(true));
    expect(result.current).toBeGreaterThanOrEqual(before);
    expect(result.current).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it("ticks every interval while enabled and stops when disabled", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ enabled }) => useNow(enabled), {
        initialProps: { enabled: true },
      });
      const atMount = result.current;
      act(() => vi.advanceTimersByTime(2500));
      expect(result.current).toBeGreaterThanOrEqual(atMount + 2);

      rerender({ enabled: false });
      const frozen = result.current;
      act(() => vi.advanceTimersByTime(5000));
      expect(result.current).toBe(frozen);
    } finally {
      vi.useRealTimers();
    }
  });
});
