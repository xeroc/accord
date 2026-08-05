// vrf.test.ts — runnable self-check for the VRF sortition slot derivation and
// the collision-retry panel resolver (ADR-0009 §2). Excluded from the build.
//
// vrf.ts imports snapshot.ts at runtime (`./snapshot.js`), which Node's direct
// type-stripper cannot resolve to `.ts` — so this test imports the COMPILED
// dist output (built first by the `test` script). The other method tests are
// self-contained and import source directly.
//   pnpm --filter @accord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMst } from "../../dist/methods/snapshot.js";
import {
  drawSlots,
  isDistinctPanel,
  resolvePanel,
  vrfSeed,
} from "../../dist/methods/vrf.js";

const VRF = new Uint8Array(32).fill(0xa5);
const DISPUTE = new Uint8Array(32).fill(0x3c);
const pk = (first: number) => {
  const b = new Uint8Array(32);
  b[0] = first;
  return b;
};

test("vrfSeed: deterministic + attempt-sensitive", async () => {
  const s0a = await vrfSeed(VRF, DISPUTE, 0, 0);
  const s0b = await vrfSeed(VRF, DISPUTE, 0, 0);
  assert.deepEqual(
    Array.from(s0a),
    Array.from(s0b),
    "same inputs => same seed",
  );
  assert.equal(s0a.length, 32);
  const s1 = await vrfSeed(VRF, DISPUTE, 0, 1);
  assert.notDeepEqual(
    Array.from(s0a),
    Array.from(s1),
    "different attempt => different seed",
  );
  // round + dispute also bind the seed
  const sR = await vrfSeed(VRF, DISPUTE, 1, 0);
  assert.notDeepEqual(Array.from(s0a), Array.from(sR));
  await assert.rejects(
    () => vrfSeed(new Uint8Array(31), DISPUTE, 0, 0),
    /InvalidVrf/,
  );
});

test("drawSlots: deterministic, in [0, total_stake), changes with attempt", async () => {
  const total = 1_000_000n;
  const slots0 = await drawSlots(VRF, DISPUTE, 0, 0, 3, total);
  assert.equal(slots0.length, 3);
  for (const r of slots0) {
    assert.ok(r >= 0n && r < total, `slot ${r} in range`);
  }
  // determinism
  const slots0b = await drawSlots(VRF, DISPUTE, 0, 0, 3, total);
  assert.deepEqual(slots0, slots0b);
  // different attempt => (very likely) different slots
  const slots1 = await drawSlots(VRF, DISPUTE, 0, 1, 3, total);
  assert.notDeepEqual(slots0, slots1);
  await assert.rejects(
    () => drawSlots(VRF, DISPUTE, 0, 0, 3, 0n),
    /InvalidTotalStake/,
  );
});

test("isDistinctPanel: detects duplicate jurors", () => {
  const m = (first: number) => ({
    leaf: { juror: pk(first), stake: 1n, cumAfter: 1n },
    proof: [],
    index: 0,
  });
  assert.equal(isDistinctPanel([m(1), m(2), m(3)]), true);
  assert.equal(isDistinctPanel([m(1), m(2), m(1)]), false);
});

test("resolvePanel: returns a distinct panel, retrying on collision with the same VRF", async () => {
  // 10-juror pool, panel 3: a distinct panel is found quickly.
  const tree = await buildMst(
    Array.from({ length: 10 }, (_, i) => ({
      juror: pk(i + 1),
      stake: BigInt((i + 1) * 100),
    })),
  );
  const { drawAttempt, memberships } = await resolvePanel(
    VRF,
    DISPUTE,
    0,
    3,
    tree,
  );
  assert.ok(drawAttempt >= 0);
  assert.equal(memberships.length, 3);
  assert.ok(isDistinctPanel(memberships), "resolved panel must be distinct");
  // the committed VRF is the SAME across retries (caller never re-requests).
  // Re-resolving is reproducible:
  const again = await resolvePanel(VRF, DISPUTE, 0, 3, tree);
  assert.equal(again.drawAttempt, drawAttempt);
  assert.deepEqual(again.memberships, memberships);
});

test("resolvePanel: throws when a distinct panel is impossible", async () => {
  // 3 real jurors but panel 5: pigeonhole guarantees a collision every attempt.
  const tree = await buildMst([
    { juror: pk(1), stake: 100n },
    { juror: pk(2), stake: 100n },
    { juror: pk(3), stake: 100n },
  ]);
  await assert.rejects(
    () => resolvePanel(VRF, DISPUTE, 0, 5, tree, 8),
    /DrawCollision/,
  );
});
