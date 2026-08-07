/**
 * lifecycle.ts — Subaccord lifecycle + circuit breaker (ADR-0005, ADR-0007).
 *
 * Seven instructions:
 *   - {@link createSubaccord}          permissionless pool creation.
 *   - {@link proposeSubaccordUpdate}   authority-gated; arms a 48h timelock.
 *   - {@link executeSubaccordUpdate}   permissionless crank; lands post-timelock.
 *   - {@link initializePause} / {@link pause} / {@link proposeUnpause} /
 *     {@link executeUnpause}            the ADR-0007 circuit-breaker quartet.
 *
 * Client-side timelock awareness (ADR-0010 §4): `propose_subaccord_update`
 * writes `execute_after_slot = slot + UPDATE_TIMELOCK_SLOTS` on-chain. The SDK
 * cannot predict the exact landing slot, so the flow is: propose → read
 * `execute_after_slot` back from the PendingUpdate account → wait until
 * `canExecuteAt(executeAfterSlot, currentSlot)` → execute. The same shape backs
 * the unpause timelock (`UNPAUSE_TIMELOCK_SLOTS`).
 *
 * Same ADR-0010 facade pattern as the other method modules: pure orchestration
 * over a typed {@link AccordLifecycleClient} seam; Kit type-only; PDAs lazy.
 *
 * Sources of truth:
 *   - instructions:  programs/accord/src/lib.rs (146-397, 77-144)
 *   - accounts/PDAs: programs/accord/src/lib.rs (1693-1845, 1640-1690)
 *   - constants:     programs/accord/src/constants.rs
 *   - UpdatePayload: programs/accord/src/state.rs (254-266)
 */
import type { Address, Instruction } from "@solana/kit";
import {
  MAX_APPEALS,
  UPDATE_TIMELOCK_SLOTS,
  UNPAUSE_TIMELOCK_SLOTS,
} from "../constants.js";
import type { Aggregation, UpdatePayload } from "../types.js";

export {
  MAX_APPEALS,
  UPDATE_TIMELOCK_SLOTS,
  UNPAUSE_TIMELOCK_SLOTS,
} from "../constants.js";
export { type UpdatePayload } from "../types.js";

// ---------------------------------------------------------------------------
// PDA seed prefixes + local constants
// ---------------------------------------------------------------------------

/** Subaccord PDA seed prefix (state.rs: SEED_SUBACCORD = b"subaccord"). */
const SEED_SUBACCORD = new Uint8Array([
  115, 117, 98, 97, 99, 99, 111, 114, 100,
]);

/** PendingUpdate PDA seed prefix (state.rs: SEED_PENDING_UPDATE = b"update"). */
const SEED_PENDING_UPDATE = new Uint8Array([117, 112, 100, 97, 116, 101]); // "update"

/** PauseState PDA seed prefix (state.rs: SEED_PAUSE = b"pause"). */
const SEED_PAUSE = new Uint8Array([112, 97, 117, 115, 101]); // "pause"

const U64_MAX = 0xffffffffffffffffn;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Args for `create_subaccord` (lib.rs:146). `risk_type`/`evidence_spec` immutable. */
export interface CreateSubaccordArgs {
  /** Immutable identity hash: the class of dispute this pool adjudicates. ≠ [0;32]. */
  riskType: Uint8Array; // 32 bytes
  /** Immutable evidence-format spec hash (ADR-0006). */
  evidenceSpec: Uint8Array; // 32 bytes
  /** SPL mint juror capital is staked in (collateral, ADR-0002/0020). */
  stakingToken: Address;
  /** Compensation mint — fees + appeal bonds (ADR-0020). Distinct from stakingToken. */
  feeToken: Address;
  minStake: bigint;
  /** Slash factor in bps (10% = 1000). */
  alphaBps: number; // u16
  reviewWindow: bigint; // seconds
  commitWindow: bigint; // seconds
  revealWindow: bigint; // seconds
  /** ≤ {@link MAX_APPEALS}; the sole per-Subaccord panel-shape knob. The
   *  round-1 size is the fixed {@link INITIAL_NUM_JURORS} (3); each appeal
   *  doubles+1 (3 → 7 → 15 → 31 at max_appeals = 3). */
  maxAppeals: number; // u8
  /** Per-Subaccord aggregation rule (ADR-0019). v1 = `Plurality`. */
  aggregation: Aggregation;
  feePerJuror: bigint;
  /** `Pubkey::default()` => immutable Subaccord; else signs propose/execute. */
  authority: Address;
  /** ADR-0006 trusted re-encryption service. */
  evidenceOperator: Address;
  /**
   * Fixed accumulator tree depth (ADR-0012). Bounds the juror pool at
   * `2^depth`; the tree never grows a level during operation. Default 20.
   */
  depth: number; // u8
}

