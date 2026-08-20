/**
 * ListBrowser — browse every CanonList on chain (accord-ajps).
 *
 * Reusable body: featured slot + grid + pagination + states. The page header
 * (title / lede / Create-list CTA) lives in HomePage so the home route can
 * present a left-biased hero and reuse this grid below it.
 *
 * Scans the Canon program via `findAllCanonLists` (typed GPA, discriminator
 * filter). TanStack Query caches the read. Cards show mints, item_count,
 * authority, and rules_hash. Client-side pagination (cap + "Load more").
 *
 * Reserved featured slot: if `VITE_FEATURED_LIST` is set, a single list is
 * fetched separately and shown prominently above the grid. Empty/absent →
 * hidden. The featured list is deduplicated from the main grid.
 *
 * see milestone §1(d), §4, §10.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Account } from "@solana/kit";
import type { CanonList } from "@useaccord/canon";

import {
  useClusterRpc,
  findAllCanonLists,
  fetchCanonListRaw,
} from "@/shared/rpc";
import { Copyable, Skeleton } from "@useaccord/ui";
import { formatHash, formatTokenAmount } from "@/shared/format";

const PAGE_SIZE = 12;
const FEATURED_LIST = import.meta.env.VITE_FEATURED_LIST?.trim() || "";

export function ListBrowser() {
  const rpc = useClusterRpc()?.rpc ?? null;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const {
    data: lists,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["canon-lists", rpc],
    queryFn: () => findAllCanonLists(rpc!),
    enabled: Boolean(rpc),
    staleTime: 30_000,
  });

  const { data: featured, isLoading: featuredLoading } = useQuery({
    queryKey: ["canon-list-featured", rpc, FEATURED_LIST],
    queryFn: () => fetchCanonListRaw(rpc!, FEATURED_LIST as never),
    enabled: Boolean(rpc) && FEATURED_LIST.length > 0,
    staleTime: 60_000,
  });

  // Reset pagination when the dataset changes (new RPC / refetch).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [rpc]);

  // Deduplicate: featured list excluded from the grid.
  const gridLists =
    lists && featured
      ? lists.filter((l) => l.address !== featured.address)
      : (lists ?? []);

  const visibleLists = gridLists.slice(0, visibleCount);
  const hasMore = gridLists.length > visibleCount;

  return (
    <section aria-label="Canon lists">
      {FEATURED_LIST && (
        <FeaturedSlot featured={featured ?? null} loading={featuredLoading} />
      )}

      {isLoading ? (
        <ListGridSkeleton />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "RPC error."}
          onRetry={() => void refetch()}
        />
      ) : gridLists.length > 0 ? (
        <>
          <ul className="grid list-none gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-label="Canon lists">
            {visibleLists.map((l) => (
              <CanonListCard key={l.address} list={l} />
            ))}
          </ul>
          <Pagination
            shown={visibleLists.length}
            total={gridLists.length}
            hasMore={hasMore}
            onLoadMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
          />
        </>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

// --- Featured slot ----------------------------------------------------------

function FeaturedSlot({
  featured,
  loading,
}: {
  featured: Account<CanonList> | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mb-6">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.06em] text-amber">Featured.</p>
        <div className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[box-shadow] hover:ring-amber/40 flex flex-col" aria-busy>
          <Skeleton className="rounded-sm bg-border" style={{ width: "40%", height: "1rem" }} aria-hidden />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "70%", height: "0.85rem", marginTop: "0.75rem" }}
            aria-hidden
          />
        </div>
      </section>
    );
  }

  if (!featured) return null;

  const d = featured.data;
  return (
    <section className="mb-6">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.06em] text-amber">Featured.</p>
      <Link to={`/lists/${featured.address}`} className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] hover:ring-amber/40">
        <span className="mb-3.5 block">
          <Copyable value={featured.address} />
        </span>
        <dl className="grid gap-1.5">
          <Stat label="Stake mint" value={<Copyable value={d.stakeMint} />} />
          <Stat label="Fee mint" value={<Copyable value={d.feeMint} />} />
          <Stat label="Items" value={d.itemCount.toString()} />
          <Stat label="Authority" value={<Copyable value={d.authority} />} />
          <Stat
            label="Rules"
            value={
              <span className="font-mono text-sm text-foreground" title={formatHash(d.rulesHash, false)}>
                {formatHash(d.rulesHash)}
              </span>
            }
          />
        </dl>
      </Link>
    </section>
  );
}

// --- List card --------------------------------------------------------------

function CanonListCard({ list }: { list: Account<CanonList> }) {
  const d = list.data;
  return (
    <li>
      <Link to={`/lists/${list.address}`} className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] hover:ring-amber/40">
        <span className="mb-3.5 block">
          <Copyable value={list.address} />
        </span>
        <dl className="grid gap-1.5">
          <Stat label="Stake mint" value={<Copyable value={d.stakeMint} />} />
          <Stat label="Fee mint" value={<Copyable value={d.feeMint} />} />
          <Stat label="Items" value={d.itemCount.toString()} />
          <Stat label="Deposit" value={formatTokenAmount(d.submitDeposit)} />
          <Stat label="Authority" value={<Copyable value={d.authority} />} />
          <Stat
            label="Rules"
            value={
              <span className="font-mono text-sm text-foreground" title={formatHash(d.rulesHash, false)}>
                {formatHash(d.rulesHash)}
              </span>
            }
          />
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

// --- Pagination -------------------------------------------------------------

function Pagination({
  shown,
  total,
  hasMore,
  onLoadMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Showing {shown} of {total}.
      </p>
      {hasMore && (
        <div className="mt-6 text-center">
          <button type="button" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]" onClick={onLoadMore}>
            Load more.
          </button>
        </div>
      )}
    </>
  );
}

// --- States -----------------------------------------------------------------

function ListGridSkeleton() {
  return (
    <ul className="grid list-none gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]" aria-busy aria-label="Loading lists">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="block rounded-lg bg-card p-4 ring-1 ring-foreground/10 transition-[box-shadow] hover:ring-amber/40 flex flex-col">
          <Skeleton className="rounded-sm bg-border" style={{ width: "60%", height: "1rem" }} aria-hidden />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "80%", height: "0.85rem", marginTop: "0.75rem" }}
            aria-hidden
          />
          <Skeleton
            className="rounded-sm bg-border"
            style={{ width: "50%", height: "0.85rem", marginTop: "0.4rem" }}
            aria-hidden
          />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <p className="mb-2 text-lg font-semibold">No lists yet.</p>
      <p className="mb-5 text-muted-foreground">
        Create a curated registry. Submit items. Challenge fakes.
      </p>
      <Link to="/lists/new" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]">
        Create a list.
      </Link>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <p className="mb-2 text-lg font-semibold">Read failed.</p>
      <p className="mb-5 text-muted-foreground font-mono text-sm text-foreground">{message}</p>
      <button type="button" className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]" onClick={onRetry}>
        Retry.
      </button>
    </div>
  );
}
