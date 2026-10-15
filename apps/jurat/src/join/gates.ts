/**
 * gates.ts — the pure join-gate evaluator (bean accord-spht, feature
 * accord-n5v4; milestone accord-g69g decision 3: "full conservative set,
 * all config-driven").
 *
 * Subaccord → {@link JoinDecision} with a reason on every reject. The
 * evaluator is the *worthiness* half of join policy: it decides whether a
 * pool belongs in Jurat's portfolio at all (token allowlists, pool
 * economics, aggregation rule, agent runtime budget) plus the static
 * budget/cap/reserve arithmetic. The executor (./executor.ts) remains the
 * send-time guard over live balances and the joined book — the two layers
 * read different data (config + scan state here, live chain there), so both
 * run.
 *
 * Boundary semantics: every limit is inclusive at the edge (min_stake ==
 * range min joins; alpha_bps == cap joins; budget consumed == budget joins).
 */

import type { Address } from "@solana/kit";
import { Aggregation, type Subaccord } from "@useaccord/sdk";

/** Config-fed policy (src/config.ts, bean accord-jxpn). */
export interface JoinPolicy {
  /** Allowed collateral mints; a pool's `staking_token` must be in it. */
  readonly stakingTokenAllowlist: ReadonlySet<Address>;
  /** Allowed compensation mints; a pool's `fee_token` must be in it. */
  readonly feeTokenAllowlist: ReadonlySet<Address>;
  /** Acceptable pool `min_stake` range (join-worthiness, inclusive). */
  readonly minStakeRange: { readonly min: bigint; readonly max: bigint };
  /** Acceptable pool `fee_per_juror` range (inclusive). */
  readonly feePerJurorRange: { readonly min: bigint; readonly max: bigint };
  /** Max tolerated `alpha_bps` (slash exposure). */
  readonly alphaBpsCap: number;
  /** Minimum `commit_window` in seconds — the agent runtime budget. */
  readonly commitWindowFloorSecs: bigint;
  /** Amount staked per join (shared with the executor's JoinBudget). */
  readonly stakeAmount: bigint;
  /** Max total staked across all joined Subaccords. */
  readonly globalStakeBudget: bigint;
  /** Max staked in any single Subaccord. */
  readonly perSubaccordCap: bigint;
  /** Staking-token balance Jurat must always retain. */
  readonly reserveFloor: bigint;
}

/**
 * Scan-time context the evaluator cannot derive from the Subaccord alone.
 * `stakingTokenBalance` may be unknown at scan time — the reserve gate is
 * skipped then and the executor enforces it against the live balance before
 * sending.
 */
export interface JoinContext {
  /** Already staked in OTHER Subaccords (joined-book sum, this pool excluded). */
  readonly stakedElsewhere?: bigint;
  /** Juror's staking-token ATA balance, when known. */
  readonly stakingTokenBalance?: bigint;
}

export type JoinRejectReason =
  | "StakingTokenNotAllowed"
  | "FeeTokenNotAllowed"
  | "MinStakeOutOfRange"
  | "FeePerJurorOutOfRange"
  | "AlphaTooHigh"
  | "NonPluralityAggregation"
  | "CommitWindowTooShort"
  | "OverGlobalBudget"
  | "OverSubaccordCap"
  | "InsufficientReserve";

export type JoinDecision =
  | { ok: true }
  | {
      ok: false;
      reason: JoinRejectReason;
      detail: string;
    };

/** Evaluate the full gate set. Order: static pool shape, then budget. */
export function evaluateJoinGate(
  sub: Subaccord,
  policy: JoinPolicy,
  ctx: JoinContext = {},
): JoinDecision {
  if (!policy.stakingTokenAllowlist.has(sub.stakingToken)) {
    return {
      ok: false,
      reason: "StakingTokenNotAllowed",
      detail: `staking token ${sub.stakingToken} not allowlisted`,
    };
  }
  if (!policy.feeTokenAllowlist.has(sub.feeToken)) {
    return {
      ok: false,
      reason: "FeeTokenNotAllowed",
      detail: `fee token ${sub.feeToken} not allowlisted`,
    };
  }
  if (sub.minStake < policy.minStakeRange.min) {
    return {
      ok: false,
      reason: "MinStakeOutOfRange",
      detail: `min_stake ${sub.minStake} < ${policy.minStakeRange.min}`,
    };
  }
  if (sub.minStake > policy.minStakeRange.max) {
    return {
      ok: false,
      reason: "MinStakeOutOfRange",
      detail: `min_stake ${sub.minStake} > ${policy.minStakeRange.max}`,
    };
  }
  if (sub.feePerJuror < policy.feePerJurorRange.min) {
    return {
      ok: false,
      reason: "FeePerJurorOutOfRange",
      detail: `fee_per_juror ${sub.feePerJuror} < ${policy.feePerJurorRange.min}`,
    };
  }
  if (sub.feePerJuror > policy.feePerJurorRange.max) {
    return {
      ok: false,
      reason: "FeePerJurorOutOfRange",
      detail: `fee_per_juror ${sub.feePerJuror} > ${policy.feePerJurorRange.max}`,
    };
  }
  if (sub.alphaBps > policy.alphaBpsCap) {
    return {
      ok: false,
      reason: "AlphaTooHigh",
      detail: `alpha_bps ${sub.alphaBps} > ${policy.alphaBpsCap}`,
    };
  }
  if (sub.aggregation !== Aggregation.Plurality) {
    return {
      ok: false,
      reason: "NonPluralityAggregation",
      detail: `aggregation ${Aggregation[sub.aggregation]} — v1 joins Plurality pools only (Median is v2)`,
    };
  }
  if (sub.commitWindow < policy.commitWindowFloorSecs) {
    return {
      ok: false,
      reason: "CommitWindowTooShort",
      detail: `commit_window ${sub.commitWindow} < ${policy.commitWindowFloorSecs} (agent runtime budget)`,
    };
  }
  if (policy.stakeAmount > policy.perSubaccordCap) {
    return {
      ok: false,
      reason: "OverSubaccordCap",
      detail: `stake amount ${policy.stakeAmount} > per-subaccord cap ${policy.perSubaccordCap}`,
    };
  }
  const stakedElsewhere = ctx.stakedElsewhere ?? 0n;
  if (stakedElsewhere + policy.stakeAmount > policy.globalStakeBudget) {
    return {
      ok: false,
      reason: "OverGlobalBudget",
      detail: `${stakedElsewhere} + ${policy.stakeAmount} > ${policy.globalStakeBudget}`,
    };
  }
  if (
    ctx.stakingTokenBalance !== undefined &&
    ctx.stakingTokenBalance < policy.stakeAmount + policy.reserveFloor
  ) {
    return {
      ok: false,
      reason: "InsufficientReserve",
      detail: `${ctx.stakingTokenBalance} < ${policy.stakeAmount} + ${policy.reserveFloor} (reserve floor)`,
    };
  }
  return { ok: true };
}
