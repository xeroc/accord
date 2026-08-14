/**
 * Canon state resolver — pure mapping from a decoded (CanonItem, CanonList)
 * snapshot to the next Canon permissionless crank action, or `null` when the
 * item is waiting on a time window, a live dispute, or nothing (bean
 * accord-7fj6).
 *
 * Canon is an Arbitrable over Accord: it owns the item lifecycle + deposits,
 * Accord owns the ruling. The three cranks (SPEC §Instructions #3/#5/#7):
 *   - `advance_pending`    — Pending → Listed after `listing_window`
 *   - `settle_item`        — Disputed → redistributed once Accord is Final
 *   - `advance_withdrawal` — WithdrawPending → Removed after
 *                            `withdrawal_timelock`, stake returned
 *
 * Gates mirror the on-chain handlers exactly
 * (programs/canon/src/instructions/*.rs); `now` is a Unix-seconds timestamp
 * matching `Clock::get().unix_timestamp`. `disputeFinal` is resolved by the
 * caller (the reconciler reuses its Dispute scan) and is only meaningful for
 * `state == Disputed` — settle_item reads Accord's `final_ruling` on-chain,
 * so the cranker must never fire it before Final (the tx would revert).
 */
import { isSome } from "@solana/kit";
import { ItemState, type CanonItem, type CanonList } from "@useaccord/canon";

export type CanonCrankAction =
  | { readonly kind: "advance_pending" }
  | { readonly kind: "settle_item" }
  | { readonly kind: "advance_withdrawal" };

/**
 * Resolve the next Canon crank action for an (item, list) snapshot, or `null`
 * when waiting. `disputeFinal` says whether the item's `active_dispute` is in
 * Accord's `Final` state.
 */
export function resolveCanonAction(
  item: CanonItem,
  list: CanonList,
  disputeFinal: boolean,
  now: bigint,
): CanonCrankAction | null {
  switch (item.state) {
    case ItemState.Pending:
      return now >= item.submittedAt + list.listingWindow ? { kind: "advance_pending" } : null;
    case ItemState.Disputed:
      return disputeFinal ? { kind: "settle_item" } : null;
    case ItemState.WithdrawPending: {
      const requestedAt = item.withdrawalRequestedAt;
      // isSome guard: None + WithdrawPending is an invariant break — nothing to crank.
      if (!isSome(requestedAt)) return null;
      return now >= requestedAt.value + list.withdrawalTimelock
        ? { kind: "advance_withdrawal" }
        : null;
    }
    default:
      // Listed: resting, awaiting a challenge or withdrawal request.
      // Removed: terminal.
      return null;
  }
}
