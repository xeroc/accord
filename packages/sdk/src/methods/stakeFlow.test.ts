// stakeFlow.test.ts — unit tests for the MST accumulator proof orchestration.
// Run via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareStakeProof,
  type JurorStakeLeaf,
  type SubaccordAccumulatorView,
} from "../../dist/methods/stakeFlow.js";
import {
  buildAccumulator,
  proofFor,
  emptyRoot,
  type LeafClaim,
} from "../../dist/methods/mst.js";
import {
  getAddressDecoder,
  getAddressEncoder,
  type Address,
} from "@solana/kit";

const DEPTH = 4;

/** Make a deterministic 32-byte pubkey from a small int (for test addresses). */
function addrBytes(n: number): Uint8Array {
  const b = new Uint8Array(32);
  b[31] = n;
  return b;
}

function addr(n: number): Address {
  return getAddressDecoder().decode(addrBytes(n)) as Address;
}

/** Build a SubaccordAccumulatorView from canonical leaf claims. */
async function subaccordView(
  claims: LeafClaim[],
  nextIndex: number,
  depth: number,
): Promise<SubaccordAccumulatorView> {
  const acc = await buildAccumulator(claims, depth);
  return { rootHash: acc.rootHash, nextIndex, depth };
}

// --- happy paths ---

test("new staker gets nextIndex (first staker on an empty tree)", async () => {
  const sub = await subaccordView([], 0, DEPTH);
  const result = await prepareStakeProof(sub, [], addr(99));
  assert.equal(result.isNewStaker, true);
  assert.equal(result.index, 0);
});

test("new staker gets nextIndex (third staker after two existing)", async () => {
  const claims: LeafClaim[] = [
    { juror: addrBytes(1), stake: 5_000n },
    { juror: addrBytes(2), stake: 3_000n },
  ];
  const sub = await subaccordView(claims, 2, DEPTH);
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(1), staked: 5_000n, treeIndex: 0 },
    { juror: addr(2), staked: 3_000n, treeIndex: 1 },
  ];
  const result = await prepareStakeProof(sub, stakes, addr(99));
  assert.equal(result.isNewStaker, true);
  assert.equal(result.index, 2);

  // Proof must match a direct proofFor on the canonical tree at index 2.
  const acc = await buildAccumulator(claims, DEPTH);
  const expected = await proofFor(acc, 2);
  assert.deepEqual(result.path, expected);
});

test("existing staker gets their treeIndex", async () => {
  const claims: LeafClaim[] = [
    { juror: addrBytes(1), stake: 5_000n },
    { juror: addrBytes(2), stake: 3_000n },
  ];
  const sub = await subaccordView(claims, 2, DEPTH);
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(1), staked: 5_000n, treeIndex: 0 },
    { juror: addr(2), staked: 3_000n, treeIndex: 1 },
  ];
  const result = await prepareStakeProof(sub, stakes, addr(2));
  assert.equal(result.isNewStaker, false);
  assert.equal(result.index, 1);

  const acc = await buildAccumulator(claims, DEPTH);
  const expected = await proofFor(acc, 1);
  assert.deepEqual(result.path, expected);
});

// --- sorting ---

test("sorts unsorted JurorStakes by treeIndex before building", async () => {
  const claims: LeafClaim[] = [
    { juror: addrBytes(1), stake: 5_000n },
    { juror: addrBytes(2), stake: 3_000n },
    { juror: addrBytes(3), stake: 2_000n },
  ];
  const sub = await subaccordView(claims, 3, DEPTH);
  // Deliberately unsorted.
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(3), staked: 2_000n, treeIndex: 2 },
    { juror: addr(1), staked: 5_000n, treeIndex: 0 },
    { juror: addr(2), staked: 3_000n, treeIndex: 1 },
  ];
  const result = await prepareStakeProof(sub, stakes, addr(2));
  assert.equal(result.index, 1);
});

// --- root verification ---

test("throws AccumulatorRootMismatch when local data is stale", async () => {
  const sub: SubaccordAccumulatorView = {
    rootHash: new Uint8Array(32).fill(0xff),
    nextIndex: 1,
    depth: DEPTH,
  };
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(1), staked: 5_000n, treeIndex: 0 },
  ];
  await assert.rejects(
    prepareStakeProof(sub, stakes, addr(1)),
    /AccumulatorRootMismatch/,
  );
});

test("root mismatch triggers when a stake amount is wrong", async () => {
  const claims: LeafClaim[] = [{ juror: addrBytes(1), stake: 5_000n }];
  const sub = await subaccordView(claims, 1, DEPTH);
  // Wrong amount — rebuild will not match root.
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(1), staked: 9_999n, treeIndex: 0 },
  ];
  await assert.rejects(
    prepareStakeProof(sub, stakes, addr(1)),
    /AccumulatorRootMismatch/,
  );
});

// --- depth-0 (REVIEW #13) ---

test("depth-0 subaccord: empty tree → empty path for first staker", async () => {
  const root = await emptyRoot(0);
  const sub: SubaccordAccumulatorView = {
    rootHash: root,
    nextIndex: 0,
    depth: 0,
  };
  const result = await prepareStakeProof(sub, [], addr(99));
  assert.equal(result.isNewStaker, true);
  assert.equal(result.index, 0);
  assert.deepEqual(result.path, []);
});

test("depth-0 subaccord: existing staker → empty path", async () => {
  const claims: LeafClaim[] = [{ juror: addrBytes(1), stake: 1_000n }];
  const sub = await subaccordView(claims, 1, 0);
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(1), staked: 1_000n, treeIndex: 0 },
  ];
  const result = await prepareStakeProof(sub, stakes, addr(1));
  assert.equal(result.isNewStaker, false);
  assert.equal(result.index, 0);
  assert.deepEqual(result.path, []);
});

// --- validation ---

test("throws InvalidTreeIndex when treeIndex exceeds pool size", async () => {
  const sub = await subaccordView([], 0, 2);
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(1), staked: 1_000n, treeIndex: 99 },
  ];
  await assert.rejects(
    prepareStakeProof(sub, stakes, addr(1)),
    /InvalidTreeIndex/,
  );
});

test("throws TreeFull when nextIndex exceeds pool capacity", async () => {
  // Depth 0 → 1 slot. Tree is full after 1 staker.
  const claims: LeafClaim[] = [{ juror: addrBytes(1), stake: 1_000n }];
  const sub = await subaccordView(claims, 1, 0);
  const stakes: JurorStakeLeaf[] = [
    { juror: addr(1), staked: 1_000n, treeIndex: 0 },
  ];
  // addr(2) is new → nextIndex=1, but size=1 → out of range.
  await assert.rejects(prepareStakeProof(sub, stakes, addr(2)), /TreeFull/);
});
