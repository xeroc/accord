import { describe, expect, it } from "vitest";

import { clamp, enterAt, exitAt, scramble, since } from "./anim";

const FPS = 30;

describe("enterAt", () => {
  it("is 0 at or before the delay and 1 at or after delay+dur", () => {
    expect(enterAt(0, FPS, 1, 0.5)).toBe(0);
    expect(enterAt(FPS, FPS, 1, 0.5)).toBe(0);
    expect(enterAt(1.5 * FPS, FPS, 1, 0.5)).toBe(1);
    expect(enterAt(10 * FPS, FPS, 1, 0.5)).toBe(1);
  });

  it("rises monotonically through the window with the brand ease", () => {
    let prev = 0;
    for (let f = 0; f <= 1.5 * FPS; f++) {
      const v = enterAt(f, FPS, 1, 0.5);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(prev).toBe(1);
  });

  it("defaults durSec to 0.5", () => {
    expect(enterAt(1.4 * FPS, FPS, 1)).toBeLessThan(1);
    expect(enterAt(1.5 * FPS, FPS, 1)).toBe(1);
  });

  it("is fps-agnostic (same seconds → same value)", () => {
    expect(enterAt(45, FPS, 1, 0.5)).toBeCloseTo(enterAt(90, 60, 1, 0.5), 5);
  });
});

describe("exitAt", () => {
  it("is 1 before start and 0 after start+dur", () => {
    expect(exitAt(0, FPS, 2, 0.4)).toBe(1);
    expect(exitAt(2 * FPS, FPS, 2, 0.4)).toBe(1);
    expect(exitAt(2.4 * FPS, FPS, 2, 0.4)).toBe(0);
  });

  it("falls monotonically", () => {
    let prev = 1;
    for (let f = 2 * FPS; f <= 2.4 * FPS; f++) {
      const v = exitAt(f, FPS, 2, 0.4);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      prev = v;
    }
  });

  it("defaults durSec to 0.4", () => {
    expect(exitAt(2.39 * FPS, FPS, 2)).toBeGreaterThan(0);
    expect(exitAt(2.4 * FPS, FPS, 2)).toBe(0);
  });
});

describe("since", () => {
  it("is 0 before `from` and counts elapsed frames after", () => {
    expect(since(10, 40)).toBe(0);
    expect(since(40, 40)).toBe(0);
    expect(since(47, 40)).toBe(7);
  });
});

describe("scramble", () => {
  it("returns the target once locked", () => {
    expect(scramble("s", 100, "6f3a91", true)).toBe("6f3a91");
  });

  it("keeps the target length while unlocked", () => {
    expect(scramble("s", 10, "6f3a91", false)).toHaveLength(6);
  });

  it("is deterministic per (seed, frame-bucket) and drifts across buckets", () => {
    const a = scramble("s", 10, "6f3a91", false);
    const b = scramble("s", 10, "6f3a91", false);
    const c = scramble("s", 12, "6f3a91", false); // bucket = floor(10/2) vs floor(12/2)
    expect(a).toBe(b);
    // A 6-char hex target scrambling with ~55% replacement per bucket:
    // identical adjacent buckets would be (0.45)^6 ≈ 0.8% likely.
    expect(a).not.toBe(c);
  });

  it("varies with the seed", () => {
    expect(scramble("a", 10, "6f3a91", false)).not.toBe(
      scramble("b", 10, "6f3a91", false),
    );
  });
});

describe("clamp", () => {
  it("carries the both-ends clamp for interpolate()", () => {
    expect(clamp).toEqual({
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  });
});
