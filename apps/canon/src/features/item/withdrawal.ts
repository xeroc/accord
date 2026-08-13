/**
 * withdrawal.ts — pure logic for the item withdrawal flow (accord-etf5).
 *
 * The withdrawal path (SPEC §Instructions #6, §Item state machine):
 *   Listed ──(request_withdrawal, submitter-only)──► WithdrawPending
 *            (opens the per-list `withdrawal_timelock` challenge window)
 *
 * `advance_withdrawal` (the actual stake return) is a permissionless CRANK,
 * cranker-owned — the app never sends it. This module therefore only computes
 * *who may request* and *how long the window has left*: read-only display logic
 * plus the eligibility predicate that gates the request button.
 *
 * Pure + synchronous — no RPC, no React. Unit-tested directly (see
 * withdrawal.test.ts). The `Option<bigint>` timestamp is read via its
 * `__option` discriminant (Kit's `Option<T> = Some | None`), since kit does
 * not re-export the `isSome` helper.
 */

import type { Address, Option } from "@solana/kit";
import { ItemState, type CanonItem, type CanonList } from "@useaccord/canon";

/** Unwrap a Kit `Option<T>` to its value, or `null` when `None`. */
export function optionValue<T>(opt: Option<T>): T | null {
  return opt.__option === "Some" ? opt.value : null;
}

/** `true` when the item is in the `WithdrawPending` window. */
export function isWithdrawPending(item: CanonItem): boolean {
  return item.state === ItemState.WithdrawPending;
}

/**
 * `true` when the connected wallet may call `request_withdrawal` on this item:
 * the item MUST be `Listed` and the connected wallet MUST be the submitter
 * (the sole withdrawer — SPEC: "submitter-only").
 *
 * @param item - decoded CanonItem data
 * @param connected - the connected wallet address, or null when no wallet
 */
export function canRequestWithdrawal(
  item: CanonItem,
  connected: Address | null,
): boolean {
  if (connected === null) return false;
  return item.state === ItemState.Listed && item.submitter === connected;
}

/**
 * The unix-seconds deadline at which the `withdrawal_timelock` elapses
 * (the moment `advance_withdrawal` becomes callable by the cranker).
 *
 * `withdrawalRequestedAt + list.withdrawalTimelock`. Returns `null` when no
 * withdrawal has been requested (`state !== WithdrawPending`).
 *
 * @param nowSec - optional override (tests); defaults to wall-clock now.
 */
export function withdrawalDeadline(
  item: CanonItem,
  list: CanonList,
): number | null {
  const requestedAt = optionValue(item.withdrawalRequestedAt);
  if (requestedAt === null) return null;
  return Number(requestedAt) + Number(list.withdrawalTimelock);
}

/**
 * Seconds remaining in the withdrawal window, or `null` when no window is open.
 * Negative (≤ 0) means the timelock has elapsed — the cranker may now
 * `advance_withdrawal`; the app shows "withdrawable" (read-only).
 */
export function withdrawalSecondsLeft(
  item: CanonItem,
  list: CanonList,
  nowSec: number = Math.floor(Date.now() / 1000),
): number | null {
  const deadline = withdrawalDeadline(item, list);
  if (deadline === null) return null;
  return deadline - nowSec;
}
