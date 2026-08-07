// vrf.test.ts — runnable self-check for the per-seat VRF sortition derivation
// (ADR-0009 §2 + ADR-0012). Excluded from the build.
//
// vrf.ts imports mst.ts at runtime (`./mst.js`), which Node's direct
// type-stripper cannot resolve to `.ts` — so this test imports the COMPILED
// dist output (built first by the `test` script).
//   pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccumulator, proofFor } from "../../dist/methods/mst.js";
import {
  findLeafForSlot,
  resolveSeat,
  seatSlot,
  vrfSeed,
  verifySeat,
} from "../../dist/methods/vrf.js";

const VRF = new Uint8Array(32).fill(0xa5);
const DISPUTE = new Uint8Array(32).fill(0x3c);
const pk = (first: number) => {
  const b = new Uint8Array(32);
  b[0] = first;
  return b;
};

test("vrfSeed: deterministic + round/dispute-bound (no draw_attempt)", async () => {
  const s0a = await vrfSeed(VRF, DISPUTE, 0);
  const s0b = await vrfSeed(VRF, DISPUTE, 0);
  assert.deepEqual(
    Array.from(s0a),
    Array.from(s0b),
    "same inputs => same seed",
  );
  assert.equal(s0a.length, 32);
  const sR = await vrfSeed(VRF, DISPUTE, 1);
  assert.notDeepEqual(Array.from(s0a), Array.from(sR), "round binds the seed");
  await assert.rejects(
    () => vrfSeed(new Uint8Array(31), DISPUTE, 0),
    /InvalidVrf/,
  );
});

test("seatSlot: deterministic, in [0, frozen_total_stake), per-seat + per-retry", async () => {
  const total = 1_000_000n;
  const r0 = await seatSlot(VRF, DISPUTE, 0, 0, total);
  const r1 = await seatSlot(VRF, DISPUTE, 0, 1, total);
  assert.ok(r0 >= 0n && r0 < total, `seat 0 slot in range: ${r0}`);
  assert.ok(r1 >= 0n && r1 < total, `seat 1 slot in range: ${r1}`);
  assert.notDeepEqual([r0], [r1], "different seats => different slots");
  // determinism
  assert.deepEqual(r0, await seatSlot(VRF, DISPUTE, 0, 0, total));
  // retry changes the slot
  const r0r1 = await seatSlot(VRF, DISPUTE, 0, 0, total, 1);
  assert.notDeepEqual([r0], [r0r1], "different retries => different slots");
  await assert.rejects(
    () => seatSlot(VRF, DISPUTE, 0, 0, 0n),
    /InvalidTotalStake/,
  );
});

test("findLeafForSlot + verifySeat: membership round-trips the frozen root", async () => {
  const leaves = Array.from({ length: 10 }, (_, i) => ({
    juror: pk(i + 1),
    stake: BigInt((i + 1) * 100),
  }));
  const tree = await buildAccumulator(leaves, 4);
  assert.equal(tree.rootSum, 5_500n); // 100·(1+2+..+10) = 5500

  // For each seat, the slot selects exactly one leaf; the proof authenticates.
  for (let seat = 0; seat < 5; seat++) {
    const slot = await seatSlot(VRF, DISPUTE, 0, seat, tree.rootSum);
    const found = await findLeafForSlot(tree, slot);
    assert.ok(found, `seat ${seat}: slot ${slot} must hit a leaf`);
    const ok = await verifySeat(
      found!.leaf,
      found!.index,
      found!.proof,
      tree.rootHash,
      tree.rootSum,
    );
    assert.ok(ok, `seat ${seat}: proof authenticates against frozen root`);
    // prefix is consistent with the leaf's running position
    const expectedPrefix = leaves
      .slice(0, found!.index)
      .reduce((a, l) => a + l.stake, 0n);
    assert.ok(
      slot >= expectedPrefix && slot - expectedPrefix < found!.leaf.stake,
      `seat ${seat}: slot in [prefix, prefix+stake)`,
    );
  }
});

test("findLeafForSlot: a wrong root is rejected", async () => {
  const tree = await buildAccumulator(
    [
      { juror: pk(1), stake: 1_000n },
      { juror: pk(2), stake: 3_000n },
    ],
    2,
  );
  const slot = await seatSlot(VRF, DISPUTE, 0, 0, tree.rootSum);
  const found = await findLeafForSlot(tree, slot)!;
  const ok = await verifySeat(
    found!.leaf,
    found!.index,
    found!.proof,
    new Uint8Array(32), // wrong root
    tree.rootSum,
  );
  assert.equal(ok, false, "a fabricated root must not authenticate");
});

test("proofFor matches findLeafForSlot's proof (builder consistency)", async () => {
  const tree = await buildAccumulator(
    [
      { juror: pk(1), stake: 1_000n },
      { juror: pk(2), stake: 3_000n },
      { juror: pk(3), stake: 500n },
    ],
    2,
  );
  const found = await findLeafForSlot(
    tree,
    await seatSlot(VRF, DISPUTE, 0, 0, tree.rootSum),
  )!;
  const direct = await proofFor(tree, found!.index);
  assert.equal(direct.length, found!.proof.length);
  assert.deepEqual(direct, found!.proof);
});