/**
 * Tagged Subaccord parameter update (state.rs:254-266). `risk_type` and
 * `evidence_spec` are immutable and absent. Re-exported from
 * {@link ../types.js} (Codama-generated canonical shape).
 */

// ---------------------------------------------------------------------------
// Pure helpers (testable, no chain)
// ---------------------------------------------------------------------------

/** u64 → 8-byte little-endian. */
function le8(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}

/** Subaccord PDA seeds (state.rs:1697): `["subaccord", creator, risk_type]`. */
export function subaccordSeeds(
  creatorBytes: Uint8Array,
  riskType: Uint8Array,
): Uint8Array[] {
  assertValidRiskType(riskType);
  if (creatorBytes.length !== 32)
    throw new Error("InvalidCreator: expected 32 bytes");
  return [SEED_SUBACCORD, creatorBytes, riskType];
}

/** PendingUpdate PDA seeds (state.rs:1816): `["update", subaccord, nonce_le]`. */
export function pendingUpdateSeeds(
  subaccordBytes: Uint8Array,
  nonce: bigint,
): Uint8Array[] {
  if (subaccordBytes.length !== 32)
    throw new Error("InvalidSubaccord: expected 32 bytes");
  if (nonce < 0n || nonce > U64_MAX)
    throw new Error(`InvalidNonce: expected u64, got ${nonce}`);
  return [SEED_PENDING_UPDATE, subaccordBytes, le8(nonce)];
}

/** PauseState PDA seeds (state.rs: `["pause"]`). Singleton. */
export function pauseSeeds(): Uint8Array[] {
  return [SEED_PAUSE];
}

/** Validate `max_appeals ≤ MAX_APPEALS` (lib.rs). The round-1 panel is the
 * fixed `INITIAL_NUM_JURORS` (=3), so this is the only panel-shape gate. */
export function assertValidMaxAppeals(maxAppeals: number): void {
  if (
    !Number.isInteger(maxAppeals) ||
    maxAppeals < 0 ||
    maxAppeals > MAX_APPEALS
  ) {
    throw new Error(
      `MaxAppealsLimitExceeded: expected 0..${MAX_APPEALS}, got ${maxAppeals}`,
    );
  }
}

/** Reject the degenerate zero risk_type (lib.rs:164 namespace squat guard). */
export function assertValidRiskType(riskType: Uint8Array): void {
  if (riskType.length !== 32) {
    throw new Error(
      `InvalidRiskType: expected 32 bytes, got ${riskType.length}`,
    );
  }
  let allZero = 1;
  for (let i = 0; i < 32; i++) allZero &= riskType[i] === 0 ? 1 : 0;
  if (allZero) throw new Error("InvalidRiskType: zero hash is reserved");
}

/** Timelock gate: may a pending update/unpause land at `currentSlot`? */
export function canExecuteAt(
  executeAfterSlot: bigint,
  currentSlot: bigint,
): boolean {
  return currentSlot >= executeAfterSlot;
}

// ---------------------------------------------------------------------------
// PDA derivations (Kit lazy-imported)
// ---------------------------------------------------------------------------

export async function findSubaccordPda(
  programAddress: Address,
  creator: Address,
  riskType: Uint8Array,
): Promise<{ address: Address; bump: number }> {
  const { getAddressEncoder, getProgramDerivedAddress } =
    await import("@solana/kit");
  const creatorBytes = new Uint8Array(getAddressEncoder().encode(creator));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: subaccordSeeds(creatorBytes, riskType),
  });
  return { address, bump };
}

export async function findPendingUpdatePda(
  programAddress: Address,
  subaccord: Address,
  nonce: bigint,
): Promise<{ address: Address; bump: number }> {
  const { getAddressEncoder, getProgramDerivedAddress } =
    await import("@solana/kit");
  const subBytes = new Uint8Array(getAddressEncoder().encode(subaccord));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: pendingUpdateSeeds(subBytes, nonce),
  });
  return { address, bump };
}

export async function findPausePda(
  programAddress: Address,
): Promise<{ address: Address; bump: number }> {
  const { getProgramDerivedAddress } = await import("@solana/kit");
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: pauseSeeds(),
  });
  return { address, bump };
}

// ---------------------------------------------------------------------------
// Seam (ADR-0010) + orchestration
// ---------------------------------------------------------------------------

/**
 * Seam to the Codama-generated Kit client + fetcher. Foundation wires the
 * concrete adapter; lifecycle.ts stays orchestration-only.
 */
