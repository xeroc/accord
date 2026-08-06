/**
 * vrf.ts — VRF request + per-seat draw choreography (ADR-0009 §2 + ADR-0012).
 *
 *   1. request_vrf          — CPI into the magicblock VRF oracle (one-shot).
 *   2. commit_vrf_callback  — oracle calls back; sets `dispute.committed_vrf`
 *                             AND atomically freezes `dispute.frozen_root`.
 *   3. draw_seat(seat, mem) — submit one seat's membership against the frozen
 *                             root. One tx per seat (1232B can't hold N proofs).
 *
 * The VRF result is committed ONCE and immutable. The frozen root is the live
 * accumulator root captured atomically at callback time — all N draw_seat txs
 * (and every appeal round) select against the SAME root.
 *
 * The chain is a dumb verifier: per seat `i`, it derives
 *   vrf_seed = sha256(committed_vrf ‖ dispute ‖ round_idx_le4)
 *   r_i      = u64_le(sha256(vrf_seed ‖ seat_le4)[0..8]) % frozen_total_stake
 * and checks the submitted leaf's reconstructed prefix range contains `r_i`.
 * Deterministic collision re-rülle (sampling without replacement) is computed
 * client-side to match the chain — bean accord-tzo0.
 *
 * Sources of truth:
 *   - request_vrf / commit_vrf_callback / draw_seat: lib.rs
 *   - sortition criterion: ADR-0009 §2 (subtree-sum form, ADR-0012)
 */
import type { Address, Instruction } from "@solana/kit";
import {
  type LeafClaim,
  type MSTNode,
  type MerkleAccumulator,
  proofFor,
  verifyMembership,
} from "./mst.js";

// ---------------------------------------------------------------------------
// Pure crypto helpers (sha256 via Web Crypto; le encoders)
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

function le4(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}

/** First 8 bytes of a hash, read little-endian as a u64. */
function leU64At(b: Uint8Array, off = 0): bigint {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(
    off,
    true,
  );
}

// ---------------------------------------------------------------------------
// Sortition slot derivation (lib.rs draw_seat) — pure, deterministic
// ---------------------------------------------------------------------------

/**
 * `vrf_seed = sha256(committed_vrf ‖ dispute ‖ round_idx_le4)` (lib.rs). Binds
 * the committed VRF to this dispute + round. No `draw_attempt` — selection is
 * deterministic per seat (ADR-0012 drops the grind).
 */
export async function vrfSeed(
  committedVrf: Uint8Array,
  disputeBytes: Uint8Array,
  roundIdx: number,
): Promise<Uint8Array> {
  if (committedVrf.length !== 32)
    throw new Error("InvalidVrf: expected 32 bytes");
  if (disputeBytes.length !== 32)
    throw new Error("InvalidDispute: expected 32 bytes");
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx > 0xffffffff)
    throw new Error(`InvalidRoundIdx: expected u32, got ${roundIdx}`);
  return sha256(committedVrf, disputeBytes, le4(roundIdx));
}

/**
 * Derive the sortition point for a single seat at a given retry:
 * `r_i = u64_le(sha256(vrf_seed ‖ seat_le4 ‖ retry_le4)[0..8]) % frozen_total_stake`.
 * `retry` defaults to 0 (the common case — no collision). The on-chain
 * `draw_seat` includes the same retry counter in its sortition hash and verifies
 * that every prior retry (0..retries) genuinely collided with an already-drawn
 * juror (bean accord-tzo0).
 */
export async function seatSlot(
  committedVrf: Uint8Array,
  disputeBytes: Uint8Array,
  roundIdx: number,
  seat: number,
  frozenTotalStake: bigint,
  retry: number = 0,
): Promise<bigint> {
  if (frozenTotalStake <= 0n) throw new Error("InvalidTotalStake: must be > 0");
  if (!Number.isInteger(seat) || seat < 0 || seat > 0xffffffff)
    throw new Error(`InvalidSeat: expected u32, got ${seat}`);
  if (!Number.isInteger(retry) || retry < 0)
    throw new Error(
      `InvalidRetry: expected non-negative integer, got ${retry}`,
    );
  const seed = await vrfSeed(committedVrf, disputeBytes, roundIdx);
  const rHash = await sha256(seed, le4(seat), le4(retry));
  return leU64At(rHash, 0) % frozenTotalStake;
}

/**
 * Find the leaf in `tree` whose sortition range `[prefix, prefix+stake)`
 * contains `slot`, and return it with its index + proof. Returns `null` if the
 * slot lands in a zero-stake gap (no eligible leaf).
 */
export async function findLeafForSlot(
  tree: MerkleAccumulator,
  slot: bigint,
): Promise<{ leaf: LeafClaim; index: number; proof: MSTNode[] } | null> {
  let running = 0n;
  for (let i = 0; i < tree.leaves.length; i++) {
    const leaf = tree.leaves[i]!;
    if (leaf.stake > 0n && slot >= running && slot - running < leaf.stake) {
      const proof = await proofFor(tree, i);
      return { leaf, index: i, proof };
    }
    running += leaf.stake;
  }
  return null;
}

/**
 * Resolve a single seat using the deterministic collision re-roll algorithm
 * (bean accord-tzo0). Iterates `retry = 0, 1, 2, …` computing
 * `r_i = sha256(seed ‖ seat ‖ retry) % total_stake`; the first retry whose
 * selected leaf is NOT in `alreadyDrawn` is the terminal. Returns the leaf,
 * proof, and the `retries` count the cranker must submit to `draw_seat`.
 *
 * The on-chain verifier independently confirms every prior retry collided — so
 * there is exactly one valid (leaf, retries) pair per seat. No caller choice.
 */
