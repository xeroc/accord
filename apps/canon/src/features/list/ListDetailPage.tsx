/**
 * `/lists/:address` — renders CanonList on-chain params + enumerates CanonItems
 * via `findAllCanonItemsByList` (memcmp on `list` at byte 40). A client-side
 * filter narrows items by ItemState. Items link to `/items/:address` (item
 * detail). The "Propose item." CTA links to the submit form
 * (`/lists/:address/submit`); items render as table rows, and rows in a
 * challengeable state (Pending/Listed/WithdrawPending — SPEC §Instructions #4)
 * link to the challenge form (`/items/:address/challenge`). Cranks are NOT
 * wired (cranker-owned).
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
import {
  CHALLENGEABLE_STATES,
  formatHash,
  formatTokenAmount,
  formatWindow,
  timeAgo,
  timeRemaining,
} from "@/shared/format";
import {
  Copyable,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@useaccord/ui";

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
          <div className="flex items-center justify-between gap-4" style={{ marginBottom: "1rem" }}>
            <h2 className="text-[1.6rem] font-semibold tracking-[-0.01em]" style={{ fontSize: "1.2rem" }}>
              Items.{" "}
              <span className="italic text-muted-foreground">
                ({itemsQuery.data?.length ?? "…"})
              </span>
            </h2>
            <Link
              to={`/lists/${address}/submit`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
            >
              Propose item.
            </Link>
          </div>

          <FilterBar
            current={filter}
            onSelect={setFilter}
            counts={itemsQuery.data}
          />

          {itemsQuery.isLoading ? (
            <ItemTableSkeleton />
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
            <ItemTable
              items={itemsQuery.data ?? []}
              filter={filter}
              listData={list.data}
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

// --- Item table --------------------------------------------------------------

function ItemTable({
  items,
  filter,
  listData,
}: {
  items: Account<CanonItem>[];
  filter: FilterKey;
  listData: CanonList;
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
    <div className="overflow-x-auto rounded-lg bg-card ring-1 ring-foreground/10">
      <Table aria-label="Items" className="w-full border-collapse text-sm">
        <TableHeader>
          <TableRow className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <TableHead scope="col" className="px-4 py-2.5 font-semibold">
              Account
            </TableHead>
            <TableHead scope="col" className="px-4 py-2.5 font-semibold">
              State
            </TableHead>
            <TableHead scope="col" className="px-4 py-2.5 font-semibold">
              Time
            </TableHead>
            <TableHead scope="col" className="px-4 py-2.5 font-semibold">
              Stake
            </TableHead>
            <TableHead scope="col" className="px-4 py-2.5 font-semibold">
              Submitter
            </TableHead>
            <TableHead scope="col" className="px-4 py-2.5 font-semibold">
              Challenges
            </TableHead>
            <TableHead scope="col" className="px-4 py-2.5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((item) => (
            <ItemRow key={item.address} item={item} listData={listData} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ItemRow({
  item,
  listData,
}: {
  item: Account<CanonItem>;
  listData: CanonList;
}) {
  const d = item.data;
  const t = itemTime(d, listData);
  return (
    <TableRow className="border-b border-border transition-colors last:border-b-0 hover:bg-foreground/5">
      <TableCell className="px-4 py-2.5">
        <Link
          to={`/items/${item.address}`}
          className="transition-colors hover:text-amber"
        >
          <Copyable value={d.account} />
        </Link>
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-2.5">
        {ITEM_STATE_LABELS[d.state] ?? "Unknown"}
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
        {t ? `${t.label} ${t.value || "—"}` : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap px-4 py-2.5">
        {formatTokenAmount(d.accumulatedStake)}
      </TableCell>
      <TableCell className="px-4 py-2.5">
        <Copyable value={d.submitter} />
      </TableCell>
      <TableCell className="px-4 py-2.5">{d.challengeCount.toString()}</TableCell>
      <TableCell className="px-4 py-2.5 text-right">
        {CHALLENGEABLE_STATES[d.state] && (
          <Link
            to={`/items/${item.address}/challenge`}
            className="inline-flex items-center justify-center rounded-md bg-transparent px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-inset ring-primary transition-[background-color,scale] hover:bg-primary/10 active:scale-[0.96]"
          >
            Challenge.
          </Link>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Per-state humanised time row. Pending counts down to auto-listing and
 * WithdrawPending to the timelock elapsing; Disputed shows time since the
 * challenge. There is no on-chain `listed_at`/`removed_at` (the crank flips
 * state without stamping), so Listed/Removed fall back to submitted-at age. */
function itemTime(
  item: CanonItem,
  listData: CanonList,
): { label: string; value: string } | null {
  switch (item.state) {
    case ItemState.Pending: {
      const r = timeRemaining(
        Number(item.submittedAt) + Number(listData.listingWindow),
      );
      return {
        label: "Lists in",
        value: r === "expired" ? "window elapsed" : r,
      };
    }
    case ItemState.Disputed:
      return { label: "Challenged", value: timeAgo(item.challengedAt) };
    case ItemState.WithdrawPending: {
      const at =
        item.withdrawalRequestedAt.__option === "Some"
          ? Number(item.withdrawalRequestedAt.value)
          : null;
      const r =
        at !== null
          ? timeRemaining(at + Number(listData.withdrawalTimelock))
          : "";
      return {
        label: "Unlocks in",
        value: r === "expired" ? "timelock elapsed" : r,
      };
    }
    case ItemState.Listed:
    case ItemState.Removed:
      return { label: "Submitted", value: timeAgo(item.submittedAt) };
  }
  return null;
}

// --- Skeletons --------------------------------------------------------------

function ListParamsSkeleton() {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <Skeleton className="rounded-sm bg-border" style={{ width: "60%", height: "0.9rem" }} aria-hidden />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "80%", height: "0.85rem", marginTop: "0.5rem" }}
            aria-hidden
          />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "50%", height: "0.85rem", marginTop: "0.4rem" }}
            aria-hidden
          />
        </div>
      ))}
    </div>
  );
}

function ItemTableSkeleton() {
  return (
    <div
      className="overflow-x-auto rounded-lg bg-card ring-1 ring-foreground/10"
      aria-busy
      aria-label="Loading items"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-6 border-b border-border px-4 py-3 last:border-b-0"
        >
          <Skeleton className="rounded-sm bg-border" style={{ width: "26%", height: "0.85rem" }} aria-hidden />
          <Skeleton className="rounded-sm bg-border" style={{ width: "10%", height: "0.85rem" }} aria-hidden />
          <Skeleton className="rounded-sm bg-border" style={{ width: "14%", height: "0.85rem" }} aria-hidden />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "18%", height: "0.85rem", marginLeft: "auto" }}
            aria-hidden
          />
        </div>
      ))}
    </div>
  );
}
