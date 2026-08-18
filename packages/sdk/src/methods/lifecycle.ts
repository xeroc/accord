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
import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  MAX_APPEALS,
  MAX_DRAW_ATTEMPTS,
  MAX_JURORS,
  MIN_APPEAL_WINDOW_SECS,
  UPDATE_TIMELOCK_SLOTS,
  UNPAUSE_TIMELOCK_SLOTS,
} from "../constants.js";
import type { Aggregation, ShortfallPolicy, UpdatePayload } from "../types.js";

export {
  MAX_APPEALS,
  MAX_DRAW_ATTEMPTS,
  MAX_JURORS,
  MIN_APPEAL_WINDOW_SECS,
  UPDATE_TIMELOCK_SLOTS,
  UNPAUSE_TIMELOCK_SLOTS,
} from "../constants.js";
export { type ShortfallPolicy, type UpdatePayload } from "../types.js";

// ---------------------------------------------------------------------------
// PDA seed prefixes + local constants
// ---------------------------------------------------------------------------

/** Subaccord PDA seed prefix (state.rs: SEED_SUBACCORD = b"subaccord"). */
const SEED_SUBACCORD = new Uint8Array([
  115, 117, 98, 97, 99, 99, 111, 114, 100,
]);

/** PendingUpdate PDA seed prefix (state.rs: SEED_PENDING_UPDATE = b"update"). */
const SEED_PENDING_UPDATE = new Uint8Array([117, 112, 100, 97, 116, 101]); // "update"

/** AccordState PDA seed prefix (state.rs: SEED_ACCORD_STATE = b"state"). */
const SEED_ACCORD_STATE = new Uint8Array([115, 116, 97, 116, 101]); // "state"

const U64_MAX = 0xffffffffffffffffn;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Args for `create_subaccord` (lib.rs:146). `domain_ref`/`evidence_spec` immutable. */
export interface CreateSubaccordArgs {
  /** Immutable identity hash: the class of dispute this pool adjudicates. ≠ [0;32]. */
  domainRef: Uint8Array; // 32 bytes
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
  /** Appeal window after a round resolves before finality (ADR-0022). Per-
   *  Subaccord, frozen onto `CaseTerms` at filing. ≥ {@link MIN_APPEAL_WINDOW_SECS}. */
  appealWindow: bigint; // seconds
  /** ≤ {@link MAX_APPEALS}; bounds the appeal ladder depth. The round-1 panel
   *  size is per-Subaccord via {@link CreateSubaccordArgs.minJurySize}
   *  (accord-9q3e); each appeal doubles+1. */
  maxAppeals: number; // u8
  /** Round-1 juror panel size (accord-9q3e). Default 3 ({@link INITIAL_NUM_JURORS});
   *  must be odd and the appeal ladder `(J+1)·2^maxAppeals − 1` must fit
   *  {@link MAX_JURORS}. Set 1 + `maxAppeals = 0` for a single-juror pool.
   *  Immutable on the Subaccord (not in {@link UpdatePayload}). */
  minJurySize: number; // u32, odd ≥ 1
  /** Per-Subaccord aggregation rule (ADR-0019). v1 = `Plurality`. */
  aggregation: Aggregation;
  feePerJuror: bigint;
  /**
   * Reveal-quorum fraction in bps (ADR-0021). A round is authoritative only if
   * `reveal_count >= ceil(panel × bps / 10_000)`. Default 6_666 (2/3); the
   * absolute commitment escalates per appeal for free via panel growth.
   */
  revealThresholdBps: number; // u16, 0..=10_000
  /** Shortfall policy (ADR-0021). v1 = `Redraw` (same-size redraw via `draw_attempt`). */
  shortfallPolicy: ShortfallPolicy;
  /**
   * Same-size redraw cap per round before the dispute fails (ADR-0021).
   * Orthogonal to {@link CreateSubaccordArgs.maxAppeals} (which bounds rounds).
   */
  maxDrawAttempts: number; // u8, 1..=MAX_DRAW_ATTEMPTS
  /**
   * Coherence tolerance for `Median` pools, in bps of the final median
   * (ADR-0025): a revealed vote is coherent iff
   * `|vote − ruling| · 10_000 ≤ ruling · coherence_tol_bps`. `0` = exact
   * match. Inert for `Plurality`. Immutable on the Subaccord (not in
   * `UpdatePayload`); frozen onto `CaseTerms` at filing. Docs default 100
   * (1% band) for `Median` pools; use `0` for `Plurality`-only pools.
   */
  coherenceTolBps: number; // u16, 0..=10_000
  /** `Pubkey::default()` => immutable Subaccord; else signs propose/execute. */
  authority: Address;
  /** ADR-0006 trusted re-encryption service. */
  evidenceOperator: Address;
  /**
   * Fixed accumulator tree depth (ADR-0012). Bounds the juror pool at
   * `2^depth`; the tree never grows a level during operation. Default 20.
   */
  depth: number; // u8
  /**
   * PROG-ATTESTTION: optional credential gate. Omit (or set both to the default
   * pubkey) ⇒ stake-only Subaccord (today's behaviour). Set both ⇒ jurors must
   * hold a valid SAS attestation to stake/draw. Both-or-neither.
   */
  jurorCredential?: Address;
  jurorSchema?: Address;
}