export async function resolveSeat(
  committedVrf: Uint8Array,
  disputeBytes: Uint8Array,
  roundIdx: number,
  seat: number,
  tree: MerkleAccumulator,
  alreadyDrawn: Uint8Array[],
  maxRetries: number = 1024,
): Promise<{
  leaf: LeafClaim;
  index: number;
  proof: MSTNode[];
  retries: number;
}> {
  const total = tree.rootSum;
  if (total <= 0n) throw new Error("InvalidTotalStake: must be > 0");
  const drawnHex = new Set(alreadyDrawn.map((j) => hex(j)));
  for (let retry = 0; retry <= maxRetries; retry++) {
    const slot = await seatSlot(
      committedVrf,
      disputeBytes,
      roundIdx,
      seat,
      total,
      retry,
    );
    const found = await findLeafForSlot(tree, slot);
    if (found && !drawnHex.has(hex(found.leaf.juror))) {
      return { ...found, retries: retry };
    }
    // else: collision (already drawn) or zero-stake gap → re-roll
  }
  throw new Error(
    `MaxRetriesExceeded: seat ${seat} could not resolve in ${maxRetries} retries`,
  );
}

function hex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** Verify a seat's membership reconstructs to the frozen root (client-side precheck). */
export async function verifySeat(
  leaf: LeafClaim,
  index: number,
  proof: MSTNode[],
  frozenRoot: Uint8Array,
  frozenTotalStake: bigint,
): Promise<boolean> {
  const { ok } = await verifyMembership(
    leaf,
    index,
    proof,
    frozenRoot,
    frozenTotalStake,
  );
  return ok;
}

// ---------------------------------------------------------------------------
// Seam (ADR-0010) + instruction orchestration
// ---------------------------------------------------------------------------

/** Accounts for `request_vrf` / `draw_seat` (the cranker signs). */
export interface VrfDrawAccounts {
  caller: Address;
  subaccord: Address;
  dispute: Address;
}

/** Extra accounts `request_vrf` needs for the VRF oracle CPI. */
export interface RequestVrfExtras {
  /** magicblock VRF oracle queue account. */
  oracleQueue: Address;
  /** Accord program-identity PDA (CPI authority for the VRF oracle). */
  programIdentity: Address;
}

/**
 * One seat's resolved membership: the leaf `(juror, stake)` at `index` plus its
 * accumulator proof, the juror's `JurorStake` PDA (remaining_accounts[0]), and
 * the deterministic collision re-roll count (bean accord-tzo0).
 */
export interface SeatMembership {
  leaf: LeafClaim;
  index: number;
  proof: MSTNode[];
  jurorStake: Address;
  /** Number of sortition retries (collisions) before this leaf was selected. */
  retries: number;
}

/**
 * Seam to the Codama-generated Kit client + Dispute fetcher. Foundation wires
 * the concrete adapter; vrf.ts stays orchestration-only.
 */
export interface AccordVrfClient {
  buildRequestVrf(input: {
    programId: Address;
    accounts: VrfDrawAccounts;
    extras: RequestVrfExtras;
  }): Instruction;
  buildDrawSeat(input: {
    programId: Address;
    accounts: VrfDrawAccounts;
    /** Round PDA — `init_if_needed` by draw_seat (`["round", dispute, current_round]`). */
    roundPda: Address;
    seat: number;
    /** Sortition collision re-roll count (bean accord-tzo0). */
    retries: number;
    leaf: LeafClaim;
    proof: MSTNode[];
    index: number;
    jurorStake: Address;
  }): Instruction;
  /** Read `committed_vrf` from a Dispute; `null` until the oracle callback lands. */
  fetchCommittedVrf(dispute: Address): Promise<Uint8Array | null>;
}

/** Build `request_vrf`. One-shot; triggers the oracle callback (freezes the root). */
export function requestVrf(
  client: AccordVrfClient,
  programId: Address,
  accounts: VrfDrawAccounts,
  extras: RequestVrfExtras,
): Instruction {
  return client.buildRequestVrf({ programId, accounts, extras });
}

/**
 * Poll a Dispute's `committed_vrf` until the oracle callback lands (or
 * `timeoutMs` elapses). Returns the 32-byte randomness. Use between
 * {@link requestVrf} and {@link drawSeat}.
 */
export async function awaitCommittedVrf(
  client: AccordVrfClient,
  dispute: Address,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<Uint8Array> {
  const interval = opts.pollIntervalMs ?? 400;
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  while (Date.now() < deadline) {
    const vrf = await client.fetchCommittedVrf(dispute);
    if (vrf && vrf.length === 32) return vrf;
    await sleep(interval);
  }
  throw new Error(`VrfTimeout: committed_vrf not set on ${dispute}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build `draw_seat` for one seat (lib.rs). Pass the pre-resolved `seat` +
 * membership (from {@link resolveSeat}) and the juror's `JurorStake` PDA. The
 * round is `init_if_needed` on-chain and persists across the N seat txs.
 * `membership.retries` carries the deterministic collision re-roll count.
 */
export function drawSeat(
  client: AccordVrfClient,
  programId: Address,
  accounts: VrfDrawAccounts,
  roundPda: Address,
  seat: number,
  membership: SeatMembership,
): Instruction {
  return client.buildDrawSeat({
    programId,
    accounts,
    roundPda,
    seat,
    retries: membership.retries,
    leaf: membership.leaf,
    proof: membership.proof,
    index: membership.index,
    jurorStake: membership.jurorStake,
  });
}
