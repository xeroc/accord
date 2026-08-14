/**
 * draw-seat.test.ts — unit tests for resolvePanel (bean accord-e539).
 *
 * resolvePanel wraps the SDK's resolveSeat in a seat loop with growing
 * already-drawn tracking. The test verifies: all seats resolve to distinct
 * jurors, every juror is from the stake pool, and the fromSeat offset works.
 * No chain access — the accumulator is built from synthetic stakes.
 */
import { test, expect } from "bun:test";
import { getAddressDecoder, getAddressEncoder, type Address } from "@solana/kit";
import { buildAccumulator, type LeafClaim } from "@useaccord/sdk";

import { resolvePanel } from "./draw-seat.js";

const DEPTH = 2; // 4-leaf tree
const ROUND_IDX = 0;
const VRF = new Uint8Array(32).fill(42);
const DISPUTE_BYTES = new Uint8Array(32).fill(7);

function addrBytes(n: number): Uint8Array {
  const b = new Uint8Array(32);
  b[31] = n;
  return b;
}
function addr(n: number): Address {
  return getAddressDecoder().decode(addrBytes(n)) as Address;
}

/** Build a tree with `stakes` placed at sequential treeIndex positions. */
async function treeWith(stakes: { juror: number; stake: bigint }[]) {
  const enc = getAddressEncoder();
  const size = 2 ** DEPTH;
  const leaves: LeafClaim[] = new Array(size);
  for (let i = 0; i < size; i++) leaves[i] = { juror: new Uint8Array(32), stake: 0n };
  stakes.forEach((s, i) => {
    leaves[i] = { juror: new Uint8Array(enc.encode(addr(s.juror))), stake: s.stake };
  });
  return buildAccumulator(leaves, DEPTH);
}

test("resolves a full 3-seat panel from a pool with 3 stakers", async () => {
  const tree = await treeWith([
    { juror: 1, stake: 5_000n },
    { juror: 2, stake: 3_000n },
    { juror: 3, stake: 2_000n },
  ]);
  const panel = await resolvePanel({
    committedVrf: VRF,
    disputeBytes: DISPUTE_BYTES,
    roundIdx: ROUND_IDX,
    fromSeat: 0,
    panelSize: 3,
    tree,
    alreadyDrawn: [],
  });

  expect(panel).toHaveLength(3);
  // Every seat is a distinct juror.
  const jurors = new Set(panel.map((s) => hex(s.leaf.juror)));
  expect(jurors.size).toBe(3);
  // Every juror is from the pool.
  const pool = new Set([hex(addrBytes(1)), hex(addrBytes(2)), hex(addrBytes(3))]);
  for (const s of panel) expect(pool.has(hex(s.leaf.juror))).toBe(true);
});

test("fromSeat=1 resolves only the remaining seats (1 already drawn)", async () => {
  const tree = await treeWith([
    { juror: 1, stake: 5_000n },
    { juror: 2, stake: 3_000n },
    { juror: 3, stake: 2_000n },
  ]);

  // Seat 0 already drawn juror 1.
  const result = await resolvePanel({
    committedVrf: VRF,
    disputeBytes: DISPUTE_BYTES,
    roundIdx: ROUND_IDX,
    fromSeat: 1,
    panelSize: 3,
    tree,
    alreadyDrawn: [addrBytes(1)],
  });

  expect(result).toHaveLength(2);
  expect(result[0]!.seat).toBe(1);
  expect(result[1]!.seat).toBe(2);
  // None of the resolved jurors is the already-drawn one.
  for (const s of result) {
    expect(hex(s.leaf.juror)).not.toBe(hex(addrBytes(1)));
  }
});

test("all seats are distinct even with heavy stake imbalance", async () => {
  // Juror 1 has 99% of stake — collision re-roll must still produce distinct seats.
  const tree = await treeWith([
    { juror: 1, stake: 9_900n },
    { juror: 2, stake: 100n },
  ]);
  const panel = await resolvePanel({
    committedVrf: VRF,
    disputeBytes: DISPUTE_BYTES,
    roundIdx: ROUND_IDX,
    fromSeat: 0,
    panelSize: 2,
    tree,
    alreadyDrawn: [],
  });

  expect(panel).toHaveLength(2);
  const jurors = new Set(panel.map((s) => hex(s.leaf.juror)));
  expect(jurors.size).toBe(2);
});

test("fromSeat == panelSize resolves nothing", async () => {
  const tree = await treeWith([{ juror: 1, stake: 1_000n }]);
  const result = await resolvePanel({
    committedVrf: VRF,
    disputeBytes: DISPUTE_BYTES,
    roundIdx: ROUND_IDX,
    fromSeat: 3,
    panelSize: 3,
    tree,
    alreadyDrawn: [],
  });
  expect(result).toHaveLength(0);
});

function hex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