/**
 * Tagged Subaccord parameter update (state.rs:254-266). `domain_ref` and
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

/** Subaccord PDA seeds (state.rs:1697): `["subaccord", creator, domain_ref]`. */
export function subaccordSeeds(
  creatorBytes: Uint8Array,
  domainRef: Uint8Array,
): Uint8Array[] {
  assertValidRiskType(domainRef);
  if (creatorBytes.length !== 32)
    throw new Error("InvalidCreator: expected 32 bytes");
  return [SEED_SUBACCORD, creatorBytes, domainRef];
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

/** AccordState PDA seeds (state.rs: `["state"]`). Singleton. */
export function accordStateSeeds(): Uint8Array[] {
  return [SEED_ACCORD_STATE];
}

/** Validate `max_appeals ≤ MAX_APPEALS` (lib.rs). With a configurable round-1
 * panel size (accord-9q3e), `maxAppeals` bounds the appeal ladder depth; the
 * ladder must also fit `MAX_JURORS` — see {@link assertValidMinJurySize}. */
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

/** Validate `min_jury_size` is odd and the appeal ladder fits `MAX_JURORS`
 * (lib.rs create_subaccord, accord-9q3e). The ladder top
 * `(J+1)·2^maxAppeals − 1` must not exceed {@link MAX_JURORS} or panel growth
 * would be silently truncated by the on-chain `.min()` cap. Throws on violation. */
export function assertValidMinJurySize(
  minJurySize: number,
  maxAppeals: number,
): void {
  if (!Number.isInteger(minJurySize) || minJurySize < 1) {
    throw new Error(
      `InvalidMinJurySize: expected odd integer ≥ 1, got ${minJurySize}`,
    );
  }
  if (minJurySize % 2 !== 1) {
    throw new Error(
      `InvalidMinJurySize: must be odd (tie avoidance under plurality), got ${minJurySize}`,
    );
  }
  const ladderTop = (minJurySize + 1) * (1 << maxAppeals) - 1;
  if (ladderTop > MAX_JURORS) {
    throw new Error(
      `InvalidMinJurySize: appeal ladder top (${ladderTop}) exceeds MAX_JURORS (${MAX_JURORS})` +
        ` for min_jury_size=${minJurySize}, max_appeals=${maxAppeals}`,
    );
  }
}

/** Validate `appeal_window ≥ MIN_APPEAL_WINDOW_SECS` (lib.rs, ADR-0022). A pool
 * that wants no appeals sets `max_appeals == 0`; a 0 window is rejected. */
export function assertValidAppealWindow(appealWindow: bigint): void {
  if (appealWindow < MIN_APPEAL_WINDOW_SECS) {
    throw new Error(
      `AppealWindowTooShort: expected >= ${MIN_APPEAL_WINDOW_SECS}, got ${appealWindow}`,
    );
  }
}

/** Validate `reveal_threshold_bps ≤ 10_000` (lib.rs, ADR-0021). */
export function assertValidRevealThreshold(revealThresholdBps: number): void {
  if (
    !Number.isInteger(revealThresholdBps) ||
    revealThresholdBps < 0 ||
    revealThresholdBps > 10_000
  ) {
    throw new Error(
      `InvalidThreshold: expected 0..10000 bps, got ${revealThresholdBps}`,
    );
  }
}

/** Validate `1 ≤ max_draw_attempts ≤ MAX_DRAW_ATTEMPTS` (lib.rs, ADR-0021). */
export function assertValidMaxDrawAttempts(maxDrawAttempts: number): void {
  if (
    !Number.isInteger(maxDrawAttempts) ||
    maxDrawAttempts < 1 ||
    maxDrawAttempts > MAX_DRAW_ATTEMPTS
  ) {
    throw new Error(
      `MaxDrawAttemptsLimitExceeded: expected 1..${MAX_DRAW_ATTEMPTS}, got ${maxDrawAttempts}`,
    );
  }
}

/** Validate `coherence_tol_bps ≤ 10_000` (lib.rs create_subaccord, ADR-0025).
 * Mirrors the on-chain `InvalidThreshold` gate — same bound as
 * {@link assertValidRevealThreshold}. */
export function assertValidCoherenceTol(coherenceTolBps: number): void {
  if (
    !Number.isInteger(coherenceTolBps) ||
    coherenceTolBps < 0 ||
    coherenceTolBps > 10_000
  ) {
    throw new Error(
      `InvalidThreshold: expected 0..10000 bps, got ${coherenceTolBps}`,
    );
  }
}

/** Reject the degenerate zero domain_ref (lib.rs:164 namespace squat guard). */
export function assertValidRiskType(domainRef: Uint8Array): void {
  if (domainRef.length !== 32) {
    throw new Error(
      `InvalidRiskType: expected 32 bytes, got ${domainRef.length}`,
    );
  }
  let allZero = 1;
  for (let i = 0; i < 32; i++) allZero &= domainRef[i] === 0 ? 1 : 0;
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
  domainRef: Uint8Array,
): Promise<{ address: Address; bump: number }> {
  const creatorBytes = new Uint8Array(getAddressEncoder().encode(creator));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: subaccordSeeds(creatorBytes, domainRef),
  });
  return { address, bump };
}

