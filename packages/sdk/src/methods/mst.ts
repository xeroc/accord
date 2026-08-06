/**
 * mst.ts — subtree-sum stake accumulator builder (ADR-0012).
 *
 * Replaces the ADR-0009 cumulative-from-left snapshot MST. The on-chain
 * program maintains only the root (`Subaccord.root_hash` + `total_stake`);
 * the full tree lives off-chain (indexers). This module is the byte-exact
 * reference the chain verifies against:
 *
 *   leaf = H(juror[32] ‖ stake_le[8])
 *   node = H(left_hash[32] ‖ left_sum_le[8] ‖ right_hash[32] ‖ right_sum_le[8])
 *   node.sum = left_sum + right_sum
 *
 * Sums are bound into node hashes, so stake-weighted ranges are
 * cryptographically authenticated (CONCEPT-REVIEW Bad 5, fixed by
 * construction). A one-leaf change touches only that leaf's ancestors →
 * O(log N) updates via {@link proofFor}.
 *
 * Sortition uses the cumulative-from-left prefix (sum of left-sibling subtree
 * sums on right-branch levels), reconstructed from the authenticated path:
 * the selected leaf's range is `[prefix, prefix + stake)`.
 *
 * Sources of truth:
 *   - on-chain helpers: programs/accord/src/lib.rs (mst_leaf_hash, mst_node_hash,
 *     empty_tree_root, verify_and_recompute, verify_membership_and_prefix)
 *   - state: LeafClaim / MSTNode in programs/accord/src/state.rs
 *
 * @see ADR-0012
 */

// ---------------------------------------------------------------------------
// Types (byte-oriented; the generated Address-typed variants are used at the
// instruction boundary in adapter.ts)
// ---------------------------------------------------------------------------

/** A subtree-sum proof element: the sibling subtree's hash + total stake. */
export interface MSTNode {
  siblingHash: Uint8Array; // 32 bytes
  siblingSum: bigint; // u64
}

/** A leaf of the accumulator: `(juror, stake)`. */
export interface LeafClaim {
  juror: Uint8Array; // 32 bytes
  stake: bigint; // u64
}

/**
 * Internal cache of all hash/sum levels. `levels[0]` = leaf hashes,
 * `levels[d]` = root. Stored so `proofFor` is O(log N) instead of O(N).
 */
interface LevelCache {
  hashes: Uint8Array[][];
  sums: bigint[][];
}

/** A built accumulator: leaves + the canonical root. */
export interface MerkleAccumulator {
  /** Fixed tree depth (bounds the pool at 2^depth). */
  depth: number;
  /** Index → leaf. Empty slots hold the all-zero leaf `(default, 0)`. */
  leaves: LeafClaim[];
  rootHash: Uint8Array; // 32 bytes
  rootSum: bigint; // == total stake
  /** Opaque cache — don't inspect; use {@link proofFor}. */
  _levels?: LevelCache;
}

/** Maximum depth the SDK accepts. The on-chain program allows up to 31, but
 * `buildAccumulator` hashes `2^depth` leaves — impractical beyond 20 in a
 * browser. Deeper pools should use a dedicated indexer for proofs. */
export const MAX_SDK_DEPTH = 20;

// ---------------------------------------------------------------------------
// Hashing — must match solana_program::hash::hashv (SHA-256 over concat).
// ---------------------------------------------------------------------------

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  let len = 0;
  for (const p of parts) len += p.length;
  const buf = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buf));
}

function le8(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}

/** Leaf hash `H(juror ‖ stake_le)` (lib.rs mst_leaf_hash). */
export async function leafHash(
  juror: Uint8Array,
  stake: bigint,
): Promise<Uint8Array> {
  if (juror.length !== 32) throw new Error("InvalidJuror: expected 32 bytes");
  return sha256(juror, le8(stake));
}

/** Node hash `H(left_hash ‖ left_sum ‖ right_hash ‖ right_sum)` (lib.rs mst_node_hash). */
async function nodeHash(
  leftHash: Uint8Array,
  leftSum: bigint,
  rightHash: Uint8Array,
  rightSum: bigint,
): Promise<Uint8Array> {
  return sha256(leftHash, le8(leftSum), rightHash, le8(rightSum));
}

