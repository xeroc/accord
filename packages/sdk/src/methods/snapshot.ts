/**
 * snapshot.ts — snapshot trust (post/challenge/finalize) + the Merkle-Sum Tree
 * helpers that back the VRF draw (ADR-0008 anchor-slot, ADR-0009 MST sortition).
 *
 * The load-bearing client-side logic is the MST builder: an off-chain indexer
 * reconstructs the tree over the Subaccord's juror set, commits only the
 * `{root_hash, total_stake}` on-chain via `post_snapshot`, and the SDK later
 * assembles `JurorMembership` inclusion proofs for each VRF-selected slot so
 * `draw` can enforce sortition (ADR-0009 §2).
 *
 * Tree shape (canonical, must match every consumer — poster, draw caller,
 * challenger):
 *   - Leaves sorted by juror pubkey ascending (required for the omission + the
 *     NotSorted fraud predicates, ADR-0009 §3).
 *   - `cum_after = stake_0 + … + stake_i` (running sum).
 *   - Leaf hash  = `sha256(juror ‖ stake_le ‖ cum_after_le)` (48-byte preimage).
 *   - Internal    = `{ hash: sha256(left.hash ‖ right.hash), sum: left.sum + right.sum }`.
 *   - Padded to a perfect binary tree (next power of two) with zero-stake
 *     sentinel leaves whose pubkeys sort strictly after every real juror, so
 *     real leaves stay contiguous and sorted. Sentinel ranges are empty
 *     (`cum_before == cum_after`), so they are never selected and do not affect
 *     the root sum.
 *
 * Bit-for-bit compatible with the on-chain `verify_mst_inclusion`
 * (lib.rs:1594-1634); {@link verifyMstInclusion} is a direct TS port used by the
 * unit tests to prove the builder + prover round-trip.
 *
 * Sources of truth:
 *   - post/challenge/finalize_snapshot: programs/accord/src/lib.rs (485-792)
 *   - LeafClaim / MSTNode / JurorMembership / FraudProof: state.rs (274-367)
 *   - MST verify + sortition: ADR-0009
 */
import type { Address, Instruction } from "@solana/kit";

/** Snapshot PDA seed prefix, `b"snapshot"` (state.rs: SEED_SNAPSHOT). */
const SEED_SNAPSHOT = new Uint8Array([115, 110, 97, 112, 115, 104, 111, 116]); // "snapshot"

// ---------------------------------------------------------------------------
// MST domain types (mirror programs/accord/src/state.rs:274-305)
// ---------------------------------------------------------------------------

/** A real or sentinel leaf: `{ juror[32], stake, cum_after }` (state.rs:301). */
export interface LeafClaim {
  juror: Uint8Array; // 32 bytes
  stake: bigint;
  cumAfter: bigint; // running sum up to and including this leaf
}

/** One level of an MST inclusion proof (state.rs:275). */
export interface MSTNode {
  siblingHash: Uint8Array; // 32 bytes
  siblingSum: bigint;
}

/** A drawn juror's MST inclusion proof (state.rs:287), consumed by `draw`. */
export interface JurorMembership {
  leaf: LeafClaim;
  proof: MSTNode[];
  index: number; // u32 position in the padded, sorted leaf array
}

