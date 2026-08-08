/**
 * staking.ts — Juror capital stake / unstake + the `active_draws` guard.
 *
 * `unstake` is blocked on-chain while a juror is drawn into any open dispute
 * (`JurorStake.active_draws > 0` → `StakeLocked`, lib.rs:272) — stake is frozen
 * until every drawn dispute settles (ADR-0003). The facade surfaces this as a
 * typed pre-check ({@link canUnstake} / {@link assertCanUnstake}) so a client
 * rejects the unstake BEFORE building or sending the transaction (matches the
 * on-chain error; test-matrix row 4).
 *
 * `stake` SPL-transfers `amount` of the Subaccord's staking token from the
 * juror's ATA into the Subaccord PDA's vault ATA (lazily created on first
 * stake). Reverts while the circuit breaker is paused (ADR-0007).
 *
 * Same ADR-0010 facade pattern: pure orchestration over a typed
 * {@link AccordStakingClient} seam; Kit type-only; PDA lazy.
 *
 * Sources of truth:
 *   - stake / unstake handlers: programs/accord/src/lib.rs (206-324)
 *   - Stake / Unstake accounts: programs/accord/src/lib.rs (1716-1798)
 *   - JurorStake struct + seeds: programs/accord/src/state.rs (60-70)
 */
import type { Address, Instruction } from "@solana/kit";
import type { MSTNode } from "./mst.js";

/** JurorStake PDA seed prefix (state.rs: SEED_JUROR_STAKE = b"stake"). */
const SEED_JUROR_STAKE = new Uint8Array([115, 116, 97, 107, 101]); // "stake"

const U64_MAX = 0xffffffffffffffffn;

/** The decoded JurorStake fields the guard + caller need. */
export interface JurorStakeView {
  juror: Address;
  /** Collateral (stake_token, ADR-0020). */
  staked: bigint;
  /** Aggregate earned fees (fee_token, ADR-0020). Withdrawable via `withdrawFees`. */
  feesEarned: bigint;
  /** Disputes this juror is currently drawn into; >0 blocks unstake. */
  activeDraws: number;
}

/**
 * Typed unstake guard result. `ok === false` ⇒ do not build the tx; the
 * `reason` matches the on-chain error class (StakeLocked / InvalidAmount /
 * InsufficientBalance).
 */
export interface UnstakeGuard {
  ok: boolean;
  reason?: "StakeLocked" | "InvalidAmount" | "InsufficientBalance";
}

/**
 * Pre-flight the `unstake` against the juror's live stake. Mirrors the three
 * on-chain requires (lib.rs:270-277): `amount > 0`, `active_draws == 0`,
 * `amount ≤ amount`. Pure — no chain access.
 */
export function canUnstake(
  stake: JurorStakeView,
  amount: bigint,
): UnstakeGuard {
  if (amount <= 0n) return { ok: false, reason: "InvalidAmount" };
  if (stake.activeDraws > 0) return { ok: false, reason: "StakeLocked" };
  if (amount > stake.staked)
    return { ok: false, reason: "InsufficientBalance" };
  return { ok: true };
}

/** Throw a typed `Error` if the unstake would revert on-chain. */
export function assertCanUnstake(stake: JurorStakeView, amount: bigint): void {
  const g = canUnstake(stake, amount);
  if (!g.ok)
    throw new Error(
      `${g.reason}: cannot unstake ${amount} (staked=${stake.staked}, activeDraws=${stake.activeDraws})`,
    );
}

/** Validate a stake/unstake `amount` is a positive u64 (lib.rs:208 / 270). */
export function assertValidAmount(amount: bigint): void {
  if (amount <= 0n)
    throw new Error(`InvalidAmount: expected > 0, got ${amount}`);
  if (amount > U64_MAX)
    throw new Error(`InvalidAmount: exceeds u64, got ${amount}`);
}

/** u64 → 8-byte little-endian. */
function le8(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}

/** JurorStake PDA seeds (state.rs:1732): `["stake", subaccord, juror]`. */
export function jurorStakeSeeds(
  subaccordBytes: Uint8Array,
  jurorBytes: Uint8Array,
): Uint8Array[] {
  if (subaccordBytes.length !== 32)
    throw new Error("InvalidSubaccord: expected 32 bytes");
  if (jurorBytes.length !== 32)
    throw new Error("InvalidJuror: expected 32 bytes");
  return [SEED_JUROR_STAKE, subaccordBytes, jurorBytes];
}

/** Derive the canonical JurorStake PDA. Kit lazy-imported. */
export async function findJurorStakePda(
  programAddress: Address,
  subaccord: Address,
  juror: Address,
): Promise<{ address: Address; bump: number }> {
  const { getAddressEncoder, getProgramDerivedAddress } =
    await import("@solana/kit");
  const enc = getAddressEncoder();
  const [address, bump] = await getProgramDerivedAddress({
    programAddress,
    seeds: jurorStakeSeeds(
      new Uint8Array(enc.encode(subaccord)),
      new Uint8Array(enc.encode(juror)),
    ),
  });
  return { address, bump };
}

/** Accounts shared by `stake` / `unstake` (the juror signs). */
export interface StakingAccounts {
  juror: Address;
  subaccord: Address;
  /** `stake` only — the ADR-0007 circuit breaker (unstake is never halted). */
  pauseState?: Address;
  jurorStake: Address;
  stakingToken: Address;
  /** Juror's ATA of the staking token (source on stake, dest on unstake). */
  jurorTokenAccount: Address;
  /** Subaccord PDA's stake_vault ATA (dest on stake, source on unstake). */
  stakeVault: Address;
}

