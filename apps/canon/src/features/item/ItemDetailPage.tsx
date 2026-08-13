/**
 * ItemDetailPage — `/items/:address`.
 *
 * Hosts the withdrawal flow (accord-etf5). Fetches the CanonItem + its backing
 * CanonList over read-only RPC, renders the item state + accumulated stake, and
 * mounts {@link WithdrawalCard} for the submitter action / countdown.
 *
 * NOTE: the full state-machine detail view (all five states, challenge/dispute
 * cross-link, submitter/challenger history) is owned by accord-gg8f. This page
 * is the minimal host that proves the withdrawal path end-to-end; gg8f expands
 * it. Cranks (advance_pending / settle_item / advance_withdrawal) are
 * cranker-owned and never appear as buttons here.
 */

import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";

import { ItemState } from "@useaccord/canon";
import { useCanonItem } from "./useCanonItem";
import { useCanonList } from "./useCanonList";
import { WithdrawalCard } from "./WithdrawalCard";
import { ITEM_STATE_LABELS, formatTokenAmount, shortAddress } from "@/shared/format";

export function ItemDetailPage() {
  const { address } = useParams<{ address: string }>();
  const item = useCanonItem(address);
  const list = useCanonList(item.data?.data.list);

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
        <p className="muted">Failed to load item: {String(item.error.message)}</p>
        <Link to="/" className="back">
          ← Back
        </Link>
      </div>
    );
  }

  if (!item.data) {
    return (
      <div className="page">
        <div className="empty">
          <p className="empty-head">Item not found</p>
          <p className="empty-body">No CanonItem at {shortAddress(address ?? "—")}.</p>
        </div>
        <Link to="/" className="back">
          ← Back
        </Link>
      </div>
    );
  }

  const it = item.data.data;
  const stateLabel = ITEM_STATE_LABELS[it.state] ?? "Unknown";

  return (
    <div className="page">
      <Link to="/" className="back">
        ← Back
      </Link>
      <div className="page-head">
        <h1 className="title mono">Canon item</h1>
        <p className="lede mono">{shortAddress(item.data.address)}</p>
      </div>

      <div className="detail-grid" style={{ marginBottom: "1.5rem" }}>
        <section className="detail-group">
          <dl className="rows">
            <div className="row">
              <dt>State</dt>
              <dd>{stateLabel}</dd>
            </div>
            <div className="row">
              <dt>Account</dt>
              <dd>{shortAddress(it.account)}</dd>
            </div>
            <div className="row">
              <dt>Submitter</dt>
              <dd>{shortAddress(it.submitter)}</dd>
            </div>
            <div className="row">
              <dt>Challenges</dt>
              <dd>{it.challengeCount}</dd>
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
              <dd>{shortAddress(list.data?.data.feeMint ?? "—")}</dd>
            </div>
            <div className="row">
              <dt>Withdrawal timelock</dt>
              <dd>{list.data ? `${list.data.data.withdrawalTimelock}s` : "—"}</dd>
            </div>
          </dl>
        </section>
      </div>

      {list.data && it.state !== ItemState.Disputed && (
        <WithdrawalCard item={item.data} list={list.data} />
      )}
    </div>
  );
}