/** Root hash of an all-zero tree at `depth` (lib.rs empty_tree_root). */
export async function emptyRoot(depth: number): Promise<Uint8Array> {
  let h = await leafHash(new Uint8Array(32), 0n);
  for (let i = 0; i < depth; i++) {
    h = await nodeHash(h, 0n, h, 0n);
  }
  return h;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a depth-`depth` accumulator from `leaves` (index = position), padding
 * the remaining `2^depth` slots with zero leaves. Returns the canonical root
 * the on-chain program would hold after these stakes (the audit property: an
 * off-chain rebuild from `JurorStake` via `getProgramAccounts` reproduces it).
 *
 * Caches all intermediate hash levels so {@link proofFor} is O(log N).
 */
export async function buildAccumulator(
  leaves: LeafClaim[],
  depth: number,
): Promise<MerkleAccumulator> {
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_SDK_DEPTH) {
    throw new Error(`InvalidDepth: expected 0..${MAX_SDK_DEPTH}, got ${depth}`);
  }
  const size = 2 ** depth;
  if (leaves.length > size) {
    throw new Error(
      `TreeFull: ${leaves.length} leaves exceed 2^depth(${depth})=${size}`,
    );
  }
  const padded: LeafClaim[] = new Array(size);
  for (let i = 0; i < size; i++) {
    padded[i] =
      i < leaves.length ? leaves[i]! : { juror: new Uint8Array(32), stake: 0n };
  }

  const levelHashes: Uint8Array[][] = [];
  const levelSums: bigint[][] = [];

  levelHashes.push(
    await Promise.all(padded.map((l) => leafHash(l.juror, l.stake))),
  );
  levelSums.push(padded.map((l) => l.stake));

  let hashes = levelHashes[0]!;
  let sums = levelSums[0]!;
  for (let level = 0; level < depth; level++) {
    const nextH: Uint8Array[] = [];
    const nextS: bigint[] = [];
    for (let k = 0; k < hashes.length; k += 2) {
      nextH.push(
        await nodeHash(hashes[k]!, sums[k]!, hashes[k + 1]!, sums[k + 1]!),
      );
      nextS.push(sums[k]! + sums[k + 1]!);
    }
    levelHashes.push(nextH);
    levelSums.push(nextS);
    hashes = nextH;
    sums = nextS;
  }

  return {
    depth,
    leaves: padded,
    rootHash: hashes[0]!,
    rootSum: sums[0]!,
    _levels: { hashes: levelHashes, sums: levelSums },
  };
}

// ---------------------------------------------------------------------------
// Proofs + verification
// ---------------------------------------------------------------------------

/**
 * The client-supplied Merkle path for `index` (sibling hash + sum per level,
 * leaf → root). Used by `stake`/`requestWithdraw`/`reconcileStake`
 * (verify-and-recompute) and by `draw_seat` (membership + sortition prefix).
 *
 * O(log N) — reads siblings from the cached levels built by
 * {@link buildAccumulator}. Falls back to O(N) rehash if the cache is absent
 * (e.g. the accumulator was constructed by hand without `_levels`).
 */
export async function proofFor(
  tree: MerkleAccumulator,
  index: number,
): Promise<MSTNode[]> {
  const size = 2 ** tree.depth;
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    throw new Error(`InvalidIndex: expected 0..<${size}, got ${index}`);
  }

  // Fast path: read siblings from cached levels.
  if (tree._levels) {
    const path: MSTNode[] = [];
    let idx = index;
    for (let level = 0; level < tree.depth; level++) {
      const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
      path.push({
        siblingHash: tree._levels.hashes[level]![sib]!,
        siblingSum: tree._levels.sums[level]![sib]!,
      });
      idx = Math.floor(idx / 2);
    }
    return path;
  }

  // Slow fallback: rebuild all levels (for hand-constructed accumulators).
  let hashes = await Promise.all(
    tree.leaves.map((l) => leafHash(l.juror, l.stake)),
  );
  let sums = tree.leaves.map((l) => l.stake);
  const path: MSTNode[] = [];
  let idx = index;
  for (let level = 0; level < tree.depth; level++) {
    const sib = idx % 2 === 0 ? idx + 1 : idx - 1;
    path.push({ siblingHash: hashes[sib]!, siblingSum: sums[sib]! });
    const nextH: Uint8Array[] = [];
    const nextS: bigint[] = [];
    for (let k = 0; k < hashes.length; k += 2) {
      nextH.push(
        await nodeHash(hashes[k]!, sums[k]!, hashes[k + 1]!, sums[k + 1]!),
      );
      nextS.push(sums[k]! + sums[k + 1]!);
    }
    hashes = nextH;
    sums = nextS;
    idx = Math.floor(idx / 2);
  }
  return path;
}

/** Reconstruct the path root from a leaf (for off-chain audit / debugging). */
export async function recomputeRoot(
  leaf: LeafClaim,
  index: number,
  path: MSTNode[],
): Promise<{ hash: Uint8Array; sum: bigint }> {
  let h = await leafHash(leaf.juror, leaf.stake);
  let s = leaf.stake;
  let idx = index;
  for (const node of path) {
    const leafIsLeft = (idx & 1) === 0;
    if (leafIsLeft) {
      h = await nodeHash(h, s, node.siblingHash, node.siblingSum);
    } else {
      h = await nodeHash(node.siblingHash, node.siblingSum, h, s);
    }
    s = s + node.siblingSum;
    idx = Math.floor(idx / 2);
  }
  return { hash: h, sum: s };
}

/**
 * Verify `leaf` at `index` authenticates against `(rootHash, rootSum)` and
 * return the cumulative-from-left prefix (lib.rs verify_membership_and_prefix).
 * The leaf's sortition range is `[prefix, prefix + stake)`.
 */
export async function verifyMembership(
  leaf: LeafClaim,
  index: number,
  path: MSTNode[],
  rootHash: Uint8Array,
  rootSum: bigint,
): Promise<{ ok: boolean; prefix: bigint }> {
  const { hash, sum } = await recomputeRoot(leaf, index, path);
  // prefix = sum of left-sibling subtree sums on levels where the leaf is the
  // right child (bit `level` of `index` is 1).
  let prefix = 0n;
  let idx = index;
  for (const node of path) {
    if ((idx & 1) === 1) prefix += node.siblingSum;
    idx = Math.floor(idx / 2);
  }
  const ok = eq(hash, rootHash) && sum === rootSum;
  return { ok, prefix };
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