/**
 * Seam to the Codama-generated Kit client + JurorStake fetcher. Foundation
 * wires the concrete adapter; staking.ts stays orchestration-only.
 *
 * ADR-0012: `stake`/`unstake` take a client-supplied accumulator `path`
 * (sibling hash + sum per level). The chain verifies it against the stored
 * root and recomputes a new canonical root — O(log N). A wrong path reverts;
 * build it via `proofFor(tree, jurorIndex)` from `./mst.js`.
 */
export interface AccordStakingClient {
  buildStake(input: {
    programId: Address;
    accounts: StakingAccounts;
    amount: bigint;
    path: MSTNode[];
  }): Instruction;
  buildRequestWithdraw(input: {
    programId: Address;
    accounts: StakingAccounts;
    amount: bigint;
    path: MSTNode[];
  }): Instruction;
  buildWithdraw(input: {
    programId: Address;
    accounts: StakingAccounts;
  }): Instruction;
  buildReconcileStake(input: {
    programId: Address;
    accounts: StakingAccounts;
    path: MSTNode[];
  }): Instruction;
  /** Fetch the decoded JurorStake fields the guard needs. */
  fetchJurorStake(jurorStake: Address): Promise<JurorStakeView | null>;
  /** Build `withdraw_fees` (ADR-0020). */
  buildWithdrawFees(input: {
    programId: Address;
    accounts: WithdrawFeesAccounts;
  }): Instruction;
}

/** Build `stake` (lib.rs). SPL-transfers `amount` into the vault. */
export function stake(
  client: AccordStakingClient,
  programId: Address,
  accounts: StakingAccounts,
  amount: bigint,
  path: MSTNode[],
): Instruction {
  assertValidAmount(amount);
  // An empty `path` is the canonical proof for a depth-0 Subaccord (single
  // leaf = root). The on-chain verifier authenticates the path against the
  // stored root + depth; do not reject it here (REVIEW #13).
  return client.buildStake({ programId, accounts, amount, path });
}

/**
 * Build `request_withdraw` (lib.rs) — phase 1 of the two-phase withdraw
 * (REVIEW #5). Ledger-only: subtracts `amount` from `JurorStake.amount`, banks
 * it in `pending_withdrawal`, and recomputes the accumulator root. No tokens
 * move; no `active_draws` gate (the lock is enforced at `withdraw`). Allowed
 * while paused. `path` is the juror's accumulator proof (ADR-0012).
 *
 * Precondition: `settlementDelta == 0` — call `reconcileStake` first when the
 * juror has a pending reward/slash. DRY with `reconcileStake` (the delta fold
 * lives in one place); withdraw only ever reads the canonical `amount`.
 */
export function requestWithdraw(
  client: AccordStakingClient,
  programId: Address,
  accounts: StakingAccounts,
  amount: bigint,
  path: MSTNode[],
): Instruction {
  assertValidAmount(amount);
  // Empty `path` is valid for depth-0 Subaccords (REVIEW #13).
  return client.buildRequestWithdraw({ programId, accounts, amount, path });
}

/**
 * Build `withdraw` (lib.rs:407) — phase 2 of the two-phase withdraw. Moves the
 * banked `pending_withdrawal` from the vault to the juror's ATA. On-chain gates:
 * `WITHDRAWAL_DELAY` elapsed since `request_withdraw` AND `active_draws == 0`.
 * No args — reads `pending_withdrawal` from `JurorStake`.
 */
export function withdraw(
  client: AccordStakingClient,
  programId: Address,
  accounts: StakingAccounts,
): Instruction {
  if (
    !accounts.stakingToken ||
    !accounts.jurorTokenAccount ||
    !accounts.stakeVault
  ) {
    throw new Error(
      "InvalidWithdrawAccounts: withdraw requires stakingToken, jurorTokenAccount, stakeVault",
    );
  }
  return client.buildWithdraw({ programId, accounts });
}

/**
 * Build `reconcile_stake` (lib.rs:460) — permissionless crank (REVIEW #4) that
 * folds a juror's `settlement_delta` into their canonical `amount` and updates
 * the accumulator root via a Merkle proof. After reconcile, the ledger and the
 * accumulator agree again. No tokens move; any caller may trigger it. `path` is
 * the juror's accumulator proof (ADR-0012).
 */
export function reconcileStake(
  client: AccordStakingClient,
  programId: Address,
  accounts: StakingAccounts,
  path: MSTNode[],
): Instruction {
  // Empty `path` is valid for depth-0 Subaccords (REVIEW #13).
  return client.buildReconcileStake({ programId, accounts, path });
}

/** Accounts for `withdraw_fees` (ADR-0020). */
export interface WithdrawFeesAccounts {
  juror: Address;
  subaccord: Address;
  jurorStake: Address;
  feeToken: Address;
  /** Juror's ATA of the fee token (withdraw destination). */
  jurorFeeTokenAccount: Address;
  /** Subaccord PDA's fee_vault ATA (withdraw source). */
  feeVault: Address;
}

/**
 * Build `withdraw_fees` (ADR-0020). Per-juror: pulls aggregate `fees_earned`
 * from the Subaccord's `fee_vault` → the juror's `fee_token` ATA. No
 * `active_draws` gate, no timelock — earned fees are not at-risk capital.
 */
export function withdrawFees(
  client: AccordStakingClient,
  programId: Address,
  accounts: WithdrawFeesAccounts,
): Instruction {
  return client.buildWithdrawFees({ programId, accounts });
}