export interface AccordLifecycleClient {
  buildCreateSubaccord(input: {
    programId: Address;
    creator: Address;
    subaccordPda: Address;
    args: CreateSubaccordArgs;
  }): Instruction;
  buildProposeSubaccordUpdate(input: {
    programId: Address;
    authority: Address;
    subaccord: Address;
    pendingUpdatePda: Address;
    nonce: bigint;
    payload: UpdatePayload;
  }): Instruction;
  buildExecuteSubaccordUpdate(input: {
    programId: Address;
    caller: Address;
    subaccord: Address;
    pendingUpdate: Address;
  }): Instruction;
  buildInitializePause(input: {
    programId: Address;
    authority: Address;
    pauseStatePda: Address;
  }): Instruction;
  buildPause(input: {
    programId: Address;
    authority: Address;
    pauseState: Address;
  }): Instruction;
  buildProposeUnpause(input: {
    programId: Address;
    authority: Address;
    pauseState: Address;
  }): Instruction;
  buildExecuteUnpause(input: {
    programId: Address;
    caller: Address;
    pauseState: Address;
  }): Instruction;
  /** Read `execute_after_slot` back from a PendingUpdate account (timelock flow). */
  fetchPendingUpdateExecuteAfter(
    pendingUpdate: Address,
  ): Promise<bigint | null>;
}

/** Build `create_subaccord` (lib.rs:146). Permissionless; creator owns the namespace. */
export async function createSubaccord(
  client: AccordLifecycleClient,
  programId: Address,
  creator: Address,
  args: CreateSubaccordArgs,
): Promise<{ instruction: Instruction; subaccord: Address; bump: number }> {
  assertValidRiskType(args.riskType);
  if (args.evidenceSpec.length !== 32)
    throw new Error("InvalidEvidenceSpec: expected 32 bytes");
  assertValidMaxAppeals(args.maxAppeals);
  const { address, bump } = await findSubaccordPda(
    programId,
    creator,
    args.riskType,
  );
  const instruction = client.buildCreateSubaccord({
    programId,
    creator,
    subaccordPda: address,
    args,
  });
  return { instruction, subaccord: address, bump };
}

/**
 * Build `propose_subaccord_update` (lib.rs:331). Authority-gated; arms a 48h
 * timelock. The exact `execute_after_slot` is set on-chain from the landing
 * slot — read it back via `fetchPendingUpdateExecuteAfter` and gate execution
 * with `canExecuteAt`. Returns the derived PendingUpdate PDA.
 */
export async function proposeSubaccordUpdate(
  client: AccordLifecycleClient,
  programId: Address,
  authority: Address,
  subaccord: Address,
  nonce: bigint,
  payload: UpdatePayload,
): Promise<{ instruction: Instruction; pendingUpdate: Address }> {
  if (nonce < 0n || nonce > U64_MAX)
    throw new Error(`InvalidNonce: expected u64, got ${nonce}`);
  const { address } = await findPendingUpdatePda(programId, subaccord, nonce);
  const instruction = client.buildProposeSubaccordUpdate({
    programId,
    authority,
    subaccord,
    pendingUpdatePda: address,
    nonce,
    payload,
  });
  return { instruction, pendingUpdate: address };
}

/**
 * Resolve the timelock for a pending update: read `execute_after_slot` back
 * from the PendingUpdate account. Pair with {@link canExecuteAt}.
 */
export async function getUpdateExecuteAfterSlot(
  client: AccordLifecycleClient,
  pendingUpdate: Address,
): Promise<bigint | null> {
  return client.fetchPendingUpdateExecuteAfter(pendingUpdate);
}

/** Build `execute_subaccord_update` (lib.rs:372). Permissionless; lands post-timelock. */
export function executeSubaccordUpdate(
  client: AccordLifecycleClient,
  programId: Address,
  caller: Address,
  subaccord: Address,
  pendingUpdate: Address,
): Instruction {
  return client.buildExecuteSubaccordUpdate({
    programId,
    caller,
    subaccord,
    pendingUpdate,
  });
}

/** Build `initialize_pause` (lib.rs:77). One-time: sets the pause authority. */
export async function initializePause(
  client: AccordLifecycleClient,
  programId: Address,
  authority: Address,
): Promise<{ instruction: Instruction; pauseState: Address }> {
  const { address } = await findPausePda(programId);
  const instruction = client.buildInitializePause({
    programId,
    authority,
    pauseStatePda: address,
  });
  return { instruction, pauseState: address };
}

/** Build `pause` (lib.rs:86). Instant, authority-gated emergency freeze. */
export function pause(
  client: AccordLifecycleClient,
  programId: Address,
  authority: Address,
  pauseState: Address,
): Instruction {
  return client.buildPause({ programId, authority, pauseState });
}

/** Build `propose_unpause` (lib.rs:102). Arms `UNPAUSE_TIMELOCK_SLOTS` notice. */
export function proposeUnpause(
  client: AccordLifecycleClient,
  programId: Address,
  authority: Address,
  pauseState: Address,
): Instruction {
  return client.buildProposeUnpause({ programId, authority, pauseState });
}

/** Build `execute_unpause` (lib.rs:120). Permissionless; lands post-timelock. */
export function executeUnpause(
  client: AccordLifecycleClient,
  programId: Address,
  caller: Address,
  pauseState: Address,
): Instruction {
  return client.buildExecuteUnpause({ programId, caller, pauseState });
}
