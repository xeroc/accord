/**
 * ListBrowser — browse every CanonList on chain (accord-ajps).
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

import { useClusterRpc, findAllCanonLists, fetchCanonListRaw } from "@/shared/rpc";
import { Copyable } from "@/components/Copyable";
import { Skeleton } from "@/components/Skeleton";
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

  const {
    data: featured,
    isLoading: featuredLoading,
  } = useQuery({
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
      : lists ?? [];

  const visibleLists = gridLists.slice(0, visibleCount);
  const hasMore = gridLists.length > visibleCount;

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="title">Canon lists.</h1>
        <p className="lede">Curated registries adjudicated by Accord courts.</p>
        <Link to="/lists/new" className="cta">Create a list.</Link>
      </header>

      {FEATURED_LIST && (
        <FeaturedSlot
          featured={featured ?? null}
          loading={featuredLoading}
        />
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
          <ul className="grid" aria-label="Canon lists">
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
    </main>
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
      <section className="featured">
        <p className="featured-label">Featured.</p>
        <div className="card card-skeleton" aria-busy>
          <Skeleton style={{ width: "40%", height: "1rem" }} />
          <Skeleton
            style={{ width: "70%", height: "0.85rem", marginTop: "0.75rem" }}
          />
        </div>
      </section>
    );
  }

  if (!featured) return null;

  const d = featured.data;
  return (
    <section className="featured">
      <p className="featured-label">Featured.</p>
      <Link to={`/lists/${featured.address}`} className="card">
        <span className="card-address">
          <Copyable value={featured.address} />
        </span>
        <dl className="card-stats">
          <Stat label="Stake mint" value={<Copyable value={d.stakeMint} />} />
          <Stat label="Fee mint" value={<Copyable value={d.feeMint} />} />
          <Stat label="Items" value={d.itemCount.toString()} />
          <Stat label="Authority" value={<Copyable value={d.authority} />} />
          <Stat
            label="Rules"
            value={
              <span className="mono" title={formatHash(d.rulesHash, false)}>
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
      <Link to={`/lists/${list.address}`} className="card">
        <span className="card-address">
          <Copyable value={list.address} />
        </span>
        <dl className="card-stats">
          <Stat label="Stake mint" value={<Copyable value={d.stakeMint} />} />
          <Stat label="Fee mint" value={<Copyable value={d.feeMint} />} />
          <Stat label="Items" value={d.itemCount.toString()} />
          <Stat label="Deposit" value={formatTokenAmount(d.submitDeposit)} />
          <Stat label="Authority" value={<Copyable value={d.authority} />} />
          <Stat
            label="Rules"
            value={
              <span className="mono" title={formatHash(d.rulesHash, false)}>
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
    <div className="stat">
      <dt>{label}.</dt>
      <dd>{value}</dd>
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
      <p className="count-note">
        Showing {shown} of {total}.
      </p>
      {hasMore && (
        <div className="load-more">
          <button type="button" className="cta" onClick={onLoadMore}>
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
    <ul className="grid" aria-busy aria-label="Loading lists">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="card card-skeleton">
          <Skeleton style={{ width: "60%", height: "1rem" }} />
          <Skeleton
            style={{ width: "80%", height: "0.85rem", marginTop: "0.75rem" }}
          />
          <Skeleton
            style={{ width: "50%", height: "0.85rem", marginTop: "0.4rem" }}
          />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <p className="empty-head">No lists yet.</p>
      <p className="empty-body">
        Create a curated registry. Submit items. Challenge fakes.
      </p>
      <Link to="/lists/new" className="cta">Create a list.</Link>
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
    <div className="empty">
      <p className="empty-head">Read failed.</p>
      <p className="empty-body mono">{message}</p>
      <button type="button" className="cta" onClick={onRetry}>
        Retry.
      </button>
    </div>
  );
}
