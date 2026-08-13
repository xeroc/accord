/**
 * ItemDetailPage — `/items/:address` (accord-gg8f).
 *
 * Renders a CanonItem as a state-machine view across all five lifecycle states
 * (SPEC §Item state machine): Pending, Listed, Removed, WithdrawPending,
 * Disputed. Each state shows its on-chain fields + a one-line "what happens
 * next" transition hint, and the submitter/challenger actions or read-only
 * crank status that apply.
 *
 * Actions vs. cranks (milestone §3):
 *  - `request_withdrawal` (Listed → WithdrawPending) is the one submitter
 *    action, rendered by {@link WithdrawalCard}.
 *  - `advance_pending` / `settle_item` / `advance_withdrawal` are cranker-owned
 *    cranks — shown as read-only status / countdowns, NEVER buttons.
 *  - `challenge_item` lands with the challenge feature (accord-t877); the
 *    Disputed state here shows the backing Accord dispute (inline +
 *    deep-linked) read-only.
 */

import { Link, useParams } from "react-router-dom";

import { ItemState } from "@useaccord/canon";
import { useCanonItem } from "./useCanonItem";
import { useCanonList } from "./useCanonList";
import { useDispute } from "./useDispute";
import { WithdrawalCard } from "./WithdrawalCard";
import { DisputeStatusCard } from "./DisputeStatusCard";
import {
  ITEM_STATE_LABELS,
  formatTimestamp,
  formatTokenAmount,
  formatWindow,
  shortAddress,
  timeRemaining,
} from "@/shared/format";

const STATE_HINT: Record<ItemState, string> = {
  [ItemState.Pending]:
    "Listed automatically after the listing window if unchallenged (cranker: advance_pending). A challenge opens a dispute.",
  [ItemState.Listed]:
    "Challengeable anytime. The submitter may request a withdrawal to delist.",
  [ItemState.Removed]: "Terminal — the item is delisted.",
  [ItemState.WithdrawPending]:
    "Stake returns after the timelock if unchallenged (cranker: advance_withdrawal). A challenge opens a dispute.",
  [ItemState.Disputed]:
    "Under Accord adjudication. settle_item applies the ruling here once final (cranker).",
};

function stateColor(state: ItemState): string {
  switch (state) {
    case ItemState.Listed:
      return "var(--green)";
    case ItemState.Removed:
      return "var(--red)";
    case ItemState.Disputed:
      return "var(--red)";
    case ItemState.WithdrawPending:
      return "var(--amber)";
    default:
      return "var(--muted-foreground)";
  }
}

