// staking.test.ts — runnable self-check for the staking guards (active_draws /
// balance / amount). The active_draws guard is the test-matrix row 4 acceptance.
// Excluded from the build; run via: pnpm --filter @accord/sdk test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertCanUnstake,
  assertValidAmount,
  canUnstake,
  jurorStakeSeeds,
  type JurorStakeView,
} from "./staking.ts";

const stake = (over: Partial<JurorStakeView>): JurorStakeView => ({
  juror: "11111111111111111111111111111111" as never,
  amount: 1_000n,
  activeDraws: 0,
  ...over,
});

test("canUnstake: ok when active_draws == 0 and amount within balance", () => {
  assert.deepEqual(canUnstake(stake({}), 1_000n), { ok: true });
  assert.deepEqual(canUnstake(stake({}), 1n), { ok: true });
  assert.deepEqual(canUnstake(stake({ amount: 500n }), 500n), { ok: true });
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

test("canUnstake: InsufficientBalance when amount > stake.amount", () => {
  assert.equal(
    canUnstake(stake({ amount: 100n }), 101n).reason,
    "InsufficientBalance",
  );
  // active_draws takes precedence over balance (it's checked first on-chain)
  assert.equal(
    canUnstake(stake({ amount: 100n, activeDraws: 2 }), 999n).reason,
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
    () => assertCanUnstake(stake({ amount: 10n }), 500n),
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
