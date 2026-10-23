/**
 * Seal-on-read + unseal flush self-check (bean accord-0yxb, ADR-0037).
 *
 * Sealed verdict frames (`unsealAt = round.revealEnd`) must be withheld on
 * EVERY read path while `now < unsealAt`; when the deadline elapses the
 * scheduler re-fans the frame out to live subscribers. All timing under fake
 * timers per the milestone test matrix.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import { type Sealable, UnsealScheduler, filterVisible, sealVisible } from "./seal.js";

const T0 = 1_700_000_000_000;

/** Minimal sealed-frame shape (verdict envelope carries more fields). */
interface Frame extends Sealable {
  readonly id: string;
  readonly unsealAt?: number;
}

describe("sealVisible", () => {
  it("frames without unsealAt are always visible", () => {
    const ev: Frame = { id: "step-1" };
    expect(sealVisible(ev, T0)).toBe(true);
    expect(sealVisible(ev, 0)).toBe(true);
  });

  it("sealed frame is withheld while now < unsealAt", () => {
    const ev: Frame = { id: "verdict", unsealAt: T0 + 5_000 };
    expect(sealVisible(ev, T0)).toBe(false);
    expect(sealVisible(ev, T0 + 4_999)).toBe(false);
  });

  it("sealed frame is visible from unsealAt exactly (inclusive)", () => {
    const ev: Frame = { id: "verdict", unsealAt: T0 + 5_000 };
    expect(sealVisible(ev, T0 + 5_000)).toBe(true);
    expect(sealVisible(ev, T0 + 60_000)).toBe(true);
  });

  it("filterVisible keeps order and drops only sealed frames", () => {
    const frames: Frame[] = [
      { id: "a" },
      { id: "b", unsealAt: T0 + 1_000 },
      { id: "c" },
      { id: "d", unsealAt: T0 + 999_999 },
    ];
    expect(filterVisible(frames, T0).map((f) => f.id)).toEqual(["a", "c"]);
    expect(filterVisible(frames, T0 + 999_999).map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("UnsealScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("withholds until unsealAt, then re-fans out exactly once", () => {
    const fanned: Array<[string, Frame]> = [];
    const scheduler = new UnsealScheduler<Frame>((dispute, frame) => {
      fanned.push([dispute, frame]);
    });
    const verdict: Frame = { id: "v1", unsealAt: T0 + 5_000 };

    scheduler.track("disputeA", verdict);
    expect(scheduler.pending()).toBe(1);

    jest.advanceTimersByTime(4_999);
    expect(fanned).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(fanned).toEqual([["disputeA", verdict]]);
    expect(scheduler.pending()).toBe(0);

    jest.advanceTimersByTime(60_000);
    expect(fanned).toHaveLength(1);
  });

  it("already-visible frames are not scheduled (read paths deliver them now)", () => {
    const fanned: Array<[string, Frame]> = [];
    const scheduler = new UnsealScheduler<Frame>((dispute, frame) => {
      fanned.push([dispute, frame]);
    });

    scheduler.track("disputeA", { id: "step" });
    scheduler.track("disputeA", { id: "late-verdict", unsealAt: T0 });
    expect(scheduler.pending()).toBe(0);

    jest.advanceTimersByTime(120_000);
    expect(fanned).toHaveLength(0);
  });

  it("fans out each sealed frame to its own dispute", () => {
    const fanned: Array<[string, Frame]> = [];
    const scheduler = new UnsealScheduler<Frame>((dispute, frame) => {
      fanned.push([dispute, frame]);
    });

    scheduler.track("disputeA", { id: "v-a", unsealAt: T0 + 1_000 });
    scheduler.track("disputeB", { id: "v-b", unsealAt: T0 + 2_000 });

    jest.advanceTimersByTime(1_000);
    expect(fanned.map(([d, f]) => `${d}:${f.id}`)).toEqual(["disputeA:v-a"]);
    jest.advanceTimersByTime(1_000);
    expect(fanned.map(([d, f]) => `${d}:${f.id}`)).toEqual(["disputeA:v-a", "disputeB:v-b"]);
  });

  it("dispose cancels pending timers", () => {
    const fanned: Array<[string, Frame]> = [];
    const scheduler = new UnsealScheduler<Frame>((dispute, frame) => {
      fanned.push([dispute, frame]);
    });

    scheduler.track("disputeA", { id: "v1", unsealAt: T0 + 5_000 });
    scheduler.dispose();
    expect(scheduler.pending()).toBe(0);

    jest.advanceTimersByTime(120_000);
    expect(fanned).toHaveLength(0);
  });
});
