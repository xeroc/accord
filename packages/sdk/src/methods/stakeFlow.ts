/**
 * stakeFlow.ts — MST accumulator proof orchestration for stake / unstake.
 *
 * This is the domain logic the `/juror/stake` route executes after fetching
 * a Subaccord + all its JurorStake accounts:
 *
 *   1. Sort JurorStake leaves by `treeIndex` (canonical append-only order).
 *   2. Build `LeafClaim[]` at each juror's canonical position.
 *   3. `buildAccumulator(leafClaims, depth)` — rebuild the canonical tree.
 *   4. Verify `accumulator.rootHash === subaccord.rootHash` — a mismatch
 *      means the local data is stale (race with a concurrent stake/unstake).
 *   5. Determine the juror's leaf index:
 *        - Existing staker → their assigned `treeIndex`.
 *        - New staker → `subaccord.nextIndex` (the next free leaf).
 *   6. `proofFor(accumulator, index)` — the Merkle path passed to `stake` /
 *      `requestWithdraw` / `reconcileStake`.
 *
 * Pure — no chain access. Takes already-fetched typed data so it's testable
 * without a validator.
 *
 * Sources of truth:
 *   - on-chain stake/requestWithdraw: programs/accord/src/lib.rs
 *   - accumulator builder: ./mst.ts (ADR-0012)
 *   - e2e flow reference: tests/src/staking.spec.ts (TreeTracker)
 */

import { getAddressEncoder, type Address } from "@solana/kit";
import {
  buildAccumulator,
  proofFor,
  type LeafClaim,
  type MerkleAccumulator,
  type MSTNode,
} from "./mst.js";

/** The Subaccord fields the proof builder needs. */
export interface SubaccordAccumulatorView {
  /** On-chain accumulator root (state.rs `root_hash`). */
  rootHash: Uint8Array;
  /** Next free leaf index (state.rs `next_index`). */
  nextIndex: number;
  /** Fixed tree depth (state.rs `depth`). */
  depth: number;
}

/** A JurorStake leaf needed for the accumulator. */
export interface JurorStakeLeaf {
  juror: Address;
  /** Canonical collateral (`staked`, not `staked + stakeDelta`). */
  staked: bigint;
  /** Leaf position assigned at first stake (state.rs `tree_index`). */
  treeIndex: number;
}

/** Result of proof computation for stake / unstake. */
export interface StakeProofResult {
  /** The Merkle path to pass to `stake` / `requestWithdraw` / `reconcileStake`. */
  path: MSTNode[];
  /** The leaf index the proof authenticates. */
  index: number;
  /** The root-verified accumulator (for audit / sortition prefix). */
  accumulator: MerkleAccumulator;
  /** `true` if this juror has never staked (proof for `nextIndex`). */
  isNewStaker: boolean;
}

/** Address → 32 raw bytes (the leaf's `juror` field). */
function addrBytes(addr: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(addr));
}

/**
 * Build the MST accumulator proof for a stake or unstake operation.
 *
 * @param subaccord    The on-chain accumulator state (rootHash, nextIndex, depth).
 * @param jurorStakes  All JurorStake accounts for this Subaccord (any order).
 * @param juror        The staking juror's address.
 * @throws if the rebuilt root does not match the on-chain root (stale data).
 */
export async function prepareStakeProof(
  subaccord: SubaccordAccumulatorView,
  jurorStakes: readonly JurorStakeLeaf[],
  juror: Address,
): Promise<StakeProofResult> {
  // 1) Sort by treeIndex (canonical leaf order in the append-only tree).
  const sorted = [...jurorStakes].sort((a, b) => a.treeIndex - b.treeIndex);

  // 2) Place each leaf at its canonical position; fill gaps with zero leaves.
  const size = 2 ** subaccord.depth;
  const leaves: LeafClaim[] = new Array(size);
  for (let i = 0; i < size; i++) {
    leaves[i] = { juror: new Uint8Array(32), stake: 0n };
  }
  for (const js of sorted) {
    if (js.treeIndex < 0 || js.treeIndex >= size) {
      throw new Error(
        `InvalidTreeIndex: ${js.treeIndex} out of range for depth ${subaccord.depth}`,
      );
    }
    leaves[js.treeIndex] = {
      juror: addrBytes(js.juror),
      stake: js.staked,
    };
  }

  // 3) Build the accumulator and verify the root matches on-chain state.
  const accumulator = await buildAccumulator(leaves, subaccord.depth);
  if (!bytesEqual(accumulator.rootHash, subaccord.rootHash)) {
    throw new Error(
      "AccumulatorRootMismatch: local rebuild does not match on-chain root. " +
        "Data may be stale — retry with fresh JurorStake accounts.",
    );
  }

  // 4) Determine the juror's leaf index.
  const existing = sorted.find((js) => js.juror === juror);
  const isNewStaker = !existing;
  const index = isNewStaker ? subaccord.nextIndex : existing.treeIndex;

  if (index < 0 || index >= size) {
    throw new Error(
      `TreeFull: index ${index} out of range for depth ${subaccord.depth} ` +
        `(pool at capacity — all ${size} leaves taken)`,
    );
  }

  // 5) Compute the Merkle proof for that index.
  const path = await proofFor(accumulator, index);

  return { path, index, accumulator, isNewStaker };
}

/** Constant-time byte comparison. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