export function ItemDetailPage() {
  const { address } = useParams<{ address: string }>();
  const item = useCanonItem(address);
  const listAddr = item.data?.data.list;
  const list = useCanonList(listAddr);
  const dispute = useDispute(item.data?.data.activeDispute);

  if (item.isLoading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: "1.5rem", width: "12rem" }} />
        <div
          className="skeleton"
          style={{ height: "6rem", width: "100%", marginTop: "1.5rem" }}
        />
      </div>
    );
  }

  if (item.error) {
    return (
      <div className="page">
        <Link to="/" className="back">
          ← Back
        </Link>
        <p className="muted">Failed to load item: {String(item.error.message)}</p>
      </div>
    );
  }

  if (!item.data) {
    return (
      <div className="page">
        <Link to="/" className="back">
          ← Back
        </Link>
        <div className="empty">
          <p className="empty-head">Item not found</p>
          <p className="empty-body">
            No CanonItem at {shortAddress(address ?? "—")}.
          </p>
        </div>
      </div>
    );
  }

  const it = item.data.data;
  const listData = list.data?.data;
  const state = it.state;
  const stateLabel = ITEM_STATE_LABELS[state] ?? "Unknown";

  // Pending: time until auto-listing (submittedAt + listingWindow).
  const listingDeadline =
    state === ItemState.Pending && listData
      ? Number(it.submittedAt) + Number(listData.listingWindow)
      : null;

  return (
    <div className="page">
      <Link to="/" className="back">
        ← Back
      </Link>
      <div className="page-head">
        <h1 className="title mono">Canon item</h1>
        <p className="lede mono">{shortAddress(item.data.address)}</p>
        <p className="mono" style={{ color: stateColor(state), fontWeight: 650 }}>
          {stateLabel}
        </p>
        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
          {STATE_HINT[state]}
        </p>
      </div>

      <div className="detail-grid" style={{ marginBottom: "1.5rem" }}>
        <section className="detail-group">
          <dl className="rows">
            <div className="row">
              <dt>Account</dt>
              <dd>{shortAddress(it.account)}</dd>
            </div>
            <div className="row">
              <dt>List</dt>
              <dd>{shortAddress(it.list)}</dd>
            </div>
            <div className="row">
              <dt>Submitter</dt>
              <dd>{shortAddress(it.submitter)}</dd>
            </div>
            <div className="row">
              <dt>Challenges</dt>
              <dd>{it.challengeCount}</dd>
            </div>
            <div className="row">
              <dt>Submitted</dt>
              <dd>{formatTimestamp(it.submittedAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="detail-group">
          <dl className="rows">
            <div className="row">
              <dt>Accumulated stake</dt>
              <dd>{formatTokenAmount(it.accumulatedStake)}</dd>
            </div>
            <div className="row">
              <dt>Fee mint</dt>
              <dd>{shortAddress(listData?.feeMint ?? "—")}</dd>
            </div>
            {state === ItemState.Disputed && (
              <>
                <div className="row">
                  <dt>Challenger</dt>
                  <dd>{shortAddress(it.challenger)}</dd>
                </div>
                <div className="row">
                  <dt>Challenge stake</dt>
                  <dd>{formatTokenAmount(it.challengeStake)}</dd>
                </div>
                <div className="row">
                  <dt>Challenged</dt>
                  <dd>{formatTimestamp(it.challengedAt)}</dd>
                </div>
              </>
            )}
            {state === ItemState.WithdrawPending &&
              it.withdrawalRequestedAt.__option === "Some" && (
                <div className="row">
                  <dt>Withdrawal requested</dt>
                  <dd>{formatTimestamp(it.withdrawalRequestedAt.value)}</dd>
                </div>
              )}
          </dl>
        </section>
      </div>

      {/* Per-state action / status */}
      {state === ItemState.Pending && (
        <section className="detail-group">
          <h3 className="mono" style={{ color: "var(--amber)", marginBottom: "0.5rem" }}>
            Listing window
          </h3>
          <dl className="rows">
            <div className="row">
              <dt>Window</dt>
              <dd>{listData ? formatWindow(listData.listingWindow) : "—"}</dd>
            </div>
            <div className="row">
              <dt>Auto-lists in</dt>
              <dd>{listingDeadline !== null ? timeRemaining(listingDeadline) || "elapsed" : "—"}</dd>
            </div>
            <div className="row">
              <dt>Advances via</dt>
              <dd className="muted">cranker (advance_pending)</dd>
            </div>
          </dl>
        </section>
      )}

      {state === ItemState.Removed && (
        <section className="detail-group">
          <p className="muted" style={{ margin: "0", fontSize: "0.9rem" }}>
            This item has been delisted. Stake was either returned to the
            submitter (withdrawal / failed challenge) or paid to the challenger
            (successful removal ruling).
          </p>
        </section>
      )}

      {(state === ItemState.Listed || state === ItemState.WithdrawPending) &&
        list.data && <WithdrawalCard item={item.data} list={list.data} />}

      {state === ItemState.Disputed &&
        (dispute.data ? (
          <DisputeStatusCard dispute={dispute.data} />
        ) : dispute.isLoading ? (
          <div className="skeleton" style={{ height: "6rem", width: "100%" }} />
        ) : (
          <section className="detail-group">
            <p className="muted" style={{ margin: "0", fontSize: "0.9rem" }}>
              Dispute account not found at {shortAddress(it.activeDispute)}.
            </p>
          </section>
        ))}
    </div>
  );
}
