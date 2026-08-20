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
  CHALLENGEABLE_STATES,
  ITEM_STATE_LABELS,
  formatTimestamp,
  formatTokenAmount,
  formatWindow,
  shortAddress,
  timeRemaining,
} from "@/shared/format";
import { DomainDocPanel, hexIfSet } from "@/features/domain/DomainDocPanel";

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

function stateClass(state: ItemState): string {
  switch (state) {
    case ItemState.Listed:
      return "text-confirm";
    case ItemState.Removed:
      return "text-slash";
    case ItemState.Disputed:
      return "text-slash";
    case ItemState.WithdrawPending:
      return "text-amber";
    default:
      return "text-muted-foreground";
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
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <div
          className="animate-pulse rounded-sm bg-border"
          style={{ height: "1.5rem", width: "12rem" }}
        />
        <div
          className="animate-pulse rounded-sm bg-border"
          style={{ height: "6rem", width: "100%", marginTop: "1.5rem" }}
        />
      </div>
    );
  }

  if (item.error) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <Link
          to="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </Link>
        <p className="italic text-muted-foreground">
          Failed to load item: {String(item.error.message)}
        </p>
      </div>
    );
  }

  if (!item.data) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-10">
        <Link
          to="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </Link>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Item not found</p>
          <p className="mb-5 text-muted-foreground">
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
    <div className="mx-auto max-w-[1100px] px-6 py-10">
      <Link
        to="/"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back
      </Link>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Canon item</h1>
        <p className="mb-4 text-muted-foreground font-mono text-sm text-foreground">{shortAddress(item.data.address)}</p>
        <p className={`font-mono text-sm font-semibold ${stateClass(state)}`}>
          {stateLabel}
        </p>
        <p className="mt-1.5 text-xs italic text-muted-foreground">
          {STATE_HINT[state]}
        </p>
        {CHALLENGEABLE_STATES[state] && (
          <Link
            to={`/items/${item.data.address}/challenge`}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
          >
            Challenge this item.
          </Link>
        )}
      </div>

      <div
        className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]"
        style={{ marginBottom: "1.5rem" }}
      >
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <dl className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Account</dt>
              <dd className="text-right">{shortAddress(it.account)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">List</dt>
              <dd className="text-right">{shortAddress(it.list)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Submitter</dt>
              <dd className="text-right">{shortAddress(it.submitter)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Challenges</dt>
              <dd className="text-right">{it.challengeCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="text-right">{formatTimestamp(it.submittedAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <dl className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Accumulated stake</dt>
              <dd className="text-right">
                {formatTokenAmount(it.accumulatedStake)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Fee mint</dt>
              <dd className="text-right">
                {shortAddress(listData?.feeMint ?? "—")}
              </dd>
            </div>
            {state === ItemState.Disputed && (
              <>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Challenger</dt>
                  <dd className="text-right">{shortAddress(it.challenger)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Challenge stake</dt>
                  <dd className="text-right">
                    {formatTokenAmount(it.challengeStake)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">Challenged</dt>
                  <dd className="text-right">
                    {formatTimestamp(it.challengedAt)}
                  </dd>
                </div>
              </>
            )}
            {state === ItemState.WithdrawPending &&
              it.withdrawalRequestedAt.__option === "Some" && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">
                    Withdrawal requested
                  </dt>
                  <dd className="text-right">
                    {formatTimestamp(it.withdrawalRequestedAt.value)}
                  </dd>
                </div>
              )}
          </dl>
        </section>
      </div>

      {/* Rules document (ADR-0027): the bytes behind the parent list's rules_hash */}
      {listData && (
        <div style={{ marginBottom: "1.5rem" }}>
          <DomainDocPanel hash={hexIfSet(listData.rulesHash)} />
        </div>
      )}

      {/* Per-state action / status */}
      {state === ItemState.Pending && (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="mb-2 font-mono text-sm text-amber">
            Listing window
          </h3>
          <dl className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Window</dt>
              <dd className="text-right">
                {listData ? formatWindow(listData.listingWindow) : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Auto-lists in</dt>
              <dd className="text-right">
                {listingDeadline !== null
                  ? timeRemaining(listingDeadline) || "elapsed"
                  : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Advances via</dt>
              <dd className="italic text-muted-foreground text-right">
                cranker (advance_pending)
              </dd>
            </div>
          </dl>
        </section>
      )}

      {state === ItemState.Removed && (
        <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
            <p className="m-0 text-xs italic text-muted-foreground">
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
          <div
            className="animate-pulse rounded-sm bg-border"
            style={{ height: "6rem", width: "100%" }}
          />
        ) : (
          <section className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
              <p className="m-0 text-xs italic text-muted-foreground">
              Dispute account not found at {shortAddress(it.activeDispute)}.
            </p>
          </section>
        ))}
    </div>
  );
}