/** A built MST: the on-chain commitments plus the in-memory levels. */
export interface MerkleSumTree {
  /** Padded + sorted leaves (sentinels last). */
  leaves: LeafClaim[];
  /** `nodes[0]` = leaf level, `nodes[d]` = level d; root = nodes[top][0]. */
  nodes: { hash: Uint8Array; sum: bigint }[][];
  rootHash: Uint8Array;
  rootSum: bigint; // == total_stake
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** sha256 over a concatenated preimage (async, Web Crypto). */
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

/** u64 → 8-byte little-endian. */
function le8(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}

/** u32 → 4-byte little-endian. */
function le4(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}

/** Compare two 32-byte pubkeys ascending (byte-wise). */
function cmpPubkey(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

/** 32-byte big-endian BigInt view (for deriving sentinel pubkeys > a given max). */
function bytesToBig(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = 0; i < 32; i++) n = (n << 8n) | BigInt(b[i]!);
  return n;
}
function bigTo32Bytes(n: bigint): Uint8Array {
  const b = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    b[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return b;
}

/** Next power of two ≥ n (n ≥ 1). */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Leaf hash `sha256(juror ‖ stake_le ‖ cum_after_le)` — matches the on-chain
 * `verify_mst_inclusion` accumulator seed (lib.rs:1602-1607).
 */
export function leafHash(leaf: LeafClaim): Promise<Uint8Array> {
  return sha256(leaf.juror, le8(leaf.stake), le8(leaf.cumAfter));
}

// ---------------------------------------------------------------------------
// MST build + prove + select
// ---------------------------------------------------------------------------

/**
 * Build the canonical MST over a juror set.
 *
 * Sorts by juror pubkey ascending, computes `cum_after`, pads to a perfect
 * binary tree with zero-stake sentinels (strictly greater than every real
 * pubkey), and computes every level's `{hash, sum}`. Returns the root
 * commitments plus the in-memory levels for proof generation.
 *
 * @param jurors `{juror: 32 bytes, stake}[]` in any order; duplicates rejected.
 */
export async function buildMst(
  jurors: { juror: Uint8Array; stake: bigint }[],
): Promise<MerkleSumTree> {
  if (jurors.length === 0)
    throw new Error("MstEmpty: at least one juror required");
  for (const j of jurors) {
    if (j.juror.length !== 32)
      throw new Error(`InvalidJuror: expected 32 bytes`);
    if (j.stake < 0n) throw new Error(`InvalidStake: negative`);
  }

  // 1. Sort by juror pubkey ascending; reject duplicates.
  const sorted = [...jurors].sort((a, b) => cmpPubkey(a.juror, b.juror));
  for (let i = 1; i < sorted.length; i++) {
    if (cmpPubkey(sorted[i - 1]!.juror, sorted[i]!.juror) === 0) {
      throw new Error("MstDuplicateJuror: input set has duplicate pubkeys");
    }
  }

  // 2. Compute cum_after (running sum) for the real leaves.
  const total = sorted.reduce((acc, j) => acc + j.stake, 0n);
  if (total === 0n) throw new Error("MstZeroStake: total stake must be > 0");

  // 3. Pad to next power of two with zero-stake sentinels > every real pubkey.
  const target = nextPow2(sorted.length);
  const padCount = target - sorted.length;
  const maxBig = bytesToBig(sorted[sorted.length - 1]!.juror);
  const leaves: LeafClaim[] = sorted.map((j) => ({
    juror: j.juror,
    stake: j.stake,
    cumAfter: 0n,
  }));
  let cum = 0n;
  for (const l of leaves) {
    cum += l.stake;
    l.cumAfter = cum;
  }
  for (let i = 0; i < padCount; i++) {
    // strictly greater than max real pubkey; sentinel range is empty (stake 0).
    const sentinel = bigTo32Bytes(maxBig + 1n + BigInt(i));
    leaves.push({ juror: sentinel, stake: 0n, cumAfter: total });
  }

  // 4. Build levels bottom-up. nodes[0] = leaves; nodes[d] = parents.
  const nodes: { hash: Uint8Array; sum: bigint }[][] = [[]];
  for (const l of leaves) {
    nodes[0]!.push({ hash: await leafHash(l), sum: l.stake });
  }
  let d = 0;
  while (nodes[d]!.length > 1) {
    const cur = nodes[d]!;
    const next: { hash: Uint8Array; sum: bigint }[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const left = cur[i]!;
      const right = cur[i + 1]!;
      next.push({
        hash: await sha256(left.hash, right.hash),
        sum: left.sum + right.sum,
      });
    }
    nodes.push(next);
    d++;
  }
  const root = nodes[nodes.length - 1]![0]!;
  return { leaves, nodes, rootHash: root.hash, rootSum: root.sum };
}

/**
 * Produce the MST inclusion proof for the leaf at `index` (position in the
 * padded sorted array). Walks rootward, recording `(sibling_hash, sibling_sum)`
 * at each level. Index bits are read LSB-first by the on-chain verifier
 * (lib.rs:1614), matching this walk.
 */
export function proveMembership(tree: MerkleSumTree, index: number): MSTNode[] {
  const proof: MSTNode[] = [];
  let idx = index;
  for (let d = 0; d < tree.nodes.length - 1; d++) {
    const level = tree.nodes[d]!;
    const sib = idx ^ 1;
    const sibling = level[sib];
    if (!sibling)
      throw new Error(`MstProof: no sibling at level ${d} for index ${index}`);
    proof.push({ siblingHash: sibling.hash, siblingSum: sibling.sum });
    idx >>= 1;
  }
  return proof;
}

/**
 * Find the leaf whose cumulative range `[cum_before, cum_after)` contains `r_i`
 * (ADR-0009 sortition slot). `cum_before = cum_after - stake`. Returns the leaf
 * index in the padded array, or throws if `r_i ≥ total_stake`.
 */
export function selectSlot(tree: MerkleSumTree, r_i: bigint): number {
  if (r_i < 0n || r_i >= tree.rootSum) {
    throw new Error(
      `SortitionOutOfRange: r_i=${r_i} not in [0, ${tree.rootSum})`,
    );
  }
  // Sentinel leaves have stake 0 (empty range) so they are never selected.
  for (let i = 0; i < tree.leaves.length; i++) {
    const l = tree.leaves[i]!;
    const cumBefore = l.cumAfter - l.stake;
    if (r_i >= cumBefore && r_i < l.cumAfter) return i;
  }
  throw new Error("SortitionMiss: unreachable if rootSum is consistent");
}

/**
 * Assemble `JurorMembership[]` for a panel: one per VRF-selected slot. Each
 * membership is `{leaf, proof, index}` ready for the `draw` instruction.
 */
export function buildMemberships(
  tree: MerkleSumTree,
  slots: bigint[],
): JurorMembership[] {
  return slots.map((r_i) => {
    const index = selectSlot(tree, r_i);
    const leaf = tree.leaves[index]!;
    const proof = proveMembership(tree, index);
    return { leaf, proof, index };
  });
}

// ---------------------------------------------------------------------------
// verifyMstInclusion — TS port of the on-chain verifier (lib.rs:1594-1634),
// used to prove the builder + prover are bit-compatible with the chain.
// ---------------------------------------------------------------------------

export async function verifyMstInclusion(
  leaf: LeafClaim,
  index: number,
  proof: MSTNode[],
  rootHash: Uint8Array,
  rootSum: bigint,
): Promise<boolean> {
  let accHash = await leafHash(leaf);
  let accSum = leaf.stake;
  let cumFromLeft = 0n;
  for (let depth = 0; depth < proof.length; depth++) {
    if (depth >= 31) return false;
    const sibling = proof[depth]!;
    const isLeft = ((index >> depth) & 1) === 0;
    if (isLeft) {
      accHash = await sha256(accHash, sibling.siblingHash);
    } else {
      accHash = await sha256(sibling.siblingHash, accHash);
      cumFromLeft += sibling.siblingSum;
    }
    accSum += sibling.siblingSum;
  }
  return (
    eqBytes(accHash, rootHash) &&
    accSum === rootSum &&
    leaf.cumAfter === cumFromLeft + leaf.stake
  );
}

function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Snapshot PDA + instruction seams (ADR-0010 facade pattern)
// ---------------------------------------------------------------------------

/** Snapshot PDA seed bytes (state.rs:1915): `["snapshot", dispute, round_idx_le4]`. */
export function snapshotSeeds(
  disputeBytes: Uint8Array,
  roundIdx: number,
): Uint8Array[] {
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx > 0xffffffff) {
    throw new Error(`InvalidRoundIdx: expected u32, got ${roundIdx}`);
  }
  return [SEED_SNAPSHOT, disputeBytes, le4(roundIdx)];
}

/** Derive the canonical Snapshot PDA. Kit lazy-imported. */
export async function findSnapshotPda(
  programAddress: Address,
  dispute: Address,
  roundIdx: number,
): Promise<{ address: Address; bump: number }> {
  const { getAddressEncoder, getProgramDerivedAddress } = await import(
    "@solana/kit"
  );
  const disputeBytes = new Uint8Array(getAddressEncoder().encode(dispute));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: snapshotSeeds(disputeBytes, roundIdx),
  });
  return { address, bump };
}

