// staking.test.ts — runnable self-check for the staking guards (active_draws /
// balance / amount). The active_draws guard is the test-matrix row 4 acceptance.
// Excluded from the build; run via: pnpm --filter @useaccord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertCanUnstake,
  assertValidAmount,
  canUnstake,
  jurorStakeSeeds,
  reconcileStake,
  requestWithdraw,
  stake as buildStakeIx,
  type AccordStakingClient,
  type JurorStakeView,
  type StakingAccounts,
} from "../../dist/methods/staking.js";
import { buildAccumulator, proofFor, type MSTNode } from "../../dist/methods/mst.js";
import type { Instruction } from "@solana/kit";

const stake = (over: Partial<JurorStakeView>): JurorStakeView => ({
  juror: "11111111111111111111111111111111" as never,
  staked: 1_000n,
  activeDraws: 0,
  ...over,
});

test("canUnstake: ok when active_draws == 0 and amount within balance", () => {
  assert.deepEqual(canUnstake(stake({}), 1_000n), { ok: true });
  assert.deepEqual(canUnstake(stake({}), 1n), { ok: true });
  assert.deepEqual(canUnstake(stake({ staked: 500n }), 500n), { ok: true });
});

test("canUnstake: StakeLocked when active_draws > 0 (matches on-chain revert)", () => {
  const g = canUnstake(stake({ activeDraws: 1 }), 100n);
  assert.equal(g.ok, false);
  assert.equal(g.reason, "StakeLocked");
  // multiple open draws still locked
  assert.equal(
    canUnstake(stake({ activeDraws: 3 }), 100n).reason,
    "StakeLocked",
  );
});

test("canUnstake: InsufficientBalance when amount > stake.staked", () => {
  assert.equal(
    canUnstake(stake({ staked: 100n }), 101n).reason,
    "InsufficientBalance",
  );
  // active_draws takes precedence over balance (it's checked first on-chain)
  assert.equal(
    canUnstake(stake({ staked: 100n, activeDraws: 2 }), 999n).reason,
    "StakeLocked",
  );
});

test("canUnstake: InvalidAmount when amount <= 0", () => {
  assert.equal(canUnstake(stake({}), 0n).reason, "InvalidAmount");
  assert.equal(canUnstake(stake({}), -1n).reason, "InvalidAmount");
});

test("assertCanUnstake: throws typed message matching the reason", () => {
  assert.doesNotThrow(() => assertCanUnstake(stake({}), 500n));
  assert.throws(
    () => assertCanUnstake(stake({ activeDraws: 1 }), 500n),
    /StakeLocked/,
  );
  assert.throws(
    () => assertCanUnstake(stake({ staked: 10n }), 500n),
    /InsufficientBalance/,
  );
  assert.throws(() => assertCanUnstake(stake({}), 0n), /InvalidAmount/);
});

test("assertValidAmount: positive u64", () => {
  assertValidAmount(1n);
  assertValidAmount(1_000_000n);
  assert.throws(() => assertValidAmount(0n), /InvalidAmount/);
  assert.throws(() => assertValidAmount(-5n), /InvalidAmount/);
});

test("jurorStakeSeeds: [b'stake', subaccord[32], juror[32]]", () => {
  const sub = new Uint8Array(32).fill(0x01);
  const jur = new Uint8Array(32).fill(0x02);
  const seeds = jurorStakeSeeds(sub, jur);
  assert.equal(seeds.length, 3);
  assert.deepEqual(Array.from(seeds[0]!), [115, 116, 97, 107, 101]); // "stake"
  assert.equal(seeds[1]!.length, 32);
  assert.equal(seeds[2]!.length, 32);
  assert.throws(
    () => jurorStakeSeeds(new Uint8Array(31), jur),
    /InvalidSubaccord/,
  );
  assert.throws(() => jurorStakeSeeds(sub, new Uint8Array(33)), /InvalidJuror/);
});

// --- REVIEW #13: depth-0 Subaccords use an empty (canonical) accumulator proof -

/** A recording seam: captures the path each builder was called with. */
function recordingClient(): {
  seen: Record<string, MSTNode[]>;
  client: AccordStakingClient;
} {
  const seen: Record<string, MSTNode[]> = {};
  const I = {} as Instruction;
  return {
    seen,
    client: {
      buildStake: (i) => ((seen.stake = i.path), I),
      buildRequestWithdraw: (i) => ((seen.requestWithdraw = i.path), I),
      buildWithdraw: () => I,
      buildReconcileStake: (i) => ((seen.reconcile = i.path), I),
      fetchJurorStake: async () => null,
    },
  };
}

const ACCOUNTS: StakingAccounts = {
  juror: "J".repeat(44) as never,
  subaccord: "S".repeat(44) as never,
  jurorStake: "JS".repeat(22) as never,
  stakingToken: "T".repeat(44) as never,
  jurorTokenAccount: "JT".repeat(22) as never,
  vault: "V".repeat(44) as never,
};
const PROGRAM = "P".repeat(44) as never;

test("depth-0 accumulator: proofFor yields the canonical empty path (REVIEW #13)", async () => {
  const tree = await buildAccumulator(
    [{ juror: new Uint8Array(32).fill(7), stake: 1_000n }],
    0,
  );
  assert.equal(tree.depth, 0);
  assert.equal(tree.leaves.length, 1);
  const path = await proofFor(tree, 0);
  assert.deepEqual(path, [], "depth-0 proof must be the empty path");
});

test("stake/requestWithdraw/reconcileStake accept an empty path (REVIEW #13)", () => {
  const { seen, client } = recordingClient();
  // Previously these threw "InvalidPath" on []. Depth-0 Subaccords need [].
  buildStakeIx(client, PROGRAM, ACCOUNTS, 1_000n, []);
  requestWithdraw(client, PROGRAM, ACCOUNTS, 1_000n, []);
  reconcileStake(client, PROGRAM, ACCOUNTS, []);
  assert.deepEqual(seen.stake, []);
  assert.deepEqual(seen.requestWithdraw, []);
  assert.deepEqual(seen.reconcile, []);
});
