/**
 * List detail page (accord-hhyy).
 *
 * `/lists/:address` — renders CanonList on-chain params + enumerates CanonItems
 * via `findAllCanonItemsByList` (memcmp on `list` at byte 40). A client-side
 * filter narrows items by ItemState. Items link to `/items/:address` (item
 * detail — sibling task). Cranks are NOT wired (cranker-owned).
 *
 * see SPEC §Item state machine, milestone §1(d), §2.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Account, Address } from "@solana/kit";
import { ItemState, type CanonItem, type CanonList } from "@useaccord/canon";

import {
  useClusterRpc,
  fetchCanonListRaw,
  findAllCanonItemsByList,
} from "@/shared/rpc";
import { Copyable } from "@/components/Copyable";
import { Skeleton } from "@/components/Skeleton";
import { formatHash, formatTokenAmount, formatWindow } from "@/shared/format";

const ITEM_STATE_LABELS: Record<ItemState, string> = {
  [ItemState.Pending]: "Pending",
  [ItemState.Listed]: "Listed",
  [ItemState.Removed]: "Removed",
  [ItemState.WithdrawPending]: "Withdraw pending",
  [ItemState.Disputed]: "Disputed",
};

type FilterKey = "all" | ItemState;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: ItemState.Pending, label: "Pending" },
  { key: ItemState.Listed, label: "Listed" },
  { key: ItemState.Disputed, label: "Disputed" },
  { key: ItemState.WithdrawPending, label: "Withdraw" },
  { key: ItemState.Removed, label: "Removed" },
];

export function ListDetailPage() {
  const { address } = useParams<{ address: string }>();
  const rpc = useClusterRpc()?.rpc ?? null;
  const [filter, setFilter] = useState<FilterKey>("all");

  const listQuery = useQuery({
    queryKey: ["canon-list", rpc, address],
    queryFn: () => fetchCanonListRaw(rpc!, address! as Address),
    enabled: Boolean(rpc && address),
    staleTime: 30_000,
  });

  const itemsQuery = useQuery({
    queryKey: ["canon-items", rpc, address],
    queryFn: () => findAllCanonItemsByList(rpc!, address! as Address),
    enabled: Boolean(rpc && address),
    staleTime: 30_000,
  });

  if (!address) {
    return (
      <main className="mx-auto max-w-[1100px] px-6 py-10">
        <p className="mb-5 text-muted-foreground">No list address provided.</p>
      </main>
    );
  }

  const list = listQuery.data;
  const listError = listQuery.isError
    ? listQuery.error instanceof Error
      ? listQuery.error.message
      : "RPC error."
    : null;
  const listMissing = !listQuery.isLoading && !list;

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10">
      <header className="mb-8">
        <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Back to lists.
        </Link>
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.01em]">List.</h1>
        {list && <Copyable value={list.address} />}
      </header>

      {listError && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">Read failed.</p>
          <p className="mb-5 text-muted-foreground font-mono text-sm text-foreground">{listError}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
            onClick={() => void listQuery.refetch()}
          >
            Retry.
          </button>
        </div>
      )}

      {listMissing && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="mb-2 text-lg font-semibold">List not found.</p>
          <p className="mb-5 text-muted-foreground">
            No CanonList at this address on the active cluster.
          </p>
        </div>
      )}

      {listQuery.isLoading && <ListParamsSkeleton />}

      {list && <ListParams list={list} />}

      {/* --- Items --- */}
      {list && (
        <section style={{ marginTop: "2.5rem" }}>
          <div className="mb-8" style={{ marginBottom: "1rem" }}>
            <h2 className="text-[1.6rem] font-semibold tracking-[-0.01em]" style={{ fontSize: "1.2rem" }}>
              Items.{" "}
              <span className="italic text-muted-foreground">
                ({itemsQuery.data?.length ?? "…"})
              </span>
            </h2>
          </div>

          <FilterBar
            current={filter}
            onSelect={setFilter}
            counts={itemsQuery.data}
          />

          {itemsQuery.isLoading ? (
            <ItemGridSkeleton />
          ) : itemsQuery.isError ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <p className="mb-2 text-lg font-semibold">Items read failed.</p>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
                onClick={() => void itemsQuery.refetch()}
              >
                Retry.
              </button>
            </div>
          ) : (
            <ItemGrid
              items={itemsQuery.data ?? []}
              filter={filter}
            />
          )}
        </section>
      )}
    </main>
  );
}

// --- List params ------------------------------------------------------------

