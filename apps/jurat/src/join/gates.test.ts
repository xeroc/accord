/**
 * gates.test.ts — join-gate evaluator table suite (bean accord-spht AC:
 * "table-driven unit tests incl. boundary cases; every reject path carries
 * a reason"). Pure Subaccord → JoinDecision; no chain access anywhere.
 */

import { describe, expect, test } from "bun:test";
import { address, type Address } from "@solana/kit";
import { Aggregation, ShortfallPolicy, type Subaccord } from "@useaccord/sdk";

import {
  evaluateJoinGate,
  type JoinContext,
  type JoinPolicy,
  type JoinRejectReason,
} from "./gates.js";

// --- fixtures ----------------------------------------------------------------

const addr = (tail: string): Address => address("1".repeat(31) + tail);

const STAKING_TOKEN = addr("2");
const FEE_TOKEN = addr("3");
const DEFAULT_PUBKEY = address("1".repeat(32));

function subaccordFixture(overrides: Partial<Subaccord> = {}): Subaccord {
  return {
    discriminator: new Uint8Array(8),
    creator: DEFAULT_PUBKEY,
    stakingToken: STAKING_TOKEN,
    feeToken: FEE_TOKEN,
    minStake: 1_000n,
    alphaBps: 1_000,
    reviewWindow: 604_800n,
    commitWindow: 172_800n,
    revealWindow: 172_800n,
    appealWindow: 259_200n,
    maxAppeals: 3,
    minJurySize: 3,
    aggregation: Aggregation.Plurality,
    feePerJuror: 50n,
    revealThresholdBps: 6_666,
    shortfallPolicy: ShortfallPolicy.Redraw,
    maxDrawAttempts: 2,
    coherenceTolBps: 0,
    authority: DEFAULT_PUBKEY,
    evidenceOperator: DEFAULT_PUBKEY,
    domainRef: new Uint8Array(32),
    evidenceSpec: new Uint8Array(32),
    jurorCredential: DEFAULT_PUBKEY,
    jurorSchema: DEFAULT_PUBKEY,
    stakerCount: 3,
    rootHash: new Uint8Array(32),
    totalStake: 3_000n,
    nextIndex: 3,
    depth: 16,
    feeVaultDeposited: 0n,
    feeVaultWithdrawn: 0n,
    stakeVaultDeposited: 3_000n,
    stakeVaultWithdrawn: 0n,
    freeHead: 0xffff_ffff,
    bump: 255,
    padding: new Uint8Array(64),
    ...overrides,
  } as Subaccord;
}

const POLICY: JoinPolicy = {
  stakingTokenAllowlist: new Set([STAKING_TOKEN]),
  feeTokenAllowlist: new Set([FEE_TOKEN]),
  minStakeRange: { min: 100n, max: 10_000n },
  feePerJurorRange: { min: 0n, max: 1_000n },
  alphaBpsCap: 2_000,
  commitWindowFloorSecs: 86_400n,
  globalStakeBudget: 2_000n,
  perSubaccordCap: 1_500n,
  reserveFloor: 100n,
};

/** Default context: nothing staked elsewhere, funded well above the floor. */
const CTX: JoinContext = { stakedElsewhere: 0n, stakingTokenBalance: 1_200n }; // min 1_000 + floor 100

// --- the suite ---------------------------------------------------------------

describe("evaluateJoinGate — accept", () => {
  test("baseline pool with every parameter inside the policy joins", () => {
    expect(evaluateJoinGate(subaccordFixture(), POLICY, CTX)).toEqual({
      ok: true,
    });
  });

  test("every boundary value at its exact limit still joins", () => {
    const edge = subaccordFixture({
      minStake: 100n, // == range min
      alphaBps: 2_000, // == cap
      commitWindow: 86_400n, // == floor
      feePerJuror: 1_000n, // == range max
    });
    const ctx: JoinContext = {
      stakedElsewhere: 1_900n, // 1_900 + min 100 == budget exactly
      stakingTokenBalance: 200n, // min 100 + floor 100 == balance exactly
    };
    expect(evaluateJoinGate(edge, POLICY, ctx)).toEqual({ ok: true });
  });
});

describe("evaluateJoinGate — reject table", () => {
  const cases: Array<{
    name: string;
    overrides?: Partial<Subaccord>;
    ctx?: Partial<JoinContext>;
    policy?: Partial<JoinPolicy>;
    reason: JoinRejectReason;
    detailMatch: RegExp;
  }> = [
    {
      name: "staking token off the allowlist",
      overrides: { stakingToken: addr("4") },
      reason: "StakingTokenNotAllowed",
      detailMatch: /staking token .* not allowlisted/,
    },
    {
      name: "fee token off the allowlist",
      overrides: { feeToken: addr("4") },
      reason: "FeeTokenNotAllowed",
      detailMatch: /fee token .* not allowlisted/,
    },
    {
      name: "pool min_stake below configured minimum",
      overrides: { minStake: 99n },
      reason: "MinStakeOutOfRange",
      detailMatch: /min_stake 99 < 100/,
    },
    {
      name: "pool min_stake above configured maximum",
      overrides: { minStake: 10_001n },
      reason: "MinStakeOutOfRange",
      detailMatch: /min_stake 10001 > 10000/,
    },
    {
      name: "fee_per_juror above configured maximum",
      overrides: { feePerJuror: 1_001n },
      reason: "FeePerJurorOutOfRange",
      detailMatch: /fee_per_juror 1001 > 1000/,
    },
    {
      name: "alpha_bps one basis point over the cap",
      overrides: { alphaBps: 2_001 },
      reason: "AlphaTooHigh",
      detailMatch: /alpha_bps 2001 > 2000/,
    },
    {
      name: "Median aggregation (v1 is Plurality-only)",
      overrides: { aggregation: Aggregation.Median },
      reason: "NonPluralityAggregation",
      detailMatch: /Median/,
    },
    {
      name: "commit window one second under the floor",
      overrides: { commitWindow: 86_399n },
      reason: "CommitWindowTooShort",
      detailMatch: /commit_window 86399 < 86400/,
    },
    {
      name: "pool minimum over the per-subaccord cap",
      policy: { perSubaccordCap: 999n },
      reason: "OverSubaccordCap",
      detailMatch: /stake 1000 > per-subaccord cap 999/,
    },
    {
      name: "join would exceed the global stake budget",
      ctx: { stakedElsewhere: 1_001n },
      reason: "OverGlobalBudget",
      detailMatch: /1001 \+ 1000 > 2000/,
    },
    {
      name: "balance cannot cover stake plus reserve floor",
      ctx: { stakingTokenBalance: 1_099n },
      reason: "InsufficientReserve",
      detailMatch: /1099 < 1000 \+ 100/,
    },
    {
      name: "zero pool minimum (stake would carry no draw weight)",
      overrides: { minStake: 0n },
      reason: "MinStakeOutOfRange",
      detailMatch: /min_stake 0 — staking zero carries no draw weight/,
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const decision = evaluateJoinGate(
        subaccordFixture(c.overrides),
        { ...POLICY, ...c.policy },
        { ...CTX, ...c.ctx },
      );
      expect(decision.ok).toBe(false);
      if (!decision.ok) {
        expect(decision.reason).toBe(c.reason);
        expect(decision.detail).toMatch(c.detailMatch);
      }
    });
  }

  test("reserve gate is skipped when the balance is unknown (executor re-checks live)", () => {
    const decision = evaluateJoinGate(subaccordFixture(), POLICY, {
      stakedElsewhere: 0n,
      stakingTokenBalance: undefined,
    });
    expect(decision).toEqual({ ok: true });
  });
});
