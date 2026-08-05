/**
 * vrf.ts — VRF request + draw choreography (ADR-0009 §2).
 *
 * The hardest multi-instruction orchestration in the SDK:
 *
 *   1. request_vrf          — CPI into the magicblock VRF oracle (one-shot).
 *   2. commit_vrf_callback  — oracle calls back; `dispute.committed_vrf = Some(r)`.
 *      The SDK awaits this (poll the Dispute account) and reads `committed_vrf`.
 *   3. draw(attempt, mem)    — submit the VRF-selected memberships.
 *
 * The VRF result is committed ONCE and is immutable across retries
 * (ADR-0009 §2: the caller cannot brute-force VRF results between retries). On
 * `SortitionMismatch` (two slots select the same juror → `DuplicateJuror`
 * on-chain), increment `draw_attempt` and retry with the SAME committed VRF.
 *
 * The client-side sortition is fully deterministic given
 * `(committed_vrf, dispute, round, draw_attempt)`, so the SDK pre-resolves the
 * first `draw_attempt` that yields a DISTINCT panel and submits a draw that
 * succeeds first try — no wasted revert. {@link resolvePanel} is pure and
 * unit-tested; it composes with the {@link ./snapshot} MST builder.
 *
 * Slot derivation (lib.rs:895-930):
 *   vrf_seed = sha256(committed_vrf ‖ dispute ‖ round_idx_le4 ‖ draw_attempt_le4)
 *   r_i      = u64_le(sha256(vrf_seed ‖ i_le4)[0..8]) % total_stake
 *
 * Sources of truth:
 *   - request_vrf / commit_vrf_callback / draw: lib.rs (793-944)
 *   - Draw account context:                   lib.rs (2073-2101)
 *   - sortition + retry design:               ADR-0009 §2
 */
import type { Address, Instruction } from "@solana/kit";
import {
  buildMemberships,
  type JurorMembership,
  type MerkleSumTree,
} from "./snapshot.js";

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

/** First 8 bytes of a hash, read little-endian as a u64 (lib.rs:930). */
function leU64At(b: Uint8Array, off = 0): bigint {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(
    off,
    true,
  );
}

function eqBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Sortition slot derivation (lib.rs:895-930) — pure, deterministic, testable
// ---------------------------------------------------------------------------

/**
 * `vrf_seed = sha256(committed_vrf ‖ dispute ‖ round_idx_le4 ‖ draw_attempt_le4)`
 * (lib.rs:895-904). Binds the committed VRF to this dispute + round + attempt.
 */
export async function vrfSeed(
  committedVrf: Uint8Array,
  disputeBytes: Uint8Array,
  roundIdx: number,
  drawAttempt: number,
): Promise<Uint8Array> {
  if (committedVrf.length !== 32)
    throw new Error("InvalidVrf: expected 32 bytes");
  if (disputeBytes.length !== 32)
    throw new Error("InvalidDispute: expected 32 bytes");
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx > 0xffffffff)
    throw new Error(`InvalidRoundIdx: expected u32, got ${roundIdx}`);
  if (
    !Number.isInteger(drawAttempt) ||
    drawAttempt < 0 ||
    drawAttempt > 0xffffffff
  )
    throw new Error(`InvalidDrawAttempt: expected u32, got ${drawAttempt}`);
  return sha256(committedVrf, disputeBytes, le4(roundIdx), le4(drawAttempt));
}

/**
 * Derive the `panelSize` sortition slots for a given attempt:
 * `r_i = u64_le(sha256(vrf_seed ‖ i_le4)[0..8]) % total_stake` (lib.rs:926-930).
 * Deterministic in `(committed_vrf, dispute, round, attempt)`; the caller has
 * zero influence beyond choosing `draw_attempt` (uniformly re-rolls all slots).
 */
export async function drawSlots(
  committedVrf: Uint8Array,
  disputeBytes: Uint8Array,
  roundIdx: number,
  drawAttempt: number,
  panelSize: number,
  totalStake: bigint,
): Promise<bigint[]> {
  if (totalStake <= 0n) throw new Error("InvalidTotalStake: must be > 0");
  const seed = await vrfSeed(committedVrf, disputeBytes, roundIdx, drawAttempt);
  const slots: bigint[] = [];
  for (let i = 0; i < panelSize; i++) {
    const rHash = await sha256(seed, le4(i));
    slots.push(leU64At(rHash, 0) % totalStake);
  }
  return slots;
}