function ListParams({ list }: { list: Account<CanonList> }) {
  const d = list.data;
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <dl className="grid gap-2">
          <Row label="Creator" value={<Copyable value={d.creator} />} />
          <Row label="Stake mint" value={<Copyable value={d.stakeMint} />} />
          <Row label="Fee mint" value={<Copyable value={d.feeMint} />} />
          <Row label="List program" value={<Copyable value={d.listProgram} />} />
        </dl>
      </div>
      <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <dl className="grid gap-2">
          <Row
            label="Rules hash"
            value={
              <span className="font-mono text-sm text-foreground" title={formatHash(d.rulesHash, false)}>
                {formatHash(d.rulesHash)}
              </span>
            }
          />
          <Row label="Subaccord" value={<Copyable value={d.subaccord} />} />
          <Row label="Authority" value={<Copyable value={d.authority} />} />
          <Row label="Item count" value={d.itemCount.toString()} />
        </dl>
      </div>
      <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <dl className="grid gap-2">
          <Row
            label="Submit deposit"
            value={formatTokenAmount(d.submitDeposit)}
          />
          <Row
            label="Challenge pct"
            value={`${d.challengePct} bps`}
          />
          <Row
            label="Listing window"
            value={formatWindow(d.listingWindow)}
          />
          <Row
            label="Withdrawal timelock"
            value={formatWindow(d.withdrawalTimelock)}
          />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}.</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

// --- Filter bar -------------------------------------------------------------

function FilterBar({
  current,
  onSelect,
  counts,
}: {
  current: FilterKey;
  onSelect: (key: FilterKey) => void;
  counts?: Account<CanonItem>[];
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
      {FILTERS.map((f) => {
        const count =
          f.key === "all"
            ? counts?.length
            : counts?.filter((i) => i.data.state === f.key).length;
        return (
          <button
            key={f.key}
            type="button"
            className={
              current === f.key
                ? "inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
                : "inline-flex items-center justify-center rounded-md bg-transparent px-3.5 py-2 text-sm font-semibold text-primary ring-1 ring-inset ring-primary transition-[background-color,scale] hover:bg-primary/10 active:scale-[0.96]"
            }
            onClick={() => onSelect(f.key)}
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.7rem" }}
          >
            {f.label}
            {count !== undefined ? ` (${count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

// --- Item grid --------------------------------------------------------------

function ItemGrid({
  items,
  filter,
}: {
  items: Account<CanonItem>[];
  filter: FilterKey;
}) {
  const filtered =
    filter === "all" ? items : items.filter((i) => i.data.state === filter);

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="mb-2 text-lg font-semibold">No items.</p>
        <p className="mb-5 text-muted-foreground">
          {filter === "all"
            ? "Submit an item to this list."
            : `No ${ITEM_STATE_LABELS[filter as ItemState] ?? filter} items.`}
        </p>
      </div>
    );
  }

  return (
    <ul className="grid list-none gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-label="Items">
      {filtered.map((item) => (
        <ItemCard key={item.address} item={item} />
      ))}
    </ul>
  );
}

function ItemCard({ item }: { item: Account<CanonItem> }) {
  const d = item.data;
  return (
    <li>
      <Link to={`/items/${item.address}`} className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] hover:ring-amber/40">
        <span className="mb-3.5 block">
          <Copyable value={d.account} />
        </span>
        <dl className="grid gap-1.5">
          <Stat label="State" value={ITEM_STATE_LABELS[d.state] ?? "Unknown"} />
          <Stat
            label="Stake"
            value={formatTokenAmount(d.accumulatedStake)}
          />
          <Stat label="Submitter" value={<Copyable value={d.submitter} />} />
          <Stat label="Challenges" value={d.challengeCount.toString()} />
        </dl>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}.</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

// --- Skeletons --------------------------------------------------------------

function ListParamsSkeleton() {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <Skeleton style={{ width: "60%", height: "0.9rem" }} />
          <Skeleton
            style={{ width: "80%", height: "0.85rem", marginTop: "0.5rem" }}
          />
          <Skeleton
            style={{ width: "50%", height: "0.85rem", marginTop: "0.4rem" }}
          />
        </div>
      ))}
    </div>
  );
}

function ItemGridSkeleton() {
  return (
    <ul className="grid list-none gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-busy aria-label="Loading items">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[box-shadow] hover:ring-amber/40 flex flex-col">
          <Skeleton style={{ width: "60%", height: "1rem" }} />
          <Skeleton
            style={{ width: "70%", height: "0.85rem", marginTop: "0.6rem" }}
          />
        </li>
      ))}
    </ul>
  );
}