export async function findPendingUpdatePda(
  programAddress: Address,
  subaccord: Address,
  nonce: bigint,
): Promise<{ address: Address; bump: number }> {
  const subBytes = new Uint8Array(getAddressEncoder().encode(subaccord));
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: pendingUpdateSeeds(subBytes, nonce),
  });
  return { address, bump };
}

export async function findAccordStatePdaWithBump(
  programAddress: Address,
): Promise<{ address: Address; bump: number }> {
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: accordStateSeeds(),
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
    accordStatePda: Address;
  }): Instruction;
  buildPause(input: {
    programId: Address;
    authority: Address;
    accordState: Address;
  }): Instruction;
  buildProposeUnpause(input: {
    programId: Address;
    authority: Address;
    accordState: Address;
  }): Instruction;
  buildExecuteUnpause(input: {
    programId: Address;
    caller: Address;
    accordState: Address;
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
  assertValidRiskType(args.domainRef);
  if (args.evidenceSpec.length !== 32)
    throw new Error("InvalidEvidenceSpec: expected 32 bytes");
  assertValidMaxAppeals(args.maxAppeals);
  assertValidAppealWindow(args.appealWindow);
  assertValidRevealThreshold(args.revealThresholdBps);
  assertValidMaxDrawAttempts(args.maxDrawAttempts);
  assertValidCoherenceTol(args.coherenceTolBps);
  assertValidMinJurySize(args.minJurySize, args.maxAppeals);
  const { address, bump } = await findSubaccordPda(
    programId,
    creator,
    args.domainRef,
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
): Promise<{ instruction: Instruction; accordState: Address }> {
  const { address } = await findAccordStatePdaWithBump(programId);
  const instruction = client.buildInitializePause({
    programId,
    authority,
    accordStatePda: address,
  });
  return { instruction, accordState: address };
}

/** Build `pause` (lib.rs:86). Instant, authority-gated emergency freeze. */
export function pause(
  client: AccordLifecycleClient,
  programId: Address,
  authority: Address,
  accordState: Address,
): Instruction {
  return client.buildPause({ programId, authority, accordState });
}

/** Build `propose_unpause` (lib.rs:102). Arms `UNPAUSE_TIMELOCK_SLOTS` notice. */
export function proposeUnpause(
  client: AccordLifecycleClient,
  programId: Address,
  authority: Address,
  accordState: Address,
): Instruction {
  return client.buildProposeUnpause({ programId, authority, accordState });
}

/** Build `execute_unpause` (lib.rs:120). Permissionless; lands post-timelock. */
export function executeUnpause(
  client: AccordLifecycleClient,
  programId: Address,
  caller: Address,
  accordState: Address,
): Instruction {
  return client.buildExecuteUnpause({ programId, caller, accordState });
}
