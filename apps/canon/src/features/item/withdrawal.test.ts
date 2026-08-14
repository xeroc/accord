/**
 * withdrawal.test.ts — unit tests for the pure withdrawal logic (accord-etf5).
 *
 * Covers the eligibility predicate (submitter-only + Listed), the
 * WithdrawPending check, and the countdown-deadline / seconds-left math over
 * the Kit `Option<bigint>` timestamp. No RPC, no React.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ItemState, type CanonItem, type CanonList } from "@useaccord/canon";
import {
  canRequestWithdrawal,
  isWithdrawPending,
  optionValue,
  withdrawalDeadline,
  withdrawalSecondsLeft,
} from "./withdrawal";

const SUBMITTER = "9xQeWvG8Z3...submitter" as CanonItem["submitter"];
const OTHER = "OtherWalletPayerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

function makeItem(over: Partial<CanonItem> = {}): CanonItem {
  return {
    discriminator: new Uint8Array(8),
    account: "AccountPdaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as CanonItem["account"],
    list: "ListPdaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as CanonItem["list"],
    submitter: SUBMITTER,
    state: ItemState.Listed,
    accumulatedStake: 500n,
    submittedAt: 1000n,
    challengeCount: 0,
    activeDispute: "11111111111111111111111111111111" as CanonItem["activeDispute"],
    challenger: "11111111111111111111111111111111" as CanonItem["challenger"],
    challengeStake: 0n,
    challengedAt: 0n,
    withdrawalRequestedAt: { __option: "None" },
    bump: 255,
    ...over,
  };
}

function makeList(over: Partial<CanonList> = {}): CanonList {
  return {
    discriminator: new Uint8Array(8),
    creator: "CreatorXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as CanonList["creator"],
    stakeMint: "StakeMintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as CanonList["stakeMint"],
    feeMint: "FeeMintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as CanonList["feeMint"],
    listProgram:
      "11111111111111111111111111111111" as CanonList["listProgram"],
    rulesHash: new Uint8Array(32),
    subaccord:
      "SubcordXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as CanonList["subaccord"],
    submitDeposit: 500n,
    challengePct: 5000,
    listingWindow: BigInt(5 * 86_400),
    withdrawalTimelock: BigInt(5 * 86_400),
    authority: "AuthXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" as CanonList["authority"],
    itemCount: 1,
    disputeCount: 0n,
    bump: 255,
    ...over,
  };
}

// --- optionValue -----------------------------------------------------------

test("optionValue unwraps Some and nulls None", () => {
  assert.equal(optionValue({ __option: "Some", value: 7n }), 7n);
  assert.equal(optionValue({ __option: "None" }), null);
});

// --- isWithdrawPending -----------------------------------------------------

test("isWithdrawPending is true only for WithdrawPending", () => {
  assert.equal(isWithdrawPending(makeItem({ state: ItemState.WithdrawPending })), true);
  assert.equal(isWithdrawPending(makeItem({ state: ItemState.Listed })), false);
  assert.equal(isWithdrawPending(makeItem({ state: ItemState.Pending })), false);
});

// --- canRequestWithdrawal --------------------------------------------------

test("canRequestWithdrawal: Listed + submitter => true", () => {
  assert.equal(canRequestWithdrawal(makeItem(), SUBMITTER), true);
});

test("canRequestWithdrawal: wrong wallet => false", () => {
  assert.equal(canRequestWithdrawal(makeItem(), OTHER), false);
});

test("canRequestWithdrawal: no wallet => false", () => {
  assert.equal(canRequestWithdrawal(makeItem(), null), false);
});

test("canRequestWithdrawal: not Listed => false (even as submitter)", () => {
  for (const state of [
    ItemState.Pending,
    ItemState.Removed,
    ItemState.WithdrawPending,
    ItemState.Disputed,
  ]) {
    assert.equal(
      canRequestWithdrawal(makeItem({ state }), SUBMITTER),
      false,
      `state ${state} must not be withdrawable`,
    );
  }
});

// --- withdrawalDeadline ----------------------------------------------------

test("withdrawalDeadline: requestedAt + timelock", () => {
  const item = makeItem({
    state: ItemState.WithdrawPending,
    withdrawalRequestedAt: { __option: "Some", value: 1_000n },
  });
  const list = makeList({ withdrawalTimelock: 5n * 86_400n });
  // 1000 + 5*86400 = 432001
  assert.equal(withdrawalDeadline(item, list), 1_000 + 5 * 86_400);
});

test("withdrawalDeadline: None => null", () => {
  const item = makeItem({ withdrawalRequestedAt: { __option: "None" } });
  assert.equal(withdrawalDeadline(item, makeList()), null);
});

// --- withdrawalSecondsLeft -------------------------------------------------

test("withdrawalSecondsLeft: positive before deadline", () => {
  const item = makeItem({
    state: ItemState.WithdrawPending,
    withdrawalRequestedAt: { __option: "Some", value: 1_000n },
  });
  const list = makeList({ withdrawalTimelock: 600n });
  // deadline = 1600; now = 1000 => 600s left
  assert.equal(withdrawalSecondsLeft(item, list, 1_000), 600);
});

test("withdrawalSecondsLeft: negative after deadline (withdrawable)", () => {
  const item = makeItem({
    state: ItemState.WithdrawPending,
    withdrawalRequestedAt: { __option: "Some", value: 1_000n },
  });
  const list = makeList({ withdrawalTimelock: 600n });
  // deadline = 1600; now = 2000 => -400 (elapsed)
  assert.equal(withdrawalSecondsLeft(item, list, 2_000), -400);
});

test("withdrawalSecondsLeft: None => null", () => {
  const item = makeItem({ withdrawalRequestedAt: { __option: "None" } });
  assert.equal(withdrawalSecondsLeft(item, makeList(), 1_000), null);
});
