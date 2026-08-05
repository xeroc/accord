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

/** JurorStake PDA seed prefix (state.rs: SEED_JUROR_STAKE = b"stake"). */
const SEED_JUROR_STAKE = new Uint8Array([115, 116, 97, 107, 101]); // "stake"

const U64_MAX = 0xffffffffffffffffn;

/** The decoded JurorStake fields the guard + caller need. */
export interface JurorStakeView {
  juror: Address;
  amount: bigint;
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
  if (amount > stake.amount)
    return { ok: false, reason: "InsufficientBalance" };
  return { ok: true };
}

/** Throw a typed `Error` if the unstake would revert on-chain. */
export function assertCanUnstake(stake: JurorStakeView, amount: bigint): void {
  const g = canUnstake(stake, amount);
  if (!g.ok)
    throw new Error(
      `${g.reason}: cannot unstake ${amount} (amount=${stake.amount}, activeDraws=${stake.activeDraws})`,
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
  const { getAddressEncoder, getProgramDerivedAddress } = await import(
    "@solana/kit"
  );
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
  /** Subaccord PDA's vault ATA (dest on stake, source on unstake). */
  vault: Address;
}

/**
 * Seam to the Codama-generated Kit client + JurorStake fetcher. Foundation
 * wires the concrete adapter; staking.ts stays orchestration-only.
 */
export interface AccordStakingClient {
  buildStake(input: {
    programId: Address;
    accounts: StakingAccounts;
    amount: bigint;
  }): Instruction;
  buildUnstake(input: {
    programId: Address;
    accounts: StakingAccounts;
    amount: bigint;
  }): Instruction;
  /** Fetch the decoded JurorStake fields the guard needs. */
  fetchJurorStake(jurorStake: Address): Promise<JurorStakeView | null>;
}

/** Build `stake` (lib.rs:206). SPL-transfers `amount` into the vault. */
export function stake(
  client: AccordStakingClient,
  programId: Address,
  accounts: StakingAccounts,
  amount: bigint,
): Instruction {
  assertValidAmount(amount);
  return client.buildStake({ programId, accounts, amount });
}

/**
 * Build `unstake` (lib.rs:270). Pre-checks the live `JurorStake` via the seam
 * fetcher and rejects BEFORE building the tx if `active_draws > 0` (or amount
 * is invalid / exceeds balance) — matches the on-chain `StakeLocked` revert.
 *
 * Pass the fetched `JurorStakeView` to avoid an extra fetch, or omit it to let
 * the facade fetch by PDA.
 */
export async function unstake(
  client: AccordStakingClient,
  programId: Address,
  accounts: StakingAccounts,
  amount: bigint,
  stakeView?: JurorStakeView,
): Promise<Instruction> {
  assertValidAmount(amount);
  const view = stakeView ?? (await client.fetchJurorStake(accounts.jurorStake));
  if (!view) throw new Error(`JurorStakeNotFound: ${accounts.jurorStake}`);
  assertCanUnstake(view, amount);
  return client.buildUnstake({ programId, accounts, amount });
}