/** Are all jurors in a panel distinct? (on-chain `DuplicateJuror` gate, lib.rs:940) */
export function isDistinctPanel(memberships: JurorMembership[]): boolean {
  for (let i = 0; i < memberships.length; i++) {
    for (let j = i + 1; j < memberships.length; j++) {
      if (eqBytes(memberships[i]!.leaf.juror, memberships[j]!.leaf.juror))
        return false;
    }
  }
  return true;
}

/**
 * Resolve the first `draw_attempt` whose VRF-derived panel is distinct, using
 * the SAME committed VRF across retries (ADR-0009 §2). Builds the matching
 * `JurorMembership[]` via the snapshot MST builder. Throws if no distinct panel
 * is found within `maxAttempts` (e.g. panel larger than the real juror pool).
 *
 * This is the retry-on-collision logic: pre-resolve locally so the submitted
 * `draw` succeeds first try instead of reverting.
 */
export async function resolvePanel(
  committedVrf: Uint8Array,
  disputeBytes: Uint8Array,
  roundIdx: number,
  panelSize: number,
  tree: MerkleSumTree,
  maxAttempts = 256,
): Promise<{ drawAttempt: number; memberships: JurorMembership[] }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slots = await drawSlots(
      committedVrf,
      disputeBytes,
      roundIdx,
      attempt,
      panelSize,
      tree.rootSum,
    );
    const memberships = buildMemberships(tree, slots);
    if (isDistinctPanel(memberships)) {
      return { drawAttempt: attempt, memberships };
    }
  }
  throw new Error(
    `DrawCollision: no distinct panel of ${panelSize} in ${maxAttempts} attempts`,
  );
}

// ---------------------------------------------------------------------------
// Seam (ADR-0010) + instruction orchestration
// ---------------------------------------------------------------------------

/** Accounts for `request_vrf` / `draw` (the cranker signs). */
export interface VrfDrawAccounts {
  caller: Address;
  subaccord: Address;
  dispute: Address;
  snapshot: Address;
}

/** Extra accounts `request_vrf` needs for the VRF oracle CPI. */
export interface RequestVrfExtras {
  /** magicblock VRF oracle queue account. */
  oracleQueue: Address;
  /** Accord program-identity PDA (CPI authority for the VRF oracle). */
  programIdentity: Address;
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
  buildDraw(input: {
    programId: Address;
    accounts: VrfDrawAccounts;
    /** Round PDA — `init`'d by draw (`["round", dispute, current_round]`). */
    roundPda: Address;
    drawAttempt: number;
    memberships: JurorMembership[];
    /** remaining_accounts: drawn JurorStake PDAs (one per panel member). */
    jurorStakeAccounts: Address[];
  }): Instruction;
  /** Read `committed_vrf` from a Dispute; `null` until the oracle callback lands. */
  fetchCommittedVrf(dispute: Address): Promise<Uint8Array | null>;
}

/** Build `request_vrf` (lib.rs:793). One-shot; triggers the oracle callback. */
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
 * {@link requestVrf} and {@link draw}.
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
 * Build `draw` (lib.rs:861) for a pre-resolved panel. Pass `drawAttempt` +
 * `memberships` from {@link resolvePanel} (and the matching JurorStake PDAs).
 * Because the panel is pre-resolved to be distinct, this draw succeeds first
 * try — no on-chain revert/retry round-trip.
 */
export function draw(
  client: AccordVrfClient,
  programId: Address,
  accounts: VrfDrawAccounts,
  roundPda: Address,
  drawAttempt: number,
  memberships: JurorMembership[],
  jurorStakeAccounts: Address[],
): Instruction {
  if (memberships.length !== jurorStakeAccounts.length) {
    throw new Error(
      `InvalidPanelSize: ${memberships.length} memberships vs ${jurorStakeAccounts.length} stake accounts`,
    );
  }
  return client.buildDraw({
    programId,
    accounts,
    roundPda,
    drawAttempt,
    memberships,
    jurorStakeAccounts,
  });
}
