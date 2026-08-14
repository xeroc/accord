/**
 * canon-state.test.ts — unit tests for the pure Canon item crank resolver
 * (bean accord-7fj6).
 *
 * Gates mirror programs/canon/src/instructions/{advance_pending,withdrawal,
 * settle_item}.rs exactly: `now` is a Unix-seconds timestamp matching
 * `Clock::get().unix_timestamp`.
 */
import { test, expect } from "bun:test";
import { address } from "@solana/kit";
import { ItemState, type CanonItem, type CanonList } from "@useaccord/canon";

import { resolveCanonAction } from "./canon-state.js";

const A = address("11111111111111111111111111111111");
const LIST = address("List111111111111111111111111111111111111111");

function list(over: Partial<CanonList> = {}): CanonList {
  return {
    discriminator: new Uint8Array(8),
    creator: A,
    stakeMint: A,
    feeMint: A,
    listProgram: A,
    rulesHash: new Uint8Array(32),
    subaccord: A,
    submitDeposit: 500n,
    challengePct: 5_000,
    listingWindow: 432_000n, // 5 days
    withdrawalTimelock: 432_000n,
    authority: LIST,
    itemCount: 1,
    disputeCount: 0n,
    bump: 0,
    ...over,
  };
}

function item(over: Partial<CanonItem> & Pick<CanonItem, "state"> = {} as never): CanonItem {
  return {
    discriminator: new Uint8Array(8),
    account: A,
    list: LIST,
    submitter: A,
    accumulatedStake: 500n,
    submittedAt: 1_000n,
    challengeCount: 0,
    activeDispute: A,
    challenger: A,
    challengeStake: 0n,
    challengedAt: 0n,
    withdrawalRequestedAt: { __option: "None" },
    bump: 0,
    ...over,
  };
}

test("Pending item past listing_window → advance_pending", () => {
  const i = item({ state: ItemState.Pending, submittedAt: 1_000n });
  expect(resolveCanonAction(i, list(), false, 1_000n + 432_000n)).toEqual({
    kind: "advance_pending",
  });
});

test("Pending item inside listing_window → null", () => {
  const i = item({ state: ItemState.Pending, submittedAt: 1_000n });
  expect(resolveCanonAction(i, list(), false, 1_000n + 432_000n - 1n)).toBeNull();
});

test("Disputed item with Final dispute → settle_item; not final → null", () => {
  const i = item({ state: ItemState.Disputed });
  expect(resolveCanonAction(i, list(), true, 2_000n)).toEqual({ kind: "settle_item" });
  expect(resolveCanonAction(i, list(), false, 2_000n)).toBeNull();
});

test("WithdrawPending past withdrawal_timelock → advance_withdrawal", () => {
  const i = item({
    state: ItemState.WithdrawPending,
    withdrawalRequestedAt: { __option: "Some", value: 5_000n },
  });
  expect(resolveCanonAction(i, list(), false, 5_000n + 432_000n)).toEqual({
    kind: "advance_withdrawal",
  });
});

test("WithdrawPending inside timelock → null", () => {
  const i = item({
    state: ItemState.WithdrawPending,
    withdrawalRequestedAt: { __option: "Some", value: 5_000n },
  });
  expect(resolveCanonAction(i, list(), false, 5_000n + 432_000n - 1n)).toBeNull();
});

test("WithdrawPending without a timestamp (invariant break) → null", () => {
  const i = item({ state: ItemState.WithdrawPending, withdrawalRequestedAt: { __option: "None" } });
  expect(resolveCanonAction(i, list(), false, 999_999_999n)).toBeNull();
});

test("Listed / Removed are terminal for the cranker → null", () => {
  const l = list();
  const t = 999_999_999n;
  expect(resolveCanonAction(item({ state: ItemState.Listed }), l, false, t)).toBeNull();
  expect(resolveCanonAction(item({ state: ItemState.Removed }), l, false, t)).toBeNull();
});
