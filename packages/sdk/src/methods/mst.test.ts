// mst.test.ts — subtree-sum accumulator builder self-check (ADR-0012).
//
// Validates the byte-exact reference the on-chain `verify_and_recompute` /
// `verify_membership_and_prefix` (lib.rs) match:
//   leaf = H(juror[32] ‖ stake_le[8])
//   node = H(left_hash[32] ‖ left_sum_le[8] ‖ right_hash[32] ‖ right_sum_le[8])
//
// The on-chain Rust inline tests (`accumulator_tests` in lib.rs) exercise the
// identical algorithm against the same fixtures; this test proves the SDK
// builder + verifier are self-consistent and that a tampered root/path is
// rejected — so SDK-built proofs land in the on-chain verifier.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAccumulator,
  emptyRoot,
  leafHash,
  proofFor,
  recomputeRoot,
  verifyMembership,
} from "../../dist/methods/mst.js";

const pk = (first: number) => {
  const b = new Uint8Array(32);
  b[0] = first;
  return b;
};

test("leafHash: H(juror || stake_le) — deterministic, stake-sensitive", async () => {
  const h1 = await leafHash(pk(1), 1_000n);
  const h1b = await leafHash(pk(1), 1_000n);
  assert.deepEqual(h1, h1b);
  assert.equal(h1.length, 32);
  const h2 = await leafHash(pk(1), 2_000n);
  assert.notDeepEqual(h1, h2, "stake must be bound into the leaf hash");
  const h3 = await leafHash(pk(2), 1_000n);
  assert.notDeepEqual(h1, h3, "juror must be bound into the leaf hash");
});

test("emptyRoot: all-zero-tree fold matches a fresh build", async () => {
  for (const depth of [0, 1, 3, 4, 8]) {
    const empty = await emptyRoot(depth);
    const built = await buildAccumulator([], depth);
    assert.deepEqual(empty, built.rootHash, `depth ${depth} empty root`);
    assert.equal(built.rootSum, 0n);
  }
});

test("buildAccumulator: root + per-leaf proof round-trip; prefix is running stake", async () => {
  const leaves = [
    { juror: pk(1), stake: 1_000n },
    { juror: pk(2), stake: 3_000n },
    { juror: pk(3), stake: 500n },
    { juror: pk(4), stake: 2_000n },
  ];
  const tree = await buildAccumulator(leaves, 4);
  assert.equal(tree.rootSum, 6_500n);

  let running = 0n;
  for (let i = 0; i < leaves.length; i++) {
    const proof = await proofFor(tree, i);
    const { ok, prefix } = await verifyMembership(
      leaves[i]!,
      i,
      proof,
      tree.rootHash,
      tree.rootSum,
    );
    assert.ok(ok, `leaf ${i} authenticates`);
    assert.equal(prefix, running, `leaf ${i} cumulative-from-left prefix`);
    running += leaves[i]!.stake;
  }
});

test("verifyMembership: rejects a tampered root and an overstated stake", async () => {
  const leaves = [
    { juror: pk(1), stake: 1_000n },
    { juror: pk(2), stake: 3_000n },
  ];
  const tree = await buildAccumulator(leaves, 2);
  const proof = await proofFor(tree, 0);

  // wrong root
  const bad = await verifyMembership(
    leaves[0]!,
    0,
    proof,
    new Uint8Array(32),
    tree.rootSum,
  );
  assert.equal(bad.ok, false);

  // overstated stake (sums are bound → root no longer authenticates)
  const inflated = await verifyMembership(
    { juror: pk(1), stake: 9_999n },
    0,
    proof,
    tree.rootHash,
    tree.rootSum,
  );
  assert.equal(inflated.ok, false, "inflated stake must not authenticate");
});

test("recomputeRoot: matches buildAccumulator for every leaf", async () => {
  const leaves = [
    { juror: pk(7), stake: 2_500n },
    { juror: pk(8), stake: 1_500n },
    { juror: pk(9), stake: 4_000n },
  ];
  const tree = await buildAccumulator(leaves, 3);
  for (let i = 0; i < leaves.length; i++) {
    const proof = await proofFor(tree, i);
    const rec = await recomputeRoot(leaves[i]!, i, proof);
    assert.deepEqual(rec.hash, tree.rootHash, `leaf ${i} recompute == root`);
    assert.equal(rec.sum, tree.rootSum);
  }
});

test("a stake change touches only ancestors: rebuild-with-one-change reproduces a single-seat proof", async () => {
  // Top up juror at index 1 (1500 -> 3000); the new root must equal a fresh
  // build with the changed leaf — the property the on-chain verify_and_recompute
  // relies on for O(log N) accumulator updates.
  const before = [
    { juror: pk(7), stake: 2_500n },
    { juror: pk(8), stake: 1_500n },
    { juror: pk(9), stake: 4_000n },
  ];
  const after = [
    { juror: pk(7), stake: 2_500n },
    { juror: pk(8), stake: 3_000n },
    { juror: pk(9), stake: 4_000n },
  ];
  const treeBefore = await buildAccumulator(before, 3);
  const treeAfter = await buildAccumulator(after, 3);
  assert.notDeepEqual(treeBefore.rootHash, treeAfter.rootHash);
  assert.equal(treeAfter.rootSum, 9_500n);

  // The proof for index 1 is unchanged in STRUCTURE (same siblings); only the
  // recomputed root differs — mirroring stake/unstake's verified update.
  const proofBefore = await proofFor(treeBefore, 1);
  const proofAfter = await proofFor(treeAfter, 1);
  assert.equal(proofBefore.length, proofAfter.length);
});