/** Accounts shared by every snapshot instruction. */
export interface SnapshotAccounts {
  /** post: the indexer poster (bond payer). finalize: any cranker. Signer. */
  signer: Address;
  subaccord: Address;
  dispute: Address;
  /** `["snapshot", dispute, round_idx]` — provided so the seam stays stateless. */
  snapshot: Address;
}

/**
 * Seam to the Codama-generated Kit client (ADR-0010). Foundation wires the
 * concrete adapter; snapshot.ts stays orchestration-only.
 */
export interface AccordSnapshotClient {
  buildPostSnapshot(input: {
    programId: Address;
    accounts: SnapshotAccounts;
    merkleRoot: Uint8Array; // [u8; 32]
    totalStake: bigint;
  }): Instruction;
  buildChallengeSnapshot(input: {
    programId: Address;
    accounts: SnapshotAccounts;
    /** The challenger's pubkey (FraudProof::Omission needs it as remaining_accounts witness owner). */
    proof: unknown; // FraudProof — a sum type; typed narrowly in the appeal/challenge task
  }): Instruction;
  buildFinalizeSnapshot(input: {
    programId: Address;
    accounts: SnapshotAccounts;
  }): Instruction;
}

/** Build `post_snapshot` (lib.rs:485): commit `{root, total_stake}` + post bond. */
export function postSnapshot(
  client: AccordSnapshotClient,
  programId: Address,
  accounts: SnapshotAccounts,
  tree: Pick<MerkleSumTree, "rootHash" | "rootSum">,
): Instruction {
  if (tree.rootHash.length !== 32)
    throw new Error("InvalidRootHash: expected 32 bytes");
  return client.buildPostSnapshot({
    programId,
    accounts,
    merkleRoot: tree.rootHash,
    totalStake: tree.rootSum,
  });
}

/** Build `challenge_snapshot` (lib.rs:557) with a `FraudProof`. */
export function challengeSnapshot(
  client: AccordSnapshotClient,
  programId: Address,
  accounts: SnapshotAccounts,
  proof: unknown,
): Instruction {
  return client.buildChallengeSnapshot({ programId, accounts, proof });
}

/** Build the permissionless `finalize_snapshot` crank (lib.rs:743). */
export function finalizeSnapshot(
  client: AccordSnapshotClient,
  programId: Address,
  accounts: SnapshotAccounts,
): Instruction {
  return client.buildFinalizeSnapshot({ programId, accounts });
}
